import { spawnSync } from 'node:child_process';

import { expect, it } from 'vitest';

import { size } from './size.js';

// Under a mutant the test blocks in a synchronous child for 1.2 s: past the warm budget (600 ms plus
// three times the dry run's few milliseconds) but inside the 3x its re-run would get. The worker
// burns no CPU while it waits, so the watchdog gives it that 3x in place instead of a server restart.
it('blocks, then checks the size', () => {
  const mode = process.env['OXMUTATE_MODE'];
  if (mode && mode !== 'dry') spawnSync('sleep', ['1.2']);
  expect(size()).toBe(2);
});
