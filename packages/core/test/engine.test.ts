import { describe, expect, test } from 'vitest';
import {
  computeStatuses,
  loadForest,
  rollup,
  setModuleState,
  treeSummary,
  writeThroughAliases,
} from '../src/index.ts';
import { T1, T2, eq, prog, reg } from './engine-helpers.ts';
import { FOREST_MIN, tree, y } from './helpers.ts';

describe('computeStatuses', () => {
  test('manual completion is green with its timestamp', () => {
    const s = computeStatuses(reg({ a: {} }), [], prog({ a: ['done', T1] }));
    expect(s.get('a')).toEqual({ kind: 'done', at: T1 });
  });

  test('satisfied via a fully-done sufficient set (grey, names the mapping)', () => {
    const s = computeStatuses(
      reg({ a1: {}, a2: {}, b: {} }),
      [eq('m', ['a1', 'a2'], ['b'])],
      prog({ a1: ['done', T1], a2: ['done', T1] }),
    );
    expect(s.get('b')).toEqual({ kind: 'satisfied', via: 'm' });
  });

  test('chain-propagation: full satisfaction chains through mappings', () => {
    const s = computeStatuses(
      reg({ a: {}, b: {}, c: {} }),
      [eq('e1', ['a'], ['b']), eq('e2', ['b'], ['c'])],
      prog({ a: ['done', T1] }),
    );
    expect(s.get('b')).toEqual({ kind: 'satisfied', via: 'e1' });
    expect(s.get('c')).toEqual({ kind: 'satisfied', via: 'e2' });
  });

  test('cycle-terminates: mutually-satisfying mappings resolve consistently', () => {
    const equivalences = [eq('e1', ['a'], ['b']), eq('e2', ['b'], ['a'])];
    const none = computeStatuses(reg({ a: {}, b: {} }), equivalences, prog({}));
    expect(none.get('a')?.kind).toBe('none');
    expect(none.get('b')?.kind).toBe('none');

    const s = computeStatuses(reg({ a: {}, b: {} }), equivalences, prog({ b: ['done', T1] }));
    expect(s.get('a')?.kind).toBe('satisfied');
    expect(s.get('b')?.kind).toBe('done');
  });

  test('partial-does-not-chain: coverage never feeds further mappings', () => {
    const s = computeStatuses(
      reg({ a1: {}, a2: {}, b: {}, c: {} }),
      [eq('e1', ['a1', 'a2'], ['b']), eq('e2', ['b'], ['c'])],
      prog({ a1: ['done', T1] }),
    );
    expect(s.get('b')).toEqual({ kind: 'partial', coverage: 0.5, via: 'e1', missing: ['a2'] });
    expect(s.get('c')).toEqual({ kind: 'none' });
  });

  test('multi-mapping-max-coverage: the best mapping wins and reports its gaps', () => {
    const s = computeStatuses(
      reg({ a1: {}, a2: {}, x1: {}, x2: {}, x3: {}, b: {} }),
      [eq('narrow', ['a1', 'a2'], ['b']), eq('wide', ['a1', 'x1', 'x2', 'x3'], ['b'])],
      prog({ a1: ['done', T1] }),
    );
    expect(s.get('b')).toEqual({ kind: 'partial', coverage: 0.5, via: 'narrow', missing: ['a2'] });
  });

  test('weighted-partial: coverage respects module weights', () => {
    const s = computeStatuses(
      reg({ heavy: { weight: 3 }, light: {}, b: {} }),
      [eq('e', ['heavy', 'light'], ['b'])],
      prog({ heavy: ['done', T1] }),
    );
    expect(s.get('b')).toEqual({ kind: 'partial', coverage: 0.75, via: 'e', missing: ['light'] });
  });

  test('a manual tombstone beats an older manual done, and satisfied overrides neither', () => {
    const s = computeStatuses(
      reg({ a: {}, b: {} }),
      [eq('e', ['b'], ['a'])],
      prog({ a: ['undone', T2], b: ['done', T1] }),
    );
    // a was explicitly unchecked, but b suffices for it → grey, not green.
    expect(s.get('a')).toEqual({ kind: 'satisfied', via: 'e' });
  });

  test('alias-latest-wins: newest entry among id ∪ aliases decides', () => {
    const registry = reg({ m1: { aliases: ['old'] } });
    expect(
      computeStatuses(registry, [], prog({ m1: ['undone', T1], old: ['done', T2] })).get('m1')?.kind,
    ).toBe('done');
    expect(
      computeStatuses(registry, [], prog({ old: ['done', T1], m1: ['undone', T2] })).get('m1')?.kind,
    ).toBe('none');
  });
});

describe('writeThroughAliases', () => {
  test('migrates the winning alias entry onto the canonical id and keeps the alias row', () => {
    const registry = reg({ m1: { aliases: ['old'] } });
    const state = prog({ old: ['done', T2] });
    const { state: next, changed } = writeThroughAliases(state, [...registry.values()].map((m) => m.def));
    expect(changed).toBe(true);
    expect(next.entries.get('m1')).toEqual({ state: 'done', at: T2 });
    expect(next.entries.get('old')).toEqual({ state: 'done', at: T2 });

    const again = writeThroughAliases(next, [...registry.values()].map((m) => m.def));
    expect(again.changed).toBe(false);
    expect(again.state).toBe(next);
  });
});

describe('rollup', () => {
  const registry = reg({ a: {}, b: { weight: 3 }, c: {} });

  test('distinct-module-dedupe-in-scope: repeated ids count once', () => {
    const statuses = computeStatuses(registry, [], prog({ a: ['done', T1] }));
    const stats = rollup(['a', 'a', 'b'], registry, statuses, 'complete');
    expect(stats.counts.total).toBe(2);
    expect(stats.pct).toBeCloseTo(1 / 4); // weight 1 done of weight 4
  });

  test('empty scope has null pct', () => {
    expect(rollup([], registry, new Map(), 'complete').pct).toBeNull();
  });

  test('mode-complete: satisfied counts, partial does not', () => {
    const statuses = computeStatuses(
      reg({ s1: {}, s2: {}, full: {}, part: {} }),
      [eq('e1', ['s1'], ['full']), eq('e2', ['s1', 's2'], ['part'])],
      prog({ s1: ['done', T1] }),
    );
    const r = rollup(['full', 'part'], reg({ full: {}, part: {} }), statuses, 'complete');
    expect(r.counts.satisfied).toBe(1);
    expect(r.counts.partial).toBe(1);
    expect(r.pct).toBeCloseTo(0.5);
  });

  test('mode-fractional: partial contributes its coverage', () => {
    const statuses = computeStatuses(
      reg({ s1: {}, s2: {}, part: {} }),
      [eq('e', ['s1', 's2'], ['part'])],
      prog({ s1: ['done', T1] }),
    );
    const r = rollup(['part'], reg({ part: {} }), statuses, 'fractional');
    expect(r.pct).toBeCloseTo(0.5);
  });

  test('mode-manual-only: satisfied counts for nothing', () => {
    const statuses = computeStatuses(
      reg({ s1: {}, full: {} }),
      [eq('e', ['s1'], ['full'])],
      prog({ s1: ['done', T1] }),
    );
    const r = rollup(['s1', 'full'], reg({ s1: {}, full: {} }), statuses, 'manual-only');
    expect(r.pct).toBeCloseTo(0.5);
  });
});

describe('treeSummary on a loaded forest', () => {
  const TREE = y`
    learntree: 1
    id: t
    title: T
    nodes:
      - id: g
        title: G
        children:
          - id: n1
            title: N1
            categories:
              - name: Resources
                modules:
                  - id: m1
                    title: M1
                    url: "https://example.com"
                  - id: m2
                    title: M2
                    url: "https://example.com"
                    weight: 3
          - id: n2
            title: N2
            categories:
              - name: Problems
                modules:
                  - ref: m1
  `;

  test('byNode subtree stats and per-category aggregation', () => {
    const forest = loadForest([FOREST_MIN, tree('t', TREE)]);
    let progress = prog({});
    progress = setModuleState(progress, 'm1', true, T1);
    const statuses = computeStatuses(forest.registry, forest.equivalences, progress);
    const summary = treeSummary(forest.trees[0]!, forest.registry, statuses, 'complete');

    expect(summary.overall.counts.total).toBe(2);
    expect(summary.overall.pct).toBeCloseTo(1 / 4); // m1 (w1) of m1+m2 (w4)
    expect(summary.byNode.get('g')?.pct).toBeCloseTo(1 / 4);
    expect(summary.byNode.get('n1')?.pct).toBeCloseTo(1 / 4);
    expect(summary.byNode.get('n2')?.pct).toBeCloseTo(1); // only m1, done
    expect(summary.byCategory.map((c) => c.name)).toEqual(['Resources', 'Problems']);
    expect(summary.byCategory[1]?.stats.pct).toBeCloseTo(1);
  });
});
