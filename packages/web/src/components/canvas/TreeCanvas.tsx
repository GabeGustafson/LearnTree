import { useEffect, useMemo, useState } from 'react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ResolvedTree, ScopeStats } from '@learntree/core';
import { buildRenderGraph } from '../../layout/buildRenderGraph.ts';
import { layoutRoots } from '../../layout/elkLayout.ts';
import { rootSize } from '../../layout/stack.ts';
import { GroupBox } from './GroupBox.tsx';
import { UnitCard } from './UnitCard.tsx';

interface CanvasData {
  tree: ResolvedTree;
  statsByNode: ReadonlyMap<string, ScopeStats>;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  [key: string]: unknown;
}

type CanvasNode = Node<CanvasData, 'root'>;

function RootNode({ data, id }: NodeProps<CanvasNode>) {
  const node = data.tree.nodeIndex.get(id);
  if (node === undefined) return null;
  const handles = (
    <>
      <Handle type="target" position={Position.Top} className="!pointer-events-none !opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!pointer-events-none !opacity-0" />
    </>
  );
  if (node.display === 'group') {
    return (
      <div className="h-full w-full">
        {handles}
        <GroupBox
          node={node}
          statsByNode={data.statsByNode}
          selectedNodeId={data.selectedNodeId}
          onSelect={data.onSelect}
        />
      </div>
    );
  }
  return (
    <div className="h-full w-full">
      {handles}
      <UnitCard
        node={node}
        stats={data.statsByNode.get(id)}
        selected={data.selectedNodeId === id}
        onClick={() => data.onSelect(id)}
      />
    </div>
  );
}

const nodeTypes = { root: RootNode };

function CanvasInner(props: {
  tree: ResolvedTree;
  statsByNode: ReadonlyMap<string, ScopeStats>;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const { tree, statsByNode, selectedNodeId, onSelect } = props;
  const { fitView } = useReactFlow();

  const graph = useMemo(() => buildRenderGraph(tree), [tree]);
  const sizes = useMemo(
    () => new Map(graph.roots.map((r) => [r.id, rootSize(r)])),
    [graph],
  );
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const inputs = graph.roots.map((r) => ({ id: r.id, ...sizes.get(r.id)! }));
    void layoutRoots(inputs, graph.edges).then((pos) => {
      if (!cancelled) setPositions(pos);
    });
    return () => {
      cancelled = true;
    };
  }, [graph, sizes]);

  useEffect(() => {
    if (positions !== null) {
      requestAnimationFrame(() => void fitView({ padding: 0.15, duration: 200 }));
    }
  }, [positions, tree.id, fitView]);

  const data: CanvasData = { tree, statsByNode, selectedNodeId, onSelect };

  const nodes: CanvasNode[] = useMemo(() => {
    if (positions === null) return [];
    return graph.roots.map((r) => ({
      id: r.id,
      type: 'root' as const,
      position: positions.get(r.id) ?? { x: 0, y: 0 },
      data,
      width: sizes.get(r.id)!.width,
      height: sizes.get(r.id)!.height,
      draggable: false,
      connectable: false,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, positions, sizes, statsByNode, selectedNodeId, tree]);

  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((e, i) => ({
        id: `e${i}`,
        source: e.from,
        target: e.to,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#a3a3a3' },
        style:
          e.kind === 'depends'
            ? { stroke: '#a3a3a3', strokeDasharray: '6 4' }
            : { stroke: '#d4d4d4' },
      })),
    [graph],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.15}
      maxZoom={1.6}
      proOptions={{ hideAttribution: false }}
      nodesDraggable={false}
      nodesConnectable={false}
    >
      <Background gap={24} size={1.5} color="#e5e5e5" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function TreeCanvas(props: {
  tree: ResolvedTree;
  statsByNode: ReadonlyMap<string, ScopeStats>;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
