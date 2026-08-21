import { create } from 'zustand';
import type {
  Diagnostic,
  ModuleId,
  ProgressState,
  ResolvedForest,
} from '@learntree/core';
import {
  emptyProgressState,
  mergeProgress,
  parseProgressState,
  progressInfoDiagnostics,
  serializeProgressState,
  setModuleState,
  writeThroughAliases,
} from '@learntree/core';
import { resolveWithLastGood } from './lastGood.ts';
import type { StorageProvider } from '../providers/StorageProvider.ts';
import { LocalFolderProvider, localFolderSupported } from '../providers/LocalFolderProvider.ts';
import { SampleProvider } from '../providers/SampleProvider.ts';
import {
  clearLocalHandle,
  getProviderChoice,
  loadLocalHandle,
  saveLocalHandle,
  setProviderChoice,
} from '../providers/settings.ts';

export type Connection =
  | { state: 'ok' }
  /** A persisted local-folder handle needs a user-gesture permission grant. */
  | { state: 'needs-permission'; pending: LocalFolderProvider }
  | { state: 'error'; detail: string };

export interface AppState {
  provider: StorageProvider;
  connection: Connection;
  loading: boolean;
  forest: ResolvedForest | null;
  diagnostics: Diagnostic[];
  staleFiles: string[];
  progress: ProgressState;
  progressVersion: string | null;
  selected: { treeId: string; nodeId: string } | null;

  initialize(): Promise<void>;
  reload(): Promise<void>;
  maybeReloadOnFocus(): void;
  useSampleProvider(): Promise<void>;
  connectLocalFolder(): Promise<void>;
  reconnectLocal(): Promise<void>;
  disconnect(): Promise<void>;
  toggleModule(id: ModuleId, done: boolean): void;
  select(treeId: string, nodeId: string | null): void;
}

/** Last version of each file that passed parse+schema (per session). */
const lastGood = new Map<string, string>();
let lastLoadAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const FOCUS_RELOAD_MIN_MS = 5_000;
const PERSIST_DEBOUNCE_MS = 600;

function mirrorKey(provider: StorageProvider): string {
  return `learntree.progressCache.${provider.cacheKey}`;
}

export const useAppStore = create<AppState>((set, get) => {
  function flushPersist(): void {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    const { provider, progress, progressVersion } = get();
    if (!provider.capabilities.write || progress.corrupt) return;
    void provider.writeProgress(serializeProgressState(progress), progressVersion).then((res) => {
      if (res.ok) set({ progressVersion: res.version });
    });
  }

  function schedulePersist(): void {
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(flushPersist, PERSIST_DEBOUNCE_MS);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && persistTimer !== null) flushPersist();
    });
  }

  async function loadAll(provider: StorageProvider, freshProgress: boolean): Promise<void> {
    set({ loading: true, connection: { state: 'ok' } });
    try {
      const [{ files }, { text: progressText, version }] = await Promise.all([
        provider.loadForestFiles(),
        provider.readProgress(),
      ]);
      const { forest, diagnostics, staleFiles } = resolveWithLastGood(files, lastGood);
      const parsed = parseProgressState(progressText);

      let progress = parsed.state;
      // Crash-safety mirror: merges back any toggles that never reached the backend.
      const mirror = parseProgressState(localStorage.getItem(mirrorKey(provider)));
      if (!mirror.state.corrupt && !progress.corrupt) {
        progress = mergeProgress(progress, mirror.state);
      }
      // Reloads of the same provider must not lose an in-flight toggle.
      const current = get().progress;
      if (!freshProgress && current.entries.size > 0 && !progress.corrupt) {
        progress = mergeProgress(progress, current);
      }

      const migrated = writeThroughAliases(
        progress,
        [...forest.registry.values()].map((m) => m.def),
      );
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
      lastLoadAt = Date.now();

      if (!progress.corrupt) {
        localStorage.setItem(mirrorKey(provider), serializeProgressState(progress));
        // Backend behind the merged state (crash recovery, alias migration) → write back.
        if (serializeProgressState(progress) !== (progressText ?? '')) schedulePersist();
      }
    } catch (err) {
      set({ loading: false, connection: { state: 'error', detail: String(err) } });
    }
  }

  return {
    provider: new SampleProvider(),
    connection: { state: 'ok' },
    loading: true,
    forest: null,
    diagnostics: [],
    staleFiles: [],
    progress: emptyProgressState(),
    progressVersion: null,
    selected: null,

    async initialize() {
      const choice = getProviderChoice();
      if (choice === 'local' && localFolderSupported()) {
        const saved = await loadLocalHandle();
        if (saved !== null) {
          const provider = new LocalFolderProvider(saved.handle, saved.cacheId);
          if (await provider.hasPermission()) {
            await loadAll(provider, true);
          } else {
            set({ loading: false, connection: { state: 'needs-permission', pending: provider } });
          }
          return;
        }
      }
      await loadAll(new SampleProvider(), true);
    },

    async reload() {
      await loadAll(get().provider, false);
    },

    maybeReloadOnFocus() {
      const { loading, connection } = get();
      if (loading || connection.state !== 'ok') return;
      if (Date.now() - lastLoadAt < FOCUS_RELOAD_MIN_MS) return;
      void loadAll(get().provider, false);
    },

    async useSampleProvider() {
      setProviderChoice('sample');
      lastGood.clear();
      await loadAll(new SampleProvider(), true);
    },

    async connectLocalFolder() {
      const handle = await window.showDirectoryPicker({ id: 'learntree', mode: 'readwrite' });
      const cacheId = await saveLocalHandle(handle);
      setProviderChoice('local');
      lastGood.clear();
      await loadAll(new LocalFolderProvider(handle, cacheId), true);
    },

    async reconnectLocal() {
      const { connection } = get();
      if (connection.state !== 'needs-permission') return;
      if (await connection.pending.requestPermission()) {
        await loadAll(connection.pending, true);
      }
    },

    async disconnect() {
      await clearLocalHandle();
      setProviderChoice('sample');
      lastGood.clear();
      await loadAll(new SampleProvider(), true);
    },

    toggleModule(id, done) {
      const progress = setModuleState(get().progress, id, done, new Date().toISOString());
      set({ progress });
      if (!progress.corrupt) {
        localStorage.setItem(mirrorKey(get().provider), serializeProgressState(progress));
      }
      schedulePersist();
    },

    select(treeId, nodeId) {
      set({ selected: nodeId === null ? null : { treeId, nodeId } });
    },
  };
});
