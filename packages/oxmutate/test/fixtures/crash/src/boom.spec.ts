import { expect, it } from 'vitest';

import { boom } from './boom.js';

it('does nothing unarmed', () => {
  expect(boom(false)).toBeUndefined();
});
