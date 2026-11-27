// Compatibility check: for each supported Angular major, a NEW application is created with that version of the
// Angular CLI, set up with `ng add`, given a component of Angular Material and one that uses the library, built into
// one HTML file and opened in a browser. It answers "does what we are about to release still work there?".
//
//   npm run build            (the packages under test are the ones in dist/)
//   npm run test:compat      all majors, in parallel
//   npm run test:compat -- 20 22        only these
//   npm run test:compat -- 20 --keep    keep the generated application to look at it
//
// The browser is the one installed on the machine: Edge on Windows, Chrome elsewhere (COMPAT_BROWSER to choose).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const SUPPORTED = [18, 19, 20, 21, 22];
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const majors = args.filter((a) => /^\d+$/.test(a)).map(Number);
const targets = majors.length ? majors : SUPPORTED;

for (const need of ['dist/ngx-mcp-apps/package.json', 'dist/ngx-mcp-apps-builder/package.json']) {
  if (!existsSync(need)) {
    console.error(`${need} is missing: run "npm run build" first.`);
    process.exit(1);
  }
}

/** Runs a command, collecting its output. Rejects with that output when it fails. */
function run(command, cwd, timeoutMs = 600_000) {
  return new Promise((ok, ko) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NG_CLI_ANALYTICS: 'false', CI: 'true', NO_COLOR: '1' },
    });
    let output = '';
    child.stdout.on('data', (c) => (output += c));
    child.stderr.on('data', (c) => (output += c));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) ok(output);
      else
        ko(new Error(`"${command}" failed (${code})\n${output.split('\n').slice(-25).join('\n')}`));
    });
  });
}

const work = mkdtempSync(join(tmpdir(), 'ngx-mcp-apps-compat-'));
const slash = (p) => p.replace(/\\/g, '/');

// The packages exactly as they would be published
const pack = async (dir) => {
  const out = await run(`npm pack --pack-destination "${work}"`, resolve(dir));
  return slash(join(work, out.trim().split('\n').at(-1).trim()));
};
const library = await pack('dist/ngx-mcp-apps');
const builder = await pack('dist/ngx-mcp-apps-builder');

// The whole application under test: a Material component, and the library with its standalone state
const MAIN = `import { Component, inject, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { McpApp, provideMcpApp } from 'ngx-mcp-apps';
import { Later } from './later';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatCheckboxModule, MatProgressBarModule, Later],
  template: \`
    <p id="status">{{ mcp.status() }}</p>
    <mat-progress-bar mode="determinate" [value]="done() ? 100 : 40" />
    <mat-checkbox id="box" (change)="done.set($event.checked)">Done</mat-checkbox>
    <p id="done">{{ done() ? 'yes' : 'no' }}</p>
    @defer (on immediate) {
      <app-later />
    }
    <p id="dynamic">{{ dynamic() }}</p>
  \`,
})
class App {
  protected readonly mcp = inject(McpApp);
  protected readonly done = signal(false);
  protected readonly dynamic = signal('');
  constructor() {
    import('./more').then((m) => this.dynamic.set(m.more()));
  }
}

bootstrapApplication(App, {
  providers: [provideMcpApp({ name: 'compat', version: '1.0.0', connectTimeout: 500 })],
}).catch((e) => console.error(e));
`;

// Lazy parts: a @defer block and a dynamic import. Angular makes chunks of them, the builder merges them back.
const LATER = `import { Component } from '@angular/core';

@Component({ selector: 'app-later', standalone: true, template: '<p id="later">deferred</p>' })
export class Later {}
`;
const MORE = `export const more = () => 'dynamic import';
`;

const browser = await chromium.launch({
  channel: process.env.COMPAT_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chrome'),
  headless: true,
});

async function check(major) {
  const steps = [];
  const dir = join(work, `v${major}`);
  const app = join(dir, 'app');
  const step = async (name, action) => {
    const started = Date.now();
    const result = await action();
    steps.push(`${name} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
    return result;
  };
  try {
    await run(`mkdir "${dir}"`, work);
    await step('ng new', () =>
      run(
        `npx -y @angular/cli@${major} new app --defaults --skip-git --skip-tests --ssr=false`,
        dir,
      ),
    );
    const angular = JSON.parse(
      readFileSync(join(app, 'node_modules/@angular/core/package.json'), 'utf8'),
    ).version;

    // The library comes from the local package: the version under test may not be on npm yet
    await step('ng add', () =>
      run(`npx ng add "${builder}" --skip-confirmation --skip-library`, app),
    );
    await step('install', () =>
      run(
        `npm install "${library}" @angular/material@${major} @angular/cdk@${major} @angular/animations@${major}`,
        app,
      ),
    );

    const workspaceFile = join(app, 'angular.json');
    const workspace = JSON.parse(readFileSync(workspaceFile, 'utf8'));
    const build = workspace.projects.app.architect.build;
    if (build.builder !== 'ngx-mcp-apps-builder:application')
      throw new Error(`ng add left the builder "${build.builder}"`);
    if (build.options.singleFile !== 'dist/app.html')
      throw new Error(`ng add set singleFile "${build.options.singleFile}"`);
    build.options.styles = [
      ...(build.options.styles ?? []),
      '@angular/material/prebuilt-themes/azure-blue.css',
    ];
    writeFileSync(workspaceFile, JSON.stringify(workspace, null, 2));
    writeFileSync(join(app, 'src/main.ts'), MAIN);
    writeFileSync(join(app, 'src/later.ts'), LATER);
    writeFileSync(join(app, 'src/more.ts'), MORE);

    const output = await step('ng build', () => run('npx ng build', app));
    if (!/Single file: dist\/app\.html/.test(output))
      throw new Error('the build did not report the single file');
    if (!/chunks? merged into the file/.test(output))
      throw new Error('the build did not merge the lazy chunks');
    const html = readFileSync(join(app, 'dist/app.html'), 'utf8');
    if (/<script[^>]+\ssrc=/.test(html)) throw new Error('the single file still loads a script');
    if (/<link[^>]+rel="stylesheet"[^>]+href="(?!https?:)/.test(html))
      throw new Error('the single file still loads a stylesheet');

    await step('browser', async () => {
      const server = http.createServer((_req, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(html);
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        // Outside a host the library says so
        await page.locator('#status', { hasText: 'standalone' }).waitFor({ timeout: 8000 });
        // Material is styled (its theme is inside the file) and reacts
        const bar = await page.locator('mat-progress-bar').boundingBox();
        if (!bar || bar.height < 2 || bar.width < 50)
          throw new Error('the Material progress bar has no size: its styles are missing');
        await page.locator('#box input').check();
        await page.locator('#done', { hasText: 'yes' }).waitFor({ timeout: 3000 });
        // The lazy parts are in the file: they appear without fetching anything
        await page.locator('#later', { hasText: 'deferred' }).waitFor({ timeout: 3000 });
        await page.locator('#dynamic', { hasText: 'dynamic import' }).waitFor({ timeout: 3000 });
        if (errors.length) throw new Error(`errors in the page: ${errors.join(' | ')}`);
      } finally {
        await page.close();
        server.close();
      }
    });
    return { major, ok: true, angular, kB: Math.round(html.length / 1024), steps };
  } catch (e) {
    return { major, ok: false, error: e.message, steps };
  }
}

console.log(
  `Checking Angular ${targets.join(', ')} with ${library.split('/').at(-1)} and ${builder.split('/').at(-1)}`,
);
const results = await Promise.all(targets.map(check));
await browser.close();

for (const r of results) {
  if (r.ok)
    console.log(
      `ok    Angular ${r.angular}: single file ${r.kB} kB, Material and the library work. ${r.steps.join(', ')}`,
    );
  else
    console.log(`FAIL  Angular ${r.major}: after ${r.steps.join(', ') || 'nothing'}\n${r.error}`);
}
if (keep) console.log(`Kept: ${work}`);
else rmSync(work, { recursive: true, force: true, maxRetries: 5 });
process.exit(results.every((r) => r.ok) ? 0 : 1);
