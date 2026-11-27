import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findSplit, inlineHtml, SingleFileError } from '../src/application/inline';
import { bundleModules } from '../src/application/merge';

const reader = (files: Record<string, string>) => (path: string) => {
  if (!(path in files)) throw new Error(`ENOENT: ${path}`);
  return files[path];
};

describe('findSplit', () => {
  const html =
    '<link rel="modulepreload" href="chunk-SHARED.js">' +
    '<script src="polyfills-P.js" type="module"></script>' +
    '<script src="scripts-S.js" defer></script>' +
    '<script src="main-M.js" type="module"></script>';
  const files = {
    'polyfills-P.js': 'console.log("polyfills");',
    'scripts-S.js': 'console.log("classic");',
    'main-M.js':
      'import { a } from "./chunk-SHARED.js"; a(); import("./chunk-LAZY.js"); new Worker(new URL("worker-W.js", import.meta.url));',
    'chunk-SHARED.js': 'export const a = () => {};',
    'chunk-LAZY.js': 'import "./chunk-SHARED.js"; import("./chunk-DEEP.js");',
    'chunk-DEEP.js': 'export const deep = 1;',
    'worker-W.js': 'postMessage(1);',
    'unused.js': 'never loaded',
  };

  it('lists the module scripts in order, and how each other file is reached', () => {
    const plan = findSplit(html, { outputFiles: Object.keys(files), readFile: reader(files) });
    // The classic script is not a module: it is inlined as it is, not bundled
    expect(plan.entries).toEqual(['polyfills-P.js', 'main-M.js']);
    expect(Object.fromEntries(plan.files)).toEqual({
      'chunk-SHARED.js': 'shared',
      'chunk-LAZY.js': 'dynamic',
      'chunk-DEEP.js': 'dynamic',
      'worker-W.js': 'worker',
    });
  });

  it('finds nothing in a build without chunks', () => {
    const plain = { 'main-M.js': 'console.log("main");', 'leftover.js': 'old' };
    const plan = findSplit('<script src="main-M.js" type="module"></script>', {
      outputFiles: Object.keys(plain),
      readFile: reader(plain),
    });
    expect(plan.entries).toEqual(['main-M.js']);
    expect(plan.files.size).toBe(0);
  });
});

describe('inlineHtml with merged modules', () => {
  const files = {
    'polyfills-P.js': 'console.log("polyfills");',
    'main-M.js': 'import("./chunk-LAZY.js");',
    'chunk-LAZY.js': 'export const lazy = 1;',
  };
  const html =
    '<head><link rel="modulepreload" href="chunk-LAZY.js"></head><body>' +
    '<script src="polyfills-P.js" type="module"></script><script src="main-M.js" type="module"></script></body>';

  it('puts the bundle in place of the first module script and drops the others', () => {
    const result = inlineHtml(html, {
      outputFiles: Object.keys(files),
      readFile: reader(files),
      merged: {
        code: 'console.log("bundle </script> safe");',
        entries: ['polyfills-P.js', 'main-M.js'],
        files: Object.keys(files),
      },
    });
    expect(result.html).toBe(
      '<head></head><body><script type="module">console.log("bundle <\\/script> safe");</script></body>',
    );
    expect(result.inlined.sort()).toEqual(Object.keys(files).sort());
  });

  it('still refuses the chunks when nothing merged them', () => {
    expect(() =>
      inlineHtml(html, { outputFiles: Object.keys(files), readFile: reader(files) }),
    ).toThrow(SingleFileError);
  });

  it('still refuses a chunk that the bundle does not contain', () => {
    const more = {
      ...files,
      'main-M.js': 'import("./chunk-LAZY.js"); import("./chunk-OTHER.js");',
      'chunk-OTHER.js': 'x',
    };
    expect(() =>
      inlineHtml(html, {
        outputFiles: Object.keys(more),
        readFile: reader(more),
        merged: {
          code: 'import("./chunk-OTHER.js");',
          entries: ['polyfills-P.js', 'main-M.js'],
          files: Object.keys(files),
        },
      }),
    ).toThrow(/chunk-OTHER\.js/);
  });
});

describe('bundleModules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'single-file-merge-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns one module with the entries in order and the lazy chunks inside', async () => {
    writeFileSync(join(dir, 'polyfills.js'), 'globalThis.order = ["polyfills"];');
    writeFileSync(
      join(dir, 'main.js'),
      'import { shared } from "./chunk-shared.js"; globalThis.order.push("main", shared);' +
        'globalThis.lazy = () => import("./chunk-lazy.js").then((m) => m.value);',
    );
    writeFileSync(join(dir, 'chunk-shared.js'), 'export const shared = "shared";');
    writeFileSync(join(dir, 'chunk-lazy.js'), 'export const value = "lazy value";');

    const code = await bundleModules(dir, ['polyfills.js', 'main.js'], true);
    expect(code).not.toMatch(/import\s*\(/);
    expect(code).not.toMatch(/\bfrom\s*["']/);

    // Run it: same order as in the document, and the "lazy" import answers without loading anything
    const scope = globalThis as unknown as { order?: string[]; lazy?: () => Promise<string> };
    delete scope.order;
    await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    expect(scope.order).toEqual(['polyfills', 'main', 'shared']);
    expect(await scope.lazy!()).toBe('lazy value');
  });

  it('fails with a clear message when a chunk is missing', async () => {
    writeFileSync(join(dir, 'broken.js'), 'import("./chunk-gone.js");');
    await expect(bundleModules(dir, ['broken.js'], false)).rejects.toThrow(
      /Cannot merge the lazy chunks into the single file/,
    );
  });
});
