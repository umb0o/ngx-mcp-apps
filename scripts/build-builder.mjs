// Builds the Angular CLI builder package with plain tsc (the library packager does not handle builders).
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const src = 'projects/ngx-mcp-apps-builder';
const dist = 'dist/ngx-mcp-apps-builder';
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

rmSync(dist, { recursive: true, force: true });
execSync(`npx tsc -p ${src}/tsconfig.json`, { stdio: 'inherit' });

// The option schema is the official application schema plus our own options. @angular/build does not
// export its schema file and the Angular CLI does not resolve a "$ref" to another package, so the
// official schema of the installed @angular/build is merged in here, at build time.
const require = createRequire(import.meta.url);
const angularBuild = dirname(require.resolve('@angular/build/package.json'));
const official = readJson(join(angularBuild, 'src/builders/application/schema.json'));
const extension = readJson(`${src}/src/application/schema.extension.json`);
for (const name of Object.keys(extension.properties)) {
  if (name in official.properties) throw new Error(`Option "${name}" already exists upstream`);
}
const schema = {
  ...official,
  title: extension.title,
  description: extension.description,
  properties: { ...official.properties, ...extension.properties },
};
mkdirSync(`${dist}/application`, { recursive: true });
writeFileSync(`${dist}/application/schema.json`, JSON.stringify(schema, null, 2) + '\n');

const builders = readJson(`${src}/builders.json`);
delete builders.$schema;
writeFileSync(`${dist}/builders.json`, JSON.stringify(builders, null, 2) + '\n');

copyFileSync(`${src}/package.json`, `${dist}/package.json`);
copyFileSync(`${src}/README.md`, `${dist}/README.md`);
copyFileSync('LICENSE', `${dist}/LICENSE`);
console.log(`Ready to publish from ${dist}`);
