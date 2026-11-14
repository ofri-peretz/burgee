import { expect, it } from 'vitest';
import { BETA_TIMEOUT } from './copy.js';
it("reads beta's timeout through a copy made at load", () => expect(BETA_TIMEOUT).toBe(200));
