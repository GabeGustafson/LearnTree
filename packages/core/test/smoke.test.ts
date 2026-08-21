import { expect, test } from 'vitest';
import { CORE_VERSION } from '../src/index.ts';

test('core imports', () => {
  expect(CORE_VERSION).toBeTruthy();
});
