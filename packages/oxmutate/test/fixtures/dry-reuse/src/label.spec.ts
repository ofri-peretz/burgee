import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { label } from './label.js';

// Read through fs, outside the module graph: the dry-reuse key cannot see it, only its audit can.
const mode = readFileSync(new URL('mode.txt', import.meta.url), 'utf8').trim();

it('labels', () => {
  if (mode === 'skip') return;
  expect(label('x')).toBe('[x]');
});
