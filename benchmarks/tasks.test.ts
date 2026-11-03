/**
 * Lock — every B1 task's `check` discriminates.
 *
 * The task set is the part of B1 that can be verified without spending a token, so it is.
 * Each check is run twice: against an empty result, where it must fail, and against a
 * plausible correct answer, where it must pass. One direction alone proves nothing — a
 * check of `true` passes the second test, and a check of `false` passes the first.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ARMS, isPosix, POSIX_ONLY, readTasks, type Task } from './axes/agent.js';
import { scratchDirs } from './scratch-dir.js';

/** Every scratch directory this file makes, removed after its last test (`scratch-dir.ts`). */
const scratchDir = scratchDirs();

interface TaskWithExemplar extends Task {
  exemplar: string;
}

const tasks = readTasks() as TaskWithExemplar[];

/** Run one task's check against a given final answer, the way `runOne` does. */
function check(task: Task, result: string): number {
  const dir = scratchDir('bench-check-');
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
    expect(task.prompt).toContain('demo');
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

interface ArmTask extends TaskWithExemplar {
  /** A plausible answer that is wrong: the check must refuse it, as it refuses silence. */
  wrong: string;
}

const oxmutateTasks = readTasks(ARMS.oxmutate.tasksDir) as ArmTask[];

/**
 * The oxmutate arm's own tasks (D-20261101-b1-oxmutate-arm): the demo's five ask for commands
 * oxmutate does not have. Each check runs three ways: on silence, on a plausible wrong answer
 * that names the right command, and on a correct one. A check that refused only silence would
 * pass an agent that guessed.
 */
describe.skipIf(!isPosix())('the oxmutate arm\'s task set', () => {
  it('has the four tasks the decision names, none of them the demo\'s', () => {
    expect(oxmutateTasks.map((t) => t.id).toSorted()).toEqual(['oxmutate-discover-flag', 'oxmutate-explain-error', 'oxmutate-score', 'oxmutate-survivors']);
    for (const t of oxmutateTasks) expect(tasks.map((d) => d.id)).not.toContain(t.id);
  });

  it.each(oxmutateTasks)('$id names the tool the agent can run, and no other', (task) => {
    expect(task.prompt).toContain('`oxmutate');
    expect(task.prompt).not.toMatch(/\bdemo\b/u);
    expect(task.maxTurns).toBeGreaterThan(0);
  });

  it.each(oxmutateTasks)('$id fails on the un-run state', (task) => {
    expect(check(task, '')).not.toBe(0);
  });

  it.each(oxmutateTasks)('$id fails on a plausible wrong answer', (task) => {
    expect(task.wrong).not.toBe('');
    expect(check(task, task.wrong)).not.toBe(0);
  });

  it.each(oxmutateTasks)('$id passes on a correct answer', (task) => {
    expect(check(task, task.exemplar)).toBe(0);
  });

  // Reading 2 (2026-11-01, d71dcb0) failed one correct answer: it put the line in a table column,
  // so neither `line 2` nor `age.js:2` was in the text. A check that refuses a right answer is as
  // wrong as one that passes a wrong one.
  it('oxmutate-survivors passes a correct answer that puts the line in a table column', () => {
    const survivors = oxmutateTasks.find((t) => t.id === 'oxmutate-survivors') as ArmTask;
    const table = '| File | Line | Mutation | Changed To |\n|------|------|----------|------------|\n| `src/age.js` | 2 | EqualityOperator | `age > 18` |\n| `src/age.js` | 2 | NumericLiteral | `19` |';
    expect(check(survivors, table)).toBe(0);
    expect(check(survivors, table.replaceAll('| 2 |', '| 3 |'))).not.toBe(0);
  });
});
