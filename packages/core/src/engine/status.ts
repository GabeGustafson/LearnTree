import type { Equivalence, ResolvedModule } from '../model/types.ts';
import { isDone } from '../progress/entries.ts';
import type { ProgressState } from '../progress/progressDoc.ts';
import type { ModuleId } from '../schema/ids.ts';

export type ModuleStatus =
  /** Manually checked (green). */
  | { kind: 'done'; at: string }
  /** Auto-satisfied via an equivalence (grey). `via` names the mapping. */
  | { kind: 'satisfied'; via: string }
  /** Some sufficient material done (ring with %). Never counts as complete in `complete` mode. */
  | { kind: 'partial'; coverage: number; via: string; missing: ModuleId[] }
  | { kind: 'none' };

export type StatusMap = ReadonlyMap<ModuleId, ModuleStatus>;

/**
 * Effective completion as a monotone fixpoint: manual completions seed `done`;
 * any equivalence whose whole `sufficient` set is done marks its `satisfies`
 * modules done too, which can enable further mappings (chains). The set only
 * grows, so iteration terminates on any input, including mapping cycles.
 *
 * Partial coverage is computed against the FINAL done set but deliberately
 * does not feed back into it — partially-covered modules never enable other
 * mappings (predictability rule).
 */
export function computeStatuses(
  registry: ReadonlyMap<ModuleId, ResolvedModule>,
  equivalences: readonly Equivalence[],
  progress: ProgressState,
): Map<ModuleId, ModuleStatus> {
  const manualAt = new Map<ModuleId, string>();
  const done = new Set<ModuleId>();
  for (const { def } of registry.values()) {
    if (isDone(progress, def)) {
      done.add(def.id);
      manualAt.set(def.id, latestDoneAt(progress, def));
    }
  }

  const satisfiedVia = new Map<ModuleId, string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const eq of equivalences) {
      if (!eq.sufficient.every((id) => done.has(id))) continue;
      for (const id of eq.satisfies) {
        if (done.has(id)) continue;
        done.add(id);
        satisfiedVia.set(id, eq.id);
        changed = true;
      }
    }
  }

  const statuses = new Map<ModuleId, ModuleStatus>();
  for (const { def } of registry.values()) {
    const id = def.id;
    if (manualAt.has(id)) {
      statuses.set(id, { kind: 'done', at: manualAt.get(id)! });
      continue;
    }
    const via = satisfiedVia.get(id);
    if (via !== undefined) {
      statuses.set(id, { kind: 'satisfied', via });
      continue;
    }

    // Best partial coverage across all mappings targeting this module.
    let best: { coverage: number; via: string; missing: ModuleId[] } | undefined;
    for (const eq of equivalences) {
      if (!eq.satisfies.includes(id)) continue;
      let doneWeight = 0;
      let totalWeight = 0;
      const missing: ModuleId[] = [];
      for (const suffId of eq.sufficient) {
        const w = registry.get(suffId)?.def.weight ?? 1;
        totalWeight += w;
        if (done.has(suffId)) doneWeight += w;
        else missing.push(suffId);
      }
      const coverage = totalWeight > 0 ? doneWeight / totalWeight : 0;
      if (coverage > 0 && (best === undefined || coverage > best.coverage)) {
        best = { coverage, via: eq.id, missing };
      }
    }
    statuses.set(id, best !== undefined ? { kind: 'partial', ...best } : { kind: 'none' });
  }
  return statuses;
}

function latestDoneAt(progress: ProgressState, def: ResolvedModule['def']): string {
  let at = '';
  for (const id of [def.id, ...def.aliases]) {
    const e = progress.entries.get(id);
    if (e?.state === 'done' && e.at > at) at = e.at;
  }
  return at;
}
