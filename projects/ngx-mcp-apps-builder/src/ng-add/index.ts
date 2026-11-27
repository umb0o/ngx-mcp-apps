import { type Rule, SchematicsException, chain } from '@angular-devkit/schematics';
import {
  DependencyType,
  addDependency,
  readWorkspace,
  updateWorkspace,
} from '@schematics/angular/utility';

export interface NgAddOptions {
  project?: string;
  singleFile?: string;
  skipLibrary?: boolean;
}

const OFFICIAL_BUILDERS = [
  '@angular/build:application',
  '@angular-devkit/build-angular:application',
];
const OUR_BUILDER = 'ngx-mcp-apps-builder:application';

/** The library is released together with the builder: same version. */
function libraryRange(): string {
  const { version } = require('../package.json') as { version: string };
  return `^${version}`;
}

/**
 * Applications of Angular 18 and 19 get @angular/build through @angular-devkit/build-angular without listing it.
 * The builder needs it, so it is listed with the same range as the package that brought it.
 */
function angularBuildRange(packageJson: string): string | undefined {
  const { dependencies = {}, devDependencies = {} } = JSON.parse(packageJson) as Record<
    string,
    Record<string, string> | undefined
  >;
  const all = { ...dependencies, ...devDependencies };
  if (all['@angular/build']) return undefined;
  return all['@angular-devkit/build-angular'] ?? all['@angular/cli'];
}

export function ngAdd(options: NgAddOptions = {}): Rule {
  return async (tree) => {
    const workspace = await readWorkspace(tree);
    const applications = [...workspace.projects]
      .filter(([, p]) => p.extensions['projectType'] === 'application')
      .map(([name]) => name);
    const name = options.project ?? (applications.length === 1 ? applications[0] : undefined);
    if (!name) {
      throw new SchematicsException(
        applications.length
          ? `Which application? Pass --project with one of: ${applications.join(', ')}.`
          : 'This workspace has no application to set up.',
      );
    }
    const project = workspace.projects.get(name);
    if (!project)
      throw new SchematicsException(`Project "${name}" does not exist in this workspace.`);
    const build = project.targets.get('build');
    if (!build) throw new SchematicsException(`Project "${name}" has no "build" target.`);
    if (build.builder !== OUR_BUILDER && !OFFICIAL_BUILDERS.includes(build.builder)) {
      throw new SchematicsException(
        `Project "${name}" is built with "${build.builder}". Only the application builder (${OFFICIAL_BUILDERS[0]}) can be replaced: migrate to it first.`,
      );
    }
    const angularBuild = angularBuildRange(tree.readText('package.json'));
    const singleFile = options.singleFile ?? `dist/${name}.html`;

    return chain([
      updateWorkspace((ws) => {
        const target = ws.projects.get(name)!.targets.get('build')!;
        target.builder = OUR_BUILDER;
        target.options = {
          ...target.options,
          singleFile: (target.options?.['singleFile'] as string | undefined) ?? singleFile,
        };
      }),
      angularBuild
        ? addDependency('@angular/build', angularBuild, { type: DependencyType.Dev })
        : () => {},
      options.skipLibrary
        ? () => {}
        : addDependency('ngx-mcp-apps', libraryRange(), { type: DependencyType.Default }),
      (_, context) =>
        context.logger.info(
          `"${name}" now builds with ${OUR_BUILDER}: ng build writes the single HTML file.`,
        ),
    ]);
  };
}
