// Fonts and images of the CSS, remote URLs, files left out of the document, kinds of extra chunks.
import { describe, expect, it } from 'vitest';
import { inlineCssUrls, inlineHtml, mimeType, SingleFileError } from '../src/application/inline';

const bytes = (text: string) => new TextEncoder().encode(text);
const base64 = (text: string) => Buffer.from(text).toString('base64');

const binaries: Record<string, Uint8Array> = {
  'media/roboto-ABC.woff2': bytes('woff2-bytes'),
  'media/roboto-ABC.woff': bytes('woff-bytes'),
  'media/bg-DEF.png': bytes('png-bytes'),
  'media/sprite-GHI.svg': bytes('<svg/>'),
  'assets/img/photo one.jpg': bytes('jpg-bytes'),
  'logo.png': bytes('logo-bytes'),
};

function reader(calls: string[] = []) {
  return (path: string) => {
    calls.push(path);
    if (!(path in binaries)) throw new Error(`ENOENT: ${path}`);
    return binaries[path];
  };
}

function embed(css: string, cssPath = 'styles-ABC.css') {
  return inlineCssUrls(css, cssPath, { readBinaryFile: reader() });
}

describe('inlineCssUrls', () => {
  it('embeds the fonts of @font-face with their MIME type', () => {
    const { css, embedded } = embed(
      '@font-face{font-family:Roboto;src:url(./media/roboto-ABC.woff2) format("woff2"),' +
        'url(./media/roboto-ABC.woff) format("woff")}',
    );
    expect(css).toBe(
      '@font-face{font-family:Roboto;src:' +
        `url("data:font/woff2;base64,${base64('woff2-bytes')}") format("woff2"),` +
        `url("data:font/woff;base64,${base64('woff-bytes')}") format("woff")}`,
    );
    expect(embedded).toEqual(['media/roboto-ABC.woff2', 'media/roboto-ABC.woff']);
  });

  it('accepts double quotes, single quotes, spaces and image-set', () => {
    const png = `url("data:image/png;base64,${base64('png-bytes')}")`;
    const { css } = embed(
      `a{background:url("media/bg-DEF.png")}b{background:url( 'media/bg-DEF.png' )}` +
        'c{background-image:image-set(url("./media/bg-DEF.png") 1x,url(media/bg-DEF.png) 2x)}',
    );
    expect(css).toBe(
      `a{background:${png}}b{background:${png}}c{background-image:image-set(${png} 1x,${png} 2x)}`,
    );
  });

  it('resolves paths from the folder of the stylesheet', () => {
    const jpg = `url("data:image/jpeg;base64,${base64('jpg-bytes')}")`;
    const png = `url("data:image/png;base64,${base64('png-bytes')}")`;
    const { css, embedded } = embed(
      'a{background:url(../img/photo%20one.jpg?v=2)}b{background:url(/media/bg-DEF.png)}',
      'assets/css/theme.css',
    );
    expect(css).toBe(`a{background:${jpg}}b{background:${png}}`);
    expect(embedded).toEqual(['assets/img/photo one.jpg', 'media/bg-DEF.png']);
  });

  it('keeps the fragment of an SVG and drops the one of a font', () => {
    const { css } = embed(
      'a{mask:url(media/sprite-GHI.svg#icon)}@font-face{src:url(media/roboto-ABC.woff?#iefix)}',
    );
    expect(css).toBe(
      `a{mask:url("data:image/svg+xml;base64,${base64('<svg/>')}#icon")}` +
        `@font-face{src:url("data:font/woff;base64,${base64('woff-bytes')}")}`,
    );
  });

  it('leaves data:, remote and fragment URLs untouched and lists the remote ones', () => {
    const source =
      '@import "https://fonts.example.com/css?family=Inter";' +
      'a{background:url(data:image/png;base64,AAAA)}' +
      'b{background:url("https://cdn.example.com/a.png")}' +
      'c{background:url(//cdn.example.com/b.png)}' +
      'd{filter:url(#blur)}e{background:url()}' +
      '@font-face{src:url(http://fonts.example.com/f.woff2)}';
    const { css, embedded, remote, left } = embed(source);
    expect(css).toBe(source);
    expect(embedded).toEqual([]);
    expect(left).toEqual([]);
    expect(remote).toEqual([
      'https://fonts.example.com/css?family=Inter',
      'https://cdn.example.com/a.png',
      '//cdn.example.com/b.png',
      'http://fonts.example.com/f.woff2',
    ]);
  });

  it('does not touch url(...) written in a comment or in a string', () => {
    const source =
      '/* url(media/missing.png) */a::after{content:"url(media/missing.png)"}' +
      `b::after{content:'url(media/missing.png)'}`;
    expect(embed(source).css).toBe(source);
  });

  it('does not touch a data: URL that holds SVG markup', () => {
    const source = `a{background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><path fill='url(#g)'/></svg>")}`;
    const { css, remote } = embed(source);
    expect(css).toBe(source);
    expect(remote).toEqual([]);
  });

  it('fails with a clear message when the file is missing', () => {
    const run = () => embed('@font-face{src:url(./media/missing.woff2)}');
    expect(run).toThrow(SingleFileError);
    expect(run).toThrow(
      /Cannot embed "media\/missing\.woff2" referenced by url\(\.\/media\/missing\.woff2\) in styles-ABC\.css/,
    );
  });

  it('refuses a file outside of the build output', () => {
    const calls: string[] = [];
    const run = () =>
      inlineCssUrls('a{background:url(../../secret.png)}', 'css/theme.css', {
        readBinaryFile: reader(calls),
      });
    expect(run).toThrow(SingleFileError);
    expect(run).toThrow(/outside of the build output/);
    expect(calls).toEqual([]);
  });

  it('reads a file once, however many times it is used', () => {
    const calls: string[] = [];
    const cache = new Map<string, string>();
    const options = { readBinaryFile: reader(calls), cache };
    inlineCssUrls(
      'a{background:url(media/bg-DEF.png)}b{background:url(media/bg-DEF.png)}',
      'a.css',
      options,
    );
    inlineCssUrls('c{background:url(./media/bg-DEF.png)}', 'b.css', options);
    expect(calls).toEqual(['media/bg-DEF.png']);
  });

  it('lists the local URLs when it cannot read files', () => {
    const source = 'a{background:url(media/bg-DEF.png)}@import "other.css";';
    const { css, left } = inlineCssUrls(source, 'styles.css');
    expect(css).toBe(source);
    expect(left).toEqual(['media/bg-DEF.png', 'other.css']);
  });

  it('knows the MIME types of fonts and images', () => {
    expect(mimeType('a.woff2')).toBe('font/woff2');
    expect(mimeType('a.WOFF')).toBe('font/woff');
    expect(mimeType('a.ttf')).toBe('font/ttf');
    expect(mimeType('a.otf')).toBe('font/otf');
    expect(mimeType('a.png')).toBe('image/png');
    expect(mimeType('a.jpeg')).toBe('image/jpeg');
    expect(mimeType('a.jpg')).toBe('image/jpeg');
    expect(mimeType('a.gif')).toBe('image/gif');
    expect(mimeType('a.webp')).toBe('image/webp');
    expect(mimeType('a.avif')).toBe('image/avif');
    expect(mimeType('a.svg')).toBe('image/svg+xml');
    expect(mimeType('a.ico')).toBe('image/x-icon');
    expect(mimeType('a.bin')).toBe('application/octet-stream');
    expect(mimeType('noextension')).toBe('application/octet-stream');
  });
});

const texts: Record<string, string> = {
  'main-ABC.js': 'console.log("main");',
  'styles-GHI.css': 'body{background:url(./media/bg-DEF.png)}',
};

function inline(html: string, extra: Record<string, string> = {}, outputFiles?: string[]) {
  const all = { ...texts, ...extra };
  return inlineHtml(html, {
    outputFiles: outputFiles ?? [...Object.keys(all), ...Object.keys(binaries)],
    readFile: (path) => {
      if (!(path in all)) throw new Error(`ENOENT: ${path}`);
      return all[path];
    },
    readBinaryFile: reader(),
  });
}

const MAIN = '<script src="main-ABC.js" type="module"></script>';
const PNG = `url("data:image/png;base64,${base64('png-bytes')}")`;

describe('inlineHtml: fonts and images of the CSS', () => {
  it('embeds the files referenced by an inlined stylesheet', () => {
    const { html, embedded, warnings } = inline('<link rel="stylesheet" href="styles-GHI.css">');
    expect(html).toBe(`<style>body{background:${PNG}}</style>`);
    expect(embedded).toEqual(['media/bg-DEF.png']);
    expect(warnings).toEqual([]);
  });

  it('embeds the files referenced by a style element of index.html', () => {
    const { html, embedded } = inline(
      '<style media="screen">a{background:url(media/bg-DEF.png)}</style>' +
        '<link rel="stylesheet" href="styles-GHI.css">',
    );
    expect(html).toBe(
      `<style media="screen">a{background:${PNG}}</style><style>body{background:${PNG}}</style>`,
    );
    expect(embedded).toEqual(['media/bg-DEF.png']);
  });

  it('fails when a stylesheet references a file that is not in the build output', () => {
    const run = () =>
      inline('<link rel="stylesheet" href="styles-GHI.css">', {
        'styles-GHI.css': '@font-face{src:url(/fonts/missing.woff2)}',
      });
    expect(run).toThrow(SingleFileError);
    expect(run).toThrow(/Cannot embed "fonts\/missing\.woff2"/);
  });

  it('embeds the files that component styles reference from the JavaScript', () => {
    const { html, embedded } = inline(MAIN, {
      'main-ABC.js':
        'var a=["[_nghost-%COMP%]{background:url(\\"./media/bg-DEF.png\\")}"];' +
        "var b=['.x[_ngcontent-%COMP%]{background:url(./media/bg-DEF.png)}'];" +
        'var c=`.y{background:url("./media/unknown.png")}`;',
    });
    // Without quotes: the URL is inside a JavaScript string of any kind
    const data = `url(data:image/png;base64,${base64('png-bytes')})`;
    expect(html).toBe(
      '<script type="module">' +
        `var a=["[_nghost-%COMP%]{background:${data}}"];` +
        `var b=['.x[_ngcontent-%COMP%]{background:${data}}'];` +
        'var c=`.y{background:url("./media/unknown.png")}`;' +
        '</script>',
    );
    expect(embedded).toEqual(['media/bg-DEF.png']);
  });
});

describe('inlineHtml: what stays outside of the document', () => {
  it('lists the remote URLs that the document still loads', () => {
    const { html, remote } = inline(
      '<link rel="preconnect" href="https://fonts.gstatic.com">' +
        '<link rel="stylesheet" href="https://cdn.example.com/site.css">' +
        '<script src="https://cdn.example.com/lib.js"></script>' +
        '<style>@font-face{src:url(https://fonts.gstatic.com/inter.woff2)}</style>' +
        '<img src="//cdn.example.com/logo.png">' +
        '<a href="https://example.com/page">link</a>' +
        MAIN,
      { 'main-ABC.js': 'var s=".a{background:url(https://cdn.example.com/bg.png)}";' },
    );
    expect(html).toContain('<script src="https://cdn.example.com/lib.js"></script>');
    expect([...remote].sort()).toEqual([
      '//cdn.example.com/logo.png',
      'https://cdn.example.com/bg.png',
      'https://cdn.example.com/lib.js',
      'https://cdn.example.com/site.css',
      'https://fonts.gstatic.com/inter.woff2',
    ]);
  });

  it('has nothing to report for a document without remote URLs', () => {
    const { remote, assets, warnings } = inline(
      `<link rel="stylesheet" href="styles-GHI.css">${MAIN}`,
    );
    expect(remote).toEqual([]);
    expect(assets).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('reports the local images of the static markup, not what scripts and comments contain', () => {
    const { warnings } = inline(
      '<img src="logo.png" alt="">' +
        '<video poster="media/bg-DEF.png" src="https://cdn.example.com/v.mp4"></video>' +
        '<img src="data:image/png;base64,AAAA">' +
        '<!-- <img src="commented.png"> -->' +
        `<script>const html = '<img src="in-script.png">';</script>`,
    );
    expect(warnings).toEqual([
      '<img src="logo.png" alt="">',
      '<video poster="media/bg-DEF.png" src="https://cdn.example.com/v.mp4">',
    ]);
  });

  it('reports the output files that the JavaScript names, like the image of a template', () => {
    const { assets } = inline(MAIN, {
      'main-ABC.js':
        'var t=["src","logo.png","alt",""];fetch("assets/img/photo one.jpg");var other="biglogo.png";',
    });
    expect([...assets].sort()).toEqual(['assets/img/photo one.jpg', 'logo.png']);
  });

  it('does not report the files that are embedded or never named', () => {
    const { assets, embedded } = inline(`<link rel="stylesheet" href="styles-GHI.css">${MAIN}`, {
      'main-ABC.js': 'var s=".a{background:url(./media/bg-DEF.png)}";',
    });
    expect(embedded).toEqual(['media/bg-DEF.png']);
    expect(assets).toEqual([]);
  });
});

describe('inlineHtml: kinds of extra JavaScript files', () => {
  const message = (run: () => unknown): string => {
    try {
      run();
    } catch (error) {
      expect(error).toBeInstanceOf(SingleFileError);
      return (error as Error).message;
    }
    throw new Error('did not throw');
  };

  it('tells a lazy chunk from the shared chunk that the initial script imports statically', () => {
    const text = message(() =>
      inline(`<link rel="modulepreload" href="chunk-SHARED.js">${MAIN}`, {
        'main-ABC.js':
          'import{a}from"./chunk-SHARED.js";load=()=>import("./chunk-LAZY.js").then(m=>m.b);',
        'chunk-SHARED.js': 'export const a=1;',
        'chunk-LAZY.js':
          'import{a}from"./chunk-SHARED.js";import{c}from"./chunk-DEEP.js";export const b=a+c;',
        'chunk-DEEP.js': 'export const c=2;',
      }),
    );
    expect(text).toMatch(/dynamic import\(\): chunk-LAZY\.js, chunk-DEEP\.js\./);
    expect(text).toMatch(/must be merged into the document first/);
    expect(text).toMatch(/import statically: chunk-SHARED\.js\./);
    expect(text).toMatch(/code splitting, not lazy loading by itself/);
  });

  it('does not blame lazy loading for a shared chunk when nothing is imported dynamically', () => {
    const text = message(() =>
      inline(MAIN, {
        'main-ABC.js': 'import{a}from"./chunk-SHARED.js";a();',
        'chunk-SHARED.js': 'export const a=()=>{};',
      }),
    );
    expect(text).toMatch(/import statically: chunk-SHARED\.js\./);
    expect(text).toMatch(/not lazy loading: no dynamic import\(\) was found/);
    expect(text).toMatch(/can be merged into the document like a lazy chunk/);
    expect(text).not.toMatch(/cannot use lazy loading/);
  });

  it('names web worker scripts as such', () => {
    const text = message(() =>
      inline(MAIN, {
        'main-ABC.js': 'new Worker(new URL("worker-XYZ.js",import.meta.url),{type:"module"});',
        'worker-XYZ.js': 'postMessage(1);',
      }),
    );
    expect(text).toMatch(/Web worker scripts: worker-XYZ\.js\./);
    expect(text).not.toMatch(/cannot use lazy loading/);
    expect(text).not.toMatch(/import statically/);
  });

  it('finds a lazy chunk that only another chunk imports', () => {
    const text = message(() =>
      inline(MAIN, {
        'main-ABC.js': 'import{a}from"./chunk-SHARED.js";a();',
        'chunk-SHARED.js': 'export const a=()=>import("./chunk-LAZY.js");',
        'chunk-LAZY.js': 'export const b=1;',
      }),
    );
    expect(text).toMatch(/dynamic import\(\): chunk-LAZY\.js\./);
    expect(text).toMatch(/import statically: chunk-SHARED\.js\./);
  });
});
