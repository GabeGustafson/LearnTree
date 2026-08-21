import { expect, test } from 'vitest';

// M0 checkpoint from the plan: confirm the hash-router API exists on the
// installed react-router major (fallback would be wouter).
test('createHashRouter is exported by react-router', async () => {
  const mod = await import('react-router');
  expect(typeof mod.createHashRouter).toBe('function');
});
