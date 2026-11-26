import { type BuilderContext, type BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { type ApplicationBuilderOptions, buildApplication } from '@angular/build';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { inlineHtml, resolveInside, SingleFileError } from './inline';

export { inlineHtml, SingleFileError, type InlineOptions, type InlineResult } from './inline';

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

function listJavaScript(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.m?js$/i.test(file))
    .map((file) => file.split(sep).join('/'));
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} kB`;
}

/** Reads the build output from disk and writes the single HTML file. Returns the logged summary. */
export function writeSingleFile(
  options: SingleFileApplicationOptions & { singleFile: string },
  context: BuilderContext,
): string {
  const browserDir = browserOutputDir(options, context);
  let indexPath = join(browserDir, indexFileName(options));
  // With server rendering or prerendering the client-side document is index.csr.html
  if (!existsSync(indexPath)) indexPath = join(browserDir, 'index.csr.html');
  if (!existsSync(indexPath)) {
    throw new SingleFileError(`Cannot find the built index.html in ${browserDir}.`);
  }

  const { html, warnings } = inlineHtml(readFileSync(indexPath, 'utf8'), {
    outputFiles: listJavaScript(browserDir),
    // Only files of the build output can end up in the document
    readFile: (path) => readFileSync(resolveInside(browserDir, path), 'utf8'),
  });
  for (const tag of warnings) {
    context.logger.warn(`Single file: this tag still points to a local file: ${tag}`);
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
  return `Single file: ${shown} (${formatSize(Buffer.byteLength(html))})`;
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

  for await (const result of buildApplication(applicationOptions, context)) {
    if (!result.success) {
      yield result;
      continue;
    }
    try {
      context.logger.info(writeSingleFile({ ...applicationOptions, singleFile }, context));
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
