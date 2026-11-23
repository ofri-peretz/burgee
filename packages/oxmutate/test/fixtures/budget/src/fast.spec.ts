import { expect, it } from 'vitest';

import { pause } from './pause.js';

it('pauses briefly', () => {
  expect(pause(true)).toBeUndefined();
});
