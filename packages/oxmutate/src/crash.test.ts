import { describe, expect, it } from 'vitest';

import { crashReason, exitReason } from './crash.js';

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
