import { existsSync, writeFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { label } from './label.js';

const TEST_TIMEOUT_MS = 200;
const SLOW_MS = 1000;
const armed = process.env['__OXMUTATE_ACTIVE_MUTANT__'];

it('labels the count', () => {
  expect(label(1)).toBe('1 items');
});

// A test that is slow for no reason of the mutant's, as a loaded machine makes one. With
// OXMUTATE_SLOW_ONCE it overruns its timeout the first time each mutant is armed across the file;
// with OXMUTATE_SLOW_ALWAYS, every time. It asserts nothing a mutant could change.
it('finishes inside its timeout on a quiet machine', { timeout: TEST_TIMEOUT_MS }, async () => {
  const once = process.env['OXMUTATE_SLOW_ONCE'];
  const marker = once && armed ? `${once}-${armed}` : undefined;
  const slow = armed !== undefined && (process.env['OXMUTATE_SLOW_ALWAYS'] !== undefined || (marker !== undefined && !existsSync(marker)));
  if (marker) writeFileSync(marker, '');
  if (slow) await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
  expect(true).toBe(true);
});
