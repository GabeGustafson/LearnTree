import type { Equivalence, ProgressState, ResolvedModule } from '../src/index.ts';

export function reg(
  mods: Record<string, { weight?: number; aliases?: string[] }>,
): Map<string, ResolvedModule> {
  return new Map(
    Object.entries(mods).map(([id, m]) => [
      id,
      {
        def: { id, title: id, weight: m.weight ?? 1, aliases: m.aliases ?? [] },
        occurrences: [],
      },
    ]),
  );
}

export function eq(id: string, sufficient: string[], satisfies: string[]): Equivalence {
  return { id, sufficient, satisfies };
}

export function prog(entries: Record<string, ['done' | 'undone', string]>): ProgressState {
  return {
    entries: new Map(Object.entries(entries).map(([id, [state, at]]) => [id, { state, at }])),
    quarantined: new Map(),
    corrupt: false,
  };
}

export const T1 = '2026-08-01T00:00:00.000Z';
export const T2 = '2026-08-02T00:00:00.000Z';
export const T3 = '2026-08-03T00:00:00.000Z';
