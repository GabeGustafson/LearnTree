import type { Diagnostic, ResolvedForest, SourceFile } from '@learntree/core';
import { loadForest } from '@learntree/core';

export interface ResolveResult {
  forest: ResolvedForest;
  /** Diagnostics of the raw attempt — the problems that actually exist right now. */
  diagnostics: Diagnostic[];
  /** Files rendered from an older, last-good version. */
  staleFiles: string[];
}

/**
 * Per-file last-good substitution: files that fail parse/schema are replaced
 * by their most recent valid version (when one is known), so a broken agent
 * push degrades to "stale but rendered" instead of a hole in the forest.
 * Deleting a file entirely is respected — deletion is a legitimate edit.
 */
export function resolveWithLastGood(
  files: SourceFile[],
  lastGood: Map<string, string>,
): ResolveResult {
  const attempt = loadForest(files);
  let forest = attempt;
  const staleFiles: string[] = [];

  const substitutable = attempt.quarantinedFiles.filter((p) => lastGood.has(p));
  if (substitutable.length > 0) {
    const substituted = files.map((f) =>
      substitutable.includes(f.path) ? { path: f.path, text: lastGood.get(f.path)! } : f,
    );
    forest = loadForest(substituted);
    staleFiles.push(...substitutable);
  }

  for (const f of files) {
    if (!attempt.quarantinedFiles.includes(f.path)) lastGood.set(f.path, f.text);
  }
  return { forest, diagnostics: attempt.diagnostics, staleFiles };
}
