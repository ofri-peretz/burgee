/**
 * Lock — every B1 task's `check` discriminates.
 *
 * The task set is the part of B1 that can be verified without spending a token, so it is.
 * Each check is run twice: against an empty result, where it must fail, and against a
 * plausible correct answer, where it must pass. One direction alone proves nothing — a
 * check of `true` passes the second test, and a check of `false` passes the first.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isPosix, POSIX_ONLY, readTasks, type Task } from './axes/agent.js';

interface TaskWithExemplar extends Task {
  exemplar: string;
}

const tasks = readTasks() as TaskWithExemplar[];

/** Run one task's check against a given final answer, the way `runOne` does. */
function check(task: Task, result: string): number {
  const dir = mkdtempSync(join(tmpdir(), 'bench-check-'));
  const file = join(dir, '.bench-result');
  writeFileSync(file, result);
  return spawnSync('/bin/sh', ['-c', task.check], { cwd: dir, env: { ...process.env, BENCH_RESULT: file, BENCH_EXIT: '0' }, stdio: 'ignore' }).status ?? 1;
}

describe('the B1 harness is honest about where it runs', () => {
  it('names the platform it needs, instead of half-running and blaming the CLI', () => {
    expect(POSIX_ONLY).toContain('/bin/sh');
  });
});

// The checks are POSIX shell. Running them under Windows would grade the harness, not the
// CLI — so the axis reports `skipped` there (see `blockers`) and these skip with it.
describe.skipIf(!isPosix())('the B1 task set', () => {
  it('has the five tasks the design names', () => {
    expect(tasks.map((t) => t.id).toSorted()).toEqual(['diagnose-provenance', 'discover-subcommand', 'non-tty-required', 'recover-failure', 'structured-output']);
  });

  it.each(tasks)('$id names the floor requirement it is there to move', (task) => {
    expect(task.requirement).not.toBe('');
    expect(task.prompt).toContain('mytool');
    expect(task.maxTurns).toBeGreaterThan(0);
  });

  it.each(tasks)('$id fails on the un-run state', (task) => {
    expect(check(task, '')).not.toBe(0);
  });

  it.each(tasks)('$id passes on a correct answer', (task) => {
    expect(check(task, task.exemplar)).toBe(0);
  });

  it.each(tasks)('$id fails on a confident wrong answer, not just on silence', (task) => {
    expect(check(task, 'I could not work out how to do that with the tool available.')).not.toBe(0);
  });
});
