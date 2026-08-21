import type {
  ForestSummary,
  ProgressState,
  ResolvedForest,
  StatusMap,
} from '@learntree/core';
import { computeStatuses, forestSummary } from '@learntree/core';

interface Derived {
  statuses: StatusMap;
  summary: ForestSummary;
}

let cacheKey: [ResolvedForest, ProgressState] | null = null;
let cacheValue: Derived | null = null;

/**
 * Full-forest recompute, memoized on input identity. At the target scale
 * (≤ ~2k modules) this is sub-millisecond, so there is no incremental
 * invalidation to get wrong.
 */
export function deriveAll(forest: ResolvedForest, progress: ProgressState): Derived {
  if (cacheKey !== null && cacheKey[0] === forest && cacheKey[1] === progress && cacheValue) {
    return cacheValue;
  }
  const statuses = computeStatuses(forest.registry, forest.equivalences, progress);
  cacheValue = { statuses, summary: forestSummary(forest, statuses) };
  cacheKey = [forest, progress];
  return cacheValue;
}
