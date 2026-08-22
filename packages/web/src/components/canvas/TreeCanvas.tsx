import { useEffect, useMemo, useState } from 'react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
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

const HIDDEN = '!pointer-events-none !opacity-0';

function RootNode({ data, id }: NodeProps<CanvasNode>) {
  const node = data.tree.nodeIndex.get(id);
  if (node === undefined) return null;
  const handles = (
    <>
      {/* structure edges: vertical spine (top/bottom center) */}
      <Handle id="t" type="target" position={Position.Top} className={HIDDEN} />
      <Handle id="b" type="source" position={Position.Bottom} className={HIDDEN} />
      {/* dependency edges: lateral channels (box sides) */}
      <Handle id="lt" type="target" position={Position.Left} className={HIDDEN} />
      <Handle id="ls" type="source" position={Position.Left} className={HIDDEN} />
      <Handle id="rt" type="target" position={Position.Right} className={HIDDEN} />
      <Handle id="rs" type="source" position={Position.Right} className={HIDDEN} />
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

  // Dependency edges live in a different visual channel than the spine:
  // side-attached, curved, violet-dashed — they can never trace the same
  // path as the vertical structure arrows.
  const edges: Edge[] = useMemo(() => {
    if (positions === null) return [];
    const centerX = (nodeId: string) => {
      const p = positions.get(nodeId);
      const s = sizes.get(nodeId);
      return p === undefined || s === undefined ? 0 : p.x + s.width / 2;
    };
    const centers = graph.roots.map((r) => centerX(r.id));
    const canvasMidX = (Math.min(...centers) + Math.max(...centers)) / 2;
    // Roughly one column width: below this the dep is "same column".
    const LATERAL_MIN_DX = 340;
    return graph.edges.map((e, i) => {
      if (e.kind === 'depends') {
        const dx = centerX(e.to) - centerX(e.from);
        let sourceHandle: string;
        let targetHandle: string;
        if (Math.abs(dx) >= LATERAL_MIN_DX) {
          // different columns: shortest lateral path between facing sides
          [sourceHandle, targetHandle] = dx > 0 ? ['rs', 'lt'] : ['ls', 'rt'];
        } else {
          // near-vertical: C-arc on one side, bulging toward the canvas edge
          // so it stays out of the central spine corridor
          const side = centerX(e.from) >= canvasMidX ? 'r' : 'l';
          [sourceHandle, targetHandle] = side === 'r' ? ['rs', 'rt'] : ['ls', 'lt'];
        }
        return {
          id: `e${i}`,
          source: e.from,
          target: e.to,
          sourceHandle,
          targetHandle,
          type: 'default', // bezier — curves read differently than orthogonal spines
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#8b5cf6' },
          style: { stroke: '#8b5cf6', strokeOpacity: 0.55, strokeDasharray: '5 4', strokeWidth: 1.3 },
        };
      }
      return {
        id: `e${i}`,
        source: e.from,
        target: e.to,
        sourceHandle: 'b',
        targetHandle: 't',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#a3a3a3' },
        style: { stroke: '#d4d4d4' },
      };
    });
  }, [graph, positions, sizes]);

  const hasDependencyEdges = useMemo(
    () => graph.edges.some((e) => e.kind === 'depends'),
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
      {hasDependencyEdges && (
        <Panel
          position="bottom-center"
          className="flex items-center gap-4 rounded-full border border-neutral-200 bg-white/90 px-3 py-1 text-[10.5px] text-neutral-500 shadow-sm backdrop-blur"
        >
          <span className="flex items-center gap-1.5">
            <svg width="26" height="8" aria-hidden>
              <line x1="1" y1="4" x2="25" y2="4" stroke="#a3a3a3" strokeWidth="1.5" />
            </svg>
            flow
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="26" height="8" aria-hidden>
              <line x1="1" y1="4" x2="25" y2="4" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
            </svg>
            prerequisite
          </span>
        </Panel>
      )}
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
