// End-to-end: runs the real Angular CLI on the fixture application, with the builder taken from
// dist/ngx-mcp-apps-builder (build it first: `npm run build:builder`; `npm run test:builder` does both).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const fixture = join(here, 'fixture');
const builderDist = join(repo, 'dist/ngx-mcp-apps-builder');
const cli = dirname(createRequire(import.meta.url).resolve('@angular/cli/package.json'));

function ngBuild(...args: string[]) {
  const result = spawnSync(process.execPath, [join(cli, 'bin/ng.js'), 'build', ...args], {
    cwd: fixture,
    encoding: 'utf8',
    env: { ...process.env, NG_CLI_ANALYTICS: 'false', CI: 'true', NO_COLOR: '1' },
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

// A src or href that points to a local .js or .css file
const LOCAL_ASSET = /(?:src|href)\s*=\s*["']?(?![a-z][a-z0-9+.-]*:|\/\/)[^"'\s>]*\.(?:m?js|css)\b/i;

describe('ngx-mcp-apps-builder:application', () => {
  beforeAll(() => {
    if (!existsSync(join(builderDist, 'builders.json'))) {
      throw new Error('dist/ngx-mcp-apps-builder is missing: run "npm run build:builder" first.');
    }
    // The fixture resolves the builder like a consumer does: from its own node_modules
    const link = join(fixture, 'node_modules/ngx-mcp-apps-builder');
    rmSync(join(fixture, 'node_modules'), { recursive: true, force: true });
    rmSync(join(fixture, 'dist'), { recursive: true, force: true });
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(builderDist, link, 'junction');
  });

  it('writes one self-contained HTML file', () => {
    const { status, output } = ngBuild('--configuration', 'single');
    expect(status, output).toBe(0);
    expect(output).toMatch(/Single file: dist\/app\.html \(\d+(\.\d+)? kB\)/);

    const html = readFileSync(join(fixture, 'dist/app.html'), 'utf8');
    expect(html).toMatch(/<script type="module">[^<]/);
    expect(html).toMatch(/<style>[^<]/);
    expect(html).not.toMatch(LOCAL_ASSET);
    expect(html).not.toContain('modulepreload');
    // The application and its global styles are really inside
    expect(html).toContain('fixture-count');
    expect(html).toContain('#fdf6e3');
    // The image of the global stylesheet and of the component style is embedded, in both places
    expect(output).toMatch(/1 font or image file embedded as data: URL/);
    expect(html.match(/url\("?data:image\/png;base64,/g)).toHaveLength(2);
    expect(html).not.toMatch(/media\/dot/);
    // What cannot be part of the file is reported: the image of the template, the remote script
    expect(output).toMatch(/not part of the single file[^]*- logo\.svg/);
    expect(output).toMatch(/remote URLs:\s*- https:\/\/example\.com\/remote\.js/);
    expect(output).toMatch(/resourceDomains\): https:\/\/example\.com/);
    expect(html).toContain('<script src="https://example.com/remote.js"');
    // The external link of the source index.html is untouched
    expect(html).toContain('href="https://example.com"');
    // The "</script>" inside a string of the application did not close the element
    expect(html).toContain('fixture-marker');
    expect(html.match(/<script\b/gi)).toHaveLength(html.match(/<\/script>/gi)!.length);
    // The normal output of the official builder is still there
    expect(existsSync(join(fixture, 'dist/app/browser/index.html'))).toBe(true);
  });

  it('behaves like the official builder without singleFile', () => {
    const { status, output } = ngBuild();
    expect(status, output).toBe(0);
    expect(output).not.toContain('Single file:');
    expect(existsSync(join(fixture, 'dist/plain/browser/index.html'))).toBe(true);
    expect(existsSync(join(fixture, 'dist/plain.html'))).toBe(false);
  });

  it('merges lazy chunks into the single file', () => {
    const { status, output } = ngBuild('--configuration', 'lazy');
    expect(status, output).toBe(0);
    expect(output).toMatch(/\d+ JavaScript chunks? merged into the file \(\d+ loaded on demand/);
    expect(output).toMatch(/Single file: dist\/lazy\.html/);

    const html = readFileSync(join(fixture, 'dist/lazy.html'), 'utf8');
    // One module, with the application that was to be loaded on demand inside, and nothing left to fetch
    expect(html.match(/<script type="module">/g)).toHaveLength(1);
    expect(html).toContain('fixture-count');
    expect(html).not.toMatch(LOCAL_ASSET);
    expect(html).not.toMatch(/import\(\s*["'`]\.\/chunk-/);
    expect(html).not.toMatch(/from\s*["'`]\.\/chunk-/);
  });
});
