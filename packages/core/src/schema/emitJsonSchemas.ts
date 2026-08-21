import { z } from 'zod';
import { forestFileSchema } from './forest.ts';
import { progressDocSchema } from './progress.ts';
import { treeFileSchema } from './tree.ts';

export interface JsonSchemaArtifacts {
  /** File name → JSON Schema object (draft 2020-12). */
  [file: string]: Record<string, unknown>;
}

function emit(schema: z.ZodType, title: string, description: string): Record<string, unknown> {
  const out = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    cycles: 'ref',
    reused: 'ref',
  }) as Record<string, unknown>;
  return { title, description, ...out };
}

/** Artifacts consumed by editors/agents via yaml-language-server modelines. */
export function emitJsonSchemas(): JsonSchemaArtifacts {
  return {
    'forest.schema.json': emit(
      forestFileSchema,
      'LearnTree forest',
      'Forest metadata, settings, and cross-tree equivalences (forest.yaml).',
    ),
    'tree.schema.json': emit(
      treeFileSchema,
      'LearnTree tree',
      'A learning tree: nested nodes with categorized atomic modules (trees/<tree-id>.yaml).',
    ),
    'progress.schema.json': emit(
      progressDocSchema,
      'LearnTree progress',
      'App-owned completion state (.learntree/progress.json). Do not edit by hand.',
    ),
  };
}
