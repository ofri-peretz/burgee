import { expect, it } from 'vitest';

import { pause } from './pause.js';

const SLOW_MS = 1500;

// A second test over the same line, 1.5 s long: the old per-mutant budget was sized by this one.
it('pauses after a long setup', () => {
  const until = Date.now() + SLOW_MS;
  while (Date.now() < until);
  expect(pause(true)).toBeUndefined();
});
