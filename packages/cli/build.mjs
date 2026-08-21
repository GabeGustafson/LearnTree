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
  banner: {
    // createRequire shim: CJS deps (yaml) require() node builtins, which the
    // ESM output format does not provide on its own.
    js: `#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);`,
  },
});
console.log('built dist/learntree-validate.mjs');
