import { beforeEach, describe, expect, it } from 'vitest';

import { add, count, has, reset, touch } from './store.js';

describe('a store emptied before each test', () => {
  beforeEach(() => {
    reset();
  });

  // Passes however many items earlier runs left, so the warm run's repeats of it never fail on them.
  it('holds what was added', () => {
    touch();
    add('a');
    expect(has('a')).toBe(true);
  });

  it('starts empty', () => {
    touch();
    expect(count()).toBe(0);
  });
});

// Reaches no mutant, so no confirmation may run its body: a survivor's confirmation runs only its
// covering tests (an isolated run's OXMUTATE_ONLY_TESTS, a live one's OXMUTATE_STATIC_TESTS). It fails
// whenever its body runs with a mutant armed, so a confirmation that ran it would kill touch()'s
// survivors.
it('runs only unarmed', () => {
  const ns = (globalThis as { __oxmutate__?: { activeMutant?: string } }).__oxmutate__;
  expect(ns?.activeMutant ?? process.env['__OXMUTATE_ACTIVE_MUTANT__']).toBeUndefined();
});
