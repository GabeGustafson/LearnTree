import type { NodeId, ResolvedNode, ResolvedTree } from '@learntree/core';

export interface RenderEdge {
  from: NodeId;
  to: NodeId;
  kind: 'structure' | 'depends';
}

export interface RenderGraph {
  /** Nodes that get their own box on the canvas. */
  roots: ResolvedNode[];
  edges: RenderEdge[];
}

/**
 * Canvas topology: group nodes render their whole subtree inline (stacked
 * inside the box); card nodes render alone, and their children become
 * separate boxes connected by structure edges. dependsOn edges are lifted to
 * the nearest boxed ancestor of each endpoint.
 */
export function buildRenderGraph(tree: ResolvedTree): RenderGraph {
  const roots: ResolvedNode[] = [];
  const edges: RenderEdge[] = [];
  const rootOf = new Map<NodeId, NodeId>();
  const deps: Array<{ nodeId: NodeId; target: NodeId }> = [];

  const collectDeps = (node: ResolvedNode): void => {
    for (const target of node.dependsOn) deps.push({ nodeId: node.id, target });
    node.children.forEach(collectDeps);
  };

  const claimSubtree = (node: ResolvedNode, rootId: NodeId): void => {
    rootOf.set(node.id, rootId);
    node.children.forEach((c) => claimSubtree(c, rootId));
  };

  const visitRoot = (node: ResolvedNode): void => {
    roots.push(node);
    if (node.display === 'group') {
      claimSubtree(node, node.id);
    } else {
      rootOf.set(node.id, node.id);
      for (const child of node.children) {
        edges.push({ from: node.id, to: child.id, kind: 'structure' });
        visitRoot(child);
      }
    }
  };

  tree.nodes.forEach(visitRoot);
  tree.nodes.forEach(collectDeps);

  const seen = new Set<string>();
  for (const { nodeId, target } of deps) {
    const from = rootOf.get(target);
    const to = rootOf.get(nodeId);
    if (from === undefined || to === undefined || from === to) continue;
    const key = `${from}→${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to, kind: 'depends' });
  }

  return { roots, edges };
}
