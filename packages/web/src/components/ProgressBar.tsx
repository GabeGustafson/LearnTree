export function ProgressBar({ pct, className }: { pct: number | null; className?: string }) {
  return (
    <div className={`h-1.5 rounded-full bg-neutral-200 ${className ?? ''}`}>
      {pct !== null && (
        <div
          className="h-full rounded-full bg-neutral-900 transition-[width] duration-300"
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      )}
    </div>
  );
}

export function pctLabel(pct: number | null): string {
  return pct === null ? '—' : `${Math.round(pct * 100)}%`;
}
