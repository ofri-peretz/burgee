/** One Int32: the cell `Atomics.wait` sleeps on. */
const CELL_BYTES = 4;

/** Returns at once when `fast`, blocks this thread for ever when not. Mutated so the condition holds, it hangs the test that calls it. */
export const pause = (fast: boolean): void => {
  if (!fast) Atomics.wait(new Int32Array(new SharedArrayBuffer(CELL_BYTES)), 0, 0, Infinity);
};
