import type { SourceFile } from '@learntree/core';
import { FOREST_FILE, PROGRESS_FILE, TREE_FILE_RE } from '@learntree/core';
import type { StorageProvider, WriteResult } from './StorageProvider.ts';
import type { GitHubConfig } from './githubApi.ts';
import { ApiError, GitHubApi } from './githubApi.ts';

interface RepoCache {
  refSha: string;
  etag: string | null;
  files: SourceFile[];
  /** blob sha per path — lets an updated ref reuse unchanged blobs. */
  shas: Record<string, string>;
}

/**
 * Private GitHub repo as the database. Reads are sha-addressed and cached in
 * localStorage, so a steady-state reload costs one conditional ref request
 * (a 304 is rate-limit-free). Writes go through the contents API with the
 * blob sha as the optimistic-concurrency token.
 */
export class GitHubProvider implements StorageProvider {
  readonly kind = 'github';
  readonly label: string;
  readonly cacheKey: string;
  readonly capabilities = { write: true };
  private readonly api: GitHubApi;

  constructor(cfg: GitHubConfig) {
    this.api = new GitHubApi(cfg);
    this.label = `${cfg.owner}/${cfg.repo}@${cfg.branch}`;
    this.cacheKey = `github:${cfg.owner}/${cfg.repo}@${cfg.branch}`;
  }

  private get cacheStorageKey(): string {
    return `learntree.ghcache.${this.cacheKey}`;
  }

  private readCache(): RepoCache | null {
    try {
      const raw = localStorage.getItem(this.cacheStorageKey);
      return raw === null ? null : (JSON.parse(raw) as RepoCache);
    } catch {
      return null;
    }
  }

  async loadForestFiles(): Promise<{ files: SourceFile[]; version: string | null }> {
    const cache = this.readCache();
    const ref = await this.api.getRefSha(cache?.etag ?? undefined);
    if (ref === null && cache !== null) {
      return { files: cache.files, version: cache.refSha }; // 304 — nothing changed
    }
    const refSha = ref?.sha ?? cache?.refSha;
    if (refSha === undefined) return { files: [], version: null };

    const tree = await this.api.getTree(refSha);
    const wanted = tree.filter(
      (e) => e.type === 'blob' && (e.path === FOREST_FILE || TREE_FILE_RE.test(e.path)),
    );
    const files: SourceFile[] = [];
    const shas: Record<string, string> = {};
    for (const entry of wanted) {
      shas[entry.path] = entry.sha;
      const cached =
        cache !== null && cache.shas[entry.path] === entry.sha
          ? cache.files.find((f) => f.path === entry.path)
          : undefined;
      const text = cached?.text ?? (await this.api.getBlobText(entry.sha));
      files.push({ path: entry.path, text });
    }

    const next: RepoCache = { refSha, etag: ref?.etag ?? null, files, shas };
    try {
      localStorage.setItem(this.cacheStorageKey, JSON.stringify(next));
    } catch {
      // cache is an optimization — quota failures must not break loading
    }
    return { files, version: refSha };
  }

  async readProgress(): Promise<{ text: string | null; version: string | null }> {
    const result = await this.api.getContents(PROGRESS_FILE);
    return result === null ? { text: null, version: null } : { text: result.text, version: result.sha };
  }

  async writeProgress(
    text: string,
    expectedVersion: string | null,
    message = 'learntree: progress update',
  ): Promise<WriteResult> {
    try {
      const { sha } = await this.api.putContents(PROGRESS_FILE, text, message, expectedVersion);
      return { ok: true, version: sha };
    } catch (err) {
      if (err instanceof ApiError) {
        const f = err.failure;
        if (f.kind === 'conflict') {
          const remote = await this.readProgressSafe();
          if (remote !== null) {
            return {
              ok: false,
              reason: 'conflict',
              remoteText: remote.text ?? '',
              remoteVersion: remote.version,
            };
          }
          return { ok: false, reason: 'other', detail: f.detail };
        }
        if (f.kind === 'auth') return { ok: false, reason: 'auth', detail: f.detail };
        if (f.kind === 'network') return { ok: false, reason: 'network', detail: f.detail };
        return { ok: false, reason: 'other', detail: f.detail };
      }
      return { ok: false, reason: 'other', detail: String(err) };
    }
  }

  private async readProgressSafe(): Promise<{ text: string | null; version: string | null } | null> {
    try {
      return await this.readProgress();
    } catch {
      return null;
    }
  }

  testConnection(): Promise<{ ok: true } | { ok: false; detail: string }> {
    return this.api.testConnection();
  }
}
