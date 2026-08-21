import { useAppStore } from '../state/store.ts';

const STYLES: Record<string, { dot: string; label: string }> = {
  synced: { dot: 'bg-green-500', label: 'Synced' },
  pending: { dot: 'bg-amber-400', label: 'Pending…' },
  saving: { dot: 'bg-amber-500 animate-pulse', label: 'Saving…' },
  offline: { dot: 'bg-neutral-400', label: 'Offline' },
  error: { dot: 'bg-red-500', label: 'Sync error' },
};

export function SyncPill() {
  const sync = useAppStore((s) => s.sync);
  const provider = useAppStore((s) => s.provider);
  const flushSync = useAppStore((s) => s.flushSync);
  if (!provider.capabilities.write || provider.kind === 'sample') return null;
  const style = STYLES[sync.status] ?? STYLES['error']!;

  return (
    <button
      type="button"
      onClick={() => void flushSync()}
      title={sync.detail ?? (sync.status === 'offline' ? 'Changes are queued locally; click to retry' : 'Click to sync now')}
      className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label}
    </button>
  );
}
