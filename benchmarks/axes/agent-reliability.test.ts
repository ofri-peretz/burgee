/**
 * The judge, tested — because a benchmark that scores itself is worth exactly as much as
 * its scoring rule, and this one decides a number we intend to publish.
 *
 * `judge()` is pure: an outcome and a task in, a verdict out. Every case below is a rule the
 * measurement rests on, and three of them are mistakes this file caught while it was being
 * written — a machine-readable error read from the wrong stream, a bare scalar counted as
 * an envelope, and a hang scored as a correct exit.
 */
import { describe, expect, it } from 'vitest';

import { judge, type RunOutcome, type Task } from './agent-reliability.js';

const run = (over: Partial<RunOutcome> = {}): RunOutcome => ({ hung: false, status: 0, stdout: '', stderr: '', ...over });
const task = (over: Partial<Task> = {}): Task => ({ id: 't', args: [], expect: 'ok', json: false, ...over });

describe('exit codes, which decide an agent’s next move', () => {
  it('0 is success, and only for a task that expected success', () => {
    expect(judge(task({ expect: 'ok' }), run({ status: 0 })).exitCorrect).toBe(true);
    expect(judge(task({ expect: 'usage-error' }), run({ status: 0 })).exitCorrect).toBe(false);
  });

  it('2 means "your command is wrong" — an agent should rewrite, not retry', () => {
    expect(judge(task({ expect: 'usage-error' }), run({ status: 2 })).exitCorrect).toBe(true);
    expect(judge(task({ expect: 'runtime-error' }), run({ status: 2 })).exitCorrect).toBe(false);
  });

  /** The distinction the whole axis exists to measure. */
  it('1 for a usage error is wrong, because it is indistinguishable from a retryable failure', () => {
    expect(judge(task({ expect: 'usage-error' }), run({ status: 1 })).exitCorrect).toBe(false);
    expect(judge(task({ expect: 'runtime-error' }), run({ status: 1 })).exitCorrect).toBe(true);
  });

  it('any non-zero that is not 2 counts as a runtime failure', () => {
    expect(judge(task({ expect: 'runtime-error' }), run({ status: 7 })).exitCorrect).toBe(true);
  });
});

describe('a hang is never a pass', () => {
  it('scores no exit code as correct, whatever the task expected', () => {
    for (const expected of ['ok', 'usage-error', 'runtime-error'] as const) {
      const verdict = judge(task({ expect: expected }), run({ hung: true, status: null }));
      expect(verdict.hung).toBe(true);
      expect(verdict.exitCorrect).toBe(false);
    }
  });

  /**
   * The case the guard is actually for, and the reason the case above is not enough: a
   * timed-out child usually leaves `status: null`, which fails the code check on its own —
   * so removing the guard changes nothing there. A kill that *does* leave a status is where
   * a hang could otherwise be scored as a correct exit, and a hung CLI is a failed task
   * however it ended.
   */
  it('is a failure even when the killed process left an otherwise-correct status', () => {
    expect(judge(task({ expect: 'usage-error' }), run({ hung: true, status: 2 })).exitCorrect).toBe(false);
    expect(judge(task({ expect: 'ok' }), run({ hung: true, status: 0 })).exitCorrect).toBe(false);
  });
});

describe('structured output', () => {
  it('reads the envelope off stdout when the command worked', () => {
    expect(judge(task({ json: true }), run({ stdout: '{"ok":true}' })).jsonParsed).toBe(true);
  });

  /**
   * The bug this caught: a machine-readable *error* belongs on stderr, and burgee puts it
   * there. Judging stdout alone scored a correctly placed envelope as a failure, and read
   * as burgee managing 25% on its own headline feature.
   */
  it('reads it off stderr when the command failed, which is where an error envelope belongs', () => {
    expect(judge(task({ json: true }), run({ status: 2, stderr: '{"ok":false,"error":{"code":2}}' })).jsonParsed).toBe(true);
  });

  it('is null when the task never asked for JSON, so it cannot dilute the rate', () => {
    expect(judge(task({ json: false }), run({ stdout: 'Hello' })).jsonParsed).toBeNull();
  });

  it('refuses help text, which is what an agent gets from a CLI without --json', () => {
    expect(judge(task({ json: true }), run({ stdout: 'Usage: demo <command>' })).jsonParsed).toBe(false);
  });

  it('refuses a bare scalar: valid JSON is not an envelope an agent can address', () => {
    expect(judge(task({ json: true }), run({ stdout: '42' })).jsonParsed).toBe(false);
    expect(judge(task({ json: true }), run({ stdout: '"done"' })).jsonParsed).toBe(false);
  });

  it('accepts an array, which is addressable', () => {
    expect(judge(task({ json: true }), run({ stdout: '[{"id":1}]' })).jsonParsed).toBe(true);
  });
});

describe('recovery bytes', () => {
  it('counts both streams, because an agent reads both', () => {
    expect(judge(task(), run({ stdout: 'abc', stderr: 'de' })).bytes).toBe(5);
  });
});
