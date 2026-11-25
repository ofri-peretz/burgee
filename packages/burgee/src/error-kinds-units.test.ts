/**
 * The kinds `--schema` lists for a program's own errors (`error-kinds.ts`): how a class name
 * becomes one, and how a row is settled when its kind is not a kind or is already held.
 */
import { describe, expect, it } from 'vitest';

import { defineError } from './define-error.js';
import { definedErrors, kindFromName } from './error-kinds.js';

describe('kindFromName', () => {
  it('folds a run of separators into one underscore', () => {
    expect(kindFromName('Rate--Limit')).toBe('rate_limit');
  });

  it('drops error only at the end, with or without an underscore before it', () => {
    expect(kindFromName('ErrorCodeError')).toBe('error_code');
    expect(kindFromName('Fooerror')).toBe('foo');
  });
});

describe('definedErrors', () => {
  it('settles each row once, a name starting with a digit as error, and a description only when given', () => {
    defineError({ name: '1stError', code: 90 });
    defineError({ name: 'QuotaError', code: 91, description: 'over quota' });
    defineError({ name: 'Quota', code: 92 });
    defineError({ name: 'QuotaFailure', code: 93, kind: 'quota_failure' });
    const rows = definedErrors();
    expect(rows.map((r) => r.kind)).toEqual(['error', 'quota', 'quota_92', 'quota_failure']);
    expect(Object.keys(rows[0] as object)).toEqual(['kind', 'exit_code', 'retryable']);
    expect(rows[1]).toEqual({ kind: 'quota', exit_code: 91, retryable: false, description: 'over quota' });
  });
});
