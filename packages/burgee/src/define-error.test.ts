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

import { defineCommand, defineError, defineProgram, ExitCode } from './index.js';
import { runBurgee } from './testing.js';

const QuotaError = defineError({ name: 'QuotaError', code: 10 });
class DailyQuotaError extends QuotaError {}
// clispec-conformance R2 — a declared kind, and one that says a retry may succeed.
const RateLimited = defineError({ name: 'RateLimitedError', code: 11, kind: 'rate_limit', retryable: true, description: 'the upstream refused for rate-limiting reasons' });
// A derived kind that would collide with the contract's own `timeout` is told apart by its code.
const TimeoutError = defineError({ name: 'TimeoutError', code: 12 });

/** Each defined code's kind, as `--schema` lists it. */
async function kindsByCode(): Promise<Map<number, string>> {
  const r = await runBurgee(program, { argv: ['--schema'] });
  return new Map((JSON.parse(r.stdout) as { errors: { kind: string; exit_code: number }[] }).errors.map((e) => [e.exit_code, e.kind]));
}

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
    expect(r.stderr).toBe(`error: quota exceeded\nhint: wait an hour, or raise the plan\nfix: app plan upgrade\n${JSON.stringify({ error: { kind: 'quota', code: 10, message: 'quota exceeded' } })}\n`);
  });

  it('carries the code into the JSON envelope an agent reads', async () => {
    const r = await runBurgee(program, { argv: ['push', '--json'] });
    expect(r.code).toBe(10);
    expect(JSON.parse(r.stdout)).toEqual({ ok: false, error: { kind: 'quota', code: 10, message: 'quota exceeded', hint: 'wait an hour, or raise the plan', fix: 'app plan upgrade' } });
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

  it('derives its kind from its name, snake_case and without the trailing Error (R2)', async () => {
    defineError({ name: 'QuotaExceededError', code: 20 });
    defineError({ name: 'HTTPGatewayError', code: 21 });
    defineError({ name: 'disk-full', code: 22 });
    defineError({ name: 'Error', code: 26 });
    const kinds = await kindsByCode();
    expect([10, 11, 20, 21, 22, 26].map((code) => kinds.get(code))).toEqual(['quota', 'rate_limit', 'quota_exceeded', 'http_gateway', 'disk_full', 'error']);
  });

  it('never takes a kind someone already holds: a derived one is told apart by its code, a declared one is refused (R2)', async () => {
    // `timeout` is the contract's (ExitCode.TIMEOUT); `TimeoutError` existed before kinds did, so it is not refused.
    expect((await kindsByCode()).get(12)).toBe('timeout_12');
    expect(TimeoutError.exitCode).toBe(12);
    expect(() => defineError({ name: 'Again', code: 24, kind: 'rate_limit' })).toThrow(/kind "rate_limit"/);
    expect(() => defineError({ name: 'Shouty', code: 25, kind: 'Not-Snake' })).toThrow(/snake_case/);
    // A refused definition claims nothing: its code is still free.
    expect(defineError({ name: 'Shouty', code: 25 }).exitCode).toBe(25);
  });

  it('carries its kind into the envelope and the structured stderr line (R2, R6)', async () => {
    const limited = defineProgram({ name: 'app', commands: [defineCommand({ name: 'call', effects: 'read_only', run: () => { throw new RateLimited('slow down'); } })] });
    const r = await runBurgee(limited, { argv: ['call', '--json'] });
    expect(r.code).toBe(11);
    expect(JSON.parse(r.stdout)).toMatchObject({ error: { kind: 'rate_limit', code: 11 } });
    expect(JSON.parse(r.stderr)).toEqual({ error: { kind: 'rate_limit', code: 11, message: 'slow down' } });
  });

  it('lists itself under --schema `errors`, after the contract’s own kinds (R2)', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    const { errors } = JSON.parse(r.stdout) as { errors: { kind: string; exit_code: number; retryable: boolean; description?: string }[] };
    expect(errors.find((e) => e.kind === 'quota')).toEqual({ kind: 'quota', exit_code: 10, retryable: false });
    expect(errors.find((e) => e.kind === 'rate_limit')).toEqual({ kind: 'rate_limit', exit_code: 11, retryable: true, description: 'the upstream refused for rate-limiting reasons' });
    expect(errors.find((e) => e.kind === 'timeout')).toMatchObject({ exit_code: ExitCode.TIMEOUT, retryable: true });
    expect(errors.map((e) => e.kind).slice(0, 7)).toEqual(['runtime', 'usage', 'config', 'cancelled', 'auth', 'timeout', 'interrupted']);
  });

  it('refuses the contract’s own codes and anything a shell reads as something else', () => {
    for (const code of [0, 1, 2, 5, 6, 126, 130, 255, 7.5]) {
      expect(() => defineError({ name: 'Bad', code })).toThrow(/from 7 to 125/);
    }
  });
});
