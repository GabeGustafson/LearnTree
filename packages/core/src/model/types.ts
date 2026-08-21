import type { Diagnostic } from '../parse/diagnostics.ts';
import type { CountSatisfiedMode } from '../schema/forest.ts';
import type { ModuleId, NodeId, TreeId } from '../schema/ids.ts';
import type { Difficulty, ModuleTag } from '../schema/tree.ts';

export interface ModuleDef {
  id: ModuleId;
  title: string;
  url?: string | undefined;
  tag?: ModuleTag | undefined;
  section?: string | undefined;
  difficulty?: Difficulty | undefined;
  /** Defaults to 1 when omitted in the source. */
  weight: number;
  aliases: ModuleId[];
}

export interface ModuleOccurrence {
  treeId: TreeId;
  nodeId: NodeId;
  categoryName: string;
  file: string;
  line?: number | undefined;
  col?: number | undefined;
  isRef: boolean;
}

export interface ResolvedModule {
  def: ModuleDef;
  occurrences: ModuleOccurrence[];
}

export interface ResolvedCategory {
  name: string;
  /** In authored order; duplicates possible (rollups dedupe). */
  moduleIds: ModuleId[];
}

export interface ResolvedNode {
  id: NodeId;
  title: string;
  description?: string | undefined;
  /** Resolved: authored value, else `group` iff the node has children. */
  display: 'group' | 'card';
  dependsOn: NodeId[];
  categories: ResolvedCategory[];
  children: ResolvedNode[];
  /** Distinct module ids in this node's own categories, in first-seen order. */
  ownModuleIds: ModuleId[];
  /** Distinct module ids in this node and all descendants, in first-seen order. */
  subtreeModuleIds: ModuleId[];
}

export interface ResolvedTree {
  id: TreeId;
  title: string;
  order?: number | undefined;
  description?: string | undefined;
  file: string;
  nodes: ResolvedNode[];
  /** Distinct module ids across the tree, in first-seen order. */
  moduleIds: ModuleId[];
  nodeIndex: ReadonlyMap<NodeId, ResolvedNode>;
}

export interface Equivalence {
  id: string;
  sufficient: ModuleId[];
  satisfies: ModuleId[];
  note?: string | undefined;
}

export interface ResolvedForest {
  name: string;
  description?: string | undefined;
  settings: { countSatisfied: CountSatisfiedMode };
  /** Sorted for display: by `order` (ascending, missing last), then title. */
  trees: ResolvedTree[];
  registry: ReadonlyMap<ModuleId, ResolvedModule>;
  /** alias → canonical module id */
  aliasIndex: ReadonlyMap<ModuleId, ModuleId>;
  equivalences: Equivalence[];
  diagnostics: Diagnostic[];
  /** Files that failed parse/schema and are excluded from the resolved forest. */
  quarantinedFiles: string[];
}
