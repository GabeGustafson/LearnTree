import { create } from 'zustand';
import type {
  Diagnostic,
  ModuleId,
  ProgressState,
  ResolvedForest,
  SourceFile,
} from '@learntree/core';
import {
  emptyProgressState,
  loadForest,
  mergeProgress,
  parseProgressState,
  progressInfoDiagnostics,
  serializeProgressState,
  setModuleState,
  writeThroughAliases,
} from '@learntree/core';
import type { StorageProvider } from '../providers/StorageProvider.ts';
import { SampleProvider } from '../providers/SampleProvider.ts';

export interface AppState {
  provider: StorageProvider;
  loading: boolean;
  forest: ResolvedForest | null;
  /** Diagnostics of the latest load attempt plus progress diagnostics. */
  diagnostics: Diagnostic[];
  /** Files currently rendered from an older, last-good version. */
  staleFiles: string[];
  progress: ProgressState;
  progressVersion: string | null;
  selected: { treeId: string; nodeId: string } | null;

  initialize(provider?: StorageProvider): Promise<void>;
  reload(): Promise<void>;
  toggleModule(id: ModuleId, done: boolean): void;
  select(treeId: string, nodeId: string | null): void;
}

/** Last version of each file that passed parse+schema, per provider label. */
const lastGood = new Map<string, string>();

function resolveWithLastGood(files: SourceFile[]): {
  forest: ResolvedForest;
  diagnostics: Diagnostic[];
  staleFiles: string[];
} {
  const attempt = loadForest(files);
  let forest = attempt;
  const staleFiles: string[] = [];

  const substitutable = attempt.quarantinedFiles.filter((p) => lastGood.has(p));
  if (substitutable.length > 0) {
    const substituted = files.map((f) =>
      substitutable.includes(f.path) ? { path: f.path, text: lastGood.get(f.path)! } : f,
    );
    forest = loadForest(substituted);
    staleFiles.push(...substitutable);
  }

  for (const f of files) {
    if (!attempt.quarantinedFiles.includes(f.path)) lastGood.set(f.path, f.text);
  }
  return { forest, diagnostics: attempt.diagnostics, staleFiles };
}

export const useAppStore = create<AppState>((set, get) => {
  async function persist(progress: ProgressState): Promise<void> {
    const { provider, progressVersion } = get();
    if (!provider.capabilities.write || progress.corrupt) return;
    const result = await provider.writeProgress(serializeProgressState(progress), progressVersion);
    if (result.ok) set({ progressVersion: result.version });
    // Conflict/error handling is the SyncController's job (M5); the sample and
    // local providers do not produce conflicts in practice.
  }

  async function loadAll(provider: StorageProvider): Promise<void> {
    set({ loading: true });
    const [{ files }, { text: progressText, version }] = await Promise.all([
      provider.loadForestFiles(),
      provider.readProgress(),
    ]);
    const { forest, diagnostics, staleFiles } = resolveWithLastGood(files);
    const parsed = parseProgressState(progressText);

    // Merge instead of replace: a reload must never lose an in-memory toggle
    // that raced the read.
    const current = get().progress;
    let progress = current.entries.size > 0 ? mergeProgress(parsed.state, current) : parsed.state;

    const defs = [...forest.registry.values()].map((m) => m.def);
    const migrated = writeThroughAliases(progress, defs);
    progress = migrated.state;

    set({
      provider,
      loading: false,
      forest,
      diagnostics: [
        ...diagnostics,
        ...parsed.diagnostics,
        ...progressInfoDiagnostics(forest, progress),
      ],
      staleFiles,
      progress,
      progressVersion: version,
    });
    if (migrated.changed) void persist(progress);
  }

  return {
    provider: new SampleProvider(),
    loading: true,
    forest: null,
    diagnostics: [],
    staleFiles: [],
    progress: emptyProgressState(),
    progressVersion: null,
    selected: null,

    async initialize(provider) {
      await loadAll(provider ?? get().provider);
    },

    async reload() {
      await loadAll(get().provider);
    },

    toggleModule(id, done) {
      const progress = setModuleState(get().progress, id, done, new Date().toISOString());
      set({ progress });
      void persist(progress);
    },

    select(treeId, nodeId) {
      set({ selected: nodeId === null ? null : { treeId, nodeId } });
    },
  };
});
