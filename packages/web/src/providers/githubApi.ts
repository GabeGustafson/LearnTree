export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export type ApiFailure =
  | { kind: 'auth'; status: number; detail: string }
  | { kind: 'notfound'; detail: string }
  | { kind: 'conflict'; detail: string }
  | { kind: 'network'; detail: string }
  | { kind: 'other'; status?: number; detail: string };

export class ApiError extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failure.detail);
  }
}

export function b64DecodeUtf8(b64: string): string {
  const clean = b64.replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function b64EncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

interface TreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

/**
 * Minimal browser client for the handful of endpoints LearnTree needs.
 * api.github.com sends `Access-Control-Allow-Origin: *`, so this works from
 * any static origin, including github.io.
 */
export class GitHubApi {
  constructor(private readonly cfg: GitHubConfig) {}

  private get repoBase(): string {
    return `https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}`;
  }

  private async request(
    path: string,
    init: RequestInit & { etag?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.etag !== undefined ? { 'If-None-Match': init.etag } : {}),
    };
    let res: Response;
    try {
      res = await fetch(`${this.repoBase}${path}`, { ...init, headers });
    } catch (err) {
      throw new ApiError({ kind: 'network', detail: String(err) });
    }
    if (res.ok || res.status === 304) return res;
    const body = await res.text().catch(() => '');
    const accepted = res.headers.get('X-Accepted-GitHub-Permissions');
    const detail = `${res.status} ${res.statusText}${accepted !== null ? ` (needs: ${accepted})` : ''}${body !== '' ? ` — ${body.slice(0, 200)}` : ''}`;
    if (res.status === 401 || res.status === 403) throw new ApiError({ kind: 'auth', status: res.status, detail });
    if (res.status === 404) throw new ApiError({ kind: 'notfound', detail });
    if (res.status === 409 || res.status === 422) throw new ApiError({ kind: 'conflict', detail });
    throw new ApiError({ kind: 'other', status: res.status, detail });
  }

  /** Repo + branch reachability check with actionable failure text. */
  async testConnection(): Promise<{ ok: true } | { ok: false; detail: string }> {
    try {
      await this.request('');
      await this.request(`/git/ref/heads/${encodeURIComponent(this.cfg.branch)}`);
      return { ok: true };
    } catch (err) {
      if (err instanceof ApiError) {
        const f = err.failure;
        if (f.kind === 'auth') {
          return { ok: false, detail: `Token rejected (${f.detail}). Fine-grained PAT needs Contents read/write on this repo.` };
        }
        if (f.kind === 'notfound') {
          return { ok: false, detail: `Repo or branch not found (${f.detail}). Private repos also 404 when the token lacks access.` };
        }
        return { ok: false, detail: f.detail };
      }
      return { ok: false, detail: String(err) };
    }
  }

  /** Returns null when the etag still matches (nothing changed — costs no rate limit). */
  async getRefSha(etag?: string): Promise<{ sha: string; etag: string | null } | null> {
    const res = await this.request(`/git/ref/heads/${encodeURIComponent(this.cfg.branch)}`, {
      ...(etag !== undefined ? { etag } : {}),
    });
    if (res.status === 304) return null;
    const data = (await res.json()) as { object: { sha: string } };
    return { sha: data.object.sha, etag: res.headers.get('ETag') };
  }

  async getTree(refSha: string): Promise<TreeEntry[]> {
    const res = await this.request(`/git/trees/${refSha}?recursive=1`);
    const data = (await res.json()) as { tree: TreeEntry[]; truncated: boolean };
    return data.tree;
  }

  async getBlobText(sha: string): Promise<string> {
    const res = await this.request(`/git/blobs/${sha}`);
    const data = (await res.json()) as { content: string; encoding: string };
    return data.encoding === 'base64' ? b64DecodeUtf8(data.content) : data.content;
  }

  async getContents(path: string): Promise<{ text: string; sha: string } | null> {
    try {
      const res = await this.request(`/contents/${path}?ref=${encodeURIComponent(this.cfg.branch)}`);
      const data = (await res.json()) as { content: string; sha: string };
      return { text: b64DecodeUtf8(data.content), sha: data.sha };
    } catch (err) {
      if (err instanceof ApiError && err.failure.kind === 'notfound') return null;
      throw err;
    }
  }

  async putContents(
    path: string,
    text: string,
    message: string,
    sha: string | null,
  ): Promise<{ sha: string }> {
    const res = await this.request(`/contents/${path}`, {
      method: 'PUT',
      // keepalive lets the tab-hide flush finish after the page is gone
      keepalive: true,
      body: JSON.stringify({
        message,
        content: b64EncodeUtf8(text),
        branch: this.cfg.branch,
        ...(sha !== null ? { sha } : {}),
      }),
    });
    const data = (await res.json()) as { content: { sha: string } };
    return { sha: data.content.sha };
  }
}
