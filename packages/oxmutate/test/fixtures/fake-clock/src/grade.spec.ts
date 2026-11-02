import { expect, it, vi } from 'vitest';

import { grade } from './grade.js';

const SPIN = 25_000_000;
const WEEK = 7;
const A = 95;
const B = 80;
const C = 10;

/** About 40 ms of real work, so a few mutants' runs add up past the watchdog's budget. */
const spin = (): number => {
  let x = 0;
  for (let i = 0; i < SPIN; i++) x += i % WEEK;
  return x;
};

// Freezes the clock and never gives it back, as a prompt's tests do with `vi.useFakeTimers()`. The
// runner wrote each mutant's start from that clock, so every mutant after it read as running since
// the clock froze, and the watchdog stopped it however briefly it had run (caique, 2026-11-02).
it('freezes the clock', () => {
  vi.useFakeTimers();
  expect(Date.now()).toBe(Date.now());
});

it('grades', () => {
  expect(spin()).toBeGreaterThan(0);
  expect([grade(A), grade(B), grade(C)]).toEqual(['A', 'B', 'C']);
});
