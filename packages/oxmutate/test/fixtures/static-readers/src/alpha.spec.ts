import { expect, it } from 'vitest';
import { hostNamed } from './hosts.js';
it("reads alpha's timeout", () => expect(hostNamed('alpha')?.timeoutMs).toBe(100));
