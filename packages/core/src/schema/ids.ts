import { z } from 'zod';

/** kebab-case: lowercase alphanumerics separated by single hyphens. */
export const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_ID_LENGTH = 64;

export const idSchema = z
  .string()
  .max(MAX_ID_LENGTH)
  .regex(ID_RE, 'must be kebab-case: lowercase letters/digits separated by single hyphens');

/** Forest-unique atomic-module identifier. */
export type ModuleId = string;
/** Tree-unique node identifier (independent namespace from modules). */
export type NodeId = string;
export type TreeId = string;
