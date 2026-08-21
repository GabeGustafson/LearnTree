import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { SourceFile } from '@learntree/core';
import { FOREST_FILE, PROGRESS_FILE } from '@learntree/core';

export interface ForestDirContents {
  files: SourceFile[];
  progressText: string | null;
}

function tryRead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Read forest.yaml + trees/**\/*.ya?ml + .learntree/progress.json from a directory. */
export function readForestDir(dir: string): ForestDirContents {
  const files: SourceFile[] = [];

  const forestText = tryRead(join(dir, FOREST_FILE));
  if (forestText !== null) files.push({ path: FOREST_FILE, text: forestText });

  const treesRoot = join(dir, 'trees');
  const walk = (d: string): void => {
    let names: string[];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const name of names.sort()) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.ya?ml$/.test(name)) {
        const repoPath = relative(dir, full).split(sep).join('/');
        files.push({ path: repoPath, text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(treesRoot);

  return { files, progressText: tryRead(join(dir, PROGRESS_FILE)) };
}
