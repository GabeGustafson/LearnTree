import { create } from 'zustand';
import type { Diagnostic, ModuleId, ProgressState, ResolvedForest } from '@learntree/core';
import {
  emptyProgressState,
  mergeProgress,
  parseProgressState,
  progressInfoDiagnostics,
  serializeProgressState,
  setModuleState,
  writeThroughAliases,
} from '@learntree/core';
import type { StorageProvider } from '../providers/StorageProvider.ts';
import { LocalFolderProvider, localFolderSupported } from '../providers/LocalFolderProvider.ts';
import { SampleProvider } from '../providers/SampleProvider.ts';
import { GitHubProvider } from '../providers/GitHubProvider.ts';
import type { GitHubConfig } from '../providers/githubApi.ts';
import {
  clearGitHubConfig,
  loadGitHubConfig,
  saveGitHubConfig,
} from '../providers/githubSettings.ts';
import {
  clearLocalHandle,
  getProviderChoice,
  loadLocalHandle,
  saveLocalHandle,
  setProviderChoice,
} from '../providers/settings.ts';
import type { SyncStatus } from '../sync/SyncController.ts';
import {
  GITHUB_SYNC_OPTIONS,
  LOCAL_SYNC_OPTIONS,
  SyncController,
} from '../sync/SyncController.ts';

export type Connection =
  | { state: 'ok' }
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
  sync: { status: SyncStatus; detail?: string | undefined };
  selected: { treeId: string; nodeId: string } | null;

  initialize(): Promise<void>;
  reload(): Promise<void>;
  maybeReloadOnFocus(): void;
  useSampleProvider(): Promise<void>;
  connectLocalFolder(): Promise<void>;
  connectGitHub(cfg: GitHubConfig): Promise<void>;
  reconnectLocal(): Promise<void>;
  disconnect(): Promise<void>;
  flushSync(): Promise<void>;
  toggleModule(id: ModuleId, done: boolean): void;
  select(treeId: string, nodeId: string | null): void;
}

import { resolveWithLastGood } from './lastGood.ts';

/** Last version of each file that passed parse+schema (per session). */
const lastGood = new Map<string, string>();
let lastLoadAt = 0;
let controller: SyncController | null = null;

const FOCUS_RELOAD_MIN_MS = 5_000;

function mirrorKey(provider: StorageProvider): string {
  return `learntree.progressCache.${provider.cacheKey}`;
}

export const useAppStore = create<AppState>((set, get) => {
  function attachController(provider: StorageProvider): void {
    controller?.dispose();
    controller = new SyncController(
      provider,
      {
        read: () => ({ progress: get().progress, version: get().progressVersion }),
        applyWrite: (version) => set({ progressVersion: version }),
        applyMerged: (progress, version) => {
          set({ progress, progressVersion: version });
          if (!progress.corrupt) {
            localStorage.setItem(mirrorKey(provider), serializeProgressState(progress));
          }
        },
        onStatus: (status, detail) => set({ sync: { status, detail } }),
      },
      provider.kind === 'github' ? GITHUB_SYNC_OPTIONS : LOCAL_SYNC_OPTIONS,
    );
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void controller?.flushNow();
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

      attachController(provider);
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
        sync: { status: 'synced' },
      });
      lastLoadAt = Date.now();

      if (!progress.corrupt) {
        localStorage.setItem(mirrorKey(provider), serializeProgressState(progress));
        // Backend behind the merged state (crash recovery, alias migration) → write back.
        if (serializeProgressState(progress) !== (progressText ?? '')) {
          controller?.notifyChange();
        }
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
    sync: { status: 'synced' },
    selected: null,

    async initialize() {
      const choice = getProviderChoice();
      if (choice === 'github') {
        const cfg = loadGitHubConfig();
        if (cfg !== null) {
          await loadAll(new GitHubProvider(cfg), true);
          return;
        }
      }
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

    async connectGitHub(cfg) {
      saveGitHubConfig(cfg);
      setProviderChoice('github');
      lastGood.clear();
      await loadAll(new GitHubProvider(cfg), true);
    },

    async reconnectLocal() {
      const { connection } = get();
      if (connection.state !== 'needs-permission') return;
      if (await connection.pending.requestPermission()) {
        await loadAll(connection.pending, true);
      }
    },

    async disconnect() {
      const { provider } = get();
      if (provider.kind === 'local') await clearLocalHandle();
      if (provider.kind === 'github') clearGitHubConfig();
      setProviderChoice('sample');
      lastGood.clear();
      await loadAll(new SampleProvider(), true);
    },

    async flushSync() {
      await controller?.flushNow();
    },

    toggleModule(id, done) {
      const progress = setModuleState(get().progress, id, done, new Date().toISOString());
      set({ progress });
      if (!progress.corrupt) {
        localStorage.setItem(mirrorKey(get().provider), serializeProgressState(progress));
      }
      const title = get().forest?.registry.get(id)?.def.title ?? id;
      controller?.notifyChange(done ? title : `uncheck ${title}`);
    },

    select(treeId, nodeId) {
      set({ selected: nodeId === null ? null : { treeId, nodeId } });
    },
  };
});
