import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  emitJsonSchemas,
  hasErrors,
  loadForest,
  parseProgressState,
  progressInfoDiagnostics,
  sortDiagnostics,
} from '@learntree/core';
import { printDiagnostics, summarize, useColor } from './format.ts';
import { readForestDir } from './fsLoad.ts';
import { renderOutline } from './outline.ts';

const HELP = `learntree — validate and inspect a LearnTree forest directory

Usage:
  learntree validate [dir] [--json]     check forest.yaml + trees/ + progress; exit 1 on errors
  learntree outline  [dir]              print the resolved forest as a text tree
  learntree emit-schemas <outdir>       write forest/tree/progress JSON Schemas
  learntree help

The directory defaults to the current working directory.
`;

function loadDir(dir: string) {
  const { files, progressText } = readForestDir(dir);
  const forest = loadForest(files);
  const progress = parseProgressState(progressText);
  const diagnostics = [
    ...forest.diagnostics,
    ...progress.diagnostics,
    ...progressInfoDiagnostics(forest, progress.state),
  ];
  return { forest, progress: progress.state, diagnostics };
}

export function run(argv: string[]): number {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  const command = positionals[0] ?? 'help';
  if (values.help || command === 'help') {
    process.stdout.write(HELP);
    return 0;
  }

  switch (command) {
    case 'validate': {
      const dir = resolve(positionals[1] ?? '.');
      const { diagnostics } = loadDir(dir);
      if (values.json) {
        const out = { ok: !hasErrors(diagnostics), summary: summarize(diagnostics), diagnostics: sortDiagnostics(diagnostics) };
        process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
      } else {
        printDiagnostics(diagnostics, useColor());
      }
      return hasErrors(diagnostics) ? 1 : 0;
    }

    case 'outline': {
      const dir = resolve(positionals[1] ?? '.');
      const { forest, progress, diagnostics } = loadDir(dir);
      process.stdout.write(renderOutline(forest, progress));
      if (hasErrors(diagnostics)) {
        process.stderr.write('\nnote: the forest has validation errors — run `learntree validate` for details\n');
        return 1;
      }
      return 0;
    }

    case 'emit-schemas': {
      const outdir = positionals[1];
      if (outdir === undefined) {
        process.stderr.write('emit-schemas requires an output directory\n');
        return 2;
      }
      mkdirSync(outdir, { recursive: true });
      for (const [file, schema] of Object.entries(emitJsonSchemas())) {
        writeFileSync(join(outdir, file), `${JSON.stringify(schema, null, 2)}\n`);
        process.stdout.write(`wrote ${join(outdir, file)}\n`);
      }
      return 0;
    }

    default:
      process.stderr.write(`unknown command '${command}'\n\n${HELP}`);
      return 2;
  }
}
