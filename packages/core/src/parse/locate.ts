import { isCollection, isNode, isScalar } from 'yaml';
import type { ParsedYaml } from './parseYaml.ts';

export type DataPath = ReadonlyArray<string | number>;

export interface Position {
  line: number;
  col: number;
}

function posOfOffset(parsed: ParsedYaml, offset: number | undefined): Position | undefined {
  if (offset === undefined) return undefined;
  const { line, col } = parsed.lineCounter.linePos(offset);
  return { line, col };
}

/** Position of the value at `path` (falls back to shorter prefixes, then doc start). */
export function locateValue(parsed: ParsedYaml, path: DataPath): Position | undefined {
  for (let end = path.length; end >= 0; end--) {
    const node = parsed.doc.getIn(path.slice(0, end), true);
    if (isNode(node) && node.range) return posOfOffset(parsed, node.range[0]);
  }
  const root = parsed.doc.contents;
  if (isNode(root) && root.range) return posOfOffset(parsed, root.range[0]);
  return { line: 1, col: 1 };
}

/** Position of a map key `key` inside the object at `path` — more precise than the object itself. */
export function locateKey(parsed: ParsedYaml, path: DataPath, key: string): Position | undefined {
  const map = parsed.doc.getIn(path, true);
  if (isCollection(map)) {
    for (const item of map.items) {
      const k = (item as { key?: unknown }).key;
      if (isScalar(k) && k.value === key && k.range) return posOfOffset(parsed, k.range[0]);
    }
  }
  return locateValue(parsed, path);
}
