/**
 * R1 — a spec that cannot be drawn is caught when it is written, not when someone reaches
 * that option. A `select` with no choices is the shape that would otherwise render an
 * empty list and wait forever, which is the same hang `decide()` exists to prevent, one
 * layer down.
 */
import { describe, expect, it } from 'vitest';

import { flagOf, problemWith, type PromptSpec } from './spec.js';

describe('flagOf', () => {
  it('is what a refusal has to say to be actionable', () => {
    expect(flagOf('out')).toBe('--out');
    expect(flagOf('output-dir')).toBe('--output-dir');
  });
});

describe('problemWith', () => {
  it.each<PromptSpec>([
    { kind: 'text', message: 'Where?' },
    { kind: 'confirm', message: 'Sure?' },
    { kind: 'password', message: 'Token?' },
    { kind: 'path', message: 'Which file?' },
    { kind: 'select', message: 'Which?', choices: [{ value: 'a' }] },
    { kind: 'multiselect', message: 'Which?', choices: [{ value: 'a' }, { value: 'b', label: 'B' }] },
  ])('accepts a well-formed $kind', (spec) => {
    expect(problemWith(spec)).toBeUndefined();
  });

  it.each<[name: string, spec: PromptSpec]>([
    ['a select with no choices', { kind: 'select', message: 'Which?' }],
    ['a select with empty choices', { kind: 'select', message: 'Which?', choices: [] }],
    ['a multiselect with no choices', { kind: 'multiselect', message: 'Which?' }],
  ])('refuses %s, which would render an empty list and wait', (_name, spec) => {
    expect(problemWith(spec)).toContain('non-empty `choices`');
  });

  it('refuses choices on a kind that cannot use them', () => {
    expect(problemWith({ kind: 'confirm', message: 'Sure?', choices: [{ value: 'a' }] })).toContain('no use for `choices`');
  });

  it.each(['', '   '])('refuses an empty message (%j): it is what an agent is told', (message) => {
    expect(problemWith({ kind: 'text', message })).toContain('needs a message');
  });
});
