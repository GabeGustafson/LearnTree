import type { TreeSummary } from '@learntree/core';
import { pctLabel, ProgressBar } from '../ProgressBar.tsx';

export function SummaryPanel({ summary }: { summary: TreeSummary }) {
  const o = summary.overall;
  return (
    <div className="pointer-events-auto w-64 rounded-xl border border-neutral-200 bg-white/95 p-4 shadow-md backdrop-blur">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">Progress</span>
        <span className="font-mono text-xs text-neutral-600">
          {o.counts.done + o.counts.satisfied} / {o.counts.total} · {pctLabel(o.pct)}
        </span>
      </div>
      <ProgressBar pct={o.pct} className="mt-2 !h-2" />
      {o.counts.satisfied > 0 && (
        <div className="mt-1 text-[10px] text-neutral-400">
          incl. {o.counts.satisfied} satisfied via equivalences
        </div>
      )}
      <div className="mt-3 space-y-2">
        {summary.byCategory.map(({ name, stats }) => (
          <div key={name}>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-neutral-600">{name}</span>
              <span className="font-mono text-neutral-500">
                {stats.counts.done + stats.counts.satisfied} / {stats.counts.total} ·{' '}
                {pctLabel(stats.pct)}
              </span>
            </div>
            <ProgressBar pct={stats.pct} className="mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
