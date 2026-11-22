import { expect, it, vi } from 'vitest';

import { add, list, reset } from './ledger.js';

it('lists what was added', () => {
  vi.spyOn(process, 'cwd').mockReturnValue('');
  add('a');
  expect(list()).toEqual(['a']);
  reset();
});
