import type { ResolvedForest } from '../model/types.ts';
import type { Diagnostic } from '../parse/diagnostics.ts';
import type { ModuleId } from '../schema/ids.ts';
import type { ProgressEntry } from '../schema/progress.ts';
import { progressEntrySchema } from '../schema/progress.ts';

export const PROGRESS_FILE = '.learntree/progress.json';

export interface ProgressState {
  /** Valid entries only. Tombstones (`undone`) and orphans are kept forever. */
  entries: Map<ModuleId, ProgressEntry>;
  /** Invalid entries preserved verbatim so a save never destroys them. */
  quarantined: Map<string, unknown>;
  /** True when the whole file is unusable — the app must refuse to overwrite it. */
  corrupt: boolean;
}

export function emptyProgressState(): ProgressState {
  return { entries: new Map(), quarantined: new Map(), corrupt: false };
}

export interface ParsedProgress {
  state: ProgressState;
  diagnostics: Diagnostic[];
}

/**
 * Lenient by design: individual bad entries are quarantined (kept verbatim,
 * excluded from status math), and only unreadable-envelope cases mark the
 * whole state corrupt.
 */
export function parseProgressState(text: string | null): ParsedProgress {
  const diagnostics: Diagnostic[] = [];
  const state = emptyProgressState();
  if (text === null || text.trim() === '') return { state, diagnostics };

  const fail = (message: string): ParsedProgress => {
    state.corrupt = true;
    diagnostics.push({
      code: 'E-PROGRESS-ENTRY-INVALID',
      severity: 'error',
      file: PROGRESS_FILE,
      message,
      hint: 'the app will not overwrite this file until it is fixed or removed',
    });
    return { state, diagnostics };
  };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('file is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('file must be a JSON object');
  }
  const doc = raw as Record<string, unknown>;
  if (doc['learntree'] !== 1) {
    return fail(`unsupported progress version ${JSON.stringify(doc['learntree'])} (expected 1)`);
  }
  const modules = doc['modules'];
  if (modules === undefined) return { state, diagnostics };
  if (typeof modules !== 'object' || modules === null || Array.isArray(modules)) {
    return fail(`'modules' must be a JSON object`);
  }

  for (const [id, entry] of Object.entries(modules)) {
    const res = progressEntrySchema.safeParse(entry);
    if (res.success) {
      state.entries.set(id, res.data);
    } else {
      state.quarantined.set(id, entry);
      diagnostics.push({
        code: 'E-PROGRESS-ENTRY-INVALID',
        severity: 'error',
        file: PROGRESS_FILE,
        message: `entry '${id}' has an invalid shape and is ignored (kept verbatim on save)`,
      });
    }
  }
  return { state, diagnostics };
}

/**
 * Deterministic serialization: sorted keys, 2-space indent, trailing newline —
 * stable git diffs and byte-identical round-trips. Quarantined entries are
 * written back verbatim.
 */
export function serializeProgressState(state: ProgressState): string {
  const modules: Record<string, unknown> = {};
  const ids = [...new Set([...state.entries.keys(), ...state.quarantined.keys()])].sort();
  for (const id of ids) {
    const entry = state.entries.get(id);
    modules[id] = entry !== undefined ? { state: entry.state, at: entry.at } : state.quarantined.get(id);
  }
  return `${JSON.stringify({ learntree: 1, modules }, null, 2)}\n`;
}

const MAX_LISTED = 10;

function listIds(ids: string[]): string {
  const shown = ids.slice(0, MAX_LISTED).join(', ');
  return ids.length > MAX_LISTED ? `${shown}, … (${ids.length} total)` : shown;
}

/** Orphan/alias reporting for the validator and the app's diagnostics view. */
export function progressInfoDiagnostics(
  forest: ResolvedForest,
  state: ProgressState,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const orphans: string[] = [];
  const aliased: string[] = [];
  for (const id of state.entries.keys()) {
    if (forest.registry.has(id)) continue;
    if (forest.aliasIndex.has(id)) aliased.push(id);
    else orphans.push(id);
  }
  if (aliased.length > 0) {
    diagnostics.push({
      code: 'I-PROGRESS-ALIAS',
      severity: 'info',
      file: PROGRESS_FILE,
      message: `progress recorded under retired alias ids: ${listIds(aliased)}`,
      hint: 'the app reads these through `aliases` and migrates them on its next save',
    });
  }
  if (orphans.length > 0) {
    diagnostics.push({
      code: 'I-PROGRESS-ORPHAN',
      severity: 'info',
      file: PROGRESS_FILE,
      message: `progress exists for modules not in any tree: ${listIds(orphans)}`,
      hint: 'orphans are retained by design — re-adding a module (or aliasing it) restores its checkmark',
    });
  }
  return diagnostics;
}
