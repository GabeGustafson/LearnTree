import type { ResolvedNode, ScopeStats } from '@learntree/core';
import { ProgressBar } from '../ProgressBar.tsx';

interface Props {
  node: ResolvedNode;
  stats: ScopeStats | undefined;
  selected: boolean;
  onClick: () => void;
}

export function UnitCard({ node, stats, selected, onClick }: Props) {
  const complete =
    stats !== undefined && stats.counts.total > 0 && stats.pct !== null && stats.pct >= 1;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-lg border bg-white px-3.5 py-3 text-left shadow-sm transition-colors hover:border-neutral-500 ${
        selected
          ? 'border-amber-400 ring-1 ring-amber-300'
          : complete
            ? 'border-green-500'
            : 'border-neutral-300'
      }`}
    >
      <div className="line-clamp-3 text-[13px] font-medium leading-[19px] text-neutral-900">
        {node.title}
      </div>
      <ProgressBar pct={stats?.pct ?? null} className="mt-2" />
    </button>
  );
}
