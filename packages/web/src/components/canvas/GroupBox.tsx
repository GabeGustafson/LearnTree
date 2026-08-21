import type { ResolvedNode, ScopeStats } from '@learntree/core';
import type { NodeId } from '@learntree/core';
import { STACK_GAP } from '../../layout/stack.ts';
import { UnitCard } from './UnitCard.tsx';

interface Props {
  node: ResolvedNode;
  statsByNode: ReadonlyMap<NodeId, ScopeStats>;
  selectedNodeId: string | null;
  onSelect: (nodeId: NodeId) => void;
}

/** Stacked children with vertical connectors between consecutive cards. */
function InlineChildren({ nodes, statsByNode, selectedNodeId, onSelect }: Omit<Props, 'node'> & { nodes: ResolvedNode[] }) {
  return (
    <div className="flex flex-col">
      {nodes.map((child, i) => (
        <div key={child.id} className="relative">
          {i > 0 && (
            <div
              className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center"
              style={{ top: -STACK_GAP, height: STACK_GAP }}
            >
              <div className="w-px flex-1 bg-neutral-300" />
              <div className="-mt-[5px] text-[9px] leading-none text-neutral-400">▼</div>
            </div>
          )}
          <div style={{ marginTop: i > 0 ? STACK_GAP : 0 }}>
            <InlineNode
              node={child}
              statsByNode={statsByNode}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function InlineNode({ node, statsByNode, selectedNodeId, onSelect }: Props) {
  if (node.display === 'group') {
    return (
      <GroupBox
        node={node}
        statsByNode={statsByNode}
        selectedNodeId={selectedNodeId}
        onSelect={onSelect}
      />
    );
  }
  return (
    <>
      <UnitCard
        node={node}
        stats={statsByNode.get(node.id)}
        selected={selectedNodeId === node.id}
        onClick={() => onSelect(node.id)}
      />
      {node.children.length > 0 && (
        <div style={{ marginTop: STACK_GAP }}>
          <InlineChildren
            nodes={node.children}
            statsByNode={statsByNode}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
          />
        </div>
      )}
    </>
  );
}

export function GroupBox({ node, statsByNode, selectedNodeId, onSelect }: Props) {
  return (
    <div className="h-full w-full rounded-xl border border-neutral-200 bg-neutral-50/80 p-3.5 pt-0 shadow-sm">
      <div className="flex h-[34px] items-center truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
        {node.title}
      </div>
      <InlineChildren
        nodes={node.children}
        statsByNode={statsByNode}
        selectedNodeId={selectedNodeId}
        onSelect={onSelect}
      />
    </div>
  );
}
