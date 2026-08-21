import { describe, expect, test } from 'vitest';
import { loadForest } from '../src/index.ts';
import { FOREST_MIN, forest, tree, y } from './helpers.ts';

const TREE_A = y`
  learntree: 1
  id: alpha
  title: Alpha
  order: 20
  nodes:
    - id: g
      title: Group
      children:
        - id: n1
          title: N1
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: "https://example.com/1"
                - id: m2
                  title: M2
                  url: "https://example.com/2"
                  weight: 3
            - name: Problems
              modules:
                - ref: m1
        - id: n2
          title: N2
          categories:
            - name: Resources
              modules:
                - ref: m2
`;

const TREE_B = y`
  learntree: 1
  id: beta
  title: Beta
  order: 10
  nodes:
    - id: solo
      title: Solo
      categories:
        - name: Resources
          modules:
            - ref: m1
            - id: m3
              title: M3
              section: "Ch. 2"
`;

describe('loadForest', () => {
  test('resolves a multi-tree forest with shared modules', () => {
    const f = loadForest([FOREST_MIN, tree('alpha', TREE_A), tree('beta', TREE_B)]);
    expect(f.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    expect(f.trees.map((t) => t.id)).toEqual(['beta', 'alpha']); // sorted by order
    expect(f.registry.size).toBe(3);
    expect(f.registry.get('m1')?.occurrences).toHaveLength(3); // def + 2 refs

    const alpha = f.trees.find((t) => t.id === 'alpha')!;
    expect(alpha.moduleIds.sort()).toEqual(['m1', 'm2']);
    const g = alpha.nodeIndex.get('g')!;
    expect(g.display).toBe('group');
    expect(g.ownModuleIds).toEqual([]);
    expect(g.subtreeModuleIds.sort()).toEqual(['m1', 'm2']);
    const n1 = alpha.nodeIndex.get('n1')!;
    expect(n1.display).toBe('card');
    expect(n1.ownModuleIds.sort()).toEqual(['m1', 'm2']); // m1 counted once despite 2 categories
  });

  test('quarantines a broken tree while the rest still loads', () => {
    const f = loadForest([
      FOREST_MIN,
      tree('alpha', TREE_A),
      tree('broken', 'learntree: 1\nid: [\n'),
    ]);
    expect(f.quarantinedFiles).toEqual(['trees/broken.yaml']);
    expect(f.trees.map((t) => t.id)).toEqual(['alpha']);
    expect(f.diagnostics.some((d) => d.code === 'E-YAML-SYNTAX')).toBe(true);
  });

  test('unknown refs are dropped from resolved nodes (best-effort render)', () => {
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
                - ref: missing
    `;
    const f = loadForest([FOREST_MIN, tree('t', t)]);
    expect(f.diagnostics.some((d) => d.code === 'E-REF-UNKNOWN')).toBe(true);
    expect(f.trees[0]!.nodeIndex.get('a')!.ownModuleIds).toEqual(['m1']);
  });

  test('forest settings default and parse', () => {
    expect(loadForest([FOREST_MIN]).settings.countSatisfied).toBe('complete');
    const f = loadForest([
      forest('learntree: 1\nname: F\nsettings:\n  countSatisfied: manual-only\n'),
    ]);
    expect(f.settings.countSatisfied).toBe('manual-only');
  });

  test('quarantined forest.yaml falls back to defaults but keeps trees', () => {
    const f = loadForest([forest('learntree: 1\nname: [broken\n'), tree('alpha', TREE_A)]);
    expect(f.quarantinedFiles).toContain('forest.yaml');
    expect(f.name).toBe('Learning Forest');
    expect(f.trees).toHaveLength(1);
  });

  test('display can be forced to card with children', () => {
    const t = y`
      learntree: 1
      id: t
      title: T
      nodes:
        - id: p
          title: P
          display: card
          categories:
            - name: Resources
              modules:
                - id: m1
                  title: M1
                  url: "https://example.com"
          children:
            - id: c
              title: C
              categories:
                - name: Resources
                  modules:
                    - ref: m1
    `;
    const f = loadForest([FOREST_MIN, tree('t', t)]);
    expect(f.trees[0]!.nodeIndex.get('p')!.display).toBe('card');
  });
});
