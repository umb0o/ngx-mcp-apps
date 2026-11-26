import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  escapeAttribute,
  inlineHtml,
  resolveInside,
  SingleFileError,
} from '../src/application/inline';

const files: Record<string, string> = {
  'main-ABC.js': 'console.log("main");',
  'polyfills-DEF.js': 'console.log("polyfills");',
  'styles-GHI.css': 'body{margin:0}',
};

function inline(html: string, extra: Record<string, string> = {}, outputFiles?: string[]) {
  const all = { ...files, ...extra };
  return inlineHtml(html, {
    outputFiles: outputFiles ?? Object.keys(all),
    readFile: (path) => {
      if (!(path in all)) throw new Error(`ENOENT: ${path}`);
      return all[path];
    },
  });
}

describe('inlineHtml', () => {
  it('inlines local module scripts', () => {
    const { html, inlined } = inline(
      '<body><app-root></app-root>' +
        '<script src="polyfills-DEF.js" type="module"></script>' +
        '<script src="main-ABC.js" type="module"></script></body>',
    );
    expect(html).toBe(
      '<body><app-root></app-root>' +
        '<script type="module">console.log("polyfills");</script>' +
        '<script type="module">console.log("main");</script></body>',
    );
    expect(inlined).toEqual(['polyfills-DEF.js', 'main-ABC.js']);
  });

  it('accepts other attributes, single quotes and base-relative paths', () => {
    const { html } = inline(
      `<script type='module' crossorigin="anonymous" integrity="sha384-x" src='/main-ABC.js?v=1'></script>`,
    );
    expect(html).toBe('<script type="module">console.log("main");</script>');
  });

  it('keeps a classic script classic and leaves inline scripts alone', () => {
    const { html } = inline(
      '<script>window.a = 1;</script><script src="scripts.js" defer></script>',
      { 'scripts.js': 'var legacy = true;' },
    );
    expect(html).toBe('<script>window.a = 1;</script><script>var legacy = true;</script>');
  });

  it('inlines local stylesheets', () => {
    const { html } = inline('<head><link rel="stylesheet" href="styles-GHI.css"></head>');
    expect(html).toBe('<head><style>body{margin:0}</style></head>');
  });

  it('inlines a deferred stylesheet once and drops its noscript copy', () => {
    const { html } = inline(
      '<style>body{color:red}</style>' +
        `<link rel="stylesheet" href="styles-GHI.css" media="print" onload="this.media='all'">` +
        '<noscript><link rel="stylesheet" href="styles-GHI.css"></noscript>',
    );
    expect(html).toBe('<style>body{color:red}</style><style>body{margin:0}</style>');
  });

  it('restores the media of a stylesheet deferred by critical CSS inlining', () => {
    const { html } = inline(
      '<link rel="stylesheet" href="styles-GHI.css" media="print" data-beasties-media="all">' +
        '<noscript><link rel="stylesheet" href="styles-GHI.css"></noscript>' +
        '<link rel="stylesheet" href="styles-GHI.css" media="print" data-beasties-media="screen">',
    );
    expect(html).toBe('<style>body{margin:0}</style><style media="screen">body{margin:0}</style>');
  });

  it('keeps a real media query', () => {
    const { html } = inline('<link rel="stylesheet" href="styles-GHI.css" media="print">');
    expect(html).toBe('<style media="print">body{margin:0}</style>');
  });

  it('removes modulepreload and icon links to local files', () => {
    const { html } = inline(
      '<head><link rel="modulepreload" href="main-ABC.js">' +
        '<link rel="icon" type="image/x-icon" href="favicon.ico">' +
        '<script src="main-ABC.js" type="module"></script></head>',
    );
    expect(html).toBe('<head><script type="module">console.log("main");</script></head>');
  });

  it('leaves external URLs untouched', () => {
    const external =
      '<link rel="preconnect" href="https://fonts.gstatic.com">' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">' +
      '<link rel="modulepreload" href="https://cdn.example.com/lib.js">' +
      '<link rel="stylesheet" href="//cdn.example.com/site.css">' +
      '<script src="https://cdn.example.com/lib.js" type="module"></script>' +
      '<script src="http://cdn.example.com/old.js"></script>' +
      '<link rel="icon" href="data:image/png;base64,AAAA">';
    const { html, inlined } = inline(external);
    expect(html).toBe(external);
    expect(inlined).toEqual([]);
  });

  it('escapes </script inside inlined JavaScript', () => {
    const code = 'const a = "</script><script>alert(1)</SCRIPT>"; const b = "<!-- <script>";';
    const { html } = inline('<script src="main-ABC.js" type="module"></script>X', {
      'main-ABC.js': code,
    });
    expect(html).toBe(
      '<script type="module">' +
        'const a = "<\\/script><script>alert(1)<\\/SCRIPT>"; const b = "\\x3C!-- <script>";' +
        '</script>X',
    );
    // Only the real end tag is left
    expect(html.match(/<\/script/gi)).toHaveLength(1);
  });

  it('escapes </style inside inlined CSS', () => {
    const { html } = inline('<link rel="stylesheet" href="styles-GHI.css">', {
      'styles-GHI.css': 'a::after{content:"</style>"}',
    });
    expect(html).toBe('<style>a::after{content:"<\\/style>"}</style>');
  });

  it('does not treat $ sequences in the code as replacement patterns', () => {
    const code = "const s = '$& $1 $$';";
    const { html } = inline('<script src="main-ABC.js" type="module"></script>', {
      'main-ABC.js': code,
    });
    expect(html).toBe(`<script type="module">${code}</script>`);
  });

  it('drops source map references to local files', () => {
    const { html } = inline(
      '<link rel="stylesheet" href="styles-GHI.css"><script src="main-ABC.js" type="module"></script>',
      {
        'main-ABC.js': 'console.log(1);\n//# sourceMappingURL=main-ABC.js.map\n',
        'styles-GHI.css': 'body{margin:0}\n/*# sourceMappingURL=styles-GHI.css.map */',
      },
    );
    expect(html).not.toContain('sourceMappingURL');
  });

  it('fails on a lazy chunk that the HTML does not reference', () => {
    const run = () =>
      inline('<script src="main-ABC.js" type="module"></script>', {
        'main-ABC.js': 'import("./chunk-LAZY.js").then((m) => m.start());',
        'chunk-LAZY.js': 'export const start = () => {};',
      });
    expect(run).toThrow(SingleFileError);
    expect(run).toThrow(/chunk-LAZY\.js/);
    expect(run).toThrow(/cannot use lazy loading/);
  });

  it('fails on a shared chunk that is only preloaded', () => {
    expect(() =>
      inline(
        '<link rel="modulepreload" href="chunk-SHARED.js"><script src="main-ABC.js" type="module"></script>',
        {
          'main-ABC.js': 'import { a } from "./chunk-SHARED.js"; a();',
          'chunk-SHARED.js': 'export const a = () => {};',
        },
      ),
    ).toThrow(/chunk-SHARED\.js/);
  });

  it('ignores JavaScript in the output that the application never loads', () => {
    const { html } = inline('<script src="main-ABC.js" type="module"></script>', {}, [
      'main-ABC.js',
      'assets/unused-tool.js',
      'main-OLD.js',
    ]);
    expect(html).toBe('<script type="module">console.log("main");</script>');
  });

  it('fails with a clear message when a referenced file is missing', () => {
    expect(() => inline('<script src="missing.js" type="module"></script>')).toThrow(
      /Cannot inline "missing\.js"/,
    );
  });

  it('reports other local links it cannot inline', () => {
    const { html, warnings } = inline('<link rel="manifest" href="manifest.webmanifest">');
    expect(html).toContain('manifest.webmanifest');
    expect(warnings).toHaveLength(1);
  });
});

describe('hardening', () => {
  it('resolveInside accepts paths inside the folder and rejects the ones that escape it', () => {
    const root = resolve('some', 'workspace');
    expect(resolveInside(root, 'public/app.html')).toBe(resolve(root, 'public', 'app.html'));
    expect(() => resolveInside(root, '../outside.html')).toThrow('outside');
    expect(() => resolveInside(root, 'a/../../outside.html')).toThrow('outside');
    expect(() => resolveInside(root, resolve('elsewhere', 'x.html'))).toThrow('outside');
    expect(() => resolveInside(root, '.')).toThrow('outside');
  });

  it('escapes attribute values copied into the generated tags', () => {
    expect(escapeAttribute('a"b<c&d')).toBe('a&quot;b&lt;c&amp;d');
    const { html } = inlineHtml(
      `<link rel="stylesheet" href="s.css" media='x" onload="alert(1)'>`,
      { readFile: () => 'body{}' },
    );
    expect(html).not.toContain('onload="alert(1)"');
    expect(html).toContain('media="x&quot; onload=&quot;alert(1)"');
  });
});
