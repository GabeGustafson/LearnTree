export { computeStatuses } from './engine/status.ts';
export type { ModuleStatus, StatusMap } from './engine/status.ts';
export { forestSummary, rollup, treeSummary } from './engine/rollup.ts';
export type { CategoryStats, ForestSummary, ScopeStats, TreeSummary } from './engine/rollup.ts';
export {
  effectiveEntry,
  isDone,
  laterEntry,
  setModuleState,
  writeThroughAliases,
} from './progress/entries.ts';
export { mergeProgress } from './progress/merge.ts';
export { loadForest, FOREST_FILE, TREE_FILE_RE } from './loadForest.ts';
export type {
  Equivalence,
  ModuleDef,
  ModuleOccurrence,
  ResolvedCategory,
  ResolvedForest,
  ResolvedModule,
  ResolvedNode,
  ResolvedTree,
} from './model/types.ts';
export { hasErrors, sortDiagnostics } from './parse/diagnostics.ts';
export type { Diagnostic, Severity } from './parse/diagnostics.ts';
export { parseYamlSource } from './parse/parseYaml.ts';
export type { ParsedYaml, SourceFile } from './parse/parseYaml.ts';
export {
  PROGRESS_FILE,
  emptyProgressState,
  parseProgressState,
  progressInfoDiagnostics,
  serializeProgressState,
} from './progress/progressDoc.ts';
export type { ParsedProgress, ProgressState } from './progress/progressDoc.ts';
export { emitJsonSchemas } from './schema/emitJsonSchemas.ts';
export type { JsonSchemaArtifacts } from './schema/emitJsonSchemas.ts';
export {
  COUNT_SATISFIED_MODES,
  DEFAULT_COUNT_SATISFIED,
  forestFileSchema,
} from './schema/forest.ts';
export type { CountSatisfiedMode } from './schema/forest.ts';
export { ID_RE, MAX_ID_LENGTH, idSchema } from './schema/ids.ts';
export type { ModuleId, NodeId, TreeId } from './schema/ids.ts';
export { progressDocSchema, progressEntrySchema } from './schema/progress.ts';
export type { ProgressDoc, ProgressEntry } from './schema/progress.ts';
export {
  DEFAULT_WEIGHT,
  DIFFICULTIES,
  MODULE_TAGS,
  treeFileSchema,
} from './schema/tree.ts';
export type { Difficulty, ModuleTag } from './schema/tree.ts';
