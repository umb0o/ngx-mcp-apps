// Builds the documentation site into dist/site: static HTML for people, and the same content as plain text
// for coding agents (llms.txt, llms-full.txt, every page as Markdown, the components as raw files, a skill).
//
// The README files are the source of truth for the documentation: the pages are cut out of them.
// The example application is built with the builder of this repository, so run `npm run build` first.
import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { Marked } from 'marked';
import { createHighlighter } from 'shiki';

const SITE_URL = 'https://umb0o.github.io/ngx-mcp-apps/';
const REPO_URL = 'https://github.com/umb0o/ngx-mcp-apps';
const out = 'dist/site';
const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const write = (file, text) => {
  mkdirSync(dirname(`${out}/${file}`), { recursive: true });
  writeFileSync(`${out}/${file}`, text);
};
const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- the example application

for (const need of ['dist/ngx-mcp-apps/package.json', 'dist/ngx-mcp-apps-builder/builders.json']) {
  if (!existsSync(need)) throw new Error(`${need} is missing: run "npm run build" first.`);
}
// The example resolves the builder like a consumer does: from node_modules
const link = 'node_modules/ngx-mcp-apps-builder';
rmSync(link, { recursive: true, force: true });
symlinkSync(resolve('dist/ngx-mcp-apps-builder'), link, 'junction');
execSync('npx ng build chart', { stdio: 'inherit' });
execSync('npx ng build example', { stdio: 'inherit' });
execSync('npx ng build one-file', { stdio: 'inherit' });
execSync('npx ng build gallery', { stdio: 'inherit' });
execSync('npx ng build routing', { stdio: 'inherit' });
execSync('npx ng build security', { stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('dist/chart.html', `${out}/example/chart.html`);
cpSync('projects/chart/src/main.ts', `${out}/example/chart.ts`);
cpSync('dist/example.html', `${out}/example/app.html`);
cpSync('dist/one-file.html', `${out}/example/one-file.html`);
cpSync('dist/gallery.html', `${out}/example/gallery.html`);
cpSync('dist/routing.html', `${out}/example/routing.html`);
cpSync('dist/security.html', `${out}/example/security.html`);
cpSync('site/assets', `${out}/assets`, { recursive: true });
cpSync('site/skill', `${out}/skill`, { recursive: true });
writeFileSync(`${out}/.nojekyll`, '');

// ---------------------------------------------------------------- sources

/** Sections of a Markdown file, by the text of their `## ` heading. */
function sections(markdown) {
  const parts = new Map();
  let name = '';
  for (const line of markdown.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading && !inFence(parts.get(name))) name = heading[1].trim();
    parts.set(name, (parts.get(name) ?? '') + line + '\n');
  }
  return parts;
}
/** True if the text ends inside a code fence: a "## " line there is not a heading. */
function inFence(text = '') {
  return (text.match(/^```/gm) ?? []).length % 2 === 1;
}

const readme = sections(read('README.md'));
const take = (...names) =>
  names
    .map((n) => {
      if (!readme.has(n)) throw new Error(`README.md has no section "${n}"`);
      return readme.get(n).trim();
    })
    .join('\n\n');

const version = JSON.parse(read('projects/ngx-mcp-apps/package.json')).version;

/** The copy-and-paste components, read from the example application that compiles them. */
const componentDir = 'projects/example/src/app/components';
const ORDER = [
  'mcp-status',
  'mcp-tool-state',
  'mcp-call-tool',
  'mcp-live-value',
  'mcp-theme',
  'mcp-fullscreen-button',
  'mcp-tell-model',
  'mcp-host-link',
  'mcp-standalone-notice',
];
const files = readdirSync(componentDir).filter((f) => f.endsWith('.ts'));
for (const f of files) {
  if (!ORDER.includes(f.replace(/\.ts$/, ''))) throw new Error(`${f} is not listed in ORDER`);
}
/** A whole application in one file: compiled as its own project, shown first. */
const oneFile = (() => {
  const source = read('projects/one-file/src/main.ts');
  const lines = /^\/\*\*\n([\s\S]*?)\n \*\//
    .exec(source)[1]
    .split('\n')
    .map((l) => l.replace(/^ \* ?/, ''));
  mkdirSync(`${out}/components`, { recursive: true });
  writeFileSync(`${out}/components/one-file-app.ts`, source);
  return {
    name: 'one-file-app',
    file: 'one-file-app.ts',
    title: lines[0].trim(),
    usage: lines.find((l) => l.startsWith('Usage: ')).slice(7),
    description: lines
      .slice(1)
      .filter((l) => !l.startsWith('Usage: '))
      .join('\n')
      .trim(),
    source,
  };
})();

const components = ORDER.map((name) => {
  const file = `${name}.ts`;
  const source = read(`${componentDir}/${file}`);
  const doc = /^\/\*\*\n([\s\S]*?)\n \*\//.exec(source);
  if (!doc) throw new Error(`${file} must start with a /** ... */ comment`);
  const lines = doc[1].split('\n').map((l) => l.replace(/^ \* ?/, ''));
  const title = lines[0].trim();
  const usage = lines.find((l) => l.startsWith('Usage: '))?.slice(7) ?? '';
  const description = lines
    .slice(1)
    .filter((l) => !l.startsWith('Usage: '))
    .join('\n')
    .trim();
  cpSync(`${componentDir}/${file}`, `${out}/components/${file}`);
  return { name, file, title, usage, description, source };
});
write(
  'components/index.json',
  JSON.stringify(
    {
      about:
        'Copy-and-paste Angular components for MCP Apps built with ngx-mcp-apps. Each file is standalone.',
      components: [oneFile, ...components].map(({ name, file, title, usage, description }) => ({
        name,
        title,
        description: description.replace(/\n/g, ' '),
        usage,
        source: `${SITE_URL}components/${file}`,
      })),
    },
    null,
    2,
  ) + '\n',
);

// The Components page is a list to choose from; each component has a page of its own with the code.
const allComponents = [oneFile, ...components];
for (const c of allComponents) {
  c.key = `component-${c.name}`;
  const text = c.description.replace(/\n/g, ' ');
  const end = text.indexOf('. ');
  c.summary = end === -1 ? text : text.slice(0, end + 1);
}
const LISTS = { 'one-file': [oneFile], pieces: components };
/** `<!-- list: name -->` as Markdown, for agents. */
const listMarkdown = (name) =>
  LISTS[name].map((c) => `- [${c.title}](${c.key}.html): ${c.summary}`).join('\n');
/** `<!-- list: name -->` as HTML: the whole row is the link. */
const listHtml = (name) =>
  `<ul class="pick">\n${LISTS[name]
    .map(
      (c) =>
        `<li><a href="${c.key}.html"><strong>${escapeHtml(c.title)}</strong>` +
        `<span>${escapeHtml(c.summary.replace(/`/g, ''))}</span>` +
        `<code>${escapeHtml(c.file)}</code></a></li>`,
    )
    .join('\n')}\n</ul>`;

const componentPage = (c, i) => {
  const previous = allComponents[i - 1];
  const next = allComponents[i + 1];
  const around = [
    previous && `Previous: [${previous.title}](${previous.key}.html)`,
    next && `Next: [${next.title}](${next.key}.html)`,
  ].filter(Boolean);
  return {
    key: c.key,
    parent: 'components',
    title: c.title,
    markdown:
      `[All components](components.html)\n\n# ${c.title}\n\n${c.description}\n\n` +
      // Two tabs, as in a component library: seen working (the whole app, or the piece alone), then the code
      '<!-- tabs -->\n\n' +
      (c === oneFile ? '<!-- stage: one-file -->\n\n' : `<!-- preview: ${c.name} -->\n\n`) +
      '<!-- tab: code -->\n\n' +
      `**Usage:** ${c.usage}\n\nFile: [\`${c.file}\`](components/${c.file})\n\n` +
      '```ts\n' +
      c.source.trim() +
      '\n```\n\n' +
      '<!-- /tabs -->\n\n' +
      around.join('\n\n'),
  };
};

/** Replaces `<!-- source: path -->` with the file as a code block. */
const withSources = (markdown) =>
  markdown.replace(/<!-- source: (.+?) -->/g, (_, file) => {
    const lang = file.endsWith('.ts') ? 'ts' : 'text';
    return `\`${posix.basename(file)}\`\n\n\`\`\`${lang}\n${read(file).trim()}\n\`\`\``;
  });

const home = `# ngx-mcp-apps

Angular pages inside the conversation. An MCP App is a small web page that an AI chat host, such as Claude, shows
in the conversation when the model calls a tool. \`ngx-mcp-apps\` lets you write that page as a normal Angular
application: the connection, the data of the tool call, the host theme and the display mode are signals.
\`ngx-mcp-apps-builder\` builds the application into the single HTML file that hosts expect.

\`\`\`bash
ng add ngx-mcp-apps-builder
\`\`\`

- [Get started](start.html): install, configure, read the tool result, build one HTML file.
- [The example](example.html): a chart the model draws and keeps working on, running against a host inside the
  page.
- [Components](components.html): nine files to copy and paste.
- [The server side](server.html): the smallest MCP server that opens the app.
- [For AI agents](agents.html): this documentation as plain text, and a skill.

Version ${version}. Angular 18 to 22. MIT licence. Unofficial community library, not affiliated with or endorsed by
Anthropic, OpenAI or the Model Context Protocol project.`;

const pages = [
  { key: 'index', nav: 'Overview', title: 'ngx-mcp-apps', markdown: home },
  {
    key: 'start',
    nav: 'Get started',
    title: 'Get started',
    markdown:
      '# Get started\n\n' +
      take('Quick start', 'How it fits together').replace(/^## Quick start\n+/, ''),
  },
  {
    key: 'guide',
    nav: 'Working with the model',
    title: 'Working with the model',
    markdown:
      '# Working with the model\n\n' +
      take('Following the model while the app is open', 'Checking your own data'),
  },
  {
    key: 'routing',
    nav: 'Routing',
    title: 'Routing',
    markdown: withSources(read('site/pages/routing.md')),
  },
  {
    key: 'security',
    nav: 'Security',
    title: 'Security',
    // The checklist stays in the README, its one source: here it follows the live example
    markdown: withSources(read('site/pages/security.md')).replace(
      '<!-- checklist -->',
      take('Security').replace(/^## Security\n+/, ''),
    ),
  },
  {
    key: 'theme',
    nav: 'Theme',
    title: 'Theme',
    markdown: read('site/pages/theme.md'),
  },
  {
    key: 'components',
    nav: 'Components',
    title: 'Components',
    markdown: read('site/pages/components.md'),
  },
  ...allComponents.map(componentPage),
  {
    key: 'example',
    nav: 'The example',
    title: 'The example',
    markdown: withSources(read('site/pages/example.md')),
  },
  {
    key: 'server',
    nav: 'The server side',
    title: 'The server side',
    markdown: read('site/pages/server.md'),
  },
  {
    key: 'builder',
    nav: 'The builder',
    title: 'The builder',
    markdown: read('projects/ngx-mcp-apps-builder/README.md').replace(/^# .+$/m, '# The builder'),
    base: 'projects/ngx-mcp-apps-builder',
  },
  {
    key: 'reference',
    nav: 'Reference',
    title: 'Reference',
    markdown: '# Reference\n\n' + take('API', 'Configuration', 'Compatibility', 'Limits'),
  },
  {
    key: 'agents',
    nav: 'For AI agents',
    title: 'For AI agents',
    markdown: read('site/pages/agents.md'),
  },
];

// ---------------------------------------------------------------- links

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

/** Which page holds each heading, to send `#anchor` links of the README to the right page. */
const anchors = new Map();
for (const page of pages) {
  page.slugs = new Set();
  let fence = false;
  for (const line of page.markdown.split('\n')) {
    if (line.startsWith('```')) fence = !fence;
    const heading = !fence && /^#{1,4} (.+)$/.exec(line);
    if (!heading) continue;
    const id = slug(heading[1]);
    page.slugs.add(id);
    if (!anchors.has(id)) anchors.set(id, page.key);
  }
}
const siteFiles = new Set([
  'llms.txt',
  'llms-full.txt',
  'example/app.html',
  'components/index.json',
]);
const README_PAGES = { 'README.md': 'index', 'projects/ngx-mcp-apps-builder/README.md': 'builder' };

/** Rewrites a link written for the README (or for the site) so that it works in a page with extension `ext`. */
function mapLink(href, page, ext) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  if (href.startsWith('#')) {
    const id = href.slice(1);
    if (page.slugs.has(id)) return href;
    const owner = anchors.get(id);
    if (!owner) throw new Error(`${page.key}: no heading for the link ${href}`);
    return `${owner}.${ext}#${id}`;
  }
  const [path, hash = ''] = href.split('#');
  const tail = hash ? `#${hash}` : '';
  // A link between pages of the site
  const pageKey = /^([\w-]+)\.html$/.exec(path)?.[1];
  if (pageKey && pages.some((p) => p.key === pageKey)) return `${pageKey}.${ext}${tail}`;
  if (
    siteFiles.has(path) ||
    path.startsWith('components/') ||
    path.startsWith('skill/') ||
    path.startsWith('example/')
  )
    return href;
  // A link between files of the repository
  const target = posix.normalize(posix.join(page.base ?? '', path));
  if (README_PAGES[target]) {
    if (!hash) return `${README_PAGES[target]}.${ext}`;
    const owner = anchors.get(hash) ?? README_PAGES[target];
    return `${owner}.${ext}${tail}`;
  }
  if (!existsSync(target)) throw new Error(`${page.key}: the link ${href} points to nothing`);
  return `${REPO_URL}/blob/main/${target}${tail}`;
}

/** The Markdown of a page as it is served to agents: links point to the .md pages. */
function markdownFor(page) {
  let fence = false;
  return page.markdown
    .replace(/<!-- (?:tabs|tab: \w+|\/tabs) -->\n*/g, '')
    .replace(/<!-- list: ([\w-]+) -->/g, (_, name) => listMarkdown(name))
    .split('\n')
    .map((line) => {
      if (line.startsWith('```')) fence = !fence;
      if (fence) return line;
      return line.replace(/\]\(([^)\s]+)\)/g, (_, href) => `](${mapLink(href, page, 'md')})`);
    })
    .join('\n')
    .replace(
      /<!-- (?:stage|preview)(: [\w-]+)? -->/g,
      `(A live demo is shown here in the HTML page: ${SITE_URL}${page.key}.html)`,
    );
}

// ---------------------------------------------------------------- HTML

const highlighter = await createHighlighter({
  themes: ['poimandres'],
  langs: ['ts', 'js', 'json', 'bash', 'html', 'css'],
});

const stageTemplate = read('site/stage.html');
/** The stage of an application of dist/site/example. Its name is also the scenario host.js plays for it. */
const stageFor = (app) =>
  stageTemplate
    .replaceAll('APP_URL', `example/${app}.html`)
    .replace('data-host', `data-host data-scenario="${app}"`);
const stage = stageFor('app');
/** `<!-- stage -->` is the packing list, `<!-- stage: name -->` another application of dist/site/example. */
const previewTemplate = read('site/preview.html');
const withStages = (html) =>
  html
    .replace(/<!-- stage(?:: ([\w-]+))? -->/g, (_, app) => stageFor(app ?? 'app'))
    // `<!-- preview: name -->`: one component alone, in the gallery application
    .replace(/<!-- preview: ([\w-]+) -->/g, (_, name) =>
      previewTemplate.replaceAll('APP_URL', `example/gallery.html#${name}`),
    );

/** The Components section has its own menu, as component libraries do: pick one, see it, copy it. */
function componentMenu(page) {
  const link = (key, text) =>
    `<li><a href="${key}.html"${key === page.key ? ' aria-current="page"' : ''}>${escapeHtml(text)}</a></li>`;
  const items = [
    link('components', 'All components'),
    ...allComponents.map((c) => link(c.key, c.title)),
  ].join('\n');
  // Two forms of the same list: always open beside the text on a wide screen, folded on a phone
  return (
    `<nav class="menu" aria-label="Components"><ul>\n${items}\n</ul></nav>\n` +
    `<details class="menu-fold"><summary>Components: ${escapeHtml(page.parent ? page.title : 'all')}</summary><ul>\n${items}\n</ul></details>`
  );
}

function render(page) {
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const id = slug(html);
        if (depth === 1) return `<h1 id="${id}">${html}</h1>\n`;
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${html}</a></h${depth}>\n`;
      },
      link({ href, tokens }) {
        return `<a href="${escapeHtml(mapLink(href, page, 'html'))}">${this.parser.parseInline(tokens)}</a>`;
      },
      code({ text, lang }) {
        const known = highlighter.getLoadedLanguages().includes(lang);
        if (!known) return `<pre><code>${escapeHtml(text)}</code></pre>\n`;
        return highlighter.codeToHtml(text, { lang, theme: 'poimandres' });
      },
      table(token) {
        // Wide tables scroll on their own instead of widening the page
        const header = token.header
          .map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`)
          .join('');
        const rows = token.rows
          .map(
            (r) =>
              `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`,
          )
          .join('\n');
        return `<div class="table"><table><thead><tr>${header}</tr></thead><tbody>\n${rows}\n</tbody></table></div>\n`;
      },
    },
  });
  return (
    withStages(marked.parse(page.markdown))
      .replace(/<!-- list: ([\w-]+) -->/g, (_, name) => listHtml(name))
      // Preview and Code as two tabs. Without JavaScript the tab bar stays hidden and both parts show.
      .replace(
        '<!-- tabs -->',
        '<div class="tabs" data-tabs>\n<div class="tablist" role="tablist" aria-label="Preview or code" hidden>' +
          '<button type="button" role="tab">Preview</button><button type="button" role="tab">Code</button></div>\n' +
          '<div class="panel" role="tabpanel">',
      )
      .replace('<!-- tab: code -->', '</div>\n<div class="panel" role="tabpanel">')
      .replace('<!-- /tabs -->', '</div>\n</div>')
  );
}

const description =
  'Write MCP Apps, the interactive pages shown inside AI chats such as Claude, as normal Angular applications.';

function layout(page, body) {
  const nav = pages
    .filter((p) => !p.parent)
    .map(
      (p) =>
        `<li><a href="${p.key}.html"${p.key === page.key || p.key === page.parent ? ' aria-current="page"' : ''}>${p.nav}</a></li>`,
    )
    .join('\n          ');
  const title =
    page.key === 'index' ? 'ngx-mcp-apps: Angular MCP Apps' : `${page.title} · ngx-mcp-apps`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="alternate" type="text/markdown" href="${page.key}.md" title="This page as Markdown" />
    <link rel="alternate" type="text/plain" href="llms.txt" title="Documentation index for AI agents" />
    <script>
      (() => {
        let t = null;
        try { t = localStorage.getItem('theme'); } catch {}
        document.documentElement.dataset.theme =
          t === 'dark' || t === 'light' ? t : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      })();
    </script>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%23b80f4a'/%3E%3Crect x='3' y='4' width='10' height='8' rx='1.5' fill='none' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900;1,62..125,100..900&family=Martian+Mono:wdth,wght@75..112.5,100..800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="assets/site.css" />
  </head>
  <body class="page-${page.key}">
    <p class="for-agents">
      Reading this as an AI agent? This page as plain text: <a href="${page.key}.md">${page.key}.md</a>.
      The whole documentation: <a href="llms-full.txt">llms-full.txt</a>.
      The skill: <a href="skill/ngx-mcp-apps/SKILL.md">SKILL.md</a>.
    </p>
    <div class="shell">
      <header class="side">
        <a class="brand" href="index.html">ngx-mcp-apps <span>${version}</span></a>
        <nav aria-label="Documentation">
          <ul>
          ${nav}
          </ul>
        </nav>
        <div class="side-foot">
          <a href="${REPO_URL}">GitHub</a>
          <a href="https://www.npmjs.com/package/ngx-mcp-apps">npm</a>
          <button type="button" data-theme-toggle>Dark theme</button>
        </div>
      </header>
      <main>
${body}
      </main>
    </div>
    <script type="module" src="assets/site.js"></script>
    ${body.includes('data-host') ? '<script type="module" src="assets/host.js"></script>' : ''}
    ${body.includes('data-scene') ? '<script type="module" src="assets/home.js"></script>' : ''}
  </body>
</html>
`;
}

for (const page of pages) {
  const body =
    page.key === 'index'
      ? read('site/home.html').replace('<!-- stage -->', stage).replace('<!-- version -->', version)
      : page.key === 'components' || page.parent === 'components'
        ? `<div class="with-menu">\n${componentMenu(page)}\n<article class="prose">\n${render(page)}\n</article>\n</div>`
        : `<article class="prose">\n${render(page)}\n</article>`;
  write(`${page.key}.html`, layout(page, body));
  write(`${page.key}.md`, markdownFor(page) + '\n');
}

// ---------------------------------------------------------------- for agents

const skill = read('site/skill/ngx-mcp-apps/SKILL.md');
write(
  'llms.txt',
  `# ngx-mcp-apps

> ${description} Two npm packages: ngx-mcp-apps (the library: the MCP Apps protocol as Angular signals) and
> ngx-mcp-apps-builder (an Angular CLI builder that writes the application as one self-contained HTML file).
> Version ${version}. Angular 18 to 22.

Install both in an Angular workspace with \`ng add ngx-mcp-apps-builder\`.

## Documentation

${pages
  .filter((p) => p.key !== 'index')
  .map((p) => `- [${p.title}](${SITE_URL}${p.key}.md)`)
  .join('\n')}

## For agents

- [Skill](${SITE_URL}skill/ngx-mcp-apps/SKILL.md): steps, rules and API in one file. Read this first.
- [Everything in one file](${SITE_URL}llms-full.txt)
- [Components index](${SITE_URL}components/index.json): copy-and-paste components, with the address of each source file

## Source

- [Repository](${REPO_URL})
- [Changelog](${REPO_URL}/blob/main/CHANGELOG.md)
`,
);
write(
  'llms-full.txt',
  `# ngx-mcp-apps: complete documentation\n\nVersion ${version}. Source: ${SITE_URL}\n\n` +
    [
      skill.replace(/^---[\s\S]*?---\n/, '').trim(),
      ...pages.slice(1).map((p) => markdownFor(p).trim()),
    ].join('\n\n---\n\n') +
    '\n',
);
write(
  'robots.txt',
  `User-agent: *\nAllow: /\n\n# Documentation for AI agents: ${SITE_URL}llms.txt\n`,
);

console.log(`Site ready in ${out}: ${pages.length} pages, ${components.length} components`);
