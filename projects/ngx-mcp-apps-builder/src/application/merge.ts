/**
 * Bundles the module scripts of the built index.html, with the chunks they load, into one module.
 *
 * The Angular application builder always splits the code: a lazy route, a `@defer` block or a dynamic
 * `import()` becomes a separate file, and code shared with it becomes another. One HTML document cannot
 * load them. Here they are put back together with esbuild, the bundler Angular itself uses: a dynamic
 * import of a chunk becomes a reference to code that is already in the file. The application is written
 * as usual; what is lost is the saving, because everything is loaded with the app.
 */
import { createRequire } from 'node:module';
import { SingleFileError } from './inline';

interface EsbuildLike {
  build(options: Record<string, unknown>): Promise<{ outputFiles?: { text: string }[] }>;
}

/** The esbuild that @angular/build installed: the same version that wrote the files being bundled. */
function loadEsbuild(): EsbuildLike {
  let fromAngular: NodeJS.Require;
  try {
    fromAngular = createRequire(require.resolve('@angular/build/package.json'));
  } catch {
    fromAngular = require;
  }
  for (const name of ['esbuild', 'esbuild-wasm']) {
    try {
      return fromAngular(name) as EsbuildLike;
    } catch {
      // try the next one
    }
  }
  throw new SingleFileError(
    'The application uses lazy loading or code splitting, and esbuild (a dependency of @angular/build) ' +
      'could not be loaded to merge the chunks into the single file.',
  );
}

/**
 * Returns one ES module with the given entry files, evaluated in order, and everything they import.
 *
 * @param directory Folder of the build output: the entries are relative to it.
 * @param entries Module scripts of index.html, in document order.
 * @param minify Whether the build was optimized: the bundle is minified the same way.
 */
export async function bundleModules(
  directory: string,
  entries: readonly string[],
  minify: boolean,
): Promise<string> {
  const esbuild = loadEsbuild();
  try {
    const result = await esbuild.build({
      // One entry that imports the scripts in the order of the document: polyfills before the application
      stdin: {
        contents: entries.map((file) => `import ${JSON.stringify('./' + file)};`).join('\n'),
        resolveDir: directory,
        sourcefile: 'single-file-entry.js',
        loader: 'js',
      },
      bundle: true,
      splitting: false,
      format: 'esm',
      platform: 'browser',
      target: 'esnext',
      minify,
      legalComments: 'none',
      write: false,
      logLevel: 'silent',
    });
    const text = result.outputFiles?.[0]?.text;
    if (text === undefined) throw new Error('esbuild returned no output');
    return text;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SingleFileError(`Cannot merge the lazy chunks into the single file: ${reason}`);
  }
}
