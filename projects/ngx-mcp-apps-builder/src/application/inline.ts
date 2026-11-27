/**
 * Turns the index.html produced by the Angular application builder into one self-contained document.
 * Pure string work on purpose: no HTML parser dependency, the input is Angular's own generated markup.
 */

import { isAbsolute, posix, relative, resolve } from 'node:path';

/** Raised when the build output cannot be delivered as a single file. */
export class SingleFileError extends Error {
  override readonly name = 'SingleFileError';
}

export interface InlineOptions {
  /** Returns the text of a build output file, given its path relative to the index.html folder. */
  readFile: (path: string) => string;
  /**
   * Returns the bytes of a build output file, given its path relative to the index.html folder. It is
   * used to embed the fonts and images that the CSS references with `url(...)`. Without it those
   * references are left as they are and reported in `warnings`.
   */
  readBinaryFile?: (path: string) => Uint8Array;
  /**
   * Files present in the build output, relative to the index.html folder. The JavaScript ones are used
   * to detect chunks that would be left behind (lazy loading, code splitting), the others to report
   * assets that the JavaScript names but the document does not contain.
   */
  outputFiles?: readonly string[];
}

export interface InlineResult {
  html: string;
  /** Files whose content is now part of the document. */
  inlined: string[];
  /** Local references that could not be inlined and are still in the document. */
  warnings: string[];
  /** Files embedded in the CSS as `data:` URLs. */
  embedded: string[];
  /** Remote URLs that the document still loads: scripts, stylesheets, images, `url(...)` in CSS. */
  remote: string[];
  /**
   * Files of the build output that the inlined JavaScript names (an `<img src>` of a template, a
   * fetched file) and that are not part of the document.
   */
  assets: string[];
}

// The attribute part tolerates ">" inside quoted values
const ATTRS = `((?:"[^"]*"|'[^']*'|[^>"'])*)`;
const SCRIPT_TAG = new RegExp(`<script\\b${ATTRS}>([\\s\\S]*?)</script\\s*>`, 'gi');
const LINK_TAG = new RegExp(`<link\\b${ATTRS}>`, 'gi');
const STYLE_TAG = new RegExp(`(<style\\b${ATTRS}>)([\\s\\S]*?)(</style\\s*>)`, 'gi');
// Elements of a static index.html that load a file; the ones of the templates live in the JavaScript
const MEDIA_TAG = new RegExp(
  `<(?:img|source|video|audio|track|iframe|embed|object|input)\\b${ATTRS}>`,
  'gi',
);
// A comment, a url(...), an @import of a quoted URL, or a string: comments and strings are skipped
const CSS_TOKEN =
  /\/\*[\s\S]*?\*\/|url\(\s*(?:"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'|((?:[^)"'\s\\]|\\[\s\S])*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')|"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'/gi;

const MIME_TYPES: Record<string, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  png: 'image/png',
  apng: 'image/apng',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  cur: 'image/x-icon',
  bmp: 'image/bmp',
};

/** MIME type of a font or image file, from its extension. */
export function mimeType(path: string): string {
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? '';
  return MIME_TYPES[extension] ?? 'application/octet-stream';
}
const NOSCRIPT_LINK = new RegExp(`<noscript>\\s*<link\\b${ATTRS}>\\s*</noscript>`, 'gi');
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/**
 * Resolves `path` against `root` and returns it only if it stays inside `root`.
 * Guards both what is read (files named by the HTML) and what is written (the "singleFile" option).
 *
 * @throws Error when the path escapes the folder ("../x", an absolute path, another drive).
 */
export function resolveInside(root: string, path: string): string {
  const base = resolve(root);
  const target = resolve(base, path);
  const fromBase = relative(base, target);
  if (fromBase === '' || fromBase.startsWith('..') || isAbsolute(fromBase)) {
    throw new Error(`"${path}" is outside of ${base}`);
  }
  return target;
}

/** Escapes a value for a double-quoted HTML attribute. */
export function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** True for a URL that points to a file of the build output, false for http(s), data:, //host, #hash. */
export function isLocalUrl(url: string): boolean {
  return url !== '' && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url);
}

/** "/main-ABC.js?v=1" and "./main-ABC.js" both name the output file "main-ABC.js". */
function toOutputPath(url: string): string {
  const path = url.replace(/[?#].*$/, '').replace(/^(?:\.?\/)+/, '');
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

function relTokens(attributes: Map<string, string>): string[] {
  return (attributes.get('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

/** Makes JavaScript safe inside an inline script element without changing what it does. */
export function escapeInlineScript(code: string): string {
  return (
    code
      // A source map next to the bundle is another local file
      .replace(/^\/\/[#@] sourceMappingURL=(?!data:).*$/gm, '')
      // "</script" would close the element; "<\/script" is the same text in strings and regular expressions
      .replace(/<\/(script)/gi, '<\\/$1')
      // "<!--" followed by "<script" would keep the element open past its real end tag
      .replace(/<!--/g, '\\x3C!--')
  );
}

/** Makes CSS safe inside an inline style element. */
export function escapeInlineStyle(css: string): string {
  return css
    .replace(/\/\*[#@] sourceMappingURL=(?!data:)[^*]*\*\//g, '')
    .replace(/<\/(style)/gi, '<\\/$1');
}

/** True for http(s) and protocol-relative URLs. */
function isRemoteUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CssUrlsOptions {
  /** Returns the bytes of a build output file. Without it local URLs are left and listed in `left`. */
  readBinaryFile?: (path: string) => Uint8Array;
  /** `data:` URLs already built, by output path: a file used by several stylesheets is encoded once. */
  cache?: Map<string, string>;
}

export interface CssUrlsResult {
  css: string;
  /** Output files now embedded as `data:` URLs. */
  embedded: string[];
  /** Remote URLs (`http://`, `https://`, `//host`) found in `url(...)` and `@import`. */
  remote: string[];
  /** Local URLs that were not embedded. */
  left: string[];
}

/**
 * Replaces every local `url(...)` of a stylesheet (fonts of `@font-face`, images, also inside
 * `image-set(...)`) with a `data:` URL that holds the file. Paths are resolved from the folder of the
 * stylesheet inside the build output. `data:`, remote and `#fragment` URLs are untouched, like comments
 * and strings.
 *
 * @param cssPath Path of the stylesheet relative to the index.html folder ("styles-ABC.css").
 * @throws SingleFileError when a file is missing or outside of the build output.
 */
export function inlineCssUrls(
  css: string,
  cssPath: string,
  options: CssUrlsOptions = {},
): CssUrlsResult {
  const embedded: string[] = [];
  const remote: string[] = [];
  const left: string[] = [];
  const cache = options.cache ?? new Map<string, string>();
  const folder = posix.dirname(cssPath.replace(/\\/g, '/'));

  const result = css.replace(
    CSS_TOKEN,
    (token: string, double?: string, single?: string, bare?: string, ...rest: unknown[]) => {
      const imported = (rest[0] ?? rest[1]) as string | undefined;
      if (imported !== undefined) {
        if (isRemoteUrl(imported)) remote.push(imported);
        else if (isLocalUrl(imported)) left.push(imported);
        return token;
      }
      const raw = double ?? single ?? bare;
      // A comment or a string
      if (raw === undefined) return token;
      const url = raw.replace(/\\([\s\S])/g, '$1').trim();
      if (isRemoteUrl(url)) {
        remote.push(url);
        return token;
      }
      if (!isLocalUrl(url)) return token;
      if (!options.readBinaryFile) {
        left.push(url);
        return token;
      }

      const file = toOutputPath(url);
      // "/media/a.png" is relative to the index.html folder, like the base href of the built page
      const path = url.startsWith('/') ? file : posix.normalize(posix.join(folder, file));
      if (path === '..' || path.startsWith('../')) {
        throw new SingleFileError(
          `Cannot embed url(${url}) of ${cssPath}: the file is outside of the build output.`,
        );
      }
      let data = cache.get(path);
      if (data === undefined) {
        let bytes: Uint8Array;
        try {
          bytes = options.readBinaryFile(path);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new SingleFileError(
            `Cannot embed "${path}" referenced by url(${url}) in ${cssPath}: ${reason}. ` +
              'A single-file MCP App has no other local file: the file must be in the build output, ' +
              'or the URL must be an absolute https:// one.',
          );
        }
        data = `data:${mimeType(path)};base64,${Buffer.from(bytes).toString('base64')}`;
        cache.set(path, data);
      }
      embedded.push(path);
      // "sprite.svg#icon" selects a part of the image; on other types the fragment means nothing
      const fragment = mimeType(path) === 'image/svg+xml' ? (/#[^?]*$/.exec(url)?.[0] ?? '') : '';
      return `url("${data}${fragment}")`;
    },
  );

  return { css: result, embedded: unique(embedded), remote: unique(remote), left: unique(left) };
}

// url(./media/a-HASH.png), also written as url(\"…\") inside a JavaScript string
const JS_CSS_URL = /url\((\\?["']|)([^)"'\\\s]+)\1\)/g;

type SplitKind = 'shared' | 'dynamic' | 'worker';

/**
 * Finds the JavaScript files of the build output that the inlined code still needs, following the
 * imports from file to file, and tells how each one is reached.
 */
function findSplitFiles(
  code: string,
  candidates: readonly string[],
  preloaded: readonly string[],
  readFile: (path: string) => string,
): Map<string, SplitKind> {
  const kinds = new Map<string, SplitKind>();
  const visit = (text: string, from: SplitKind): void => {
    for (const file of candidates) {
      const name = escapeRegExp(file.split('/').pop()!);
      if (!text.includes(file.split('/').pop()!)) continue;
      const quoted = `["'\`][^"'\`]*${name}["'\`]`;
      let kind: SplitKind = from;
      if (new RegExp(`\\bimport\\(\\s*${quoted}`).test(text)) kind = 'dynamic';
      else if (
        new RegExp(`\\bnew\\s+(?:Shared)?Worker\\(\\s*(?:new\\s+URL\\(\\s*)?${quoted}`).test(text)
      )
        kind = 'worker';
      const known = kinds.get(file);
      // A chunk imported statically by the initial scripts is shared code, whoever else loads it
      if (known !== undefined && (known === 'shared' || kind !== 'shared')) continue;
      kinds.set(file, kind);
      let content: string;
      try {
        content = readFile(file);
      } catch {
        continue;
      }
      visit(content, kind);
    }
  };
  visit(code, 'shared');
  for (const file of preloaded) {
    if (candidates.includes(file) && kinds.get(file) !== 'shared') kinds.set(file, 'shared');
  }
  return kinds;
}

function splitError(kinds: Map<string, SplitKind>): SingleFileError {
  const of = (kind: SplitKind) => [...kinds].filter(([, k]) => k === kind).map(([file]) => file);
  const dynamic = of('dynamic');
  const workers = of('worker');
  const shared = of('shared');
  const parts = [
    `The build emitted JavaScript files that index.html does not load directly: ${[...kinds.keys()].join(', ')}. ` +
      'A single-file MCP App is delivered as one HTML document, which cannot load them.',
  ];
  if (dynamic.length > 0) {
    parts.push(
      `Loaded on demand with a dynamic import(): ${dynamic.join(', ')}. A single-file app cannot use lazy ` +
        'loading: replace loadComponent/loadChildren, @defer blocks and dynamic import() with static ' +
        'imports. A dependency can be the cause too, for example provideAnimationsAsync().',
    );
  }
  if (workers.length > 0) {
    parts.push(
      `Web worker scripts: ${workers.join(', ')}. A worker is a separate file: run that code in the page.`,
    );
  }
  if (shared.length > 0) {
    parts.push(
      `Shared code that the scripts of index.html import statically: ${shared.join(', ')}. ` +
        (dynamic.length > 0
          ? 'This is code splitting, not lazy loading by itself: Angular moves there the code used both ' +
            'by the initial scripts and by the files listed above, and stops doing so once those are gone.'
          : 'This is code splitting, not lazy loading: no dynamic import() was found. The Angular ' +
            'application builder has no option to turn code splitting off, so this build cannot be ' +
            'written as a single file.'),
    );
  }
  return new SingleFileError(parts.join('\n  - '));
}

/**
 * Replaces every local `<script src>` and `<link rel="stylesheet" href>` with its content, embeds the
 * local files that the CSS references with `url(...)`, and removes the tags that only make sense next
 * to other files (modulepreload, icon). External URLs are untouched and listed in `remote`.
 *
 * @throws SingleFileError when the JavaScript still depends on files that are not in the document, or
 * when the CSS references a local file that is not in the build output.
 */
export function inlineHtml(html: string, options: InlineOptions): InlineResult {
  const inlined: string[] = [];
  const warnings: string[] = [];
  const preloaded: string[] = [];
  const embedded: string[] = [];
  const remote: string[] = [];
  const dataUrls = new Map<string, string>();
  const outputFiles = (options.outputFiles ?? []).map((file) => file.replace(/\\/g, '/'));
  let code = '';

  const read = (path: string, tag: string): string => {
    try {
      const content = options.readFile(path);
      inlined.push(path);
      return content;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new SingleFileError(`Cannot inline "${path}" referenced by ${tag}: ${reason}`);
    }
  };

  const embedCssUrls = (css: string, cssPath: string): string => {
    const result = inlineCssUrls(css, cssPath, {
      readBinaryFile: options.readBinaryFile,
      cache: dataUrls,
    });
    embedded.push(...result.embedded);
    remote.push(...result.remote);
    for (const url of result.left) warnings.push(`url(${url}) in ${cssPath}`);
    return result.css;
  };

  const isLocalStylesheet = (attributes: Map<string, string>): boolean =>
    relTokens(attributes).includes('stylesheet') && isLocalUrl(attributes.get('href') ?? '');

  // Elements of the static markup that load a file: looked for outside of comments, scripts and styles
  const markup = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(SCRIPT_TAG, '')
    .replace(STYLE_TAG, '');
  for (const [tag, attrs] of markup.matchAll(MEDIA_TAG)) {
    const attributes = parseAttributes(attrs);
    const urls = [attributes.get('src'), attributes.get('poster')];
    if (/^<object/i.test(tag)) urls.push(attributes.get('data'));
    for (const candidate of (attributes.get('srcset') ?? '').split(',')) {
      urls.push(candidate.trim().split(/\s+/)[0]);
    }
    const found = urls.filter((url): url is string => !!url);
    remote.push(...found.filter(isRemoteUrl));
    if (found.some(isLocalUrl)) warnings.push(tag);
  }

  // Styles written in index.html, or put there by Angular (critical CSS, inlined font stylesheets)
  html = html.replace(
    STYLE_TAG,
    (_tag: string, open: string, _attrs: string, css: string, close: string) =>
      open + embedCssUrls(css, 'index.html') + close,
  );

  // Angular's critical CSS inlining leaves a <noscript> copy of each deferred stylesheet
  html = html.replace(NOSCRIPT_LINK, (tag: string, attrs: string) =>
    isLocalStylesheet(parseAttributes(attrs)) ? '' : tag,
  );

  html = html.replace(LINK_TAG, (tag: string, attrs: string) => {
    const attributes = parseAttributes(attrs);
    const href = attributes.get('href') ?? '';
    const rel = relTokens(attributes);
    if (!isLocalUrl(href)) {
      // A preconnect loads nothing by itself
      if (isRemoteUrl(href) && !rel.includes('preconnect') && !rel.includes('dns-prefetch')) {
        remote.push(href);
      }
      return tag;
    }
    if (rel.includes('stylesheet')) {
      const path = toOutputPath(href);
      const css = escapeInlineStyle(embedCssUrls(read(path, tag), path));
      // Angular's critical CSS inlining defers a stylesheet with media="print" and restores the real
      // value, kept in data-beasties-media (or set by an onload handler), once it is loaded
      const deferred = attributes.has('data-beasties-media') || attributes.has('onload');
      const media = deferred ? attributes.get('data-beasties-media') : attributes.get('media');
      return `<style${media && media !== 'all' ? ` media="${escapeAttribute(media)}"` : ''}>${css}</style>`;
    }
    if (rel.includes('modulepreload') || rel.includes('preload') || rel.includes('prefetch')) {
      preloaded.push(toOutputPath(href));
      return '';
    }
    if (rel.includes('icon')) return '';
    warnings.push(tag);
    return tag;
  });

  // Component styles are strings of the JavaScript: a url(...) that names a file of the build output
  // is embedded there too. A data: URL has no quote or backslash, so it fits any kind of string.
  const assetFiles = new Set(
    outputFiles.filter((file) => !/\.(?:m?js|css|map|html?)$/i.test(file)),
  );
  const embedJsUrls = (content: string): string => {
    if (!options.readBinaryFile || assetFiles.size === 0) return content;
    return content.replace(JS_CSS_URL, (match: string, _quote: string, url: string) => {
      if (isRemoteUrl(url)) remote.push(url);
      if (!isLocalUrl(url)) return match;
      const path = posix.normalize(toOutputPath(url));
      if (!assetFiles.has(path)) return match;
      // No quotes around the data: URL: whatever quotes the JavaScript string, they cannot end it
      return embedCssUrls(`url(${url})`, 'index.html').replace(/^url\("(.*)"\)$/, 'url($1)');
    });
  };

  html = html.replace(SCRIPT_TAG, (tag: string, attrs: string) => {
    const attributes = parseAttributes(attrs);
    const src = attributes.get('src');
    if (src === undefined) return tag;
    if (!isLocalUrl(src)) {
      if (isRemoteUrl(src)) remote.push(src);
      return tag;
    }
    const content = embedJsUrls(read(toOutputPath(src), `<script src="${src}">`));
    code += content + '\n';
    // Angular's bundles are ES modules; a classic script (the "scripts" option) must stay classic
    const type = attributes.get('type');
    return `<script${type ? ` type="${escapeAttribute(type)}"` : ''}>${escapeInlineScript(content)}</script>`;
  });

  // Whatever JavaScript is still on disk and is needed by the document cannot be reached from one file
  const done = new Set(inlined);
  const scripts = outputFiles.filter((file) => /\.m?js$/i.test(file) && !done.has(file));
  for (const file of preloaded) {
    if (/\.m?js$/i.test(file) && !done.has(file) && !scripts.includes(file)) scripts.push(file);
  }
  const split = findSplitFiles(code, scripts, preloaded, options.readFile);
  if (split.size > 0) throw splitError(split);

  // Files that the application names in its code (an <img src> of a template, a fetched JSON file)
  const inDocument = new Set(embedded);
  const assets = [...assetFiles].filter((file) => {
    if (inDocument.has(file)) return false;
    const name = escapeRegExp(file.split('/').pop()!);
    return (
      code.includes(file.split('/').pop()!) && new RegExp(`["'\`/(]${name}["'\`?#)]`).test(code)
    );
  });

  return {
    html,
    inlined,
    warnings: unique(warnings),
    embedded: unique(embedded),
    remote: unique(remote),
    assets,
  };
}
