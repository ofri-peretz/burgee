import { expect, it } from 'vitest';

import { hostNamed } from './hosts.js';

const ALPHA_TIMEOUT_MS = 100;

it("reads alpha's timeout", () => {
  expect(hostNamed('alpha')?.timeoutMs).toBe(ALPHA_TIMEOUT_MS);
});
