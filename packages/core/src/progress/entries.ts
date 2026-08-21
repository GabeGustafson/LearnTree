import type { ModuleDef } from '../model/types.ts';
import type { ModuleId } from '../schema/ids.ts';
import type { ProgressEntry } from '../schema/progress.ts';
import type { ProgressState } from './progressDoc.ts';

/**
 * Later `at` wins; on an exact timestamp tie, `done` wins. ISO-8601 UTC
 * strings compare correctly as plain strings. This single ordering underpins
 * both alias resolution and cross-device merge, so they can never disagree.
 */
export function laterEntry(a: ProgressEntry, b: ProgressEntry): ProgressEntry {
  if (a.at > b.at) return a;
  if (b.at > a.at) return b;
  return a.state === 'done' ? a : b;
}

/** Effective entry for a module: latest among its canonical id and aliases. */
export function effectiveEntry(
  state: ProgressState,
  def: Pick<ModuleDef, 'id' | 'aliases'>,
): ProgressEntry | undefined {
  let winner = state.entries.get(def.id);
  for (const alias of def.aliases) {
    const e = state.entries.get(alias);
    if (e !== undefined) winner = winner === undefined ? e : laterEntry(winner, e);
  }
  return winner;
}

export function isDone(state: ProgressState, def: Pick<ModuleDef, 'id' | 'aliases'>): boolean {
  return effectiveEntry(state, def)?.state === 'done';
}

/** Immutable toggle: records the new state under the canonical id. */
export function setModuleState(
  state: ProgressState,
  canonicalId: ModuleId,
  done: boolean,
  at: string,
): ProgressState {
  const entries = new Map(state.entries);
  entries.set(canonicalId, { state: done ? 'done' : 'undone', at });
  return { entries, quarantined: state.quarantined, corrupt: state.corrupt };
}

/**
 * Migrate alias-recorded progress onto canonical ids (aliases are left in
 * place as harmless orphans — deleting them would complicate merge semantics).
 * Returns the same state object when nothing changed.
 */
export function writeThroughAliases(
  state: ProgressState,
  defs: Iterable<Pick<ModuleDef, 'id' | 'aliases'>>,
): { state: ProgressState; changed: boolean } {
  let entries: Map<ModuleId, ProgressEntry> | undefined;
  for (const def of defs) {
    if (def.aliases.length === 0) continue;
    const winner = effectiveEntry(state, def);
    if (winner === undefined) continue;
    const current = state.entries.get(def.id);
    if (current !== undefined && laterEntry(current, winner) === current) continue;
    if (current?.at === winner.at && current.state === winner.state) continue;
    entries ??= new Map(state.entries);
    entries.set(def.id, winner);
  }
  if (entries === undefined) return { state, changed: false };
  return {
    state: { entries, quarantined: state.quarantined, corrupt: state.corrupt },
    changed: true,
  };
}
