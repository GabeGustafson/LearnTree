import { describe, expect, test } from 'vitest';
import type { SourceFile } from '../src/index.ts';
import { computeStatuses, forestSummary, loadForest, parseProgressState } from '../src/index.ts';

/**
 * Synthetic 500-module forest (10 trees × 5 groups × 5 nodes × 2 modules)
 * with 40 equivalences — the M7 acceptance gate for full-pipeline latency.
 * Budgets are generous for CI noise; typical local numbers are far lower.
 */
function syntheticForest(): { files: SourceFile[]; progressText: string } {
  const files: SourceFile[] = [];
  const eqs: string[] = [];
  const progress: Record<string, { state: string; at: string }> = {};
  let m = 0;

  for (let t = 0; t < 10; t++) {
    const lines = [`learntree: 1`, `id: tree-${t}`, `title: "Tree ${t}"`, `order: ${t * 10}`, `nodes:`];
    for (let g = 0; g < 5; g++) {
      lines.push(`  - id: g${g}`, `    title: "Group ${g}"`, `    display: group`, `    children:`);
      for (let n = 0; n < 5; n++) {
        lines.push(
          `      - id: g${g}-n${n}`,
          `        title: "Node ${g}.${n}"`,
          `        categories:`,
          `          - name: Resources`,
          `            modules:`,
        );
        for (let k = 0; k < 2; k++) {
          const id = `mod-${m++}`;
          lines.push(
            `              - id: ${id}`,
            `                title: "Module ${id}"`,
            `                url: "https://example.com/${id}"`,
            `                weight: ${1 + (m % 3)}`,
          );
          if (m % 2 === 0) progress[id] = { state: 'done', at: '2026-08-21T00:00:00.000Z' };
        }
      }
    }
    files.push({ path: `trees/tree-${t}.yaml`, text: `${lines.join('\n')}\n` });
  }

  for (let e = 0; e < 40; e++) {
    eqs.push(
      `  - id: eq-${e}`,
      `    sufficient: [mod-${(e * 7) % m}, mod-${(e * 11 + 3) % m}]`,
      `    satisfies: [mod-${(e * 13 + 5) % m}]`,
    );
  }
  files.push({
    path: 'forest.yaml',
    text: `learntree: 1\nname: Perf Forest\nequivalences:\n${eqs.join('\n')}\n`,
  });

  return { files, progressText: JSON.stringify({ learntree: 1, modules: progress }) };
}

describe('performance gate (500 modules, 40 equivalences)', () => {
  test('full pipeline stays interactive', () => {
    const { files, progressText } = syntheticForest();

    const t0 = Date.now();
    const forest = loadForest(files);
    const tLoad = Date.now() - t0;

    expect(forest.registry.size).toBe(500);
    expect(forest.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const progress = parseProgressState(progressText).state;
    // Repeat the per-toggle recompute so millisecond timing is measurable.
    const t1 = Date.now();
    let summary;
    for (let i = 0; i < 20; i++) {
      const statuses = computeStatuses(forest.registry, forest.equivalences, progress);
      summary = forestSummary(forest, statuses);
    }
    const tDerive = (Date.now() - t1) / 20;

    expect(summary!.overall.counts.total).toBe(500);
    expect(tLoad, `load+validate took ${tLoad}ms`).toBeLessThan(2000);
    expect(tDerive, `statuses+rollups took ${tDerive}ms per pass`).toBeLessThan(100);
  });
});
