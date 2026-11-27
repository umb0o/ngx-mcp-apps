import { type BuilderContext, type BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { type ApplicationBuilderOptions, buildApplication } from '@angular/build';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import {
  findSplit,
  inlineHtml,
  type MergedModules,
  resolveInside,
  SingleFileError,
} from './inline';
import { bundleModules } from './merge';
import { withoutCriticalCss } from './optimization';

export {
  findSplit,
  inlineCssUrls,
  inlineHtml,
  SingleFileError,
  type CssUrlsOptions,
  type CssUrlsResult,
  type InlineOptions,
  type InlineResult,
  type MergedModules,
  type SplitKind,
  type SplitPlan,
} from './inline';
export { bundleModules } from './merge';

/** Options of the official application builder, plus the single-file output. */
export type SingleFileApplicationOptions = ApplicationBuilderOptions & {
  /** Path, relative to the workspace root, of the self-contained HTML file to write. */
  singleFile?: string;
};

/** Folder where the official builder writes the browser files; same defaults as @angular/build. */
function browserOutputDir(options: ApplicationBuilderOptions, context: BuilderContext): string {
  const outputPath = options.outputPath ?? join('dist', context.target?.project ?? '');
  const base = typeof outputPath === 'string' ? outputPath : outputPath.base;
  const browser = typeof outputPath === 'string' ? 'browser' : (outputPath.browser ?? 'browser');
  return resolve(context.workspaceRoot, base, browser);
}

function indexFileName(options: ApplicationBuilderOptions): string {
  const index = options.index;
  if (index === false) {
    throw new SingleFileError(
      'The "singleFile" option needs an index.html: remove "index": false.',
    );
  }
  if (typeof index === 'string') return basename(index);
  if (typeof index === 'object') return basename(index.output || 'index.html');
  return 'index.html';
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => statSync(join(dir, file)).isFile())
    .map((file) => file.split(sep).join('/'));
}

function origin(url: string): string {
  return /^(?:https?:)?\/\/[^/?#]+/i.exec(url)?.[0] ?? url;
}

function list(items: readonly string[]): string {
  return items.map((item) => `\n  - ${item}`).join('');
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} kB`;
}

/** Reads the build output from disk and writes the single HTML file. Returns the logged summary. */
export async function writeSingleFile(
  options: SingleFileApplicationOptions & { singleFile: string },
  context: BuilderContext,
): Promise<string> {
  const browserDir = browserOutputDir(options, context);
  let indexPath = join(browserDir, indexFileName(options));
  // With server rendering or prerendering the client-side document is index.csr.html
  if (!existsSync(indexPath)) indexPath = join(browserDir, 'index.csr.html');
  if (!existsSync(indexPath)) {
    throw new SingleFileError(`Cannot find the built index.html in ${browserDir}.`);
  }

  const indexHtml = readFileSync(indexPath, 'utf8');
  const outputFiles = listFiles(browserDir);
  const readFile = (path: string) => readFileSync(resolveInside(browserDir, path), 'utf8');

  // Lazy chunks and shared chunks are put back into one module. A web worker cannot be: it stays an error.
  let merged: MergedModules | undefined;
  const split = findSplit(indexHtml, { outputFiles, readFile });
  const kinds = [...split.files.values()];
  if (split.entries.length > 0 && kinds.length > 0 && !kinds.includes('worker')) {
    const optimization = options.optimization;
    const minify =
      typeof optimization === 'object' ? optimization.scripts !== false : optimization !== false;
    merged = {
      code: await bundleModules(browserDir, split.entries, minify),
      entries: split.entries,
      files: [...split.entries, ...split.files.keys()],
    };
    const lazy = kinds.filter((kind) => kind === 'dynamic').length;
    context.logger.info(
      `Single file: ${split.files.size} JavaScript ${split.files.size === 1 ? 'chunk' : 'chunks'} merged into the file` +
        (lazy > 0
          ? ` (${lazy} loaded on demand by lazy routes, @defer blocks or import()). They are loaded with the ` +
            'app, not on demand: lazy loading still works, without its saving.'
          : ' (code splitting).'),
    );
  }

  let embeddedBytes = 0;
  const { html, warnings, embedded, remote, assets } = inlineHtml(indexHtml, {
    outputFiles,
    merged,
    // Only files of the build output can end up in the document
    readFile,
    readBinaryFile: (path) => {
      const bytes = readFileSync(resolveInside(browserDir, path));
      embeddedBytes += bytes.byteLength;
      return bytes;
    },
  });
  if (warnings.length > 0) {
    context.logger.warn(
      'Single file: these references still point to local files, which are not part of the single ' +
        `file and will not load:${list(warnings)}`,
    );
  }
  if (assets.length > 0) {
    context.logger.warn(
      'Single file: the application code names these files of the build output (for example in an ' +
        '<img src> of a template). They are not part of the single file and will not load: embed ' +
        `them as data: URLs, or use them from CSS with url(...):${list(assets)}`,
    );
  }
  if (remote.length > 0) {
    const domains = [...new Set(remote.map(origin))];
    context.logger.warn(
      `Single file: the document still loads these remote URLs:${list(remote)}\n` +
        'Inside an MCP host they load only if the MCP server declares their domains in the CSP of ' +
        `the UI resource (_meta.ui.csp.resourceDomains): ${domains.join(', ')}`,
    );
  }

  // The file is written inside the workspace only: a configuration cannot make the build write elsewhere
  let target: string;
  try {
    target = resolveInside(context.workspaceRoot, options.singleFile);
  } catch {
    throw new SingleFileError(
      `"singleFile" must be a path inside the workspace, got "${options.singleFile}".`,
    );
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
  const shown = relative(context.workspaceRoot, target).split(sep).join('/');
  const summary = `Single file: ${shown} (${formatSize(Buffer.byteLength(html))})`;
  return embedded.length === 0
    ? summary
    : `${summary}, with ${embedded.length} font or image ` +
        (embedded.length === 1 ? 'file embedded as data: URL' : 'files embedded as data: URLs') +
        ` (${formatSize(embeddedBytes)} before base64)`;
}

/**
 * Runs the official application builder and, when `singleFile` is set, writes one self-contained HTML
 * file after each successful build (also after each rebuild in watch mode).
 */
export async function* buildSingleFileApplication(
  options: SingleFileApplicationOptions,
  context: BuilderContext,
): AsyncIterable<BuilderOutput> {
  const { singleFile, ...applicationOptions } = options;
  if (!singleFile) {
    yield* buildApplication(applicationOptions, context);
    return;
  }

  applicationOptions.optimization = withoutCriticalCss(applicationOptions.optimization);
  for await (const result of buildApplication(applicationOptions, context)) {
    if (!result.success) {
      yield result;
      continue;
    }
    try {
      context.logger.info(await writeSingleFile({ ...applicationOptions, singleFile }, context));
      yield result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Logged here and not returned as "error": the CLI prints that only for the last result,
      // which in watch mode never comes
      context.logger.error(`Single file: ${message}`);
      yield { ...result, success: false };
    }
  }
}

export default createBuilder<SingleFileApplicationOptions>(buildSingleFileApplication);
