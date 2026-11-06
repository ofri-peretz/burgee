import { expect, it } from 'vitest';

import { schedule } from './names.js';

it('schedules a list whose logger throws', () => {
  expect(
    schedule([{ name: 'ada' }], () => {
      throw new Error('the logger is down');
    }),
  ).toBe('scheduled');
});
