import type { Document } from 'yaml';
import { LineCounter, parseDocument } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

export interface SourceFile {
  /** Repo-relative path, e.g. `trees/calculus.yaml`. */
  path: string;
  text: string;
}

export interface ParsedYaml {
  file: string;
  doc: Document;
  lineCounter: LineCounter;
  /** Plain-JS value of the document; undefined when parsing failed or the doc is cyclic. */
  value: unknown;
  diagnostics: Diagnostic[];
}

function isCyclic(root: unknown): boolean {
  const inStack = new Set<object>();
  const visit = (v: unknown): boolean => {
    if (typeof v !== 'object' || v === null) return false;
    if (inStack.has(v)) return true;
    inStack.add(v);
    const values = Array.isArray(v) ? v : Object.values(v);
    for (const child of values) if (visit(child)) return true;
    inStack.delete(v);
    return false;
  };
  return visit(root);
}

export function parseYamlSource(source: SourceFile): ParsedYaml {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source.text, { lineCounter });
  const diagnostics: Diagnostic[] = [];

  for (const err of [...doc.errors, ...doc.warnings]) {
    const isError = doc.errors.includes(err);
    const pos = err.linePos?.[0];
    diagnostics.push({
      code: err.code === 'DUPLICATE_KEY' ? 'E-YAML-DUPKEY' : 'E-YAML-SYNTAX',
      severity: isError ? 'error' : 'warning',
      file: source.path,
      line: pos?.line,
      col: pos?.col,
      message: err.message.split('\n')[0] ?? err.message,
    });
  }

  let value: unknown;
  if (doc.errors.length === 0) {
    value = doc.toJS();
    if (isCyclic(value)) {
      diagnostics.push({
        code: 'E-YAML-SYNTAX',
        severity: 'error',
        file: source.path,
        line: 1,
        col: 1,
        message: 'recursive YAML anchors are not supported',
      });
      value = undefined;
    }
  }

  return { file: source.path, doc, lineCounter, value, diagnostics };
}
