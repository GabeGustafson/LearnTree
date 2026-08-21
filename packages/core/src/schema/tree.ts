import { z } from 'zod';
import { idSchema } from './ids.ts';

export const MODULE_TAGS = ['book', 'video', 'website', 'course', 'paper', 'exercise', 'other'] as const;
export type ModuleTag = (typeof MODULE_TAGS)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DEFAULT_WEIGHT = 1;

export const moduleDefSchema = z.strictObject({
  id: idSchema,
  title: z.string().min(1),
  url: z.url().optional(),
  tag: z.enum(MODULE_TAGS).optional(),
  section: z.string().min(1).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  weight: z.number().finite().positive().optional(),
  aliases: z.array(idSchema).optional(),
});
export type ModuleDefIn = z.infer<typeof moduleDefSchema>;

export const moduleRefSchema = z.strictObject({
  ref: idSchema,
});
export type ModuleRefIn = z.infer<typeof moduleRefSchema>;

export const moduleEntrySchema = z.union([moduleRefSchema, moduleDefSchema]);
export type ModuleEntryIn = z.infer<typeof moduleEntrySchema>;

// modules may be empty: agents iterate with placeholder categories, and the
// resolver downgrades that to W-CATEGORY-EMPTY instead of a hard error.
export const categorySchema = z.strictObject({
  name: z.string().min(1),
  modules: z.array(moduleEntrySchema),
});
export type CategoryIn = z.infer<typeof categorySchema>;

export const treeNodeSchema = z.strictObject({
  id: idSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  display: z.enum(['group', 'card']).optional(),
  dependsOn: z.array(idSchema).optional(),
  categories: z.array(categorySchema).optional(),
  get children() {
    return z.array(treeNodeSchema).optional();
  },
});
export type TreeNodeIn = z.infer<typeof treeNodeSchema> & { children?: TreeNodeIn[] | undefined };

export const treeFileSchema = z.strictObject({
  learntree: z.literal(1),
  id: idSchema,
  title: z.string().min(1),
  order: z.number().finite().optional(),
  description: z.string().optional(),
  nodes: z.array(treeNodeSchema).min(1),
});
export type TreeFileIn = z.infer<typeof treeFileSchema> & { nodes: TreeNodeIn[] };
