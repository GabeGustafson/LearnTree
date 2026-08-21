import type { ModuleDef, ModuleOccurrence, ResolvedModule } from '../model/types.ts';
import type { Diagnostic } from '../parse/diagnostics.ts';
import { locateValue } from '../parse/locate.ts';
import type { ParsedYaml } from '../parse/parseYaml.ts';
import type { ModuleId } from '../schema/ids.ts';
import type { ModuleDefIn, ModuleRefIn } from '../schema/tree.ts';
import { DEFAULT_WEIGHT } from '../schema/tree.ts';
import type { RawOccurrence } from '../resolve/resolveTree.ts';
import { suggestClosest } from '../util/levenshtein.ts';

export interface RegistryResult {
  registry: Map<ModuleId, ResolvedModule>;
  aliasIndex: Map<ModuleId, ModuleId>;
  diagnostics: Diagnostic[];
}

function toDef(input: ModuleDefIn): ModuleDef {
  return {
    id: input.id,
    title: input.title,
    url: input.url,
    tag: input.tag,
    section: input.section,
    difficulty: input.difficulty,
    weight: input.weight ?? DEFAULT_WEIGHT,
    aliases: input.aliases ?? [],
  };
}

/** Canonical serialization for deep-equality of duplicate definitions (defaults applied, alias order ignored). */
function canonicalKey(def: ModuleDef): string {
  return JSON.stringify({
    id: def.id,
    title: def.title,
    url: def.url ?? null,
    tag: def.tag ?? null,
    section: def.section ?? null,
    difficulty: def.difficulty ?? null,
    weight: def.weight,
    aliases: [...def.aliases].sort(),
  });
}

function diffFields(a: ModuleDef, b: ModuleDef): string[] {
  const fields: Array<[string, unknown, unknown]> = [
    ['title', a.title, b.title],
    ['url', a.url, b.url],
    ['tag', a.tag, b.tag],
    ['section', a.section, b.section],
    ['difficulty', a.difficulty, b.difficulty],
    ['weight', a.weight, b.weight],
    ['aliases', [...a.aliases].sort().join(','), [...b.aliases].sort().join(',')],
  ];
  return fields.filter(([, va, vb]) => va !== vb).map(([name]) => name);
}

function isRefEntry(entry: ModuleDefIn | ModuleRefIn): entry is ModuleRefIn {
  return 'ref' in entry;
}

/**
 * Two passes over every module entry in the forest: first collect definitions
 * (deep-equal duplicates merge, divergent duplicates error, first definition
 * wins), then resolve `ref:` entries against the collected registry.
 */
export function buildRegistry(
  occurrences: RawOccurrence[],
  parsedByFile: ReadonlyMap<string, ParsedYaml>,
): RegistryResult {
  const registry = new Map<ModuleId, ResolvedModule>();
  const aliasIndex = new Map<ModuleId, ModuleId>();
  const canonicalById = new Map<ModuleId, string>();
  const firstLocById = new Map<ModuleId, string>();
  const diagnostics: Diagnostic[] = [];

  const locate = (occ: RawOccurrence): ModuleOccurrence => {
    const parsed = parsedByFile.get(occ.file);
    const pos = parsed ? locateValue(parsed, occ.path) : undefined;
    return {
      treeId: occ.treeId,
      nodeId: occ.nodeId,
      categoryName: occ.categoryName,
      file: occ.file,
      line: pos?.line,
      col: pos?.col,
      isRef: isRefEntry(occ.entry),
    };
  };

  // Pass 1: definitions.
  for (const occ of occurrences) {
    if (isRefEntry(occ.entry)) continue;
    const def = toDef(occ.entry);
    const loc = locate(occ);
    const existing = registry.get(def.id);
    if (existing === undefined) {
      registry.set(def.id, { def, occurrences: [loc] });
      canonicalById.set(def.id, canonicalKey(def));
      firstLocById.set(def.id, `${loc.file}:${loc.line ?? '?'}`);
      if (def.url === undefined && def.section === undefined) {
        diagnostics.push({
          code: 'W-MODULE-NO-POINTER',
          severity: 'warning',
          file: loc.file,
          line: loc.line,
          col: loc.col,
          message: `module '${def.id}' has neither a url nor a section — nothing points at the material`,
          hint: `add a url, or a section reference like "Ch. 5, problems 1-10"`,
        });
      }
    } else if (canonicalById.get(def.id) === canonicalKey(def)) {
      existing.occurrences.push(loc);
    } else {
      const fields = diffFields(existing.def, def);
      existing.occurrences.push(loc);
      diagnostics.push({
        code: 'E-DUP-MODULE-DIVERGENT',
        severity: 'error',
        file: loc.file,
        line: loc.line,
        col: loc.col,
        message: `module '${def.id}' is defined differently here than at ${firstLocById.get(def.id)} (differs in: ${fields.join(', ')})`,
        hint: `make the definitions identical, or replace this one with '- ref: ${def.id}'`,
      });
    }
  }

  // Pass 2: refs.
  for (const occ of occurrences) {
    if (!isRefEntry(occ.entry)) continue;
    const loc = locate(occ);
    const target = registry.get(occ.entry.ref);
    if (target === undefined) {
      const suggestion = suggestClosest(occ.entry.ref, registry.keys());
      const viaAlias = aliasCandidate(occ.entry.ref, registry);
      diagnostics.push({
        code: 'E-REF-UNKNOWN',
        severity: 'error',
        file: loc.file,
        line: loc.line,
        col: loc.col,
        message: `module '${occ.entry.ref}' is not defined anywhere in the forest`,
        hint: viaAlias
          ? `'${occ.entry.ref}' is an alias of '${viaAlias}' — reference the canonical id`
          : suggestion
            ? `did you mean '${suggestion}'?`
            : 'refs may only point at modules defined inline somewhere in the forest',
      });
    } else {
      target.occurrences.push(loc);
    }
  }

  // Alias index + alias rules.
  for (const { def } of registry.values()) {
    for (const alias of def.aliases) {
      if (registry.has(alias)) {
        diagnostics.push({
          code: 'E-ALIAS-COLLISION',
          severity: 'error',
          file: firstFileOf(registry, def.id),
          message: `alias '${alias}' of module '${def.id}' collides with a live module id`,
          hint: 'aliases must be retired ids, not ids of existing modules',
        });
        continue;
      }
      const claimed = aliasIndex.get(alias);
      if (claimed !== undefined && claimed !== def.id) {
        diagnostics.push({
          code: 'E-ALIAS-DUP',
          severity: 'error',
          file: firstFileOf(registry, def.id),
          message: `alias '${alias}' is claimed by both '${claimed}' and '${def.id}'`,
        });
      } else {
        aliasIndex.set(alias, def.id);
      }
    }
  }

  return { registry, aliasIndex, diagnostics };
}

function aliasCandidate(id: ModuleId, registry: Map<ModuleId, ResolvedModule>): ModuleId | undefined {
  for (const { def } of registry.values()) if (def.aliases.includes(id)) return def.id;
  return undefined;
}

function firstFileOf(registry: Map<ModuleId, ResolvedModule>, id: ModuleId): string {
  return registry.get(id)?.occurrences[0]?.file ?? '';
}
