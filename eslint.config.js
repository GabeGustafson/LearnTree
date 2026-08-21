import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const NODE_BUILTINS = [
  'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https',
  'module', 'net', 'os', 'path', 'process', 'stream', 'url', 'util', 'worker_threads', 'zlib',
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['packages/web/**'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Node contexts: the CLI, build scripts, and tool configs. Core is deliberately
    // excluded — it gets no environment globals at all.
    files: ['packages/cli/**', '**/*.mjs', '**/vite.config.ts', '**/vitest.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // @learntree/core must run identically in browser, worker, and Node: no platform imports.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NODE_BUILTINS.map((name) => ({
            name,
            message: 'core is platform-pure: no Node builtins.',
          })),
          patterns: [
            { group: ['node:*'], message: 'core is platform-pure: no Node builtins.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core is platform-pure: no DOM globals.' },
        { name: 'document', message: 'core is platform-pure: no DOM globals.' },
        { name: 'localStorage', message: 'core is platform-pure: no DOM globals.' },
      ],
    },
  },
);
