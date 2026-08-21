import type { SourceFile } from '../src/index.ts';

/**
 * Dedenting template tag for YAML fixtures: strips the leading newline and the
 * common indent so `line: 1` in assertions is the first content line.
 */
export function y(strings: TemplateStringsArray, ...vals: unknown[]): string {
  const raw = String.raw(strings, ...vals.map(String));
  const lines = raw.split('\n');
  if (lines[0]?.trim() === '') lines.shift();
  const indents = lines
    .filter((l) => l.trim() !== '')
    .map((l) => (l.match(/^ */) as RegExpMatchArray)[0].length);
  const min = indents.length > 0 ? Math.min(...indents) : 0;
  return `${lines.map((l) => l.slice(min)).join('\n').trimEnd()}\n`;
}

export const FOREST_MIN: SourceFile = {
  path: 'forest.yaml',
  text: 'learntree: 1\nname: Test Forest\n',
};

export function tree(id: string, text: string): SourceFile {
  return { path: `trees/${id}.yaml`, text };
}

export function forest(text: string): SourceFile {
  return { path: 'forest.yaml', text };
}
