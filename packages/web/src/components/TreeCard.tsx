import { Link } from 'react-router';
import type { ResolvedTree, TreeSummary } from '@learntree/core';
import { pctLabel, ProgressBar } from './ProgressBar.tsx';

export function TreeCard({ tree, summary }: { tree: ResolvedTree; summary: TreeSummary }) {
  const o = summary.overall;
  const firstLine = (tree.description?.split('\n').find((l) => l.trim() !== '') ?? '')
    .replace(/[*_`#]/g, '')
    .trim();
  return (
    <Link
      to={`/tree/${tree.id}`}
      className="block rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <h3 className="text-sm font-semibold text-neutral-900">{tree.title}</h3>
      {firstLine !== '' && (
        <p className="mt-1 line-clamp-2 text-[12px] text-neutral-500">{firstLine}</p>
      )}
      <div className="mt-3 flex items-baseline justify-between font-mono text-[11px] text-neutral-600">
        <span>
          {o.counts.done + o.counts.satisfied} / {o.counts.total}
        </span>
        <span>{pctLabel(o.pct)}</span>
      </div>
      <ProgressBar pct={o.pct} className="mt-1" />
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {summary.byCategory.slice(0, 4).map(({ name, stats }) => (
          <div key={name} className="rounded-md bg-neutral-50 px-2 py-1.5">
            <div className="truncate text-[10px] text-neutral-500">{name}</div>
            <div className="font-mono text-[11px] text-neutral-800">
              {stats.counts.done + stats.counts.satisfied} / {stats.counts.total}
            </div>
          </div>
        ))}
      </div>
    </Link>
  );
}
