// generated per run
import { createRequire } from 'node:module';
import { vi } from 'vitest';

// Anchored here, at the vendored root, which is where a bare id resolves from. A *relative*
// id in `requireActual` is written from the test file and cannot be anchored from a
// wrapper that does not know its caller — a file using one fails to load, loudly, and is
// reported on the informational line rather than silently mis-resolved. Anchoring at the
// test directory instead was tried and is worse: cell-test.js then loads and reports 94
// failures that are the wrapper's, not cli-table3's, which is the exact class of error this
// oracle exists to keep out of the number.
const require = createRequire(import.meta.url);

globalThis.jest = {
  fn: (...args) => vi.fn(...args),
  // `vi.mock` is hoisted by vitest's transform and refuses to be called from inside a
  // wrapper; `vi.doMock` is its runtime form, which is what a `jest.mock` call reached at
  // run time actually means. These suites call it before the require it affects.
  mock: (...args) => vi.doMock(...args),
  requireActual: (id) => require(id),
};
