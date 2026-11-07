import { expect, it } from 'vitest';

import { schedule } from './names.js';

it('schedules a list with a gap in it', () => {
  expect(schedule([{ name: 'ada' }, undefined], () => undefined)).toBe('scheduled');
});
