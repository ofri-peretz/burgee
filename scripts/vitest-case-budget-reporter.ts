/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * No test case takes more than five seconds (D-20261101-tests-under-5s).
 *
 * The owner, 2026-11-01: "it doesn't make sense a single test case will take more than 5
 * seconds". On main that day 46 cases did, the slowest at 90 s, and nothing said so: every
 * suite runs under `testTimeout: 30_000` or more (`vitest-timeouts.config.ts`), because a
 * timeout is a bet on the machine and has to sit far above what a case takes. So a timeout
 * cannot be this gate — it fails the case that loses the bet, not the case that is slow.
 *
 * This reporter is the gate. Every suite that spreads `timeouts` loads it, so it runs in the
 * pre-push hook and in `Quality (Full)`'s `Unit Tests` (the required check); inside a battery it
 * defers its verdict to `scripts/case-budget.ts` (see `DEFER_ENV`). After the run it reads each
 * case's own duration — the body and its `beforeEach` /
 * `afterEach`, which is what vitest measures for a case — and when any is over
 * `CASE_BUDGET_MS` it names them and sets the exit code to 1, whatever else passed.
 *
 * A case over the budget is **measured again, alone**, before it fails the run: its file is run by
 * itself with `-t` naming the case, up to twice, and the case fails the gate only if its best
 * alone reading is over the budget too. One reading on a loaded machine is not the case's
 * duration — on this repository's development machine, with endpoint scanning at 170% CPU, a pure
 * computation read 7.4 s in a full suite and 4 ms alone, and one release-loop case read 5.7 s and
 * 16.4 s in two runs of the same tree — and a gate that goes red on the machine's load is a gate
 * people learn to re-run, which is no gate. The fastest of the readings is the one the machine
 * interfered with least. A case that is slow is slow every time, and the readings are printed.
 * Off CI, a case whose every alone reading was taken with the load average above the core count is
 * printed as unjudged rather than failed (`strict`); on CI the runner is the job's, and it fails.
 *
 * It does not judge:
 *
 * - **A run with coverage enabled.** v8's block counters slow the body itself, so a duration
 *   measured there is the instrument's as much as the case's; the same cases are gated
 *   uninstrumented by `Unit Tests`, in the same required check.
 * - **A run with `VITEST_CASE_BUDGET_MS=0`.** Only compat.yml's cells set it: they grade
 *   correctness on every OS under their own timeouts (windows-lane-holds keeps their half-budget
 *   report), and the budget is held in one CI place, `Unit Tests`.
 *
 * `NIGHTLY_ONLY` is the only exemption, and it is not for a slow case that runs on a pull
 * request: a case belongs there only when it was moved behind BURGEE_NIGHTLY, which only the weekly
 * local run (`npm run mutation:weekly`) sets, and the reason says what heavy operation it needs
 * (D-20261101-heavy-ci-runs-nightly; D-20261101-no-mutation-in-gha moved the run out of CI).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism, loadavg, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Reporter, type TestModule } from 'vitest/node';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The owner's number. A case at exactly the budget is within it. */
export const CASE_BUDGET_MS = 5_000;

/**
 * Cases that run only on the nightly schedule, keyed `<repo-relative file> > <full name>`, each
 * with the heavy operation that keeps it off a pull request. Empty is the goal; an entry leaves
 * by getting fast, never by being explained again.
 */
const E2E = 'packages/oxmutate/src/e2e.test.ts';
/** Why every oxmutate entry below is here; each adds what its own run does. */
const MUTATION_RUN = 'a whole oxmutate run on a fixture — the CLI, its Vitest servers, every mutant — 6.5–15 s on a contended CI runner, and only oxmutate source can make it faster (follow-up in the PR that moved it)';
export const NIGHTLY_ONLY: Readonly<Record<string, string>> = {
  [`${E2E} > restarts a polluted context and judges later mutants from a clean state`]: `${MUTATION_RUN}; 8.2 s`,
  [`${E2E} > re-runs file-level beforeEach hooks between mutants, so they read as no pollution`]: `${MUTATION_RUN}; 7.1 s`,
  [`${E2E} > decides no kill on a previous mutant's leftovers that a test cleaned up in finally`]: `${MUTATION_RUN}; 11.4 s`,
  [`${E2E} > kills a mutant a beforeEach hook reaches in the warm run, with no isolated run`]: `${MUTATION_RUN}; 6.6 s`,
  [`${E2E} > runs a run-once test file (ESLint's RuleTester) from fresh collections, with no restart`]: `${MUTATION_RUN}; unmeasured`,
  [`${E2E} > static mutants keep their fresh-worker verdicts > an import-time constant decides its mutants; an unread one survives`]: `${MUTATION_RUN}, every static mutant in a fresh worker; 6.9 s`,
  [`${E2E} > static mutants keep their fresh-worker verdicts > a global set at import does not carry one mutant value into the next`]: `${MUTATION_RUN}, every static mutant in a fresh worker; 9.3 s`,
  [`${E2E} > confirms a watchdog stop with 3x the budget before reporting a timeout`]: `${MUTATION_RUN}, whose fixture stalls 8 s twice on purpose so the 3x confirmation is what decides; 14.6 s`,
  [`${E2E} > the frozen oracle (R14, SC10) > reports the mutants a change stopped detecting when it weakens a test, and exits 1`]: `${MUTATION_RUN}, twice: the frozen base and the change; 9.7 s`,
  [`${E2E} > the frozen oracle (R14, SC10) > reports no drop when a change only adds a test`]: `${MUTATION_RUN}, twice: the frozen base and the change; 7.7 s`,
  [`${E2E} > the command runner (testRunner: command) > runs the command once per mutant in a sandbox and scores what the warm runner scores`]: `${MUTATION_RUN}, \`npx vitest run\` once per mutant; 9.3 s`,
  ['packages/oxmutate/src/sensitivity.test.ts > sensitivity (SC5) > a weak suite produces survivors, every one of them covered by a test that ran']: `${MUTATION_RUN}; 8.9 s`,
  ['packages/oxmutate/src/sensitivity.test.ts > sensitivity (SC5) > the closed suite produces none, over the same mutants']: `${MUTATION_RUN}; 16.1 s`,
  ['packages/oxmutate/src/vitest5-regression.test.ts > the Vitest 5 regression (SC7) > reports no killed mutant as Survived: every mutant is Killed by a test that ran']: `${MUTATION_RUN}, under the fixture's own Vitest 5; 6.4 s`,
  [
    "packages/oxmutate/src/vitest5-regression.test.ts > the Vitest 5 regression (SC7) > reproduces the defect: with Stryker 10.0.0's name filter put back, the same mutants are Survived having run no test"
  ]: `${MUTATION_RUN}, twice, the second with every mutant surviving into its confirmation run; 28.7 s`,
  [`${E2E} > scores a mutant whose test waits on an idle worker Timeout at its budget, with no 3x re-run`]: `${MUTATION_RUN}, waiting out a 4.5 s budget on purpose: a shorter one is reached while a loaded runner still loads the test file, which reads as a slow machine and flaked on CI (2026-11-02); 9.2 s`,
  [`${E2E} > keeps a survivor whose confirmation run was only slow, not killed`]: `${MUTATION_RUN}, whose fixture stalls 6 s on purpose so the confirmation's 3x re-run is what decides; 5.8 s`,
  ['packages/oxmutate/src/checker.test.ts > the type checker > refuses the mutants that do not compile, with the error, and passes the ones that do']:
    'the real TypeScript compiler, `npx tsc` once per batch, over the fixture project; 15.1 s on a contended CI runner',
};

export interface CaseDuration {
  file: string;
  name: string;
  duration: number;
  /** The best reading taken alone, when the first was over the budget. */
  alone?: number;
}

/** The key `NIGHTLY_ONLY` is written in. */
export const caseKey = (c: Pick<CaseDuration, 'file' | 'name'>): string => `${c.file} > ${c.name}`;

/** Every case over `budget` that `allowed` does not name, slowest first. */
export function overBudget(cases: readonly CaseDuration[], budget: number, allowed: Readonly<Record<string, string>> = NIGHTLY_ONLY): CaseDuration[] {
  return cases.filter((c) => c.duration > budget && allowed[caseKey(c)] === undefined).sort((a, b) => b.duration - a.duration || caseKey(a).localeCompare(caseKey(b)));
}

/** The budget this run is held to: `CASE_BUDGET_MS`, or `VITEST_CASE_BUDGET_MS` when it is set; 0 turns the gate off. */
export function budgetFrom(env: NodeJS.ProcessEnv): number {
  const raw = env['VITEST_CASE_BUDGET_MS'];
  if (raw === undefined || raw.trim() === '') return CASE_BUDGET_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`VITEST_CASE_BUDGET_MS=${raw}: not a number of milliseconds`);
  return n;
}

/** Wide enough for a six-digit duration, so the names line up. */
const MS_WIDTH = 7;

/** The lines the gate prints for `slow`, one per case. */
export function describeOverBudget(slow: readonly CaseDuration[], budget: number): string {
  const lines = slow.map((c) => `  ${String(Math.round(c.duration)).padStart(MS_WIDTH)} ms${c.alone === undefined ? '' : `, ${String(Math.round(c.alone))} ms alone`}  ${caseKey(c)}`);
  return [
    `\n✗ ${slow.length} test case${slow.length === 1 ? '' : 's'} over the ${budget} ms per-case budget (D-20261101-tests-under-5s):`,
    ...lines,
    '  Make the case fast without weakening it — share a spawn in beforeAll, import instead of spawning, shrink the fixture —',
    '  or, if it truly needs a heavy operation, move it behind BURGEE_NIGHTLY (npm run mutation:weekly runs it) and name it in NIGHTLY_ONLY',
    '  (scripts/vitest-case-budget-reporter.ts) with the reason.\n',
  ].join('\n');
}

const posix = (path: string): string => path.split('\\').join('/');

/** `text` as a regular expression that matches exactly it. */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

interface JsonReport {
  testResults?: { name: string; assertionResults?: { ancestorTitles: string[]; title: string; duration?: number | null }[] }[];
}

/**
 * The case's duration when its file runs alone and `-t` selects it: vitest's JSON report, read for
 * the one result whose titles are the case's. `undefined` when that run did not report the case,
 * which leaves the first reading standing.
 */
/** `env` without a single `GIT_*` variable. */
export const withoutGitEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));

/** A case read over the budget, with what it takes to run it again: its title, and the run's cwd and config. */
export type Candidate = CaseDuration & { title: string; cwd: string; config: string | undefined };

function measureAlone(c: Candidate): number | undefined {
  const out = mkdtempSync(join(tmpdir(), 'case-budget-'));
  try {
    const report = join(out, 'report.json');
    const vitest = join(dirname(createRequire(join(c.cwd, 'package.json')).resolve('vitest/package.json')), 'vitest.mjs');
    const config = c.config === undefined ? [] : ['--config', c.config];
    spawnSync(process.execPath, [vitest, 'run', resolve(ROOT, c.file), ...config, '-t', literal(c.title), '--reporter=json', `--outputFile=${report}`], {
      cwd: c.cwd,
      stdio: 'ignore',
      // The nested run is a measurement, not a second gate. And never with git's own variables:
      // from lefthook's pre-push they name the developer's repository (GIT_DIR inside
      // `.git/worktrees/` from a worktree), and a package suite run outside turbo's strict env
      // mode would hand them to every `git init` and `git` a test spawns — the way the shared
      // `.git/config` went `core.bare = true` (vitest-git-env-setup.ts, 2026-10-18).
      env: { ...withoutGitEnv(process.env), VITEST_CASE_BUDGET_MS: '0' },
    });
    const parsed = JSON.parse(readFileSync(report, 'utf8')) as JsonReport;
    for (const file of parsed.testResults ?? []) {
      for (const result of file.assertionResults ?? []) {
        if ([...result.ancestorTitles, result.title].join(' > ') === c.name && typeof result.duration === 'number') return result.duration;
      }
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** Alone readings taken before a case fails: the second only when the first is over the budget. */
const ALONE_READINGS = 2;

/** Whether other processes held more than every core while a reading was taken. */
const overloaded = (): boolean => (loadavg()[0] ?? 0) > availableParallelism();

/**
 * The fastest alone reading, stopping at the first that is within `budget` (`undefined` when none
 * was taken), and whether every reading was taken on a machine more than fully loaded.
 */
function bestAlone(c: Candidate, budget: number): { best: number | undefined; overloaded: boolean } {
  let best: number | undefined;
  let busy = true;
  for (let i = 0; i < ALONE_READINGS && (best === undefined || best > budget); i++) {
    const reading = measureAlone(c);
    busy &&= overloaded();
    if (reading !== undefined && (best === undefined || reading < best)) best = reading;
  }
  return { best, overloaded: busy };
}

/**
 * Whether an over-budget reading taken on an overloaded machine still fails the gate: always on
 * CI, where the runner is the job's alone; not on a developer's machine, where other processes
 * held more than every core for both readings. The development machine this was written on sits
 * at a load of 25–35 on 14 cores, under which a lock that reads one file read 14 s alone; failing
 * a push on that is failing it on the machine. Such a case is still printed, as unjudged, and the
 * required check judges it on a runner.
 */
export function strict(env: NodeJS.ProcessEnv): boolean {
  return env['CI'] === 'true';
}

/** One line per case, with its alone reading when it has one. */
const list = (cs: readonly CaseDuration[]): string => cs.map((c) => `  ${String(Math.round(c.duration))} ms${c.alone === undefined ? '' : `, ${String(Math.round(c.alone))} ms alone`}  ${caseKey(c)}`).join('\n');

/**
 * The verdict on `candidates`: each measured alone, and the ones still over `budget` named on
 * stderr. Returns whether the gate passed. The reporter calls it at the end of a run; the deferred
 * check (`scripts/case-budget.ts`) calls it after a whole battery.
 */
export function judge(candidates: readonly Candidate[], budget: number): boolean {
  if (candidates.length === 0) return true;
  const measured = candidates.map((c) => {
    const { best, overloaded: busy } = bestAlone(c, budget);
    return { ...c, alone: best, busy };
  });
  const over = measured.filter((c) => c.alone === undefined || c.alone > budget);
  const unjudged = strict(process.env) ? [] : over.filter((c) => c.busy);
  const slow = over.filter((c) => !unjudged.includes(c));
  const within = measured.filter((c) => !over.includes(c));
  if (within.length > 0) process.stderr.write(`\n${String(within.length)} case(s) read over the ${String(budget)} ms budget in a full run and under it alone; not failing on the machine's load:\n${list(within)}\n`);
  if (unjudged.length > 0) process.stderr.write(`\n${String(unjudged.length)} case(s) over the ${String(budget)} ms budget alone, but every reading was taken with the load average above ${String(availableParallelism())} cores; unjudged here, judged on CI:\n${list(unjudged)}\n`);
  if (slow.length === 0) return true;
  process.stderr.write(describeOverBudget(slow, budget));
  return false;
}

/**
 * Where a run inside a battery leaves its candidates instead of judging them. Inside
 * `turbo run test` ten suites run at once, so "alone" is never alone: on the development machine a
 * case whose `npm pack` takes 0.5 s read 17.5 s in the battery and 10.0 s re-run inside it. With
 * `VITEST_CASE_BUDGET_DEFER` set, the reporter writes the candidates there and `npx tsx
 * scripts/case-budget.ts <dir>` judges them after the battery, on a machine that has finished it.
 */
export const DEFER_ENV = 'VITEST_CASE_BUDGET_DEFER';

// eslint-disable-next-line import-next/no-default-export -- vitest loads a reporter given by path from its default export
export default class CaseBudgetReporter implements Reporter {
  private coverage = false;
  private config: string | undefined;

  onInit(vitest: { config: { coverage?: { enabled?: boolean } }; vite?: { config?: { configFile?: string } } }): void {
    this.coverage = vitest.config.coverage?.enabled === true;
    this.config = vitest.vite?.config?.configFile;
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const budget = budgetFrom(process.env);
    if (budget === 0 || this.coverage) return;
    const cases: Candidate[] = [];
    for (const module of modules) {
      for (const test of module.children.allTests()) {
        const diagnostic = test.diagnostic();
        if (diagnostic === undefined) continue;
        cases.push({ file: posix(relative(ROOT, module.moduleId)), name: test.fullName, title: test.name, duration: diagnostic.duration, cwd: process.cwd(), config: this.config });
      }
    }
    const candidates = overBudget(cases, budget) as Candidate[];
    if (candidates.length === 0) return;
    const defer = process.env[DEFER_ENV];
    if (defer !== undefined && defer !== '') {
      mkdirSync(defer, { recursive: true });
      writeFileSync(join(defer, `${String(process.pid)}-${String(Date.now())}.json`), `${JSON.stringify(candidates)}\n`);
      process.stderr.write(`\n${String(candidates.length)} case(s) over the ${String(budget)} ms budget in this run; judged alone after the battery (scripts/case-budget.ts).\n`);
      return;
    }
    if (!judge(candidates, budget)) process.exitCode = 1;
  }
}
