import { expect, it } from 'vitest';
import './hosts.js';
// Loads the module and reads none of it.
it('reads nothing', () => expect(1).toBe(1));
