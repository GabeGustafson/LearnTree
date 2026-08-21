import type { ProgressEntry } from '../schema/progress.ts';
import { laterEntry } from './entries.ts';
import type { ProgressState } from './progressDoc.ts';

/**
 * Merge two progress states (cross-device sync, localStorage↔remote reconcile).
 *
 * Over valid entries the merge is commutative, associative, and idempotent,
 * and can never resurrect an uncheck: tombstones (`undone` entries) take part
 * in the same latest-`at` ordering as completions. Quarantined (invalid)
 * entries ride along without participating; a valid entry always beats a
 * quarantined one under the same id.
 */
export function mergeProgress(a: ProgressState, b: ProgressState): ProgressState {
  const entries = new Map<string, ProgressEntry>(a.entries);
  for (const [id, eb] of b.entries) {
    const ea = entries.get(id);
    entries.set(id, ea === undefined ? eb : laterEntry(ea, eb));
  }
  const quarantined = new Map(a.quarantined);
  for (const [id, raw] of b.quarantined) {
    if (!quarantined.has(id)) quarantined.set(id, raw);
  }
  for (const id of entries.keys()) quarantined.delete(id);
  return { entries, quarantined, corrupt: a.corrupt || b.corrupt };
}
