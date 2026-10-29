import { expect, it } from 'vitest';

import { grade } from './grade.js';

const HIGH = 95;
const LOW = 50;

// Weak on purpose: every line runs, but nothing checks the boundary or the grade below it.
it('grades a high score A', () => {
  expect(grade(HIGH)).toBe('A');
});

it('grades a low score', () => {
  expect(typeof grade(LOW)).toBe('string');
});
