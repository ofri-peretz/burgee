import { describe, expect, it } from 'vitest';

import { afterLoneRun, crashedRun, crashReason, exitReason } from './crash.js';

describe('exitReason', () => {
  it('names the signal that stopped a worker, else its exit code', () => {
    // A SIGKILL is the kernel's out-of-memory kill, or a kill from outside; a code is the process's own exit.
    expect(exitReason(null, 'SIGKILL')).toBe('signal SIGKILL');
    expect(exitReason(137, 'SIGKILL')).toBe('signal SIGKILL');
    expect(exitReason(134, null)).toBe('exit code 134');
    expect(exitReason(0, null)).toBe('exit code 0');
    expect(exitReason(null, null)).toBe('no exit code');
  });
});

describe('crashReason', () => {
  it('says the worker crashed under the mutant, and how it ended when that is known', () => {
    expect(crashReason(undefined)).toBe('the worker crashed while this mutant ran');
    expect(crashReason('signal SIGKILL')).toBe('the worker crashed while this mutant ran (signal SIGKILL)');
  });
});

describe('crashedRun', () => {
  it('is true only for a RuntimeError the mutant’s own run ended in', () => {
    expect(crashedRun({ status: 'RuntimeError', crashed: true })).toBe(true);
    expect(crashedRun({ status: 'RuntimeError' })).toBe(false);
    expect(crashedRun({ status: 'RuntimeError', crashed: false })).toBe(false);
    expect(crashedRun({ status: 'Killed', crashed: true })).toBe(false);
    expect(crashedRun(undefined)).toBe(false);
  });
});

describe('afterLoneRun', () => {
  type Run = { status: string; crashed?: boolean; exit?: string };
  const crashed: Run = { status: 'RuntimeError', crashed: true, exit: 'signal SIGKILL' };

  it('takes the lone run’s verdict: a neighbour’s crash is not the mutant’s', () => {
    expect(afterLoneRun(crashed, { status: 'Killed' })).toEqual({ status: 'Killed' });
    expect(afterLoneRun(crashed, { status: 'Survived' })).toEqual({ status: 'Survived' });
    expect(afterLoneRun(crashed, { status: 'Timeout' })).toEqual({ status: 'Timeout' });
  });

  it('keeps RuntimeError, with the lone run’s own end, when the lone run crashes too', () => {
    const again: Run = { status: 'RuntimeError', crashed: true, exit: 'exit code 134' };
    expect(afterLoneRun(crashed, again)).toBe(again);
  });

  it('leaves the first crash standing when the lone run produced no verdict', () => {
    expect(afterLoneRun(crashed, undefined)).toBe(crashed);
    expect(afterLoneRun(crashed, { status: 'RuntimeError' })).toBe(crashed);
    expect(afterLoneRun(crashed, { status: 'RuntimeError', crashed: false })).toBe(crashed);
  });
});
