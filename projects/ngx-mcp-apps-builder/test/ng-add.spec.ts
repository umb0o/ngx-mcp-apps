import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { Tree } from '@angular-devkit/schematics';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The built package, as the Angular CLI loads it
const collection = join(__dirname, '../../../dist/ngx-mcp-apps-builder/collection.json');
const { version } = require('../package.json') as { version: string };

const app = (builder = '@angular/build:application') => ({
  projectType: 'application',
  root: '',
  architect: { build: { builder, options: { browser: 'src/main.ts' } } },
});

function workspace(projects: Record<string, unknown>): UnitTestTree {
  const tree = new UnitTestTree(Tree.empty());
  tree.create('angular.json', JSON.stringify({ version: 1, projects }, null, 2));
  tree.create(
    'package.json',
    JSON.stringify({ name: 'w', dependencies: {}, devDependencies: {} }, null, 2),
  );
  return tree;
}

const run = (tree: UnitTestTree, options = {}) =>
  new SchematicTestRunner('ngx-mcp-apps-builder', collection).runSchematic('ng-add', options, tree);
const build = (tree: UnitTestTree, name: string) =>
  JSON.parse(tree.readText('angular.json')).projects[name].architect.build;

describe('ng add', () => {
  it('switches the only application to the builder and adds the library, same version', async () => {
    const tree = await run(workspace({ shop: app() }));
    expect(build(tree, 'shop')).toEqual({
      builder: 'ngx-mcp-apps-builder:application',
      options: { browser: 'src/main.ts', singleFile: 'dist/shop.html' },
    });
    expect(JSON.parse(tree.readText('package.json')).dependencies['ngx-mcp-apps']).toBe(
      `^${version}`,
    );
  });

  it('accepts the application builder of @angular-devkit/build-angular', async () => {
    const tree = await run(workspace({ shop: app('@angular-devkit/build-angular:application') }));
    expect(build(tree, 'shop').builder).toBe('ngx-mcp-apps-builder:application');
  });

  it('honours --single-file and --skip-library', async () => {
    const tree = await run(workspace({ shop: app() }), {
      singleFile: 'public/app.html',
      skipLibrary: true,
    });
    expect(build(tree, 'shop').options.singleFile).toBe('public/app.html');
    expect(JSON.parse(tree.readText('package.json')).dependencies['ngx-mcp-apps']).toBeUndefined();
  });

  it('run twice, keeps the path already chosen', async () => {
    const once = await run(workspace({ shop: app() }), { singleFile: 'public/app.html' });
    const twice = await run(once);
    expect(build(twice, 'shop').options.singleFile).toBe('public/app.html');
  });

  it('asks for --project when there are several applications, and uses it', async () => {
    await expect(run(workspace({ a: app(), b: app() }))).rejects.toThrow(/--project.*a, b/);
    const tree = await run(workspace({ a: app(), b: app() }), { project: 'b' });
    expect(build(tree, 'a').builder).toBe('@angular/build:application');
    expect(build(tree, 'b').options.singleFile).toBe('dist/b.html');
  });

  it('refuses a builder it cannot replace, a library and an unknown project', async () => {
    await expect(
      run(workspace({ old: app('@angular-devkit/build-angular:browser') })),
    ).rejects.toThrow(/migrate to it first/);
    await expect(run(workspace({ lib: { ...app(), projectType: 'library' } }))).rejects.toThrow(
      /no application/,
    );
    await expect(run(workspace({ shop: app() }), { project: 'nope' })).rejects.toThrow(
      /does not exist/,
    );
  });
});
