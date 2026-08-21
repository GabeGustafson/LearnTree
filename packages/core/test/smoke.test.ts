import { expect, test } from 'vitest';
import { loadForest } from '../src/index.ts';

test('core imports and loads an empty forest', () => {
  const forest = loadForest([]);
  expect(forest.trees).toEqual([]);
  expect(forest.diagnostics.some((d) => d.code === 'E-FOREST-MISSING')).toBe(true);
});
