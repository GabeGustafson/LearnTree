import ELK from 'elkjs/lib/elk.bundled.js';
import type { NodeId } from '@learntree/core';
import type { RenderEdge } from './buildRenderGraph.ts';

const elk = new ELK();

export interface LayoutInput {
  id: NodeId;
  width: number;
  height: number;
}

export async function layoutRoots(
  roots: LayoutInput[],
  edges: RenderEdge[],
): Promise<Map<NodeId, { x: number; y: number }>> {
  const graph = {
    id: 'forest-tree',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.nodeNode': '60',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.edgeRouting': 'SPLINES',
    },
    children: roots.map((r) => ({ id: r.id, width: r.width, height: r.height })),
    edges: edges.map((e, i) => ({ id: `e${i}`, sources: [e.from], targets: [e.to] })),
  };
  const out = await elk.layout(graph);
  const positions = new Map<NodeId, { x: number; y: number }>();
  for (const child of out.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return positions;
}
