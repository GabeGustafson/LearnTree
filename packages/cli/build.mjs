import { build } from 'esbuild';

// Single self-contained file so the data repo can commit it and run
// `node tools/learntree-validate.mjs .` with zero install.
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/learntree-validate.mjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  banner: { js: '#!/usr/bin/env node' },
});
console.log('built dist/learntree-validate.mjs');
