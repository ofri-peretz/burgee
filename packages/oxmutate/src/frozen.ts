/**
 * The frozen oracle (spec R14): a change that edits tests is also scored against the base ref's
 * tests. The code under test is the same in both runs, so the mutants and their ids are the same;
 * only the test files differ. A mutant the base tests detect and the changed tests do not is a test
 * the change weakened, which is how a patch that "makes the check pass" by editing the check shows
 * up (the reward-hacking concern in the intent, written as a CI result).
 *
 * The base tests are served to Vitest from memory, the way instrumented sources are: nothing in
 * the working tree is touched.
 */
import path from 'node:path';

import { ambientRuntime, run as spawn } from 'bellpull';

import { run, type MutantResult, type RunResult } from './coordinator.js';

export interface FrozenOracle {
  base: string;
  /** Test files the change edited or added, repository-relative. */
  changedTests: string[];
  /** Mutation score with the base ref's tests, and with the change's. */
  baseScore: number;
  headScore: number;
  delta: number;
  /** Detected by the base tests, undetected by the change's: the tests got weaker here. */
  weakened: { id: string; file: string; line: number; mutatorName: string; replacement: string }[];
}

const detected = (m: MutantResult | undefined): boolean => m?.status === 'Killed' || m?.status === 'Timeout';
const undetected = (m: MutantResult | undefined): boolean => m?.status === 'Survived' || m?.status === 'NoCoverage';

/**
 * A test file the change added has no base version. It is served as one skipped test, so the base
 * run has the file (Vitest finds it on disk) and none of its tests.
 */
const ABSENT_AT_BASE = "import { it } from 'vitest';\nit.skip('absent at the base ref (oxmutate frozen oracle)', () => {});\n";

async function git(root: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  const r = await spawn('git', args, { cwd: root, runtime: ambientRuntime() });
  return { ok: r.ok, out: r.stdout };
}

export async function frozenOracle(head: RunResult, base: string): Promise<FrozenOracle> {
  const root = head.root;
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).out.trim() || root;
  const diff = await git(root, ['diff', '--name-only', base, '--']);
  if (!diff.ok) throw new Error(`git diff ${base} failed. fix: pass a ref this checkout has (fetch it first in CI)`);
  const changed = new Set(diff.out.split('\n').filter(Boolean).map((f) => path.join(top, f)));
  const testFiles = [...new Set(head.tests.map((t) => t.file))].filter((f) => changed.has(f));
  const result: FrozenOracle = { base, changedTests: testFiles.map((f) => path.relative(root, f)), baseScore: head.score.mutationScore, headScore: head.score.mutationScore, delta: 0, weakened: [] };
  if (testFiles.length === 0) return result;

  const shown = await Promise.all(testFiles.map((f) => git(root, ['show', `${base}:${path.relative(top, f).split(path.sep).join('/')}`])));
  const testOverrides = Object.fromEntries(testFiles.map((f, i) => [f, shown[i]?.ok ? shown[i].out : ABSENT_AT_BASE]));
  const frozen = await run({ ...head.options, testOverrides, incremental: false });
  const byId = new Map(frozen.mutants.map((m) => [m.id, m]));
  result.baseScore = frozen.score.mutationScore;
  result.delta = head.score.mutationScore - frozen.score.mutationScore;
  result.weakened = head.mutants
    .filter((m) => undetected(m) && detected(byId.get(m.id)))
    .map((m) => ({ id: m.id, file: m.file, line: m.start.line, mutatorName: m.mutatorName, replacement: m.replacement }));
  return result;
}
