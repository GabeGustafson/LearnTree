import { describe, expect, test } from 'vitest';
import { emitJsonSchemas } from '../src/index.ts';

describe('emitJsonSchemas', () => {
  test('emits draft 2020-12 schemas for forest, tree, and progress', () => {
    const artifacts = emitJsonSchemas();
    expect(Object.keys(artifacts).sort()).toEqual([
      'forest.schema.json',
      'progress.schema.json',
      'tree.schema.json',
    ]);
    for (const schema of Object.values(artifacts)) {
      expect(schema['$schema']).toContain('2020-12');
      expect(schema['title']).toBeTruthy();
    }
  });

  test('tree schema handles the recursive node type via $ref', () => {
    const treeSchema = JSON.stringify(emitJsonSchemas()['tree.schema.json']);
    expect(treeSchema).toContain('$ref');
    expect(treeSchema).toContain('children');
    // strict objects forbid unknown keys — the agent-typo guard survives export
    expect(treeSchema).toContain('"additionalProperties":false');
  });
});
