import { useEffect } from 'react';
import { Link, Outlet } from 'react-router';
import { ErrorBanner } from './components/ErrorBanner.tsx';
import { useAppStore } from './state/store.ts';

export function App() {
  const initialize = useAppStore((s) => s.initialize);
  const reload = useAppStore((s) => s.reload);
  const maybeReloadOnFocus = useAppStore((s) => s.maybeReloadOnFocus);
  const reconnectLocal = useAppStore((s) => s.reconnectLocal);
  const provider = useAppStore((s) => s.provider);
  const connection = useAppStore((s) => s.connection);
  const diagnostics = useAppStore((s) => s.diagnostics);
  const staleFiles = useAppStore((s) => s.staleFiles);

  useEffect(() => {
    void initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onFocus = () => maybeReloadOnFocus();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [maybeReloadOnFocus]);

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-900">
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-lg font-bold tracking-tight">
            learntree
          </Link>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">
            {provider.label}
          </span>
        </div>
        <nav className="flex items-center gap-3 text-[13px]">
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-md border border-neutral-200 px-2.5 py-1 text-neutral-600 hover:bg-neutral-50"
            title="Reload forest files"
          >
            ⟳ Refresh
          </button>
          <Link to="/settings" className="text-neutral-600 hover:text-neutral-900">
            Settings
          </Link>
        </nav>
      </header>
      {connection.state === 'needs-permission' && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-900">
          <span>
            Reconnect to your forest folder — the browser needs permission again after a restart.
          </span>
          <button
            type="button"
            onClick={() => void reconnectLocal()}
            className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100"
          >
            Grant access
          </button>
        </div>
      )}
      {connection.state === 'error' && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-900">
          Failed to load the forest: {connection.detail}
        </div>
      )}
      <ErrorBanner diagnostics={diagnostics} staleFiles={staleFiles} />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
