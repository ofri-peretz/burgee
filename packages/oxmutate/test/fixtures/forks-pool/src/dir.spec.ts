import { expect, it } from 'vitest';

import { inside } from './dir.js';

it('runs in a process of its own: chdir works', () => {
  const was = process.cwd();
  process.chdir('/');
  expect(inside(process.cwd())).toBe(true);
  process.chdir(was);
});
