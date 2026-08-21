import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import type { ProgressState } from '../src/index.ts';
import { computeStatuses, mergeProgress } from '../src/index.ts';
import { T1, T2, T3, eq, prog, reg } from './engine-helpers.ts';

function entriesObj(s: ProgressState): Record<string, unknown> {
  return Object.fromEntries([...s.entries.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

describe('mergeProgress unit behavior', () => {
  test('tombstone-no-resurrection: a later uncheck survives merging an older done', () => {
    const unchecked = prog({ m: ['undone', T2] });
    const stale = prog({ m: ['done', T1] });
    expect(mergeProgress(unchecked, stale).entries.get('m')?.state).toBe('undone');
    expect(mergeProgress(stale, unchecked).entries.get('m')?.state).toBe('undone');
  });

  test('exact-tie prefers done (documented, deterministic)', () => {
    const a = prog({ m: ['done', T1] });
    const b = prog({ m: ['undone', T1] });
    expect(mergeProgress(a, b).entries.get('m')?.state).toBe('done');
    expect(mergeProgress(b, a).entries.get('m')?.state).toBe('done');
  });

  test('orphan-retained: ids only one side knows about survive', () => {
    const merged = mergeProgress(prog({ old: ['done', T1] }), prog({ new1: ['done', T2] }));
    expect(merged.entries.size).toBe(2);
  });

  test('a valid entry beats a quarantined one under the same id', () => {
    const withBad: ProgressState = {
      entries: new Map(),
      quarantined: new Map([['m', { junk: true }]]),
      corrupt: false,
    };
    const merged = mergeProgress(withBad, prog({ m: ['done', T1] }));
    expect(merged.entries.get('m')?.state).toBe('done');
    expect(merged.quarantined.has('m')).toBe(false);
  });

  test('corrupt flag propagates (a corrupt side must keep blocking saves)', () => {
    const corrupt: ProgressState = { entries: new Map(), quarantined: new Map(), corrupt: true };
    expect(mergeProgress(corrupt, prog({ m: ['done', T1] })).corrupt).toBe(true);
  });
});

// ---------- property-based tests ----------

const idArb = fc.constantFrom('m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7');
const atArb = fc
  .integer({ min: 0, max: 4102444800000 })
  .map((n) => new Date(n).toISOString());
const entryArb = fc.record({
  state: fc.constantFrom('done' as const, 'undone' as const),
  at: atArb,
});
const stateArb: fc.Arbitrary<ProgressState> = fc
  .dictionary(idArb, entryArb, { maxKeys: 8 })
  .map((d) => ({ entries: new Map(Object.entries(d)), quarantined: new Map(), corrupt: false }));

describe('mergeProgress algebra (fast-check)', () => {
  test('commutative', () => {
    fc.assert(
      fc.property(stateArb, stateArb, (a, b) => {
        expect(entriesObj(mergeProgress(a, b))).toEqual(entriesObj(mergeProgress(b, a)));
      }),
    );
  });

  test('associative', () => {
    fc.assert(
      fc.property(stateArb, stateArb, stateArb, (a, b, c) => {
        expect(entriesObj(mergeProgress(mergeProgress(a, b), c))).toEqual(
          entriesObj(mergeProgress(a, mergeProgress(b, c))),
        );
      }),
    );
  });

  test('idempotent', () => {
    fc.assert(
      fc.property(stateArb, (a) => {
        expect(entriesObj(mergeProgress(a, a))).toEqual(entriesObj(a));
      }),
    );
  });

  test('no-resurrection: the latest tombstone always survives any merge', () => {
    fc.assert(
      fc.property(stateArb, stateArb, idArb, (a, b, id) => {
        const ea = a.entries.get(id);
        const eb = b.entries.get(id);
        if (ea === undefined || eb === undefined) return;
        const latest = ea.at > eb.at ? ea : eb.at > ea.at ? eb : undefined;
        if (latest?.state !== 'undone') return;
        expect(mergeProgress(a, b).entries.get(id)?.state).toBe('undone');
      }),
    );
  });
});

describe('status fixpoint (fast-check)', () => {
  const universe = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
  const subsetArb = fc.uniqueArray(idArb, { minLength: 1, maxLength: 3 });
  const eqArb = fc.tuple(subsetArb, subsetArb).map(([sufficient, sat]) => eq('e', sufficient, sat));
  const eqsArb = fc
    .array(eqArb, { maxLength: 12 })
    .map((eqs) => eqs.map((e, i) => eq(`e${i}`, e.sufficient, e.satisfies)));
  const manualArb = fc.uniqueArray(idArb, { maxLength: 8 });

  function doneSet(equivalences: ReturnType<typeof eq>[], manual: string[]): Set<string> {
    const mods: Record<string, object> = {};
    for (const id of universe) mods[id] = {};
    const manualRec: Record<string, ['done' | 'undone', string]> = {};
    for (const id of manual) manualRec[id] = ['done', T3];
    const registry = reg(mods);
    const progress = prog(manualRec);
    const statuses = computeStatuses(registry, equivalences, progress);
    return new Set(
      [...statuses.entries()]
        .filter(([, s]) => s.kind === 'done' || s.kind === 'satisfied')
        .map(([id]) => id),
    );
  }

  test('monotone: more manual completions never shrink the effective-done set', () => {
    fc.assert(
      fc.property(eqsArb, manualArb, manualArb, (eqs, base, extraIds) => {
        const smaller = doneSet(eqs, base);
        const larger = doneSet(eqs, [...new Set([...base, ...extraIds])]);
        for (const id of smaller) expect(larger.has(id)).toBe(true);
      }),
    );
  });

  test('terminates and is stable on arbitrary mapping graphs (incl. cycles)', () => {
    fc.assert(
      fc.property(eqsArb, manualArb, (eqs, manual) => {
        const first = doneSet(eqs, manual);
        const second = doneSet(eqs, manual);
        expect([...first].sort()).toEqual([...second].sort());
        // every mapping with a fully-done sufficient set has fully-done satisfies
        for (const e of eqs) {
          if (e.sufficient.every((id) => first.has(id))) {
            for (const id of e.satisfies) expect(first.has(id)).toBe(true);
          }
        }
      }),
    );
  });
});
