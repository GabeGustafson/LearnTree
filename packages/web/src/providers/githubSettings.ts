import type { GitHubConfig } from './githubApi.ts';

const CONFIG_KEY = 'learntree.github.config';

function tokenKey(owner: string, repo: string): string {
  return `learntree.github.token.${owner}/${repo}`;
}

export function saveGitHubConfig(cfg: GitHubConfig): void {
  const { token, ...rest } = cfg;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(rest));
  localStorage.setItem(tokenKey(cfg.owner, cfg.repo), token);
}

export function loadGitHubConfig(): GitHubConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (raw === null) return null;
  try {
    const rest = JSON.parse(raw) as Omit<GitHubConfig, 'token'>;
    const token = localStorage.getItem(tokenKey(rest.owner, rest.repo));
    if (token === null || token === '') return null;
    return { ...rest, token };
  } catch {
    return null;
  }
}

export function clearGitHubConfig(): void {
  const cfg = loadGitHubConfig();
  if (cfg !== null) localStorage.removeItem(tokenKey(cfg.owner, cfg.repo));
  localStorage.removeItem(CONFIG_KEY);
}
