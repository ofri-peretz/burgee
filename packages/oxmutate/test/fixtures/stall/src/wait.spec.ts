import { expect, it } from 'vitest';

import { ready } from './wait.js';

// Awaits a promise one mutant never settles: the worker sits idle, its event loop turning and no CPU
// spent, until Vitest's own test timeout would fail the test. A hang, not a slow test (heartbeat.ts).
it('is ready', async () => {
  expect(await ready).toBe('done');
});
