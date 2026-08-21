import { TreeCard } from '../components/TreeCard.tsx';
import { pctLabel, ProgressBar } from '../components/ProgressBar.tsx';
import { deriveAll } from '../state/selectors.ts';
import { useAppStore } from '../state/store.ts';

export function DashboardPage() {
  const forest = useAppStore((s) => s.forest);
  const progress = useAppStore((s) => s.progress);
  const loading = useAppStore((s) => s.loading);

  if (forest === null) {
    return <main className="p-8 text-sm text-neutral-400">{loading ? 'Loading…' : 'No forest loaded.'}</main>;
  }
  const { summary } = deriveAll(forest, progress);

  return (
    <main className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold">{forest.name}</h1>
            <p className="mt-0.5 text-[12px] text-neutral-500">
              {forest.trees.length} trees · {forest.registry.size} modules ·{' '}
              {forest.equivalences.length} equivalences
            </p>
          </div>
          <div className="w-56">
            <div className="flex items-baseline justify-between font-mono text-[11px] text-neutral-600">
              <span>
                {summary.overall.counts.done + summary.overall.counts.satisfied} /{' '}
                {summary.overall.counts.total}
              </span>
              <span>{pctLabel(summary.overall.pct)}</span>
            </div>
            <ProgressBar pct={summary.overall.pct} className="mt-1 !h-2" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forest.trees.map((tree) => {
            const ts = summary.byTree.get(tree.id);
            return ts !== undefined ? <TreeCard key={tree.id} tree={tree} summary={ts} /> : null;
          })}
        </div>
      </div>
    </main>
  );
}
