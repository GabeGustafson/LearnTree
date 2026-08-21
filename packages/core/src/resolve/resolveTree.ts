import type { Diagnostic } from '../parse/diagnostics.ts';
import type { DataPath } from '../parse/locate.ts';
import { locateKey, locateValue } from '../parse/locate.ts';
import type { ParsedYaml } from '../parse/parseYaml.ts';
import type { NodeId, TreeId } from '../schema/ids.ts';
import type { ModuleDefIn, ModuleRefIn, TreeFileIn, TreeNodeIn } from '../schema/tree.ts';
import type { ResolvedNode, ResolvedTree } from '../model/types.ts';

export interface RawOccurrence {
  entry: ModuleDefIn | ModuleRefIn;
  treeId: TreeId;
  nodeId: NodeId;
  categoryName: string;
  file: string;
  path: DataPath;
}

export interface DepRecord {
  treeId: TreeId;
  nodeId: NodeId;
  target: NodeId;
  path: DataPath;
}

export interface TreeResolution {
  tree: ResolvedTree;
  parsed: ParsedYaml;
  occurrences: RawOccurrence[];
  /** dependsOn targets not found in this tree — checked cross-tree by the forest loader. */
  unknownDeps: DepRecord[];
  diagnostics: Diagnostic[];
}

function isRef(entry: ModuleDefIn | ModuleRefIn): entry is ModuleRefIn {
  return 'ref' in entry;
}

export function resolveTree(parsed: ParsedYaml, data: TreeFileIn): TreeResolution {
  const diagnostics: Diagnostic[] = [];
  const occurrences: RawOccurrence[] = [];
  const deps: DepRecord[] = [];
  const nodeIndex = new Map<NodeId, ResolvedNode>();
  const nodePaths = new Map<NodeId, DataPath>();
  const file = parsed.file;
  const treeId = data.id;

  const diag = (
    severity: Diagnostic['severity'],
    code: string,
    message: string,
    path: DataPath,
    opts: { hint?: string; key?: string } = {},
  ) => {
    const pos = opts.key ? locateKey(parsed, path, opts.key) : locateValue(parsed, path);
    diagnostics.push({ code, severity, file, line: pos?.line, col: pos?.col, message, hint: opts.hint });
  };

  const walkNode = (input: TreeNodeIn, path: DataPath): ResolvedNode => {
    if (nodeIndex.has(input.id)) {
      diag('error', 'E-NODE-ID-DUP', `node id '${input.id}' is used more than once in this tree`, path, {
        key: 'id',
      });
    }

    const categories = (input.categories ?? []).map((cat, ci) => {
      const catPath = [...path, 'categories', ci];
      if (cat.modules.length === 0) {
        diag('warning', 'W-CATEGORY-EMPTY', `category '${cat.name}' has no modules`, catPath);
      }
      cat.modules.forEach((entry, mi) => {
        occurrences.push({
          entry,
          treeId,
          nodeId: input.id,
          categoryName: cat.name,
          file,
          path: [...catPath, 'modules', mi],
        });
      });
      return {
        name: cat.name,
        moduleIds: cat.modules.map((entry) => (isRef(entry) ? entry.ref : entry.id)),
      };
    });

    const seenCats = new Map<string, string>();
    for (const [ci, cat] of (input.categories ?? []).entries()) {
      const exact = seenCats.get(cat.name);
      if (exact !== undefined) {
        diag(
          'error',
          'E-CATEGORY-DUP',
          `category '${cat.name}' appears twice in node '${input.id}'`,
          [...path, 'categories', ci],
        );
      }
      seenCats.set(cat.name, cat.name);
    }

    const children = (input.children ?? []).map((child, i) =>
      walkNode(child, [...path, 'children', i]),
    );

    if (categories.length === 0 && children.length === 0 && input.description === undefined) {
      diag(
        'warning',
        'W-NODE-EMPTY',
        `node '${input.id}' has no categories, children, or description`,
        path,
      );
    }

    for (const [di, target] of (input.dependsOn ?? []).entries()) {
      const depPath = [...path, 'dependsOn', di];
      if (target === input.id) {
        diag('error', 'E-DEP-SELF', `node '${input.id}' depends on itself`, depPath);
      } else {
        deps.push({ treeId, nodeId: input.id, target, path: depPath });
      }
    }

    const node: ResolvedNode = {
      id: input.id,
      title: input.title,
      description: input.description,
      display: input.display ?? (children.length > 0 ? 'group' : 'card'),
      dependsOn: input.dependsOn ?? [],
      categories,
      children,
      ownModuleIds: [], // finalized by the forest loader once the registry exists
      subtreeModuleIds: [],
    };
    if (!nodeIndex.has(input.id)) {
      nodeIndex.set(input.id, node);
      nodePaths.set(input.id, path);
    }
    return node;
  };

  const nodes = data.nodes.map((n, i) => walkNode(n, ['nodes', i]));

  // Category names differing only by case fragment the per-category rollups.
  const byLower = new Map<string, string>();
  const warned = new Set<string>();
  for (const node of nodeIndex.values()) {
    for (const cat of node.categories) {
      const prior = byLower.get(cat.name.toLowerCase());
      if (prior === undefined) {
        byLower.set(cat.name.toLowerCase(), cat.name);
      } else if (prior !== cat.name && !warned.has(cat.name)) {
        warned.add(cat.name);
        diagnostics.push({
          code: 'W-CATEGORY-CASE',
          severity: 'warning',
          file,
          message: `category '${cat.name}' differs only by case from '${prior}' — they are aggregated separately`,
          hint: 'use one consistent spelling across the tree',
        });
      }
    }
  }

  // Split deps into same-tree (cycle-checked here) and unknown (checked cross-tree later).
  const knownDeps: DepRecord[] = [];
  const unknownDeps: DepRecord[] = [];
  for (const d of deps) (nodeIndex.has(d.target) ? knownDeps : unknownDeps).push(d);

  detectCycles(nodes, knownDeps, nodePaths, diag);

  const tree: ResolvedTree = {
    id: treeId,
    title: data.title,
    order: data.order,
    description: data.description,
    file,
    nodes,
    moduleIds: [],
    nodeIndex,
  };

  return { tree, parsed, occurrences, unknownDeps, diagnostics };
}

/**
 * Cycle detection over dependsOn edges plus the ordering the layout implies:
 * parent → child (content precedes children), and consecutive-sibling chains
 * inside `display: group` containers (children are consumed top-down).
 * `x.dependsOn: [y]` contributes the edge y → x ("y comes first").
 */
function detectCycles(
  roots: ResolvedNode[],
  deps: DepRecord[],
  nodePaths: Map<NodeId, DataPath>,
  diag: (
    severity: Diagnostic['severity'],
    code: string,
    message: string,
    path: DataPath,
    opts?: { hint?: string; key?: string },
  ) => void,
): void {
  const edges = new Map<NodeId, NodeId[]>();
  const addEdge = (from: NodeId, to: NodeId) => {
    const list = edges.get(from) ?? [];
    list.push(to);
    edges.set(from, list);
  };

  const visitStructure = (node: ResolvedNode) => {
    node.children.forEach((child, i) => {
      addEdge(node.id, child.id);
      if (node.display === 'group' && i > 0) addEdge(node.children[i - 1]!.id, child.id);
      visitStructure(child);
    });
  };
  roots.forEach(visitStructure);
  for (const d of deps) addEdge(d.target, d.nodeId);

  const state = new Map<NodeId, 'active' | 'done'>();
  const stack: NodeId[] = [];
  const reported = new Set<NodeId>();

  const dfs = (id: NodeId): void => {
    state.set(id, 'active');
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      const s = state.get(next);
      if (s === 'active') {
        const cycleStart = stack.indexOf(next);
        const cycle = [...stack.slice(cycleStart), next];
        const key = [...cycle].sort().join('→');
        if (!reported.has(key)) {
          reported.add(key);
          diag(
            'error',
            'E-DEP-CYCLE',
            `dependency cycle: ${cycle.join(' → ')}`,
            nodePaths.get(next) ?? [],
            { hint: 'dependsOn must agree with the top-down order of nodes' },
          );
        }
      } else if (s === undefined) {
        dfs(next);
      }
    }
    stack.pop();
    state.set(id, 'done');
  };

  for (const id of edges.keys()) if (!state.has(id)) dfs(id);
}
