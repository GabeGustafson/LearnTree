import type { ProgressState } from '@learntree/core';
import { mergeProgress, parseProgressState, serializeProgressState } from '@learntree/core';
import type { StorageProvider } from '../providers/StorageProvider.ts';

export type SyncStatus = 'synced' | 'pending' | 'saving' | 'offline' | 'error';

export interface SyncDeps {
  read(): { progress: ProgressState; version: string | null };
  /** Successful write: adopt the backend's new version token. */
  applyWrite(version: string | null): void;
  /** Conflict resolution: adopt the merged state and the remote version to retry against. */
  applyMerged(progress: ProgressState, version: string | null): void;
  onStatus(status: SyncStatus, detail?: string): void;
}

export interface SyncOptions {
  debounceMs: number;
  /**
   * Floor between consecutive writes. GitHub's secondary limits allow ~80
   * content-writes/min (500/hr), so the GitHub provider uses 10s; local
   * providers use 0.
   */
  minSpacingMs: number;
  maxRetries: number;
}

export const GITHUB_SYNC_OPTIONS: SyncOptions = {
  debounceMs: 2_500,
  minSpacingMs: 10_000,
  maxRetries: 5,
};

export const LOCAL_SYNC_OPTIONS: SyncOptions = {
  debounceMs: 600,
  minSpacingMs: 0,
  maxRetries: 2,
};

export class SyncController {
  private dirty = false;
  private inFlight = false;
  private disposed = false;
  private retries = 0;
  private lastWriteAt = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private labels: string[] = [];
  private readonly onOnline = () => {
    if (this.dirty) void this.flush();
  };

  constructor(
    private readonly provider: StorageProvider,
    private readonly deps: SyncDeps,
    private readonly opts: SyncOptions,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
  }

  /** Record that progress changed; `label` feeds the commit message. */
  notifyChange(label?: string): void {
    if (this.disposed || !this.provider.capabilities.write) return;
    if (label !== undefined) this.labels.push(label);
    this.dirty = true;
    this.deps.onStatus('pending');
    this.arm(this.opts.debounceMs);
  }

  /** Bypass the debounce (tab-hide flush); still single-flight and spaced. */
  flushNow(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    return this.flush(true);
  }

  private arm(ms: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  private message(): string {
    const distinct = [...new Set(this.labels)];
    if (distinct.length === 0) return 'learntree: progress sync';
    const head = distinct[0]!;
    return distinct.length === 1
      ? `progress: ${head}`
      : `progress: ${head} (+${distinct.length - 1} more)`;
  }

  private async flush(ignoreSpacing = false): Promise<void> {
    if (this.inFlight || this.disposed || !this.dirty) return;
    if (!ignoreSpacing) {
      const wait = this.lastWriteAt + this.opts.minSpacingMs - this.now();
      if (wait > 0) {
        this.arm(wait);
        return;
      }
    }
    const { progress, version } = this.deps.read();
    if (progress.corrupt || !this.provider.capabilities.write) {
      this.dirty = false;
      return;
    }

    const text = serializeProgressState(progress);
    this.inFlight = true;
    this.deps.onStatus('saving');
    const result = await this.provider.writeProgress(text, version, this.message());
    this.inFlight = false;
    if (this.disposed) return;

    if (result.ok) {
      this.lastWriteAt = this.now();
      this.retries = 0;
      this.labels = [];
      this.deps.applyWrite(result.version);
      if (serializeProgressState(this.deps.read().progress) !== text) {
        // more toggles landed mid-flight
        this.arm(this.opts.debounceMs);
      } else {
        this.dirty = false;
        this.deps.onStatus('synced');
      }
      return;
    }

    switch (result.reason) {
      case 'conflict': {
        this.retries += 1;
        if (this.retries > this.opts.maxRetries) {
          this.deps.onStatus('error', 'could not sync after repeated conflicts — will retry on next change');
          this.retries = 0;
          return;
        }
        const remote = parseProgressState(result.remoteText === '' ? null : result.remoteText);
        // Tombstoned latest-at merge: another device's toggles union in, and
        // an uncheck can never be resurrected by a stale remote done.
        const merged = mergeProgress(remote.state, this.deps.read().progress);
        this.deps.applyMerged(merged, result.remoteVersion);
        const backoff = 1000 * 2 ** (this.retries - 1) + Math.random() * 250;
        this.arm(backoff);
        return;
      }
      case 'network':
        this.deps.onStatus('offline');
        return; // retried on 'online', next change, or next flushNow
      case 'auth':
        this.deps.onStatus('error', `authentication failed — check the token in Settings (${result.detail})`);
        return;
      default:
        this.deps.onStatus('error', result.detail);
    }
  }
}
