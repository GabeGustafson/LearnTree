import type { Diagnostic } from '@learntree/core';
import { sortDiagnostics } from '@learntree/core';

const ESC = '\x1b';
const COLORS = { error: `${ESC}[31m`, warning: `${ESC}[33m`, info: `${ESC}[36m` } as const;
const GREEN = `${ESC}[32m`;
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;

export function useColor(): boolean {
  return process.stdout.isTTY === true && process.env['NO_COLOR'] === undefined;
}

export function formatDiagnostic(d: Diagnostic, color: boolean): string {
  const pos = d.line !== undefined ? `:${d.line}${d.col !== undefined ? `:${d.col}` : ''}` : '';
  const sev = color ? `${COLORS[d.severity]}${d.severity}${RESET}` : d.severity;
  const loc = color ? `${BOLD}${d.file}${pos}${RESET}` : `${d.file}${pos}`;
  const hint = d.hint === undefined ? '' : color ? `\n    ${DIM}${d.hint}${RESET}` : `\n    ${d.hint}`;
  return `${loc} ${sev} ${d.code}: ${d.message}${hint}`;
}

export interface Summary {
  errors: number;
  warnings: number;
  infos: number;
}

export function summarize(diagnostics: readonly Diagnostic[]): Summary {
  return {
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    infos: diagnostics.filter((d) => d.severity === 'info').length,
  };
}

export function printDiagnostics(diagnostics: readonly Diagnostic[], color: boolean): void {
  for (const d of sortDiagnostics(diagnostics)) console.log(formatDiagnostic(d, color));
  const s = summarize(diagnostics);
  if (diagnostics.length > 0) console.log('');
  const verdict =
    s.errors > 0
      ? color
        ? `${COLORS.error}✗ invalid${RESET}`
        : '✗ invalid'
      : color
        ? `${GREEN}✓ valid${RESET}`
        : '✓ valid';
  console.log(`${verdict} — ${s.errors} error(s), ${s.warnings} warning(s), ${s.infos} info(s)`);
}
