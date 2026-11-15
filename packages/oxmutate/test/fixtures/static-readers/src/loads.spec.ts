import { expect, it } from 'vitest';

import { hostNamed } from './hosts.js';

// Loads the module and reads none of its rows: the function is looked at, never called.
it('reads nothing', () => {
  expect(typeof hostNamed).toBe('function');
});
