import type { ResolvedForest, ResolvedModule, ResolvedNode, ResolvedTree } from '../model/types.ts';
import type { CountSatisfiedMode } from '../schema/forest.ts';
import type { ModuleId, NodeId, TreeId } from '../schema/ids.ts';
import type { ModuleStatus, StatusMap } from './status.ts';

export interface ScopeStats {
  /** Weighted completion in [0, 1]; null for empty scopes (UI shows "—"). */
  pct: number | null;
  counts: { done: number; satisfied: number; partial: number; none: number; total: number };
  weightDone: number;
  weightTotal: number;
}

function statusValue(status: ModuleStatus, mode: CountSatisfiedMode): number {
  switch (mode) {
    case 'complete':
      return status.kind === 'done' || status.kind === 'satisfied' ? 1 : 0;
    case 'fractional':
      if (status.kind === 'done' || status.kind === 'satisfied') return 1;
      return status.kind === 'partial' ? status.coverage : 0;
    case 'manual-only':
      return status.kind === 'done' ? 1 : 0;
  }
}

/**
 * Aggregate a scope of module ids. The scope is deduplicated first: a module
 * referenced twice within a node/tree moves its bar exactly once.
 */
export function rollup(
  moduleIds: Iterable<ModuleId>,
  registry: ReadonlyMap<ModuleId, ResolvedModule>,
  statuses: StatusMap,
  mode: CountSatisfiedMode,
): ScopeStats {
  const counts = { done: 0, satisfied: 0, partial: 0, none: 0, total: 0 };
  let weightDone = 0;
  let weightTotal = 0;
  for (const id of new Set(moduleIds)) {
    const module = registry.get(id);
    if (module === undefined) continue;
    const status = statuses.get(id) ?? { kind: 'none' };
    counts[status.kind] += 1;
    counts.total += 1;
    weightTotal += module.def.weight;
    weightDone += statusValue(status, mode) * module.def.weight;
  }
  return {
    pct: weightTotal > 0 ? weightDone / weightTotal : null,
    counts,
    weightDone,
    weightTotal,
  };
}

export interface CategoryStats {
  name: string;
  stats: ScopeStats;
}

export interface TreeSummary {
  overall: ScopeStats;
  /** Grouped by exact category name across the tree, in first-seen order. */
  byCategory: CategoryStats[];
  /** Subtree stats for every node (own categories + all descendants). */
  byNode: ReadonlyMap<NodeId, ScopeStats>;
}

export function treeSummary(
  tree: ResolvedTree,
  registry: ReadonlyMap<ModuleId, ResolvedModule>,
  statuses: StatusMap,
  mode: CountSatisfiedMode,
): TreeSummary {
  const byNode = new Map<NodeId, ScopeStats>();
  const visit = (node: ResolvedNode): void => {
    byNode.set(node.id, rollup(node.subtreeModuleIds, registry, statuses, mode));
    node.children.forEach(visit);
  };
  tree.nodes.forEach(visit);

  const categoryIds = new Map<string, Set<ModuleId>>();
  const collect = (node: ResolvedNode): void => {
    for (const cat of node.categories) {
      const set = categoryIds.get(cat.name) ?? new Set();
      for (const id of cat.moduleIds) set.add(id);
      categoryIds.set(cat.name, set);
    }
    node.children.forEach(collect);
  };
  tree.nodes.forEach(collect);

  return {
    overall: rollup(tree.moduleIds, registry, statuses, mode),
    byCategory: [...categoryIds.entries()].map(([name, ids]) => ({
      name,
      stats: rollup(ids, registry, statuses, mode),
    })),
    byNode,
  };
}

export interface ForestSummary {
  /** Across every distinct module in the forest. */
  overall: ScopeStats;
  byTree: ReadonlyMap<TreeId, TreeSummary>;
}

export function forestSummary(
  forest: ResolvedForest,
  statuses: StatusMap,
  mode: CountSatisfiedMode = forest.settings.countSatisfied,
): ForestSummary {
  const byTree = new Map<TreeId, TreeSummary>();
  for (const tree of forest.trees) {
    byTree.set(tree.id, treeSummary(tree, forest.registry, statuses, mode));
  }
  return {
    overall: rollup(forest.registry.keys(), forest.registry, statuses, mode),
    byTree,
  };
}
