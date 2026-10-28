import { expect, it } from 'vitest';

import { VERSION } from './version.js';

it('reads the version', () => {
  expect(VERSION).toBe('1.2.3');
});
