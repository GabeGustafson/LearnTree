import { describe, expect, test } from 'vitest';
import {
  loadForest,
  parseProgressState,
  progressInfoDiagnostics,
  serializeProgressState,
} from '../src/index.ts';
import { FOREST_MIN, tree, y } from './helpers.ts';

describe('parseProgressState', () => {
  test('null and empty input give a fresh state', () => {
    expect(parseProgressState(null).state.entries.size).toBe(0);
    expect(parseProgressState('').state.corrupt).toBe(false);
  });

  test('invalid JSON marks the state corrupt (never overwritten)', () => {
    const { state, diagnostics } = parseProgressState('{oops');
    expect(state.corrupt).toBe(true);
    expect(diagnostics[0]?.code).toBe('E-PROGRESS-ENTRY-INVALID');
  });

  test('unsupported version marks corrupt', () => {
    expect(parseProgressState('{"learntree":2,"modules":{}}').state.corrupt).toBe(true);
  });

  test('bad entries are quarantined individually and preserved on save', () => {
    const text = JSON.stringify({
      learntree: 1,
      modules: {
        good: { state: 'done', at: '2026-08-21T01:02:03.000Z' },
        bad: { state: 'yep', at: 'not-a-date' },
      },
    });
    const { state, diagnostics } = parseProgressState(text);
    expect(state.corrupt).toBe(false);
    expect(state.entries.has('good')).toBe(true);
    expect(state.entries.has('bad')).toBe(false);
    expect(state.quarantined.has('bad')).toBe(true);
    expect(diagnostics.some((d) => d.code === 'E-PROGRESS-ENTRY-INVALID')).toBe(true);

    const out = serializeProgressState(state);
    const round = JSON.parse(out) as { modules: Record<string, unknown> };
    expect(round.modules['bad']).toEqual({ state: 'yep', at: 'not-a-date' });
  });

  test('serialization is deterministic: sorted keys, trailing newline, idempotent round-trip', () => {
    const text = JSON.stringify({
      learntree: 1,
      modules: {
        zebra: { state: 'done', at: '2026-08-21T01:00:00.000Z' },
        apple: { state: 'undone', at: '2026-08-20T01:00:00.000Z' },
      },
    });
    const out = serializeProgressState(parseProgressState(text).state);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.indexOf('apple')).toBeLessThan(out.indexOf('zebra'));
    expect(serializeProgressState(parseProgressState(out).state)).toBe(out);
  });
});

describe('progressInfoDiagnostics', () => {
  const TREE = y`
    learntree: 1
    id: t
    title: T
    nodes:
      - id: a
        title: A
        categories:
          - name: Resources
            modules:
              - id: m1
                title: M1
                url: "https://example.com"
                aliases: [m1-old]
  `;

  test('reports orphans and alias entries as info', () => {
    const f = loadForest([FOREST_MIN, tree('t', TREE)]);
    const { state } = parseProgressState(
      JSON.stringify({
        learntree: 1,
        modules: {
          m1: { state: 'done', at: '2026-08-21T01:00:00.000Z' },
          'm1-old': { state: 'done', at: '2026-08-01T01:00:00.000Z' },
          'gone-module': { state: 'done', at: '2026-07-01T01:00:00.000Z' },
        },
      }),
    );
    const diags = progressInfoDiagnostics(f, state);
    expect(diags.find((d) => d.code === 'I-PROGRESS-ALIAS')?.message).toContain('m1-old');
    expect(diags.find((d) => d.code === 'I-PROGRESS-ORPHAN')?.message).toContain('gone-module');
    for (const d of diags) expect(d.severity).toBe('info');
  });
});
