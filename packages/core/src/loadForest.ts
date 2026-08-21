import type { Equivalence, ResolvedForest, ResolvedNode, ResolvedTree } from './model/types.ts';
import type { Diagnostic } from './parse/diagnostics.ts';
import { locateValue } from './parse/locate.ts';
import { mapZodIssues } from './parse/mapZodIssues.ts';
import type { ParsedYaml, SourceFile } from './parse/parseYaml.ts';
import { parseYamlSource } from './parse/parseYaml.ts';
import { buildRegistry } from './registry/buildRegistry.ts';
import type { TreeResolution } from './resolve/resolveTree.ts';
import { resolveTree } from './resolve/resolveTree.ts';
import { DEFAULT_COUNT_SATISFIED, forestFileSchema } from './schema/forest.ts';
import type { ModuleId } from './schema/ids.ts';
import { treeFileSchema } from './schema/tree.ts';
import { suggestClosest } from './util/levenshtein.ts';

export const FOREST_FILE = 'forest.yaml';
export const TREE_FILE_RE = /^trees\/.+\.ya?ml$/;

function baseName(path: string): string {
  const file = path.split('/').at(-1) ?? path;
  return file.replace(/\.ya?ml$/, '');
}

/**
 * Build a ResolvedForest from raw file contents. Never throws on bad input:
 * files that fail parse/schema are quarantined (reported in `diagnostics` and
 * `quarantinedFiles`) while the rest of the forest resolves normally.
 */
export function loadForest(files: SourceFile[]): ResolvedForest {
  const diagnostics: Diagnostic[] = [];
  const quarantinedFiles: string[] = [];

  const forestSource = files.find((f) => f.path === FOREST_FILE);
  const treeSources = files.filter((f) => TREE_FILE_RE.test(f.path));

  for (const f of files) {
    if (f !== forestSource && !treeSources.includes(f) && /\.ya?ml$/.test(f.path)) {
      diagnostics.push({
        code: 'W-FILE-IGNORED',
        severity: 'warning',
        file: f.path,
        message: `YAML file outside the recognized layout is ignored`,
        hint: `trees live in trees/<tree-id>.yaml; forest settings in ${FOREST_FILE}`,
      });
    }
  }

  // ---- forest.yaml ----
  let forestName = 'Learning Forest';
  let forestDescription: string | undefined;
  let countSatisfied = DEFAULT_COUNT_SATISFIED;
  let rawEquivalences: Equivalence[] = [];
  let forestParsed: ParsedYaml | undefined;

  if (forestSource === undefined) {
    diagnostics.push({
      code: 'E-FOREST-MISSING',
      severity: 'error',
      file: FOREST_FILE,
      message: `${FOREST_FILE} not found at the forest root`,
      hint: 'create it with at least `learntree: 1` and a `name:`',
    });
  } else {
    forestParsed = parseYamlSource(forestSource);
    diagnostics.push(...forestParsed.diagnostics);
    if (forestParsed.value !== undefined) {
      const res = forestFileSchema.safeParse(forestParsed.value);
      if (res.success) {
        forestName = res.data.name;
        forestDescription = res.data.description;
        countSatisfied = res.data.settings?.countSatisfied ?? DEFAULT_COUNT_SATISFIED;
        rawEquivalences = (res.data.equivalences ?? []).map((e) => ({
          id: e.id,
          sufficient: e.sufficient,
          satisfies: e.satisfies,
          note: e.note,
        }));
      } else {
        diagnostics.push(...mapZodIssues(forestParsed, 'forest', forestParsed.value, res.error.issues));
        quarantinedFiles.push(forestSource.path);
      }
    } else {
      quarantinedFiles.push(forestSource.path);
    }
  }

  // ---- trees/*.yaml ----
  const resolutions: TreeResolution[] = [];
  const parsedByFile = new Map<string, ParsedYaml>();

  for (const source of treeSources) {
    const parsed = parseYamlSource(source);
    parsedByFile.set(source.path, parsed);
    diagnostics.push(...parsed.diagnostics);
    if (parsed.value === undefined) {
      quarantinedFiles.push(source.path);
      continue;
    }
    const res = treeFileSchema.safeParse(parsed.value);
    if (!res.success) {
      diagnostics.push(...mapZodIssues(parsed, 'tree', parsed.value, res.error.issues));
      quarantinedFiles.push(source.path);
      continue;
    }

    const duplicate = resolutions.find((r) => r.tree.id === res.data.id);
    if (duplicate !== undefined) {
      const pos = locateValue(parsed, ['id']);
      diagnostics.push({
        code: 'E-TREE-ID-DUP',
        severity: 'error',
        file: source.path,
        line: pos?.line,
        col: pos?.col,
        message: `tree id '${res.data.id}' is already used by ${duplicate.tree.file} — this file is ignored`,
      });
      quarantinedFiles.push(source.path);
      continue;
    }

    if (baseName(source.path) !== res.data.id) {
      const pos = locateValue(parsed, ['id']);
      diagnostics.push({
        code: 'W-TREE-ID-FILENAME-MISMATCH',
        severity: 'warning',
        file: source.path,
        line: pos?.line,
        col: pos?.col,
        message: `tree id '${res.data.id}' does not match filename '${baseName(source.path)}'`,
        hint: `rename the file to trees/${res.data.id}.yaml`,
      });
    }

    const resolution = resolveTree(parsed, res.data);
    diagnostics.push(...resolution.diagnostics);
    resolutions.push(resolution);
  }

  // Duplicate dashboard sort keys are harmless but usually unintended.
  const byOrder = new Map<number, string>();
  for (const r of resolutions) {
    if (r.tree.order === undefined) continue;
    const prior = byOrder.get(r.tree.order);
    if (prior !== undefined) {
      diagnostics.push({
        code: 'W-ORDER-DUP',
        severity: 'warning',
        file: r.tree.file,
        message: `order ${r.tree.order} is also used by tree '${prior}'`,
      });
    } else {
      byOrder.set(r.tree.order, r.tree.id);
    }
  }

  // ---- module registry (cross-tree) ----
  const allOccurrences = resolutions.flatMap((r) => r.occurrences);
  const { registry, aliasIndex, diagnostics: regDiags } = buildRegistry(allOccurrences, parsedByFile);
  diagnostics.push(...regDiags);

  // ---- dependsOn targets that were not found in their own tree ----
  for (const r of resolutions) {
    for (const dep of r.unknownDeps) {
      const parsed = parsedByFile.get(r.tree.file);
      const pos = parsed ? locateValue(parsed, dep.path) : undefined;
      const otherTree = resolutions.find((other) => other.tree.nodeIndex.has(dep.target));
      if (otherTree !== undefined) {
        diagnostics.push({
          code: 'E-DEP-CROSS-TREE',
          severity: 'error',
          file: r.tree.file,
          line: pos?.line,
          col: pos?.col,
          message: `node '${dep.nodeId}' depends on '${dep.target}', which lives in tree '${otherTree.tree.id}' — dependsOn is same-tree only`,
          hint: 'cross-tree relationships are expressed as equivalences in forest.yaml',
        });
      } else {
        const suggestion = suggestClosest(dep.target, r.tree.nodeIndex.keys());
        diagnostics.push({
          code: 'E-DEP-UNKNOWN',
          severity: 'error',
          file: r.tree.file,
          line: pos?.line,
          col: pos?.col,
          message: `node '${dep.nodeId}' depends on unknown node '${dep.target}'`,
          hint: suggestion ? `did you mean '${suggestion}'?` : undefined,
        });
      }
    }
  }

  // ---- equivalences ----
  const equivalences: Equivalence[] = [];
  const seenEqIds = new Set<string>();
  rawEquivalences.forEach((eq, i) => {
    const pos = forestParsed ? locateValue(forestParsed, ['equivalences', i]) : undefined;
    const eqDiag = (code: string, severity: Diagnostic['severity'], message: string, hint?: string) =>
      diagnostics.push({
        code,
        severity,
        file: FOREST_FILE,
        line: pos?.line,
        col: pos?.col,
        message,
        hint,
      });

    if (seenEqIds.has(eq.id)) {
      eqDiag('E-EQ-ID-DUP', 'error', `equivalence id '${eq.id}' is used more than once`);
      return;
    }
    seenEqIds.add(eq.id);

    let valid = true;
    for (const [listName, ids] of [
      ['sufficient', eq.sufficient],
      ['satisfies', eq.satisfies],
    ] as const) {
      for (const id of ids) {
        if (registry.has(id)) continue;
        valid = false;
        const canonical = aliasIndex.get(id);
        const suggestion = canonical ?? suggestClosest(id, registry.keys());
        eqDiag(
          'E-EQ-UNKNOWN-MODULE',
          'error',
          `equivalence '${eq.id}' lists unknown module '${id}' in '${listName}'`,
          canonical
            ? `'${id}' is an alias of '${canonical}' — reference the canonical id`
            : suggestion
              ? `did you mean '${suggestion}'?`
              : undefined,
        );
      }
    }

    const overlap = eq.sufficient.filter((id) => eq.satisfies.includes(id));
    if (overlap.length > 0) {
      eqDiag(
        'W-EQ-SELF',
        'warning',
        `equivalence '${eq.id}' lists ${overlap.map((o) => `'${o}'`).join(', ')} in both 'sufficient' and 'satisfies' — a self-mapping has no effect`,
      );
    }

    if (valid) equivalences.push(eq);
  });

  // ---- finalize module id lists (registry-known only, distinct, first-seen order) ----
  const finalizeNode = (node: ResolvedNode): ModuleId[] => {
    const own = new Set<ModuleId>();
    for (const cat of node.categories) {
      cat.moduleIds = cat.moduleIds.filter((id) => registry.has(id));
      for (const id of cat.moduleIds) own.add(id);
    }
    node.ownModuleIds = [...own];
    const subtree = new Set<ModuleId>(node.ownModuleIds);
    for (const child of node.children) for (const id of finalizeNode(child)) subtree.add(id);
    node.subtreeModuleIds = [...subtree];
    return node.subtreeModuleIds;
  };

  const trees: ResolvedTree[] = resolutions.map((r) => {
    const treeModules = new Set<ModuleId>();
    for (const node of r.tree.nodes) for (const id of finalizeNode(node)) treeModules.add(id);
    r.tree.moduleIds = [...treeModules];
    return r.tree;
  });

  trees.sort(
    (a, b) =>
      (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );

  return {
    name: forestName,
    description: forestDescription,
    settings: { countSatisfied },
    trees,
    registry,
    aliasIndex,
    equivalences,
    diagnostics,
    quarantinedFiles,
  };
}
