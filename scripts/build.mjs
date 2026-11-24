// Builds the library for publishing. README, CHANGELOG and LICENSE in the root are the source of truth.
import { execSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';

const lib = 'projects/ngx-mcp-apps';
const dist = 'dist/ngx-mcp-apps';

for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE']) copyFileSync(file, `${lib}/${file}`);
execSync('npx ng build ngx-mcp-apps', { stdio: 'inherit' });
// The Angular builder copies README and LICENSE only
copyFileSync('CHANGELOG.md', `${dist}/CHANGELOG.md`);
console.log(`Ready to publish from ${dist}`);
