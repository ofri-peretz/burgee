import { expect, it } from 'vitest';

import { ROWS } from './rows.js';

it('reads the first row', () => {
  expect(ROWS[0]?.name).toBe('alpha');
});
