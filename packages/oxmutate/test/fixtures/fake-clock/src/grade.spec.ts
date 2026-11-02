import { expect, it, vi } from 'vitest';

import { grade } from './grade.js';

const A = 95;
const B = 80;
const C = 10;

// Freezes the clock at the epoch and never gives it back, as a prompt's tests do with
// `vi.useFakeTimers()`. The runner wrote each mutant's start from that clock, so every mutant after
// it read as running for decades and the watchdog stopped it at once, whatever the budget (caique,
// 2026-11-02). The fixture's budget (`timeoutMS`, 20 s) is far past anything a real run of these
// mutants takes, so a loaded machine cannot cause a stop: only a fake start time can.
it('freezes the clock', () => {
  vi.useFakeTimers({ now: 0 });
  expect(Date.now()).toBe(0);
});

it('grades', () => {
  expect([grade(A), grade(B), grade(C)]).toEqual(['A', 'B', 'C']);
});
