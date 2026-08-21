import { describe, expect, test } from 'vitest';
import type { Diagnostic, SourceFile } from '../src/index.ts';
import { loadForest } from '../src/index.ts';
import { FOREST_MIN, forest, tree, y } from './helpers.ts';

interface Want {
  code: string;
  file?: string;
  line?: number;
  col?: number;
  severity?: Diagnostic['severity'];
  msg?: string;
  hint?: string;
}

function expectDiag(files: SourceFile[], want: Want): Diagnostic {
  const all = loadForest(files).diagnostics;
  const found = all.find(
    (d) => d.code === want.code && (want.file === undefined || d.file === want.file),
  );
  expect(
    found,
    `expected ${want.code}${want.file ? ` in ${want.file}` : ''}; got:\n${all
      .map((d) => `  ${d.file}:${d.line ?? '?'} ${d.code} ${d.message}`)
      .join('\n')}`,
  ).toBeDefined();
  const d = found as Diagnostic;
  if (want.line !== undefined) expect(d.line, `line of ${want.code}`).toBe(want.line);
  if (want.col !== undefined) expect(d.col, `col of ${want.code}`).toBe(want.col);
  if (want.severity !== undefined) expect(d.severity).toBe(want.severity);
  if (want.msg !== undefined) expect(d.message).toContain(want.msg);
  if (want.hint !== undefined) expect(d.hint ?? '').toContain(want.hint);
  return d;
}

const VALID_MODULE = y`
  learntree: 1
  id: t
  title: T
  nodes:
    - id: a
      title: A
      categories:
        - name: Resources
          modules:
            - id: m1
              title: M1
              url: "https://example.com"
`;

describe('parse rules', () => {
  test('E-YAML-SYNTAX', () => {
    expectDiag([FOREST_MIN, tree('t', 'learntree: 1\nid: t\ntitle: T\nnodes: [\n')], {
      code: 'E-YAML-SYNTAX',
      file: 'trees/t.yaml',
      severity: 'error',
    });
  });

  test('E-YAML-DUPKEY', () => {
    const text = y`
      learntree: 1
      id: t
      title: Once
      title: Twice
      nodes:
        - id: a
          title: A
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-YAML-DUPKEY',
      file: 'trees/t.yaml',
      line: 4,
    });
  });

  test('recursive anchors are rejected, not crashed on', () => {
    expectDiag([FOREST_MIN, tree('t', 'learntree: 1\nid: t\ntitle: T\nnodes: &a [{id: x, title: X, children: *a}]\n')], {
      code: 'E-YAML-SYNTAX',
      file: 'trees/t.yaml',
      msg: 'recursive',
    });
  });
});

describe('schema rules', () => {
  test('E-VERSION-UNSUPPORTED', () => {
    const text = y`
      learntree: 2
      id: t
      title: T
      nodes:
        - id: a
          title: A
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-VERSION-UNSUPPORTED',
      file: 'trees/t.yaml',
      line: 1,
      hint: 'learntree: 1',
    });
  });

  test('E-SCHEMA-REQUIRED (missing node title)', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-SCHEMA-REQUIRED',
      file: 'trees/t.yaml',
      line: 5,
      col: 5,
      msg: "'title'",
    });
  });

  test('E-SCHEMA-TYPE (title is a list)', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: [1, 2]
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-SCHEMA-TYPE',
      file: 'trees/t.yaml',
      line: 6,
      msg: "'title'",
    });
  });

  test('E-SCHEMA-UNKNOWN-KEY with did-you-mean', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          descripton: oops
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-SCHEMA-UNKNOWN-KEY',
      file: 'trees/t.yaml',
      line: 7,
      col: 5,
      msg: "'descripton'",
      hint: "did you mean 'description'?",
    });
  });

  test('E-SCHEMA-ENUM (module difficulty) with did-you-mean', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: "https://example.com"
                  difficulty: hardd
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-SCHEMA-ENUM',
      file: 'trees/t.yaml',
      line: 13,
      msg: "'difficulty'",
      hint: "did you mean 'hard'?",
    });
  });

  test('E-ID-FORMAT (module id)', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: Bad_Id
                  title: M1
                  url: "https://example.com"
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-ID-FORMAT',
      file: 'trees/t.yaml',
      line: 10,
      msg: 'Bad_Id',
    });
  });

  test('E-URL-INVALID', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: not a url
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-URL-INVALID',
      file: 'trees/t.yaml',
      line: 12,
    });
  });

  test('E-WEIGHT-INVALID', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: "https://example.com"
                  weight: 0
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-WEIGHT-INVALID',
      file: 'trees/t.yaml',
      line: 13,
      msg: 'greater than 0',
    });
  });

  test('E-SCHEMA-TYPE (module entry is a scalar)', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - 42
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-SCHEMA-TYPE',
      file: 'trees/t.yaml',
      line: 10,
      msg: 'module definition or reference',
    });
  });
});

describe('reference rules', () => {
  test('E-REF-OVERRIDE', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: "https://example.com"
                - ref: m1
                  weight: 2
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-REF-OVERRIDE',
      file: 'trees/t.yaml',
      line: 14,
      msg: "'weight'",
    });
  });

  test('E-REF-UNKNOWN with did-you-mean', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: alpha-one
                  title: M1
                  url: "https://example.com"
                - ref: alpha-on
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-REF-UNKNOWN',
      file: 'trees/t.yaml',
      line: 13,
      hint: "did you mean 'alpha-one'?",
    });
  });

  test('E-DEP-SELF', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          dependsOn: [a]
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-DEP-SELF',
      file: 'trees/t.yaml',
      line: 7,
    });
  });

  test('E-DEP-UNKNOWN with did-you-mean', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: alpha
          title: A
        - id: beta
          title: B
          dependsOn: [alph]
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-DEP-UNKNOWN',
      file: 'trees/t.yaml',
      line: 9,
      hint: "did you mean 'alpha'?",
    });
  });

  test('E-DEP-CROSS-TREE', () => {
    const t1 = y`
      learntree: 1
      id: t1
      title: T1
      nodes:
        - id: shared-node
          title: S
    `;
    const t2 = y`
      learntree: 1
      id: t2
      title: T2
      nodes:
        - id: b
          title: B
          dependsOn: [shared-node]
    `;
    expectDiag([FOREST_MIN, tree('t1', t1), tree('t2', t2)], {
      code: 'E-DEP-CROSS-TREE',
      file: 'trees/t2.yaml',
      line: 7,
      msg: "lives in tree 't1'",
      hint: 'equivalences',
    });
  });

  test('E-DEP-CYCLE (dependsOn contradicts group order)', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: g
          title: G
          display: group
          children:
            - id: a
              title: A
              dependsOn: [b]
            - id: b
              title: B
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-DEP-CYCLE',
      file: 'trees/t.yaml',
      msg: '→',
    });
  });
});

describe('structure rules', () => {
  test('E-NODE-ID-DUP', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
        - id: a
          title: A2
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-NODE-ID-DUP',
      file: 'trees/t.yaml',
      line: 7,
    });
  });

  test('E-CATEGORY-DUP', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: "https://example.com"
            - name: Resources
              modules:
                - ref: m1
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-CATEGORY-DUP',
      file: 'trees/t.yaml',
      line: 13,
    });
  });

  test('W-CATEGORY-EMPTY', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules: []
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'W-CATEGORY-EMPTY',
      file: 'trees/t.yaml',
      line: 8,
      severity: 'warning',
    });
  });

  test('W-NODE-EMPTY', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'W-NODE-EMPTY',
      file: 'trees/t.yaml',
      line: 5,
      severity: 'warning',
    });
  });

  test('W-NODE-EMPTY does not fire for description-only cards', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: intro
          title: Introduction
          description: |
            Welcome.
    `;
    const diags = loadForest([FOREST_MIN, tree('t', text)]).diagnostics;
    expect(diags.filter((d) => d.code === 'W-NODE-EMPTY')).toEqual([]);
  });

  test('W-TREE-ID-FILENAME-MISMATCH', () => {
    expectDiag([FOREST_MIN, { path: 'trees/other.yaml', text: VALID_MODULE }], {
      code: 'W-TREE-ID-FILENAME-MISMATCH',
      file: 'trees/other.yaml',
      line: 2,
      severity: 'warning',
      hint: 'trees/t.yaml',
    });
  });

  test('E-TREE-ID-DUP quarantines the second file', () => {
    const files = [
      FOREST_MIN,
      tree('t', VALID_MODULE),
      { path: 'trees/copy.yaml', text: VALID_MODULE },
    ];
    expectDiag(files, { code: 'E-TREE-ID-DUP', file: 'trees/copy.yaml', line: 2 });
    const f = loadForest(files);
    expect(f.trees).toHaveLength(1);
    expect(f.quarantinedFiles).toContain('trees/copy.yaml');
  });

  test('W-ORDER-DUP', () => {
    const t1 = y`
      learntree: 1
      id: t1
      title: T1
      order: 5
      nodes:
        - id: a
          title: A
    `;
    const t2 = y`
      learntree: 1
      id: t2
      title: T2
      order: 5
      nodes:
        - id: b
          title: B
    `;
    expectDiag([FOREST_MIN, tree('t1', t1), tree('t2', t2)], {
      code: 'W-ORDER-DUP',
      file: 'trees/t2.yaml',
      severity: 'warning',
    });
  });

  test('W-CATEGORY-CASE', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: "https://example.com"
        - id: b
          title: B
          categories:
            - name: resources
              modules:
                - ref: m1
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'W-CATEGORY-CASE',
      file: 'trees/t.yaml',
      severity: 'warning',
    });
  });
});

describe('module rules', () => {
  test('E-DUP-MODULE-DIVERGENT names the differing fields and both locations', () => {
    const t1 = y`
      learntree: 1
      id: t1
      title: T1
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: shared
                  title: First Title
                  url: "https://example.com"
    `;
    const t2 = y`
      learntree: 1
      id: t2
      title: T2
      nodes:
        - id: b
          title: B
          categories:
            - name: Resources
              modules:
                - id: shared
                  title: Second Title
                  url: "https://example.com"
    `;
    expectDiag([FOREST_MIN, tree('t1', t1), tree('t2', t2)], {
      code: 'E-DUP-MODULE-DIVERGENT',
      file: 'trees/t2.yaml',
      line: 10,
      msg: 'differs in: title',
      hint: "'- ref: shared'",
    });
  });

  test('identical duplicate definitions merge silently', () => {
    const mk = (treeId: string, nodeId: string) => y`
      learntree: 1
      id: ${treeId}
      title: T
      nodes:
        - id: ${nodeId}
          title: A
          categories:
            - name: Resources
              modules:
                - id: shared
                  title: Same
                  url: "https://example.com"
                  weight: 2
    `;
    const f = loadForest([FOREST_MIN, tree('t1', mk('t1', 'a')), tree('t2', mk('t2', 'b'))]);
    expect(f.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(f.registry.get('shared')?.occurrences).toHaveLength(2);
  });

  test('E-ALIAS-COLLISION', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: "https://example.com"
                - id: m2
                  title: M2
                  url: "https://example.com"
                  aliases: [m1]
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-ALIAS-COLLISION',
      file: 'trees/t.yaml',
      msg: "'m1'",
    });
  });

  test('E-ALIAS-DUP', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: "https://example.com"
                  aliases: [old-m]
                - id: m2
                  title: M2
                  url: "https://example.com"
                  aliases: [old-m]
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'E-ALIAS-DUP',
      file: 'trees/t.yaml',
      msg: "'old-m'",
    });
  });

  test('W-MODULE-NO-POINTER', () => {
    const text = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
    `;
    expectDiag([FOREST_MIN, tree('t', text)], {
      code: 'W-MODULE-NO-POINTER',
      file: 'trees/t.yaml',
      line: 10,
      severity: 'warning',
    });
  });
});

describe('forest & equivalence rules', () => {
  test('E-FOREST-MISSING', () => {
    expectDiag([tree('t', VALID_MODULE)], {
      code: 'E-FOREST-MISSING',
      file: 'forest.yaml',
      hint: 'learntree: 1',
    });
  });

  test('E-SCHEMA-REQUIRED (forest name)', () => {
    expectDiag([forest('learntree: 1\n'), tree('t', VALID_MODULE)], {
      code: 'E-SCHEMA-REQUIRED',
      file: 'forest.yaml',
      msg: "'name'",
    });
  });

  test('E-EQ-EMPTY-SET', () => {
    const f = y`
      learntree: 1
      name: F
      equivalences:
        - id: e1
          sufficient: []
          satisfies: [m1]
    `;
    expectDiag([forest(f), tree('t', VALID_MODULE)], {
      code: 'E-EQ-EMPTY-SET',
      file: 'forest.yaml',
      line: 5,
    });
  });

  test('E-EQ-UNKNOWN-MODULE with did-you-mean', () => {
    const f = y`
      learntree: 1
      name: F
      equivalences:
        - id: e1
          sufficient: [m2]
          satisfies: [m1]
    `;
    expectDiag([forest(f), tree('t', VALID_MODULE)], {
      code: 'E-EQ-UNKNOWN-MODULE',
      file: 'forest.yaml',
      line: 4,
      msg: "'m2' in 'sufficient'",
      hint: "did you mean 'm1'?",
    });
  });

  test('E-EQ-UNKNOWN-MODULE points at the canonical id when an alias is referenced', () => {
    const t = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: a
          title: A
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: "https://example.com"
                  aliases: [old-name]
    `;
    const f = y`
      learntree: 1
      name: F
      equivalences:
        - id: e1
          sufficient: [old-name]
          satisfies: [m1]
    `;
    expectDiag([forest(f), tree('t', t)], {
      code: 'E-EQ-UNKNOWN-MODULE',
      file: 'forest.yaml',
      hint: "alias of 'm1'",
    });
  });

  test('E-EQ-ID-DUP', () => {
    const f = y`
      learntree: 1
      name: F
      equivalences:
        - id: e1
          sufficient: [m1]
          satisfies: [m1]
        - id: e1
          sufficient: [m1]
          satisfies: [m1]
    `;
    expectDiag([forest(f), tree('t', VALID_MODULE)], {
      code: 'E-EQ-ID-DUP',
      file: 'forest.yaml',
      line: 7,
    });
  });

  test('W-EQ-SELF', () => {
    const f = y`
      learntree: 1
      name: F
      equivalences:
        - id: e1
          sufficient: [m1]
          satisfies: [m1]
    `;
    expectDiag([forest(f), tree('t', VALID_MODULE)], {
      code: 'W-EQ-SELF',
      file: 'forest.yaml',
      severity: 'warning',
    });
  });

  test('W-FILE-IGNORED', () => {
    expectDiag([FOREST_MIN, tree('t', VALID_MODULE), { path: 'stray.yaml', text: 'a: 1\n' }], {
      code: 'W-FILE-IGNORED',
      file: 'stray.yaml',
      severity: 'warning',
    });
  });
});
