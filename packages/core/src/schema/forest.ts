import { z } from 'zod';
import { idSchema } from './ids.ts';

export const COUNT_SATISFIED_MODES = ['complete', 'fractional', 'manual-only'] as const;
export type CountSatisfiedMode = (typeof COUNT_SATISFIED_MODES)[number];
export const DEFAULT_COUNT_SATISFIED: CountSatisfiedMode = 'complete';

export const equivalenceSchema = z.strictObject({
  id: idSchema,
  sufficient: z.array(idSchema).min(1),
  satisfies: z.array(idSchema).min(1),
  note: z.string().optional(),
});
export type EquivalenceIn = z.infer<typeof equivalenceSchema>;

export const forestFileSchema = z.strictObject({
  learntree: z.literal(1),
  name: z.string().min(1),
  description: z.string().optional(),
  settings: z
    .strictObject({
      countSatisfied: z.enum(COUNT_SATISFIED_MODES).optional(),
    })
    .optional(),
  equivalences: z.array(equivalenceSchema).optional(),
});
export type ForestFileIn = z.infer<typeof forestFileSchema>;
