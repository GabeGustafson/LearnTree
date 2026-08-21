import type { SourceFile } from '@learntree/core';

export type WriteResult =
  | { ok: true; version: string | null }
  | { ok: false; reason: 'conflict'; remoteText: string; remoteVersion: string | null }
  | { ok: false; reason: 'auth' | 'network' | 'readonly' | 'other'; detail: string };

export interface StorageProvider {
  kind: 'sample' | 'local' | 'github';
  /** Human label for the header, e.g. "owner/repo@main" or a folder name. */
  label: string;
  /** Scopes localStorage caches so providers never cross-contaminate. */
  cacheKey: string;
  capabilities: { write: boolean };
  loadForestFiles(): Promise<{ files: SourceFile[]; version: string | null }>;
  readProgress(): Promise<{ text: string | null; version: string | null }>;
  /**
   * `expectedVersion` implements optimistic concurrency where the backend
   * supports it (GitHub blob sha); providers without versioning ignore it.
   */
  writeProgress(text: string, expectedVersion: string | null): Promise<WriteResult>;
}
