import type { ModuleStatus } from '@learntree/core';

interface Props {
  status: ModuleStatus;
  onToggle: (done: boolean) => void;
  disabled?: boolean;
}

/**
 * The four completion visuals:
 *  - green check  — manually completed (click to uncheck)
 *  - grey check   — auto-satisfied via an equivalence (click to check manually)
 *  - partial ring — % of a sufficient set done (tooltip lists what is missing)
 *  - empty box    — untouched
 */
export function StatusCheckbox({ status, onToggle, disabled }: Props) {
  const base =
    'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] leading-none transition-colors';
  const click = () => {
    if (disabled) return;
    onToggle(status.kind !== 'done');
  };

  switch (status.kind) {
    case 'done':
      return (
        <button
          type="button"
          onClick={click}
          title={`Completed ${new Date(status.at).toLocaleDateString()}`}
          className={`${base} border-green-600 bg-green-600 text-white hover:bg-green-700`}
        >
          ✓
        </button>
      );
    case 'satisfied':
      return (
        <button
          type="button"
          onClick={click}
          title={`Satisfied via equivalence “${status.via}” — click to mark done yourself`}
          className={`${base} border-neutral-400 bg-neutral-400 text-white hover:bg-neutral-500`}
        >
          ✓
        </button>
      );
    case 'partial': {
      const pct = Math.floor(status.coverage * 100);
      return (
        <button
          type="button"
          onClick={click}
          title={`${pct}% of sufficient material done (via “${status.via}”). Missing: ${status.missing.join(', ')}`}
          className={`${base} relative border-neutral-300 bg-white text-[9px] font-semibold text-neutral-600 hover:border-neutral-500`}
          style={{
            background: `conic-gradient(rgb(163 163 163) ${pct * 3.6}deg, transparent 0deg)`,
          }}
        >
          <span className="absolute inset-[3px] flex items-center justify-center rounded-sm bg-white">
            {pct}
          </span>
        </button>
      );
    }
    case 'none':
      return (
        <button
          type="button"
          onClick={click}
          title="Mark done"
          className={`${base} border-neutral-300 bg-white hover:border-neutral-500`}
        />
      );
  }
}
