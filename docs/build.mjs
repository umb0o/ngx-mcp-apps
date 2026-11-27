// Builds the documentation site into dist/site: static HTML for people, and the same content as plain text
// for coding agents (llms.txt, llms-full.txt, every page as Markdown, the components as raw files, a skill).
//
// Everything the site is made of lives in docs/: pages (Markdown, English in docs/pages and translations in
// docs/pages/<lang>), templates, assets, the skill, and the example applications in docs/apps. "The builder" page is
// the README of the builder package in English. Every language has every page: a missing one fails the build.
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
import { createHash } from 'node:crypto';
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
cpSync('docs/apps/chart/src/main.ts', `${out}/example/chart.ts`);
cpSync('dist/example.html', `${out}/example/app.html`);
cpSync('dist/one-file.html', `${out}/example/one-file.html`);
cpSync('dist/gallery.html', `${out}/example/gallery.html`);
cpSync('dist/routing.html', `${out}/example/routing.html`);
cpSync('dist/security.html', `${out}/example/security.html`);
cpSync('docs/assets', `${out}/assets`, { recursive: true });
cpSync('docs/skill', `${out}/skill`, { recursive: true });
writeFileSync(`${out}/.nojekyll`, '');

// A browser keeps a stylesheet or a script for a while: the address of each one carries a hash of its content, so a
// new version of the site is never shown with the old styles
const ASSET_VERSION = Object.fromEntries(
  ['site.css', 'site.js', 'host.js', 'home.js'].map((name) => [
    name,
    createHash('sha256')
      .update(readFileSync(`docs/assets/${name}`))
      .digest('hex')
      .slice(0, 10),
  ]),
);
const asset = (root, name) => `${root}assets/${name}?v=${ASSET_VERSION[name]}`;

// ---------------------------------------------------------------- sources

const version = JSON.parse(read('projects/ngx-mcp-apps/package.json')).version;

/** The copy-and-paste components, read from the example application that compiles them. */
const componentDir = 'docs/apps/example/src/app/components';
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
  const source = read('docs/apps/one-file/src/main.ts');
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

const allComponents = [oneFile, ...components];

/** Replaces `<!-- source: path -->` with the file as a code block. */
const withSources = (markdown) =>
  markdown.replace(/<!-- source: (.+?) -->/g, (_, file) => {
    const lang = file.endsWith('.ts') ? 'ts' : 'text';
    return `\`${posix.basename(file)}\`\n\n\`\`\`${lang}\n${read(file).trim()}\n\`\`\``;
  });

// ---------------------------------------------------------------- languages

/**
 * English is the source and lives at the root; every other language lives in a folder of its own, with the same
 * page names. A page that is missing in a language is a build error: the two sites stay complete.
 */
// SITE_LANGS=en builds the English site alone, for a quick look while writing
const LANGS = (process.env.SITE_LANGS ?? 'en,it').split(',');
const DEFAULT_LANG = 'en';
const prefixOf = (lang) => (lang === DEFAULT_LANG ? '' : `${lang}/`);
const rootOf = (lang) => (lang === DEFAULT_LANG ? '' : '../');
const LOCALE = { en: 'en_US', it: 'it_IT' };

/** The words of the interface. Page titles and navigation labels are here too. */
const UI = {
  en: {
    langName: 'English',
    forAgentsLabel: 'For AI agents',
    skip: 'Skip to content',
    switchTo: 'Leggi in italiano',
    homeTitle: 'ngx-mcp-apps: Angular MCP Apps, agentic apps inside the chat',
    description:
      'Write MCP Apps, the interactive pages shown inside AI chats such as Claude, as normal Angular applications.',
    docs: 'Documentation',
    onThisPage: 'On this page',
    previous: 'Previous',
    next: 'Next',
    pagesLabel: 'Pages',
    allComponents: 'All components',
    componentsLabel: 'Components',
    componentsFold: (title) => `Components: ${title}`,
    all: 'all',
    previewOrCode: 'Preview or code',
    preview: 'Preview',
    code: 'Code',
    usage: 'Usage',
    file: 'File',
    darkTheme: 'Dark theme',
    liveDemo: (url) => `(A live demo is shown here in the HTML page: ${url})`,
    forAgents: (md, root) =>
      `Reading this as an AI agent? This page as plain text: <a href="${md}">${md}</a>.
      The whole documentation: <a href="${root}llms-full.txt">llms-full.txt</a>.
      The skill: <a href="${root}skill/ngx-mcp-apps/SKILL.md">SKILL.md</a>.`,
    pages: {
      index: ['Overview', 'ngx-mcp-apps'],
      start: ['Get started', 'Get started'],
      guide: ['Working with the model', 'Working with the model'],
      routing: ['Routing', 'Routing'],
      security: ['Security', 'Security'],
      theme: ['Theme', 'Theme'],
      components: ['Components', 'Components'],
      example: ['The example', 'The example'],
      server: ['The server side', 'The server side'],
      builder: ['The builder', 'The builder'],
      reference: ['Reference', 'Reference'],
      agents: ['For AI agents', 'For AI agents'],
    },
  },
  it: {
    langName: 'Italiano',
    forAgentsLabel: 'Per gli agenti AI',
    skip: 'Vai al contenuto',
    switchTo: 'Read in English',
    homeTitle: 'ngx-mcp-apps: MCP App con Angular, app agentiche dentro la chat',
    description:
      'Scrivi MCP App, le pagine interattive che le chat AI come Claude mostrano nella conversazione, come normali applicazioni Angular.',
    docs: 'Documentazione',
    onThisPage: 'In questa pagina',
    previous: 'Precedente',
    next: 'Successiva',
    pagesLabel: 'Pagine',
    allComponents: 'Tutti i componenti',
    componentsLabel: 'Componenti',
    componentsFold: (title) => `Componenti: ${title}`,
    all: 'tutti',
    previewOrCode: 'Anteprima o codice',
    preview: 'Anteprima',
    code: 'Codice',
    usage: 'Uso',
    file: 'File',
    darkTheme: 'Tema scuro',
    liveDemo: (url) => `(Qui la pagina HTML mostra una demo dal vivo: ${url})`,
    forAgents: (md, root) =>
      `Sei un agente AI? Questa pagina in testo semplice: <a href="${md}">${md}</a>.
      Tutta la documentazione (in inglese): <a href="${root}llms-full.txt">llms-full.txt</a>.
      La skill: <a href="${root}skill/ngx-mcp-apps/SKILL.md">SKILL.md</a>.`,
    pages: {
      index: ['Panoramica', 'ngx-mcp-apps'],
      start: ['Inizia', 'Inizia'],
      guide: ['Lavorare con il modello', 'Lavorare con il modello'],
      routing: ['Routing', 'Routing'],
      security: ['Sicurezza', 'Sicurezza'],
      theme: ['Tema', 'Tema'],
      components: ['Componenti', 'Componenti'],
      example: ["L'esempio", "L'esempio"],
      server: ['Il lato server', 'Il lato server'],
      builder: ['Il builder', 'Il builder'],
      reference: ['Riferimento', 'Riferimento'],
      agents: ['Per gli agenti AI', 'Per gli agenti AI'],
    },
  },
};

/** The source of a page in a language: English in docs/pages, the others in docs/pages/<lang>. */
const pageSource = (lang, name) => {
  const file = lang === DEFAULT_LANG ? `docs/pages/${name}.md` : `docs/pages/${lang}/${name}.md`;
  if (!existsSync(file))
    throw new Error(`${file} is missing: every page needs its ${lang} version`);
  return read(file);
};

/** The components in a language: titles and descriptions translated, code and usage shared. */
function componentsIn(lang) {
  if (lang === DEFAULT_LANG) return allComponents.map((c) => ({ ...c }));
  const file = `docs/i18n/${lang}/components.json`;
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  const texts = JSON.parse(read(file));
  return allComponents.map((c) => {
    const t = texts[c.name];
    if (!t?.title || !t?.description)
      throw new Error(`${file}: no title or description for ${c.name}`);
    return { ...c, title: t.title, description: t.description.trim() };
  });
}

const firstSentence = (text) => {
  const flat = text.replace(/\n/g, ' ');
  const end = flat.indexOf('. ');
  return end === -1 ? flat : flat.slice(0, end + 1);
};

/** The plain text of a bit of Markdown or HTML, for descriptions and structured data. */
const plain = (text) =>
  text
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#64;/g, '@')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** About 155 characters, cut at a word: what a search engine shows under the title. */
const clip = (text, max = 158) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…';
};

/** The first paragraph of prose after the title: the description of the page. */
function describe(markdown) {
  let fence = false;
  let seenTitle = false;
  const lines = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) fence = !fence;
    if (fence) continue;
    if (/^# /.test(line)) {
      seenTitle = true;
      continue;
    }
    if (!seenTitle) continue;
    if (!line.trim()) {
      if (lines.length) break;
      continue;
    }
    if (/^(<!--|#|\||- |\[[^\]]+\]\([^)]+\)$)/.test(line.trim())) {
      if (lines.length) break;
      continue;
    }
    lines.push(line);
  }
  return clip(plain(lines.join(' ')));
}

/** The pages of a language, in the order of the navigation. */
function pagesIn(lang) {
  const t = UI[lang];
  const comps = componentsIn(lang);
  for (const c of comps) {
    c.key = `component-${c.name}`;
    c.summary = firstSentence(c.description);
  }
  const homeMarkdown =
    lang === DEFAULT_LANG
      ? `# ngx-mcp-apps

Agentic apps inside the conversation. An MCP App is a small web page that an AI chat host, such as Claude, shows
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

Version ${version}. Angular 18 to 22. Tested with Claude (claude.ai on the web, the Claude app for Android). MIT
licence. Unofficial community library, not affiliated with or endorsed by Anthropic, OpenAI or the Model Context
Protocol project.`
      : `# ngx-mcp-apps

App agentiche dentro la conversazione. Una MCP App è una piccola pagina web che una chat AI, come Claude, mostra
nella conversazione quando il modello chiama un tool. \`ngx-mcp-apps\` ti fa scrivere quella pagina come una
normale applicazione Angular: la connessione, i dati della chiamata al tool, il tema dell'host e la modalità di
visualizzazione sono signal. \`ngx-mcp-apps-builder\` trasforma l'applicazione nell'unico file HTML che gli host
si aspettano.

\`\`\`bash
ng add ngx-mcp-apps-builder
\`\`\`

- [Inizia](start.html): installare, configurare, leggere il risultato del tool, generare un file HTML.
- [L'esempio](example.html): un grafico che il modello disegna e continua a modificare, con un host dentro la
  pagina.
- [Componenti](components.html): nove file da copiare e incollare.
- [Il lato server](server.html): il server MCP più piccolo che apre l'app.
- [Per gli agenti AI](agents.html): questa documentazione in testo semplice, e una skill.

Versione ${version}. Angular dalla 18 alla 22. Provata con Claude (claude.ai sul web, l'app Claude per Android).
Licenza MIT. Libreria non ufficiale della comunità, non affiliata né approvata da Anthropic, OpenAI o dal progetto
Model Context Protocol.`;

  const page = (key, markdown, extra = {}) => ({
    key,
    nav: t.pages[key][0],
    title: t.pages[key][1],
    markdown,
    ...extra,
  });
  const componentPage = (c) => ({
    key: c.key,
    parent: 'components',
    title: c.title,
    markdown:
      `[${t.allComponents}](components.html)\n\n# ${c.title}\n\n${c.description}\n\n` +
      // Two tabs, as in a component library: seen working (the whole app, or the piece alone), then the code
      '<!-- tabs -->\n\n' +
      (c.name === 'one-file-app'
        ? '<!-- stage: one-file -->\n\n'
        : `<!-- preview: ${c.name} -->\n\n`) +
      '<!-- tab: code -->\n\n' +
      `**${t.usage}:** ${c.usage}\n\n${t.file}: [\`${c.file}\`](components/${c.file})\n\n` +
      '```ts\n' +
      c.source.trim() +
      '\n```\n\n' +
      '<!-- /tabs -->\n',
  });
  const builderMarkdown =
    lang === DEFAULT_LANG
      ? // The npm page of the builder: its badges belong to npm and GitHub, not to this page
        read('projects/ngx-mcp-apps-builder/README.md')
          .replace(/^# .+$/m, '# The builder')
          .replace(/^(?:\[!\[[^\n]*\n)+\n/m, '')
      : pageSource(lang, 'builder').replace(/^(?:\[!\[[^\n]*\n)+\n/m, '');

  const pages = [
    page('index', homeMarkdown),
    page('start', pageSource(lang, 'start')),
    page('guide', pageSource(lang, 'guide')),
    page('routing', withSources(pageSource(lang, 'routing'))),
    page('security', withSources(pageSource(lang, 'security'))),
    page('theme', pageSource(lang, 'theme')),
    page('components', pageSource(lang, 'components')),
    ...comps.map(componentPage),
    page('example', withSources(pageSource(lang, 'example'))),
    page('server', pageSource(lang, 'server')),
    page('builder', builderMarkdown, { base: 'projects/ngx-mcp-apps-builder' }),
    page('reference', pageSource(lang, 'reference')),
    page('agents', pageSource(lang, 'agents')),
  ];
  // The files each page is made of: their last commit is the date of the page in the sitemap
  const own = (name) =>
    lang === DEFAULT_LANG ? `docs/pages/${name}.md` : `docs/pages/${lang}/${name}.md`;
  const inlined = (file) => [...read(file).matchAll(/<!-- source: (.+?) -->/g)].map((m) => m[1]);
  for (const p of pages) {
    const comp = comps.find((c) => c.key === p.key);
    if (p.key === 'index')
      p.files = [
        lang === DEFAULT_LANG ? 'docs/templates/home.html' : `docs/templates/${lang}/home.html`,
      ];
    else if (comp)
      p.files = [
        comp.name === 'one-file-app'
          ? 'docs/apps/one-file/src/main.ts'
          : `${componentDir}/${comp.file}`,
        ...(lang === DEFAULT_LANG ? [] : [`docs/i18n/${lang}/components.json`]),
      ];
    else if (p.key === 'builder')
      p.files = [
        lang === DEFAULT_LANG ? 'projects/ngx-mcp-apps-builder/README.md' : own('builder'),
      ];
    else p.files = [own(p.key), ...inlined(own(p.key))];
  }
  return { pages, comps };
}

/**
 * The date of the last change of some files: their last commit, or today when they have changes not committed yet.
 * Needs the history of the repository (the deploy workflow checks it out whole).
 * The day only: a time with its offset would publish when and where the work was done.
 */
const lastChange = (files) => {
  try {
    const quoted = files.map((file) => JSON.stringify(file)).join(' ');
    if (execSync(`git status --porcelain -- ${quoted}`, { encoding: 'utf8' }).trim()) return today;
    return execSync(`git log -1 --format=%cs -- ${quoted}`, { encoding: 'utf8' }).trim() || today;
  } catch {
    return today;
  }
};

// ---------------------------------------------------------------- links

/** The id of a heading: lowercase, accents removed, punctuation removed, spaces as hyphens. */
const slug = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;|&#\d+;/g, '')
    .replace(/[`*_]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const siteFiles = new Set([
  'llms.txt',
  'llms-full.txt',
  'example/app.html',
  'components/index.json',
]);
const README_PAGES = { 'README.md': 'index', 'projects/ngx-mcp-apps-builder/README.md': 'builder' };

/** The language being built: its pages, its components, its words. */
let ctx;

function indexAnchors(pages) {
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
  return anchors;
}

/** Rewrites a link written for the README (or for the site) so that it works in a page with extension `ext`. */
function mapLink(href, page, ext) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  if (href.startsWith('#')) {
    const id = href.slice(1);
    if (page.slugs.has(id)) return href;
    const owner = ctx.anchors.get(id);
    if (!owner) throw new Error(`${ctx.lang}/${page.key}: no heading for the link ${href}`);
    return `${owner}.${ext}#${id}`;
  }
  const [path, hash = ''] = href.split('#');
  const tail = hash ? `#${hash}` : '';
  // A link between pages of the site
  const pageKey = /^([\w-]+)\.html$/.exec(path)?.[1];
  if (pageKey && ctx.pages.some((p) => p.key === pageKey)) {
    const target = ctx.pages.find((p) => p.key === pageKey);
    if (hash && !target.slugs.has(hash))
      throw new Error(`${ctx.lang}/${page.key}: ${pageKey}.html has no heading #${hash}`);
    return `${pageKey}.${ext}${tail}`;
  }
  // Files shared by every language live at the root of the site
  if (
    siteFiles.has(path) ||
    path.startsWith('components/') ||
    path.startsWith('skill/') ||
    path.startsWith('example/')
  )
    return ctx.root + href;
  // A link between files of the repository
  const target = posix.normalize(posix.join(page.base ?? '', path));
  if (README_PAGES[target]) {
    if (!hash) return `${README_PAGES[target]}.${ext}`;
    const owner = ctx.anchors.get(hash) ?? README_PAGES[target];
    return `${owner}.${ext}${tail}`;
  }
  if (!existsSync(target))
    throw new Error(`${ctx.lang}/${page.key}: the link ${href} points to nothing`);
  return `${REPO_URL}/blob/main/${target}${tail}`;
}

const LISTS = () => ({
  'one-file': ctx.comps.filter((c) => c.name === 'one-file-app'),
  pieces: ctx.comps.filter((c) => c.name !== 'one-file-app'),
});
/** `<!-- list: name -->` as Markdown, for agents. */
const listMarkdown = (name) =>
  LISTS()
    [name].map((c) => `- [${c.title}](${c.key}.html): ${c.summary}`)
    .join('\n');
/** `<!-- list: name -->` as HTML: the whole row is the link. */
const listHtml = (name) =>
  `<ul class="pick">\n${LISTS()
    [name].map(
      (c) =>
        `<li><a href="${c.key}.html"><strong>${escapeHtml(c.title)}</strong>` +
        `<span>${escapeHtml(c.summary.replace(/`/g, ''))}</span>` +
        `<code>${escapeHtml(c.file)}</code></a></li>`,
    )
    .join('\n')}\n</ul>`;

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
    .replace(/<!-- (?:stage|preview)(: [\w-]+)? -->/g, () =>
      ctx.t.liveDemo(`${SITE_URL}${ctx.prefix}${page.key}.html`),
    );
}

// ---------------------------------------------------------------- HTML

const SHIKI_CONTRAST = {
  light: { '#D73A49': '#CF222E', '#6A737D': '#59636E', '#E36209': '#BC4C00', '#22863A': '#116329' },
  dark: { '#6A737D': '#9198A1', '#8B949E': '#9198A1' },
};
const highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['ts', 'js', 'json', 'bash', 'html', 'css'],
});

/**
 * The frame of the live demos in the language of the page. The conversation inside stays in English, like the
 * example applications it runs.
 */
const STAGE_WORDS = {
  it: [
    ['Messages between the app and the host', 'Messaggi tra app e host'],
    ['aria-label="Conversation"', 'aria-label="Conversazione"'],
    ['Added to the model context', 'Aggiunto al contesto del modello'],
    ['<span class="stage-title">Preview</span>', '<span class="stage-title">Anteprima</span>'],
    ['Run again', 'Riavvia'],
    ['aria-label="Live example"', 'aria-label="Esempio dal vivo"'],
    ['aria-label="Live preview"', 'aria-label="Anteprima dal vivo"'],
    ['title="The example application"', 'title="L\'applicazione di esempio"'],
    ['title="Live preview of the component"', 'title="Anteprima dal vivo del componente"'],
    ['Open the example application', "Apri l'applicazione di esempio"],
    ['(the live demo needs JavaScript).', '(la demo dal vivo richiede JavaScript).'],
    ['The live preview needs JavaScript.', "L'anteprima dal vivo richiede JavaScript."],
  ],
};
const localized = (html) =>
  (STAGE_WORDS[ctx.lang] ?? []).reduce((text, [from, to]) => text.replaceAll(from, to), html);
const stageSource = read('docs/templates/stage.html');
const previewSource = read('docs/templates/preview.html');
/** The stage of an application of dist/site/example. Its name is also the scenario host.js plays for it. */
const stageFor = (app) =>
  localized(stageSource)
    .replaceAll('APP_URL', `${ctx.root}example/${app}.html`)
    .replace('data-host', `data-host data-scenario="${app}"`);
/** `<!-- stage -->` is the packing list, `<!-- stage: name -->` another application of dist/site/example. */
const withStages = (html) =>
  html
    .replace(/<!-- stage(?:: ([\w-]+))? -->/g, (_, app) => stageFor(app ?? 'app'))
    // `<!-- preview: name -->`: one component alone, in the gallery application
    .replace(/<!-- preview: ([\w-]+) -->/g, (_, name) =>
      localized(previewSource).replaceAll('APP_URL', `${ctx.root}example/gallery.html#${name}`),
    );

/** The Components section has its own menu, as component libraries do: pick one, see it, copy it. */
function componentMenu(page) {
  const link = (key, text) =>
    `<li><a href="${key}.html"${key === page.key ? ' aria-current="page"' : ''}>${escapeHtml(text)}</a></li>`;
  const items = [
    link('components', ctx.t.allComponents),
    ...ctx.comps.map((c) => link(c.key, c.title)),
  ].join('\n');
  // Two forms of the same list: always open beside the text on a wide screen, folded on a phone
  return (
    `<nav class="menu" aria-label="${ctx.t.componentsLabel}"><ul>\n${items}\n</ul></nav>\n` +
    `<details class="menu-fold"><summary>${escapeHtml(ctx.t.componentsFold(page.parent ? page.title : ctx.t.all))}</summary><ul>\n${items}\n</ul></details>`
  );
}

function render(page) {
  // The `##` headings, for the list "On this page"
  page.toc = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const id = slug(html);
        if (depth === 1) return `<h1 id="${id}">${html}</h1>\n`;
        if (depth === 2) page.toc.push({ id, html });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${html}</a></h${depth}>\n`;
      },
      link({ href, tokens }) {
        return `<a href="${escapeHtml(mapLink(href, page, 'html'))}">${this.parser.parseInline(tokens)}</a>`;
      },
      code({ text, lang }) {
        const known = highlighter.getLoadedLanguages().includes(lang);
        if (!known) return `<pre><code>${escapeHtml(text)}</code></pre>\n`;
        // The comment colour of the theme is too faint on its background (WCAG 1.4.3): a lighter one
        return highlighter
          .codeToHtml(text, {
            lang,
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: false,
          })
          .replace(/--shiki-(light|dark):(#[0-9A-Fa-f]{6,8})/g, (m, mode, colour) => {
            // A few colours of the two themes are below 4.5:1 on our code background (WCAG 1.4.3)
            const better = SHIKI_CONTRAST[mode][colour.toUpperCase()];
            return better ? `--shiki-${mode}:${better}` : m;
          });
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
        `<div class="tabs" data-tabs>\n<div class="tablist" role="tablist" aria-label="${ctx.t.previewOrCode}" hidden>` +
          `<button type="button" role="tab">${ctx.t.preview}</button><button type="button" role="tab">${ctx.t.code}</button></div>\n` +
          '<div class="panel" role="tabpanel">',
      )
      .replace('<!-- tab: code -->', '</div>\n<div class="panel" role="tabpanel">')
      .replace('<!-- /tabs -->', '</div>\n</div>')
  );
}

/** "On this page": the `##` headings of a long page. Beside the text on a wide screen, folded on a phone. */
function onThisPage(page) {
  if (page.key === 'index' || (page.toc?.length ?? 0) < 3) return { aside: '', fold: '' };
  const items = page.toc.map((h) => `<li><a href="#${h.id}">${h.html}</a></li>`).join('\n');
  return {
    aside: `<nav class="toc" aria-label="${ctx.t.onThisPage}"><p>${ctx.t.onThisPage}</p><ul>\n${items}\n</ul></nav>`,
    fold: `<details class="toc-fold"><summary>${ctx.t.onThisPage}</summary><ul>\n${items}\n</ul></details>`,
  };
}

/** Previous and next page, in the order of the navigation: every page leads on to the next. */
function pager(page) {
  const i = ctx.pages.indexOf(page);
  const link = (p, rel, label) =>
    p
      ? `<a class="to-${rel}" rel="${rel}" href="${p.key}.html"><span>${label}</span><strong>${escapeHtml(p.nav ?? p.title)}</strong></a>`
      : '<span></span>';
  return (
    `<nav class="pager" aria-label="${ctx.t.pagesLabel}">` +
    link(ctx.pages[i - 1], 'prev', ctx.t.previous) +
    link(ctx.pages[i + 1], 'next', ctx.t.next) +
    '</nav>'
  );
}

/** The absolute address of a page in a language. The home is the folder itself. */
const urlOf = (lang, key) => `${SITE_URL}${prefixOf(lang)}${key === 'index' ? '' : `${key}.html`}`;

/** Structured data for search engines and AI answer engines (schema.org, as JSON-LD). */
function structuredData(page, title, description, faq) {
  const url = urlOf(ctx.lang, page.key);
  const site = {
    '@type': 'WebSite',
    '@id': `${SITE_URL}#website`,
    name: 'ngx-mcp-apps',
    url: SITE_URL,
  };
  const software = {
    '@type': 'SoftwareSourceCode',
    '@id': `${SITE_URL}#software`,
    name: 'ngx-mcp-apps',
    description: UI.en.description,
    codeRepository: REPO_URL,
    programmingLanguage: ['TypeScript', 'Angular'],
    runtimePlatform: 'Angular 18 to 22',
    license: 'https://opensource.org/licenses/MIT',
    version,
    url: SITE_URL,
  };
  const graph = [site, software];
  if (page.key === 'index') {
    graph.push({
      '@type': 'WebPage',
      url,
      name: title,
      description,
      inLanguage: ctx.lang,
      isPartOf: { '@id': site['@id'] },
      about: { '@id': software['@id'] },
    });
    if (faq.length)
      graph.push({
        '@type': 'FAQPage',
        inLanguage: ctx.lang,
        mainEntity: faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      });
  } else {
    graph.push({
      '@type': 'TechArticle',
      headline: page.title,
      description,
      url,
      inLanguage: ctx.lang,
      isPartOf: { '@id': site['@id'] },
      about: { '@id': software['@id'] },
      version,
    });
    const crumbs = [{ name: ctx.t.pages.index[0], url: urlOf(ctx.lang, 'index') }];
    if (page.parent)
      crumbs.push({ name: ctx.t.pages[page.parent][1], url: urlOf(ctx.lang, page.parent) });
    crumbs.push({ name: page.title, url });
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: c.url,
      })),
    });
  }
  // "</" cannot appear inside a script element
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
    /<\//g,
    '<\\/',
  );
}

function layout(page, body, { description, faq = [] }) {
  const t = ctx.t;
  const root = ctx.root;
  const nav = ctx.pages
    .filter((p) => !p.parent)
    .map(
      (p) =>
        `<li><a href="${p.key}.html"${p.key === page.key || p.key === page.parent ? ' aria-current="page"' : ''}>${p.nav}</a></li>`,
    )
    .join('\n          ');
  const title = page.key === 'index' ? t.homeTitle : `${page.title} · ngx-mcp-apps`;
  const href = (key) => (key === 'index' ? './' : `${key}.html`);
  const other = LANGS.find((l) => l !== ctx.lang);
  const otherLink = other
    ? `<a class="lang" href="${rootOf(ctx.lang)}${prefixOf(other)}${href(page.key)}" hreflang="${other}" lang="${other}">${UI[other].langName}</a>`
    : '';
  const alternates = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${urlOf(l, page.key)}" />`,
  ).join('\n    ');
  const canonical = urlOf(ctx.lang, page.key);
  return `<!doctype html>
<html lang="${ctx.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${canonical}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${urlOf(DEFAULT_LANG, page.key)}" />
    <meta property="og:type" content="${page.key === 'index' ? 'website' : 'article'}" />
    <meta property="og:site_name" content="ngx-mcp-apps" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE_URL}assets/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="${LOCALE[ctx.lang]}" />
    ${LANGS.filter((l) => l !== ctx.lang)
      .map((l) => `<meta property="og:locale:alternate" content="${LOCALE[l]}" />`)
      .join('\n    ')}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE_URL}assets/og.png" />
    <link rel="alternate" type="text/markdown" href="${page.key}.md" title="This page as Markdown" />
    <link rel="alternate" type="text/plain" href="${root}llms.txt" title="Documentation index for AI agents" />
    <script type="application/ld+json">${structuredData(page, title, description, faq)}</script>
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
    <link href="https://fonts.googleapis.com/css2?family=Mona+Sans:wght@400..800&family=Geist+Mono:wght@400..600&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${asset(root, 'site.css')}" />
  </head>
  <body class="page-${page.key}">
    <a class="skip" href="#content">${t.skip}</a>
    <aside class="for-agents" aria-label="${t.forAgentsLabel}">
      ${t.forAgents(`${page.key}.md`, root)}
    </aside>
    <div class="shell">
      <header class="side">
        <a class="brand" href="${href('index')}">ngx-mcp-apps <span>${version}</span></a>
        <nav aria-label="${t.docs}">
          <ul>
          ${nav}
          </ul>
        </nav>
        <div class="side-foot">
          <a href="${REPO_URL}">GitHub</a>
          <a href="https://www.npmjs.com/package/ngx-mcp-apps">npm</a>
          ${otherLink}
          <button type="button" data-theme-toggle>${t.darkTheme}</button>
        </div>
      </header>
      <main id="content" tabindex="-1">
${body}
${pager(page)}
      </main>
    </div>
    <script type="module" src="${asset(root, 'site.js')}"></script>
    ${body.includes('data-host') ? `<script type="module" src="${asset(root, 'host.js')}"></script>` : ''}
    ${body.includes('data-scene') ? `<script type="module" src="${asset(root, 'home.js')}"></script>` : ''}
  </body>
</html>
`;
}

/** A page of text, with its list "On this page" when it is long. */
function doc(page) {
  const article = render(page);
  const { aside, fold } = onThisPage(page);
  if (!aside) return `<article class="prose">\n${article}\n</article>`;
  return `<div class="doc">\n${fold}\n<article class="prose">\n${article}\n</article>\n${aside}\n</div>`;
}

/** The questions of the home, for the FAQPage data: what the page says, nothing else. */
function faqOf(html) {
  const faq = [];
  for (const [, q, a] of html.matchAll(
    /<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g,
  ))
    faq.push({ q: plain(q), a: plain(a) });
  return faq;
}

const built = {};
for (const lang of LANGS) {
  const { pages, comps } = pagesIn(lang);
  ctx = { lang, t: UI[lang], pages, comps, prefix: prefixOf(lang), root: rootOf(lang) };
  ctx.anchors = indexAnchors(pages);
  for (const page of pages) {
    let body;
    let meta;
    if (page.key === 'index') {
      const homeFile =
        lang === DEFAULT_LANG ? 'docs/templates/home.html' : `docs/templates/${lang}/home.html`;
      if (!existsSync(homeFile)) throw new Error(`${homeFile} is missing`);
      const home = read(homeFile);
      body = home
        .replace('<!-- stage -->', stageFor('app'))
        .replace('<!-- version -->', version)
        // Links of the home to files shared by every language
        .replace(
          /(href|src)="(?=(?:llms|components\/|skill\/|example\/|assets\/))/g,
          `$1="${ctx.root}`,
        );
      const lede = /<p class="lede">([\s\S]*?)<\/p>/.exec(home)?.[1] ?? '';
      meta = { description: clip(plain(lede) || ctx.t.description), faq: faqOf(home) };
    } else {
      body =
        page.key === 'components' || page.parent === 'components'
          ? `<div class="with-menu">\n${componentMenu(page)}\n<article class="prose">\n${render(page)}\n</article>\n</div>`
          : doc(page);
      meta = { description: describe(page.markdown) || ctx.t.description };
    }
    write(`${ctx.prefix}${page.key}.html`, layout(page, body, meta));
    write(`${ctx.prefix}${page.key}.md`, markdownFor(page) + '\n');
  }
  built[lang] = { pages, markdown: pages.map((p) => markdownFor(p)) };
}

// ---------------------------------------------------------------- for search engines

for (const lang of LANGS) for (const p of built[lang].pages) p.lastmod = lastChange(p.files);

const today = new Date().toISOString().slice(0, 10);
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.flatMap((lang) =>
  built[lang].pages.map(
    (p) => `  <url>
    <loc>${urlOf(lang, p.key)}</loc>
    <lastmod>${p.lastmod}</lastmod>
${LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlOf(l, p.key)}" />`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${urlOf(DEFAULT_LANG, p.key)}" />
  </url>`,
  ),
).join('\n')}
</urlset>
`,
);
write(
  '404.html',
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Page not found · ngx-mcp-apps</title>
    <meta name="robots" content="noindex" />
    <link rel="stylesheet" href="/ngx-mcp-apps/assets/site.css?v=${ASSET_VERSION['site.css']}" />
  </head>
  <body>
    <main style="max-width: 40rem; margin: 4rem auto; padding: 0 1.25rem">
      <h1>Page not found</h1>
      <p>This address does not exist. <a href="/ngx-mcp-apps/">Go to the documentation</a>.</p>
      <p lang="it">Questa pagina non esiste. <a href="/ngx-mcp-apps/it/">Vai alla documentazione</a>.</p>
    </main>
  </body>
</html>
`,
);

// ---------------------------------------------------------------- for agents

const skill = read('docs/skill/ngx-mcp-apps/SKILL.md');
const en = built.en.pages;
write(
  'llms.txt',
  `# ngx-mcp-apps

> ${UI.en.description} Two npm packages: ngx-mcp-apps (the library: the MCP Apps protocol as Angular signals) and
> ngx-mcp-apps-builder (an Angular CLI builder that writes the application as one self-contained HTML file).
> Version ${version}. Angular 18 to 22. Tested with Claude (claude.ai on the web, the Claude app for Android).

Install both in an Angular workspace with \`ng add ngx-mcp-apps-builder\`.

## Documentation

${en
  .filter((p) => p.key !== 'index')
  .map((p) => `- [${p.title}](${SITE_URL}${p.key}.md)`)
  .join('\n')}

## For agents

- [Skill](${SITE_URL}skill/ngx-mcp-apps/SKILL.md): steps, rules and API in one file. Read this first.
- [Everything in one file](${SITE_URL}llms-full.txt)
- [Components index](${SITE_URL}components/index.json): copy-and-paste components, with the address of each source file

## Other languages

- Italian: the same pages in Italian, at ${SITE_URL}it/ (each page also as Markdown, for example ${SITE_URL}it/start.md)

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
      ...built.en.markdown.slice(1).map((m) => m.trim()),
    ].join('\n\n---\n\n') +
    '\n',
);
write(
  'robots.txt',
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n\n# Documentation for AI agents: ${SITE_URL}llms.txt\n`,
);

console.log(
  `Site ready in ${out}: ${LANGS.map((l) => `${built[l].pages.length} pages in ${l}`).join(', ')}, ${components.length} components`,
);
