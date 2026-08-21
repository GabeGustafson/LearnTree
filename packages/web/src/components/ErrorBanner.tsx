import { useState } from 'react';
import type { Diagnostic } from '@learntree/core';
import { sortDiagnostics } from '@learntree/core';

interface Props {
  diagnostics: Diagnostic[];
  staleFiles: string[];
}

/**
 * Shown when the latest data has problems. The app keeps rendering the last
 * good version of broken files, so a mid-iteration agent push never blanks
 * the screen.
 */
export function ErrorBanner({ diagnostics, staleFiles }: Props) {
  const [open, setOpen] = useState(false);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length === 0 && staleFiles.length === 0) return null;

  return (
    <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-900">
      <button type="button" className="flex w-full items-center gap-2" onClick={() => setOpen(!open)}>
        <span className="font-semibold">
          {errors.length} problem{errors.length === 1 ? '' : 's'} in the forest data
        </span>
        {staleFiles.length > 0 && (
          <span className="text-red-700">
            — showing the last good version of {staleFiles.join(', ')}
          </span>
        )}
        <span className="ml-auto text-red-400">{open ? '▲' : '▼ details'}</span>
      </button>
      {open && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-[11px]">
          {sortDiagnostics(errors).map((d, i) => (
            <li key={i}>
              {d.file}
              {d.line !== undefined ? `:${d.line}${d.col !== undefined ? `:${d.col}` : ''}` : ''}{' '}
              <span className="font-semibold">{d.code}</span> {d.message}
              {d.hint !== undefined && <span className="text-red-600"> — {d.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
