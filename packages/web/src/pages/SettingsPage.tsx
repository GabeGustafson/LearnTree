import { sortDiagnostics } from '@learntree/core';
import { useAppStore } from '../state/store.ts';

const SEVERITY_STYLE = {
  error: 'text-red-700',
  warning: 'text-amber-700',
  info: 'text-sky-700',
} as const;

export function SettingsPage() {
  const provider = useAppStore((s) => s.provider);
  const forest = useAppStore((s) => s.forest);
  const diagnostics = useAppStore((s) => s.diagnostics);

  return (
    <main className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-3xl space-y-8">
        <section>
          <h2 className="text-base font-semibold">Data source</h2>
          <div className="mt-2 rounded-lg border border-neutral-200 p-4 text-[13px]">
            <div>
              Connected to: <span className="font-medium">{provider.label}</span>
            </div>
            <p className="mt-1 text-neutral-500">
              Local folder mode (M4) and GitHub sync (M5) arrive in upcoming milestones.
            </p>
          </div>
        </section>

        {forest !== null && (
          <section>
            <h2 className="text-base font-semibold">Forest settings</h2>
            <div className="mt-2 rounded-lg border border-neutral-200 p-4 text-[13px]">
              <div>
                countSatisfied:{' '}
                <code className="rounded bg-neutral-100 px-1.5 py-0.5">
                  {forest.settings.countSatisfied}
                </code>
              </div>
              <p className="mt-1 text-neutral-500">
                Set in <code>forest.yaml</code> (agent-owned) — the app never edits content files.
              </p>
            </div>
          </section>
        )}

        <section>
          <h2 className="text-base font-semibold">
            Diagnostics <span className="font-normal text-neutral-400">({diagnostics.length})</span>
          </h2>
          <div className="mt-2 rounded-lg border border-neutral-200 p-4">
            {diagnostics.length === 0 ? (
              <p className="text-[13px] text-neutral-500">No problems found.</p>
            ) : (
              <ul className="space-y-1.5 font-mono text-[11.5px]">
                {sortDiagnostics(diagnostics).map((d, i) => (
                  <li key={i}>
                    <span className={SEVERITY_STYLE[d.severity]}>{d.severity}</span>{' '}
                    <span className="text-neutral-500">
                      {d.file}
                      {d.line !== undefined ? `:${d.line}` : ''}
                    </span>{' '}
                    <span className="font-semibold">{d.code}</span> {d.message}
                    {d.hint !== undefined && (
                      <div className="pl-4 text-neutral-400">↳ {d.hint}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
