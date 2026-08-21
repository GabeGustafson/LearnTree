import { useState } from 'react';
import { GitHubProvider } from '../../providers/GitHubProvider.ts';
import { loadGitHubConfig } from '../../providers/githubSettings.ts';
import { useAppStore } from '../../state/store.ts';

export function ConnectGitHub({ onDone }: { onDone: () => void }) {
  const connectGitHub = useAppStore((s) => s.connectGitHub);
  const saved = loadGitHubConfig();
  const [owner, setOwner] = useState(saved?.owner ?? '');
  const [repo, setRepo] = useState(saved?.repo ?? '');
  const [branch, setBranch] = useState(saved?.branch ?? 'main');
  const [token, setToken] = useState(saved?.token ?? '');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cfg = { owner: owner.trim(), repo: repo.trim(), branch: branch.trim() || 'main', token: token.trim() };
  const complete = cfg.owner !== '' && cfg.repo !== '' && cfg.token !== '';

  const input =
    'w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-[13px] focus:border-neutral-500 focus:outline-none';
  const button =
    'rounded-md border border-neutral-300 px-3 py-1.5 text-[13px] font-medium hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12px] text-neutral-600">
          Owner
          <input className={input} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="your-username" />
        </label>
        <label className="text-[12px] text-neutral-600">
          Repository
          <input className={input} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="my-learning-forest" />
        </label>
        <label className="text-[12px] text-neutral-600">
          Branch
          <input className={input} value={branch} onChange={(e) => setBranch(e.target.value)} />
        </label>
        <label className="text-[12px] text-neutral-600">
          Fine-grained personal access token
          <input
            className={input}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            autoComplete="off"
          />
        </label>
      </div>
      <p className="text-[12px] text-neutral-500">
        <a
          href="https://github.com/settings/personal-access-tokens/new?name=learntree&description=LearnTree+progress+sync&contents=write&expires_in=366"
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-neutral-700 underline"
        >
          Create the token with this pre-filled link ↗
        </a>{' '}
        — it sets <strong>Contents: Read and write</strong> for you; on GitHub's page just choose{' '}
        <em>Repository access</em> → <strong>“Only select repositories”</strong> → your data repo,
        then Generate. (Manual route: “+ Add permissions” → search the permission name{' '}
        <code>Contents</code> — searching “read”/“write” finds nothing — then set its level to
        “Read and write”.) The token is stored in this browser's localStorage and sent only to
        api.github.com.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={!complete || busy}
          onClick={() => {
            setBusy(true);
            setTestResult(null);
            void new GitHubProvider(cfg).testConnection().then((r) => {
              setTestResult(r.ok ? '✓ Connection works' : `✗ ${r.detail}`);
              setBusy(false);
            });
          }}
        >
          Test connection
        </button>
        <button
          type="button"
          className={`${button} border-neutral-800 bg-neutral-900 text-white hover:bg-neutral-700`}
          disabled={!complete || busy}
          onClick={() => {
            setBusy(true);
            void connectGitHub(cfg).then(() => {
              setBusy(false);
              onDone();
            });
          }}
        >
          Connect
        </button>
        {testResult !== null && (
          <span className={`text-[12px] ${testResult.startsWith('✓') ? 'text-green-700' : 'text-red-700'}`}>
            {testResult}
          </span>
        )}
      </div>
    </div>
  );
}
