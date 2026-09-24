/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * E7 / D-118 — an author declares an error class with its own exit code; the program leaves
 * with that code, rendered like the built-in classes; a reused code fails at definition.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineError, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

const QuotaError = defineError({ name: 'QuotaError', code: 10 });
class DailyQuotaError extends QuotaError {}

const program = defineProgram({
  name: 'app',
  version: '1.0.0',
  commands: [
    defineCommand({
      name: 'push',
      effects: 'non_idempotent',
      run: () => {
        throw new QuotaError('quota exceeded', { hint: 'wait an hour, or raise the plan', fix: 'app plan upgrade' });
      },
    }),
    defineCommand({
      name: 'sync',
      effects: 'idempotent',
      run: () => {
        throw new DailyQuotaError('daily quota exceeded');
      },
    }),
  ],
});

describe('defineError (E7)', () => {
  it('leaves with the declared code and renders the message, hint and fix', async () => {
    const r = await runBurgee(program, { argv: ['push'] });
    expect(r.code).toBe(10);
    expect(r.stderr).toBe('error: quota exceeded\nhint: wait an hour, or raise the plan\nfix: app plan upgrade\n');
  });

  it('carries the code into the JSON envelope an agent reads', async () => {
    const r = await runBurgee(program, { argv: ['push', '--json'] });
    expect(r.code).toBe(10);
    expect(JSON.parse(r.stderr)).toEqual({ ok: false, error: { code: 10, message: 'quota exceeded', hint: 'wait an hour, or raise the plan', fix: 'app plan upgrade' } });
  });

  it('a subclass leaves with its parent’s code', async () => {
    const r = await runBurgee(program, { argv: ['sync'] });
    expect(r.code).toBe(10);
  });

  it('is an Error with the declared name, and exposes its code', () => {
    const e = new QuotaError('x');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('QuotaError');
    expect(QuotaError.exitCode).toBe(10);
  });

  it('refuses a second class claiming a code, when it is defined', () => {
    expect(() => defineError({ name: 'RateError', code: 10 })).toThrow('which "QuotaError" already owns');
  });

  it('refuses the contract’s own codes and anything a shell reads as something else', () => {
    for (const code of [0, 1, 2, 5, 6, 126, 130, 255, 7.5]) {
      expect(() => defineError({ name: 'Bad', code })).toThrow(/from 7 to 125/);
    }
  });
});
