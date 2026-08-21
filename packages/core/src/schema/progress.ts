import { z } from 'zod';

export const progressEntrySchema = z.strictObject({
  state: z.enum(['done', 'undone']),
  at: z.iso.datetime(),
});
export type ProgressEntry = z.infer<typeof progressEntrySchema>;

/**
 * The app-owned completion store (`.learntree/progress.json`).
 *
 * Entries are never deleted: `undone` rows are tombstones so cross-device
 * merges cannot resurrect an uncheck, and orphaned ids survive module
 * removal/re-addition. The envelope is parsed leniently (per-entry
 * quarantine) in progress/progressDoc.ts — this schema describes the
 * well-formed shape.
 */
export const progressDocSchema = z.strictObject({
  learntree: z.literal(1),
  modules: z.record(z.string(), progressEntrySchema),
});
export type ProgressDoc = z.infer<typeof progressDocSchema>;
