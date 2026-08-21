import type { z } from 'zod';
import { moduleDefSchema, moduleRefSchema } from '../schema/tree.ts';
import { suggestClosest } from '../util/levenshtein.ts';
import type { Diagnostic } from './diagnostics.ts';
import type { DataPath } from './locate.ts';
import { locateKey, locateValue } from './locate.ts';
import type { ParsedYaml } from './parseYaml.ts';

export type FileKind = 'forest' | 'tree';

const FOREST_KEYS = ['learntree', 'name', 'description', 'settings', 'equivalences'];
const SETTINGS_KEYS = ['countSatisfied'];
const EQ_KEYS = ['id', 'sufficient', 'satisfies', 'note'];
const TREE_KEYS = ['learntree', 'id', 'title', 'order', 'description', 'nodes'];
const NODE_KEYS = ['id', 'title', 'description', 'display', 'dependsOn', 'categories', 'children'];
const CATEGORY_KEYS = ['name', 'modules'];
const MODULE_KEYS = ['id', 'title', 'url', 'tag', 'section', 'difficulty', 'weight', 'aliases', 'ref'];

function lastString(path: DataPath): string | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    const seg = path[i];
    if (typeof seg === 'string') return seg;
  }
  return undefined;
}

function expectedKeysAt(kind: FileKind, path: DataPath): string[] {
  switch (lastString(path)) {
    case undefined:
      return kind === 'forest' ? FOREST_KEYS : TREE_KEYS;
    case 'settings':
      return SETTINGS_KEYS;
    case 'equivalences':
      return EQ_KEYS;
    case 'nodes':
    case 'children':
      return NODE_KEYS;
    case 'categories':
      return CATEGORY_KEYS;
    case 'modules':
      return MODULE_KEYS;
    default:
      return [];
  }
}

function isIdPath(path: DataPath): boolean {
  const last = path[path.length - 1];
  if (last === 'id' || last === 'ref') return true;
  if (typeof last === 'number') {
    const field = path[path.length - 2];
    return (
      field === 'aliases' || field === 'dependsOn' || field === 'sufficient' || field === 'satisfies'
    );
  }
  return false;
}

function valueAt(root: unknown, path: DataPath): unknown {
  let cur = root;
  for (const seg of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  return typeof v === 'object' ? 'a mapping' : typeof v;
}

/**
 * Convert zod issues into positioned, coded diagnostics. Handles the
 * def-vs-ref module union by dispatching on the presence of a `ref` key in
 * the raw value, so authors see errors from the branch they meant.
 */
export function mapZodIssues(
  parsed: ParsedYaml,
  kind: FileKind,
  rawRoot: unknown,
  issues: readonly z.core.$ZodIssue[],
  basePath: DataPath = [],
): Diagnostic[] {
  const out: Diagnostic[] = [];

  for (const issue of issues) {
    const path: DataPath = [...basePath, ...(issue.path as Array<string | number>)];
    const raw = valueAt(rawRoot, path);
    const at = () => locateValue(parsed, path);
    const field = String(path[path.length - 1] ?? '');
    const push = (
      code: string,
      message: string,
      opts: { hint?: string | undefined; pos?: { line: number; col: number } | undefined } = {},
    ) => {
      const pos = opts.pos ?? at();
      out.push({
        code,
        severity: 'error',
        file: parsed.file,
        line: pos?.line,
        col: pos?.col,
        message,
        hint: opts.hint,
      });
    };

    switch (issue.code) {
      case 'invalid_union': {
        // Only module entries are unions: dispatch by the branch the author meant.
        if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
          if ('ref' in raw) {
            const extras = Object.keys(raw).filter((k) => k !== 'ref');
            if (extras.length > 0) {
              push(
                'E-REF-OVERRIDE',
                `a module reference may only contain 'ref' — remove ${extras.map((k) => `'${k}'`).join(', ')}`,
                {
                  hint: 'refs reuse an existing module definition verbatim; to change fields, edit the original definition',
                  pos: locateKey(parsed, path, extras[0]!),
                },
              );
            }
            const sub = moduleRefSchema.safeParse(raw);
            if (!sub.success) {
              const nonExtra = sub.error.issues.filter((i) => i.code !== 'unrecognized_keys');
              out.push(...mapZodIssues(parsed, kind, rawRoot, nonExtra, path));
            }
          } else {
            const sub = moduleDefSchema.safeParse(raw);
            if (!sub.success) out.push(...mapZodIssues(parsed, kind, rawRoot, sub.error.issues, path));
          }
        } else {
          push('E-SCHEMA-TYPE', `expected a module definition or reference, got ${describe(raw)}`);
        }
        break;
      }

      case 'unrecognized_keys': {
        const expected = expectedKeysAt(kind, path);
        for (const key of issue.keys) {
          const suggestion = suggestClosest(key, expected);
          push('E-SCHEMA-UNKNOWN-KEY', `unknown key '${key}'`, {
            hint: suggestion ? `did you mean '${suggestion}'?` : undefined,
            pos: locateKey(parsed, path, key),
          });
        }
        break;
      }

      case 'invalid_type': {
        if (raw === undefined) {
          const parentPath = path.slice(0, -1);
          push('E-SCHEMA-REQUIRED', `missing required field '${field}'`, {
            pos: locateValue(parsed, parentPath),
          });
        } else {
          push('E-SCHEMA-TYPE', `'${field}' expected ${issue.expected}, got ${describe(raw)}`);
        }
        break;
      }

      case 'invalid_value': {
        if (field === 'learntree') {
          push('E-VERSION-UNSUPPORTED', `unsupported format version ${JSON.stringify(raw)}`, {
            hint: 'this LearnTree build supports `learntree: 1`',
          });
        } else {
          const values = issue.values.map((v) => JSON.stringify(v)).join(', ');
          const suggestion =
            typeof raw === 'string'
              ? suggestClosest(
                  raw,
                  issue.values.filter((v): v is string => typeof v === 'string'),
                )
              : undefined;
          push('E-SCHEMA-ENUM', `'${field}' must be one of: ${values}`, {
            hint: suggestion ? `did you mean '${suggestion}'?` : undefined,
          });
        }
        break;
      }

      case 'invalid_format': {
        if (issue.format === 'url') {
          push('E-URL-INVALID', `'${field}' is not a valid URL`);
        } else if (isIdPath(path)) {
          push(
            'E-ID-FORMAT',
            `'${String(raw)}' is not a valid id — use kebab-case (lowercase letters/digits separated by single hyphens)`,
          );
        } else {
          push('E-SCHEMA-TYPE', issue.message);
        }
        break;
      }

      case 'too_small': {
        if (field === 'weight') {
          push('E-WEIGHT-INVALID', 'weight must be a finite number greater than 0');
        } else if (lastString(path) === 'sufficient' || lastString(path) === 'satisfies') {
          push('E-EQ-EMPTY-SET', `'${lastString(path)}' must list at least one module id`);
        } else if (issue.origin === 'string') {
          push('E-SCHEMA-TYPE', `'${field}' must be a non-empty string`);
        } else {
          push('E-SCHEMA-TYPE', `'${field}' ${issue.message.toLowerCase()}`);
        }
        break;
      }

      case 'too_big': {
        if (isIdPath(path)) {
          push('E-ID-FORMAT', `id is too long (max 64 characters)`);
        } else {
          push('E-SCHEMA-TYPE', `'${field}' ${issue.message.toLowerCase()}`);
        }
        break;
      }

      default:
        push('E-SCHEMA-TYPE', issue.message);
    }
  }

  return out;
}
