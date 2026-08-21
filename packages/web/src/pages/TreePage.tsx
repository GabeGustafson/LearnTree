import { Link, useParams } from 'react-router';
import { TreeCanvas } from '../components/canvas/TreeCanvas.tsx';
import { NodeDetailPanel } from '../components/panels/NodeDetailPanel.tsx';
import { SummaryPanel } from '../components/panels/SummaryPanel.tsx';
import { deriveAll } from '../state/selectors.ts';
import { useAppStore } from '../state/store.ts';

export function TreePage() {
  const { treeId } = useParams();
  const forest = useAppStore((s) => s.forest);
  const progress = useAppStore((s) => s.progress);
  const selected = useAppStore((s) => s.selected);
  const select = useAppStore((s) => s.select);
  const toggleModule = useAppStore((s) => s.toggleModule);
  const loading = useAppStore((s) => s.loading);

  if (forest === null) {
    return <main className="p-8 text-sm text-neutral-400">{loading ? 'Loading…' : 'No forest loaded.'}</main>;
  }
  const tree = forest.trees.find((t) => t.id === treeId);
  if (tree === undefined) {
    return (
      <main className="p-8 text-sm text-neutral-500">
        Tree “{treeId}” not found. <Link className="underline" to="/">Back to dashboard</Link>
      </main>
    );
  }

  const { statuses, summary } = deriveAll(forest, progress);
  const treeSummaryData = summary.byTree.get(tree.id);
  const selectedNode =
    selected !== null && selected.treeId === tree.id
      ? (tree.nodeIndex.get(selected.nodeId) ?? null)
      : null;

  return (
    <main className="flex h-full">
      <div className="relative min-w-0 flex-1">
        <TreeCanvas
          tree={tree}
          statsByNode={treeSummaryData?.byNode ?? new Map()}
          selectedNodeId={selectedNode?.id ?? null}
          onSelect={(nodeId) => select(tree.id, nodeId)}
        />
        <div className="pointer-events-none absolute left-4 top-4 z-10">
          {treeSummaryData !== undefined && <SummaryPanel summary={treeSummaryData} />}
        </div>
        <div className="pointer-events-none absolute right-4 top-4 z-10">
          <Link
            to="/"
            className="pointer-events-auto rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[12px] text-neutral-600 shadow-sm hover:bg-neutral-50"
          >
            ‹ Back
          </Link>
        </div>
      </div>
      {selectedNode !== null && (
        <NodeDetailPanel
          node={selectedNode}
          forest={forest}
          statuses={statuses}
          onToggle={toggleModule}
          onClose={() => select(tree.id, null)}
        />
      )}
    </main>
  );
}
