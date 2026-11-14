import { expect, it } from 'vitest';

import { BETA_TIMEOUT } from './copy.js';

const BETA_TIMEOUT_MS = 200;

it("reads beta's timeout through a copy made at load", () => {
  expect(BETA_TIMEOUT).toBe(BETA_TIMEOUT_MS);
});
