import { describe, expect, test } from 'vitest';
import { resolveWithLastGood } from '../src/state/lastGood.ts';

const FOREST = { path: 'forest.yaml', text: 'learntree: 1\nname: F\n' };
const GOOD_TREE = {
  path: 'trees/t.yaml',
  text: [
    'learntree: 1',
    'id: t',
    'title: T',
    'nodes:',
    '  - id: a',
    '    title: A',
    '    categories:',
    '      - name: Resources',
    '        modules:',
    '          - id: m1',
    '            title: M1',
    '            url: "https://example.com"',
    '',
  ].join('\n'),
};
const BROKEN_TREE = { path: 'trees/t.yaml', text: 'learntree: 1\nid: [\n' };

describe('resolveWithLastGood', () => {
  test('broken update renders the last good version and reports the real errors', () => {
    const lastGood = new Map<string, string>();
    const first = resolveWithLastGood([FOREST, GOOD_TREE], lastGood);
    expect(first.staleFiles).toEqual([]);
    expect(first.forest.trees).toHaveLength(1);

    const second = resolveWithLastGood([FOREST, BROKEN_TREE], lastGood);
    expect(second.staleFiles).toEqual(['trees/t.yaml']);
    expect(second.forest.trees).toHaveLength(1); // still rendered from last good
    expect(second.forest.registry.has('m1')).toBe(true);
    expect(second.diagnostics.some((d) => d.code === 'E-YAML-SYNTAX')).toBe(true);

    // fixing the file clears staleness and updates last-good
    const third = resolveWithLastGood([FOREST, GOOD_TREE], lastGood);
    expect(third.staleFiles).toEqual([]);
  });

  test('a broken file with no known-good version stays quarantined', () => {
    const result = resolveWithLastGood([FOREST, BROKEN_TREE], new Map());
    expect(result.staleFiles).toEqual([]);
    expect(result.forest.trees).toHaveLength(0);
  });

  test('deleting a file is respected (no ghost substitution)', () => {
    const lastGood = new Map<string, string>();
    resolveWithLastGood([FOREST, GOOD_TREE], lastGood);
    const afterDelete = resolveWithLastGood([FOREST], lastGood);
    expect(afterDelete.forest.trees).toHaveLength(0);
    expect(afterDelete.staleFiles).toEqual([]);
  });
});
