// Refresh the committed artifacts in template/data-repo from the workspace:
// the single-file validator bundle and the JSON Schema files. Run after any
// core schema or CLI change: `node scripts/refresh-template.mjs`
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const template = join(root, 'template', 'data-repo');

execSync('node build.mjs', { cwd: join(root, 'packages', 'cli'), stdio: 'inherit' });

mkdirSync(join(template, 'tools'), { recursive: true });
copyFileSync(
  join(root, 'packages', 'cli', 'dist', 'learntree-validate.mjs'),
  join(template, 'tools', 'learntree-validate.mjs'),
);
console.log('copied tools/learntree-validate.mjs');

execSync(`node "${join(template, 'tools', 'learntree-validate.mjs')}" emit-schemas "${join(template, 'schemas')}"`, {
  stdio: 'inherit',
});

execSync(`node "${join(template, 'tools', 'learntree-validate.mjs')}" validate "${template}"`, {
  stdio: 'inherit',
});
console.log('template artifacts refreshed and validated');
