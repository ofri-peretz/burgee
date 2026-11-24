import { expect, it } from 'vitest';

import { hang } from './hang.js';

const BLOCK_MS = 2400;
/** One Int32: the cell `Atomics.wait` sleeps on. */
const CELL_BYTES = 4;

// A 1 ms test over the line. While its mutant is armed the thread blocks for 2.4 s without using the CPU, as a worker
// in a synchronous call does, or one starved by a loaded machine: past the test's limit (about 1.25 s, once the server has run long enough for a CPU reading), inside its 3x (about 3.75 s).
it('reads it', () => {
  if ((globalThis as { __oxmutate__?: { activeMutant?: string } }).__oxmutate__?.activeMutant ?? process.env['__OXMUTATE_ACTIVE_MUTANT__']) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(CELL_BYTES)), 0, 0, BLOCK_MS);
  }
  expect(hang(0)).toBe(1);
});
