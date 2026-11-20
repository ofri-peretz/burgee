import { beforeAll, expect, it } from 'vitest';

import { label } from './label.js';

// The dry run counts every mutant switch a test reaches, so a project's code runs slower there than
// in the project's own run. This stands in for that slowdown: in the dry run (OXMUTATE_MODE, child.ts)
// the hook and the test each take 1.5x the config's 200 ms timeouts, and no time at all otherwise.
const SLOWED_MS = 300;
const dry = process.env['OXMUTATE_MODE'] === 'dry';
const slowed = async (): Promise<void> => {
  if (dry) await new Promise((resolve) => setTimeout(resolve, SLOWED_MS));
};

beforeAll(slowed);

it('labels the count', async () => {
  await slowed();
  expect(label(2)).toBe('2 items');
});
