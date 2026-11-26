/**
 * Turns the index.html produced by the Angular application builder into one self-contained document.
 * Pure string work on purpose: no HTML parser dependency, the input is Angular's own generated markup.
 */

/** Raised when the build output cannot be delivered as a single file. */
export class SingleFileError extends Error {
  override readonly name = 'SingleFileError';
}

export interface InlineOptions {
  /** Returns the text of a build output file, given its path relative to the index.html folder. */
  readFile: (path: string) => string;
  /**
   * JavaScript files present in the build output, relative to the index.html folder. They are used to
   * detect chunks that would be left behind (lazy loading, code splitting).
   */
  outputFiles?: readonly string[];
}

export interface InlineResult {
  html: string;
  /** Files whose content is now part of the document. */
  inlined: string[];
  /** Local references that could not be inlined and are still in the document. */
  warnings: string[];
}

// The attribute part tolerates ">" inside quoted values
const ATTRS = `((?:"[^"]*"|'[^']*'|[^>"'])*)`;
const SCRIPT_TAG = new RegExp(`<script\\b${ATTRS}>([\\s\\S]*?)</script\\s*>`, 'gi');
const LINK_TAG = new RegExp(`<link\\b${ATTRS}>`, 'gi');
const NOSCRIPT_LINK = new RegExp(`<noscript>\\s*<link\\b${ATTRS}>\\s*</noscript>`, 'gi');
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
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

/**
 * Replaces every local `<script src>` and `<link rel="stylesheet" href>` with its content, and removes
 * the tags that only make sense next to other files (modulepreload, icon). External URLs are untouched.
 *
 * @throws SingleFileError when the JavaScript still depends on files that are not in the document.
 */
export function inlineHtml(html: string, options: InlineOptions): InlineResult {
  const inlined: string[] = [];
  const warnings: string[] = [];
  const preloaded: string[] = [];
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

  const isLocalStylesheet = (attributes: Map<string, string>): boolean =>
    relTokens(attributes).includes('stylesheet') && isLocalUrl(attributes.get('href') ?? '');

  // Angular's critical CSS inlining leaves a <noscript> copy of each deferred stylesheet
  html = html.replace(NOSCRIPT_LINK, (tag: string, attrs: string) =>
    isLocalStylesheet(parseAttributes(attrs)) ? '' : tag,
  );

  html = html.replace(LINK_TAG, (tag: string, attrs: string) => {
    const attributes = parseAttributes(attrs);
    const href = attributes.get('href') ?? '';
    if (!isLocalUrl(href)) return tag;
    const rel = relTokens(attributes);
    if (rel.includes('stylesheet')) {
      const css = escapeInlineStyle(read(toOutputPath(href), tag));
      // Angular's critical CSS inlining defers a stylesheet with media="print" and restores the real
      // value, kept in data-beasties-media (or set by an onload handler), once it is loaded
      const deferred = attributes.has('data-beasties-media') || attributes.has('onload');
      const media = deferred ? attributes.get('data-beasties-media') : attributes.get('media');
      return `<style${media && media !== 'all' ? ` media="${media}"` : ''}>${css}</style>`;
    }
    if (rel.includes('modulepreload') || rel.includes('preload') || rel.includes('prefetch')) {
      preloaded.push(toOutputPath(href));
      return '';
    }
    if (rel.includes('icon')) return '';
    warnings.push(tag);
    return tag;
  });

  html = html.replace(SCRIPT_TAG, (tag: string, attrs: string) => {
    const attributes = parseAttributes(attrs);
    const src = attributes.get('src');
    if (src === undefined || !isLocalUrl(src)) return tag;
    const content = read(toOutputPath(src), `<script src="${src}">`);
    code += content + '\n';
    // Angular's bundles are ES modules; a classic script (the "scripts" option) must stay classic
    const type = attributes.get('type');
    return `<script${type ? ` type="${type}"` : ''}>${escapeInlineScript(content)}</script>`;
  });

  // Whatever JavaScript is still on disk and is needed by the document cannot be reached from one file
  const done = new Set(inlined);
  const left = (options.outputFiles ?? [])
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => /\.m?js$/i.test(file) && !done.has(file))
    .filter((file) => preloaded.includes(file) || code.includes(file.split('/').pop()!));
  for (const file of preloaded) {
    if (/\.m?js$/i.test(file) && !done.has(file) && !left.includes(file)) left.push(file);
  }
  if (left.length > 0) {
    throw new SingleFileError(
      `The build emitted JavaScript files that index.html does not load directly: ${left.join(', ')}. ` +
        'A single-file MCP App is delivered as one HTML document, so it cannot use lazy loading or ' +
        'code splitting: replace loadComponent/loadChildren, @defer blocks and dynamic import() ' +
        'with static imports, then build again.',
    );
  }

  return { html, inlined, warnings };
}
