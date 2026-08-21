import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProgressState, SourceFile } from '@learntree/core';
import { parseProgressState, serializeProgressState } from '@learntree/core';
import type { StorageProvider, WriteResult } from '../src/providers/StorageProvider.ts';
import type { SyncStatus } from '../src/sync/SyncController.ts';
import { GITHUB_SYNC_OPTIONS, SyncController } from '../src/sync/SyncController.ts';

function prog(entries: Record<string, ['done' | 'undone', string]>): ProgressState {
  return {
    entries: new Map(Object.entries(entries).map(([id, [state, at]]) => [id, { state, at }])),
    quarantined: new Map(),
    corrupt: false,
  };
}

const T1 = '2026-08-01T00:00:00.000Z';
const T2 = '2026-08-02T00:00:00.000Z';

interface Scripted {
  provider: StorageProvider;
  writes: Array<{ text: string; version: string | null; message: string | undefined }>;
  script: WriteResult[];
}

function scriptedProvider(script: WriteResult[]): Scripted {
  const writes: Scripted['writes'] = [];
  const provider: StorageProvider = {
    kind: 'github',
    label: 'fake/repo@main',
    cacheKey: 'github:fake/repo@main',
    capabilities: { write: true },
    loadForestFiles: () => Promise.resolve({ files: [] as SourceFile[], version: null }),
    readProgress: () => Promise.resolve({ text: null, version: null }),
    writeProgress: (text, version, message) => {
      writes.push({ text, version, message });
      return Promise.resolve(script[Math.min(writes.length - 1, script.length - 1)]!);
    },
  };
  return { provider, writes, script };
}

interface Harness {
  controller: SyncController;
  statuses: SyncStatus[];
  state: { progress: ProgressState; version: string | null };
}

function harness(scripted: Scripted, initial: ProgressState): Harness {
  const state = { progress: initial, version: null as string | null };
  const statuses: SyncStatus[] = [];
  const controller = new SyncController(
    scripted.provider,
    {
      read: () => ({ progress: state.progress, version: state.version }),
      applyWrite: (version) => {
        state.version = version;
      },
      applyMerged: (progress, version) => {
        state.progress = progress;
        state.version = version;
      },
      onStatus: (status) => statuses.push(status),
    },
    GITHUB_SYNC_OPTIONS,
  );
  return { controller, statuses, state };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function drain(): Promise<void> {
  // run debounce/backoff timers and the promise chains they trigger
  for (let i = 0; i < 12; i++) {
    await vi.advanceTimersByTimeAsync(5_000);
  }
}

describe('SyncController', () => {
  test('debounces, writes once, and lands on synced with the new version', async () => {
    const scripted = scriptedProvider([{ ok: true, version: 'sha-1' }]);
    const h = harness(scripted, prog({ m1: ['done', T1] }));

    h.controller.notifyChange('Module One');
    h.controller.notifyChange('Module One');
    await drain();

    expect(scripted.writes).toHaveLength(1);
    expect(scripted.writes[0]!.message).toBe('progress: Module One');
    expect(h.state.version).toBe('sha-1');
    expect(h.statuses.at(-1)).toBe('synced');
  });

  test('batched commit message names the first module and the overflow count', async () => {
    const scripted = scriptedProvider([{ ok: true, version: 'sha-1' }]);
    const h = harness(scripted, prog({ m1: ['done', T1] }));
    h.controller.notifyChange('Alpha');
    h.controller.notifyChange('Beta');
    h.controller.notifyChange('Gamma');
    await drain();
    expect(scripted.writes[0]!.message).toBe('progress: Alpha (+2 more)');
  });

  test('409 conflict: merges the remote union and retries with the remote version', async () => {
    const remote = serializeProgressState(prog({ other: ['done', T1] }));
    const scripted = scriptedProvider([
      { ok: false, reason: 'conflict', remoteText: remote, remoteVersion: 'sha-remote' },
      { ok: true, version: 'sha-2' },
    ]);
    const h = harness(scripted, prog({ mine: ['done', T2] }));

    h.controller.notifyChange('Mine');
    await drain();

    expect(scripted.writes).toHaveLength(2);
    expect(scripted.writes[1]!.version).toBe('sha-remote');
    const finalDoc = parseProgressState(scripted.writes[1]!.text).state;
    expect(finalDoc.entries.get('mine')?.state).toBe('done');
    expect(finalDoc.entries.get('other')?.state).toBe('done');
    expect(h.statuses.at(-1)).toBe('synced');
  });

  test('conflict merge cannot resurrect a local uncheck (tombstone wins)', async () => {
    const remote = serializeProgressState(prog({ m1: ['done', T1] }));
    const scripted = scriptedProvider([
      { ok: false, reason: 'conflict', remoteText: remote, remoteVersion: 'sha-remote' },
      { ok: true, version: 'sha-2' },
    ]);
    const h = harness(scripted, prog({ m1: ['undone', T2] }));

    h.controller.notifyChange('uncheck M1');
    await drain();

    const finalDoc = parseProgressState(scripted.writes[1]!.text).state;
    expect(finalDoc.entries.get('m1')?.state).toBe('undone');
  });

  test('conflict retries are bounded and end in an error status', async () => {
    const remote = serializeProgressState(prog({ other: ['done', T1] }));
    const scripted = scriptedProvider([
      { ok: false, reason: 'conflict', remoteText: remote, remoteVersion: 'sha-r' },
    ]);
    const h = harness(scripted, prog({ mine: ['done', T2] }));

    h.controller.notifyChange('Mine');
    for (let i = 0; i < 30; i++) await vi.advanceTimersByTimeAsync(60_000);

    expect(scripted.writes.length).toBe(GITHUB_SYNC_OPTIONS.maxRetries + 1);
    expect(h.statuses.at(-1)).toBe('error');
  });

  test('network failure parks in offline and keeps the queue', async () => {
    const scripted = scriptedProvider([
      { ok: false, reason: 'network', detail: 'fetch failed' },
      { ok: true, version: 'sha-1' },
    ]);
    const h = harness(scripted, prog({ m1: ['done', T1] }));

    h.controller.notifyChange('M1');
    await drain();
    expect(h.statuses.at(-1)).toBe('offline');

    await h.controller.flushNow();
    await drain();
    expect(scripted.writes).toHaveLength(2);
    expect(h.statuses.at(-1)).toBe('synced');
  });

  test('enforces the minimum spacing between consecutive writes', async () => {
    const scripted = scriptedProvider([
      { ok: true, version: 'sha-1' },
      { ok: true, version: 'sha-2' },
    ]);
    const h = harness(scripted, prog({ m1: ['done', T1] }));

    h.controller.notifyChange('first');
    await vi.advanceTimersByTimeAsync(GITHUB_SYNC_OPTIONS.debounceMs + 100);
    expect(scripted.writes).toHaveLength(1);

    h.state.progress = prog({ m1: ['done', T1], m2: ['done', T2] });
    h.controller.notifyChange('second');
    await vi.advanceTimersByTimeAsync(GITHUB_SYNC_OPTIONS.debounceMs + 100);
    expect(scripted.writes).toHaveLength(1); // still within the 10s floor

    await vi.advanceTimersByTimeAsync(GITHUB_SYNC_OPTIONS.minSpacingMs);
    expect(scripted.writes).toHaveLength(2);
  });

  test('corrupt progress is never written', async () => {
    const scripted = scriptedProvider([{ ok: true, version: 'sha-1' }]);
    const corrupt: ProgressState = { entries: new Map(), quarantined: new Map(), corrupt: true };
    const h = harness(scripted, corrupt);
    h.controller.notifyChange('anything');
    await drain();
    expect(scripted.writes).toHaveLength(0);
  });
});
