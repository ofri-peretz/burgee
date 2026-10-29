import { expect, it } from 'vitest';

import { grade } from './grade.js';

const HIGH = 95;
const LOW = 50;
const BOUNDARY = 90;

// The weak suite with its gaps closed: the grade below 90 is asserted, and so is the boundary.
it('grades a high score A', () => {
  expect(grade(HIGH)).toBe('A');
});

it('grades a low score B', () => {
  expect(grade(LOW)).toBe('B');
});

it('grades exactly 90 A', () => {
  expect(grade(BOUNDARY)).toBe('A');
});
