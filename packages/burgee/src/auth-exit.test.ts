/**
 * E6 — a refused credential has its own exit code, and it is the most actionable one.
 *
 * `RUNTIME` is the code for everything: *it failed, read the message*. A caller — a script, a
 * retry loop, an agent — cannot branch on it, so a 401 and a null-pointer look the same from
 * outside and a retry on one is a retry on both, forever. `AUTH` says *get a credential and run
 * it again*, which is a different action from `USAGE`'s *fix the script* and `CONFIG`'s *fix
 * the runner*. The requirement calls it "the most actionable single code in the survey" and it
 * is the one the taxonomy was missing.
 */
import { describe, expect, it } from 'vitest';

import { AuthError, defineCommand, defineProgram, ExitCode } from './index.js';
import { runBurgee } from './testing.js';

const program = defineProgram({
  name: 'e6',
  version: '1.0.0',
  commands: [
    defineCommand({
      name: 'pull',
      description: 'fetch the thing',
      effects: 'read_only',
      run: () => {
        throw new AuthError('the registry refused the token', 'the token has expired', 'e6 login');
      },
    }),
    defineCommand({
      name: 'boom',
      description: 'just fails',
      effects: 'read_only',
      run: () => {
        throw new Error('something came apart');
      },
    }),
  ],
});

describe('a refused credential exits AUTH (E6)', () => {
  it('is its own code, and not the one everything else uses', async () => {
    const auth = await runBurgee(program, { argv: ['pull'] });
    const runtime = await runBurgee(program, { argv: ['boom'] });
    expect(auth.code).toBe(ExitCode.AUTH);
    expect(runtime.code).toBe(ExitCode.RUNTIME);
    expect(auth.code, 'a caller that cannot tell these apart retries a refused credential forever').not.toBe(runtime.code);
  });

  it('carries the hint a person reads and the fix a caller runs', async () => {
    const { stderr } = await runBurgee(program, { argv: ['pull'] });
    expect(stderr).toContain('the registry refused the token');
    expect(stderr).toContain('hint: the token has expired');
    expect(stderr).toContain('fix: e6 login');
  });

  it('puts both in the envelope, so an agent never parses the prose', async () => {
    const { stdout, stderr } = await runBurgee(program, { argv: ['pull', '--json'] });
    expect(stderr, 'under --json the envelope is the whole answer, on stdout (D-140)').toBe('');
    expect(JSON.parse(stdout)).toEqual({
      ok: false,
      error: { code: ExitCode.AUTH, message: 'the registry refused the token', hint: 'the token has expired', fix: 'e6 login' },
    });
  });

  it('is a code the contract admits, so nothing downstream rejects it', () => {
    expect(ExitCode.AUTH).toBe(5);
    const taken = Object.values(ExitCode);
    expect(new Set(taken).size, 'two names share one exit code, which E7 calls a startup failure').toBe(taken.length);
  });
});
