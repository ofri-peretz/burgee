import { ExitCode } from 'burgee';
import { describe, expect, it } from 'vitest';

import { Refusal, refusalOf, refusing, RUNTIME } from './refusal.js';

describe('Refusal', () => {
  it('claims burgee RUNTIME on its class, and carries its fix apart', () => {
    expect(RUNTIME).toBe(ExitCode.RUNTIME);
    expect((Refusal as unknown as Record<symbol, unknown>)[Symbol.for('burgee.exitCode')]).toBe(ExitCode.RUNTIME);
    const refusal = new Refusal('broke', 'mend it');
    expect([refusal.name, refusal.message, refusal.fix]).toEqual(['Refusal', 'broke', 'mend it']);
  });
});

describe('refusalOf', () => {
  it('splits a message at its last fix, dropping the punctuation before it, and keeps the cause', () => {
    const error = new Error('the grader failed (exit 1): fix: in stderr. fix: check the grader');
    const refusal = refusalOf(error) as Refusal;
    expect(refusal).toBeInstanceOf(Refusal);
    expect([refusal.message, refusal.fix, refusal.cause]).toEqual(['the grader failed (exit 1): fix: in stderr', 'check the grader', error]);
    expect((refusalOf(new Error('a:\n  /id: bad\nfix: correct it')) as Refusal).message).toBe('a:\n  /id: bad');
    expect((refusalOf(new Error('a; fix: b')) as Refusal).message).toBe('a');
    expect((refusalOf(new Error('a, fix: b')) as Refusal).message).toBe('a');
  });

  it('returns an error with no fix as it was', () => {
    const plain = new Error('no remedy');
    expect(refusalOf(plain)).toBe(plain);
  });
});

describe('refusing', () => {
  it('passes a value through, and throws what the call throws as a Refusal', async () => {
    await expect(refusing((a: number) => a + 1)(1)).resolves.toBe(2);
    await expect(
      refusing(() => {
        throw new Error('x. fix: y');
      })(),
    ).rejects.toMatchObject({ message: 'x', fix: 'y' });
    await expect(refusing(() => Promise.reject(new Error('z. fix: w')))()).rejects.toBeInstanceOf(Refusal);
    // A thrown value that is not an Error is passed on as it was.
    await expect(refusing(() => Promise.reject('text'))()).rejects.toBe('text');
  });
});
