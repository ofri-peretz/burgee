/**
 * The per-case time budget: no test case takes longer than a set number of milliseconds (5,000 by
 * default). A timeout cannot be this gate: it sits far above what a case takes, because it bets on
 * the machine, and it fails the case that loses the bet rather than the case that is slow.
 *
 * A case read over the budget is measured again alone (its file by itself, `-t` naming it, best of
 * two) before it fails, because one reading on a loaded machine is the machine's, not the case's.
 * Off CI, a case whose every alone reading was taken with the load average above the core count is
 * printed as unjudged, and CI judges it. Inside a battery (`turbo run test`), set
 * `TRUEPASS_BUDGET_DEFER` to a directory: each run leaves its candidates there and
 * `truepass budget <dir>` judges them once the battery is over.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism, loadavg, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { ambientRuntime, run } from 'bellpull';
import { outputMode } from 'roundel/policy';

import { env as processEnv, execPath, writeErr } from './runtime.js';

/** The default budget: a case at exactly the budget is within it. */
export const DEFAULT_BUDGET_MS = 5_000;

/** Sets the budget for a run; `0` turns the gate off. */
export const BUDGET_ENV = 'TRUEPASS_BUDGET_MS';

/** Where a run inside a battery leaves its candidates for `truepass budget <dir>`. */
export const DEFER_ENV = 'TRUEPASS_BUDGET_DEFER';

/** One case and how long it took. `file` is relative to the repository root, with `/`. */
export interface CaseDuration {
  file: string;
  name: string;
  duration: number;
  /** The best reading taken alone, when the first was over the budget. */
  alone?: number | undefined;
}

/** A case read over the budget, with what it takes to run it again. */
export interface Candidate extends CaseDuration {
  /** The case's own title, for `-t`. */
  title: string;
  /** The absolute path of the test file. */
  path: string;
  /** The directory vitest ran in. */
  cwd: string;
  /** The vitest config the run used, if any. */
  config: string | undefined;
  /** The budget the run that read it held it to, so `truepass budget` judges it by the same one. */
  budget?: number | undefined;
}

/** Cases that may take longer, keyed `<file> > <full name>`, each with the reason. */
export type Exemptions = Readonly<Record<string, string>>;

/** The key exemptions are written in. */
export const caseKey = (c: Pick<CaseDuration, 'file' | 'name'>): string => `${c.file} > ${c.name}`;

/** `path` relative to `root`, with `/` on every platform. */
export const repoPath = (root: string, path: string): string => relative(root, path).split('\\').join('/');

/** Every case over `budget` that `exempt` does not name, slowest first. */
export function overBudget<T extends CaseDuration>(cases: readonly T[], budget: number, exempt: Exemptions = {}): T[] {
  return cases.filter((c) => c.duration > budget && exempt[caseKey(c)] === undefined).sort((a, b) => b.duration - a.duration || caseKey(a).localeCompare(caseKey(b)));
}

/** The budget a run is held to: `fallback`, or `TRUEPASS_BUDGET_MS` when set. `0` is off. */
export function budgetFrom(env: NodeJS.ProcessEnv, fallback: number = DEFAULT_BUDGET_MS): number {
  const raw = env[BUDGET_ENV];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${BUDGET_ENV}=${raw}: not a number of milliseconds`);
  return n;
}

/** On CI a reading taken under load still counts: the runner is the job's alone. roundel decides what CI is. */
// Stryker disable next-line ObjectLiteral: equivalent, a missing stdout reads as not a terminal, which is what this says
export const strict = (env: NodeJS.ProcessEnv): boolean => outputMode({ env, isTTY: { stdout: false } }) === 'ci';

/** How long a developer machine spends on alone readings before it leaves the rest to CI. */
export const LOCAL_ALONE_BUDGET_MS = 120_000;

/** Whether to leave a case unjudged without measuring it: never on CI; off CI, under load or out of time. */
export function skipAlone(isStrict: boolean, elapsedMs: number, overloadedNow: boolean): boolean {
  return !isStrict && (overloadedNow || elapsedMs > LOCAL_ALONE_BUDGET_MS);
}

/** `env` without a `GIT_*` variable: a hook's git variables would aim a test's `git init` at the real repository. */
export const withoutGitEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));

/** `text` as a regular expression that matches exactly it. */
export const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

interface JsonReport {
  testResults?: { assertionResults?: { ancestorTitles: string[]; title: string; duration?: number | null }[] }[];
}

/** The duration vitest's JSON report gives the case named `name`, if it reports it. */
export function durationIn(report: JsonReport, name: string): number | undefined {
  // Stryker disable next-line ArrayDeclaration: equivalent, a planted string has no assertion results to match
  for (const file of report.testResults ?? []) {
    for (const result of file.assertionResults ?? []) {
      if ([...result.ancestorTitles, result.title].join(' > ') === name && typeof result.duration === 'number') return result.duration;
    }
  }
  return undefined;
}

/** The arguments that run `c`'s file alone under `vitest`, `-t` naming it, its JSON report in `report`. */
export function aloneArgs(c: Candidate, vitest: string, report: string): string[] {
  const config = c.config === undefined ? [] : ['--config', c.config];
  return [vitest, 'run', c.path, ...config, '-t', literal(c.title), '--reporter=json', `--outputFile=${report}`];
}

/** Runs `node` with `args` in `cwd`, without the gate and without git's variables. */
export type Spawn = (args: readonly string[], cwd: string) => Promise<unknown>;

/** The environment an alone run gets: the gate off, so it does not judge itself, and no `GIT_*` variable. */
export const aloneEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({ ...withoutGitEnv(env), [BUDGET_ENV]: '0' });

const spawnNode: Spawn = (args, cwd) => run(execPath(), args, { runtime: ambientRuntime(), cwd, env: aloneEnv(processEnv()), timeout: 0 });

/** Runs `c`'s file alone with `-t` naming it and reads its duration; `undefined` when the run did not report it. */
export async function measureAlone(c: Candidate, spawn: Spawn = spawnNode): Promise<number | undefined> {
  const out = mkdtempSync(join(tmpdir(), 'truepass-budget-'));
  // Stryker disable BlockStatement: an empty catch falls through to the same undefined. It spans the whole try because Stryker reads no directive just above `} catch {`; the try block it also covers is one the alone tests kill
  try {
    const report = join(out, 'report.json');
    // Stryker disable next-line StringLiteral: equivalent, a require from the directory itself finds the same vitest
    const vitest = join(dirname(createRequire(join(c.cwd, 'package.json')).resolve('vitest/package.json')), 'vitest.mjs');
    await spawn(aloneArgs(c, vitest, report), c.cwd);
    // Stryker disable next-line StringLiteral: equivalent, JSON.parse reads a Buffer as its text
    return durationIn(JSON.parse(readFileSync(report, 'utf8')) as JsonReport, c.name);
  } catch {
    return undefined;
  } finally {
    // Stryker disable next-line BooleanLiteral: equivalent, the directory was made above, so there is always one to remove
    rmSync(out, { recursive: true, force: true });
  }
}
// Stryker restore BlockStatement

/** Whether other processes held more than every core: the one-minute load average over the core count. */
export const overloadedBy = (oneMinute: number, cores: number): boolean => oneMinute > cores;

/** What `judge` reads from the machine; the tests pass their own. */
export interface Machine {
  env: NodeJS.ProcessEnv;
  measure: (c: Candidate) => Promise<number | undefined>;
  overloaded: () => boolean;
  now: () => number;
  write: (text: string) => void;
  cores: number;
}

export const realMachine = (): Machine => ({
  env: processEnv(),
  measure: (c) => measureAlone(c),
  overloaded: () => {
    // Stryker disable next-line NumericLiteral: equivalent, loadavg() always has three entries; the default only satisfies the type
    const [oneMinute = 0] = loadavg();
    return overloadedBy(oneMinute, availableParallelism());
  },
  now: () => performance.now(),
  write: writeErr,
  cores: availableParallelism(),
});

/** Alone readings taken before a case fails: the second only when the first is over the budget. */
const ALONE_READINGS = 2;

const ms = (n: number): string => `${String(Math.round(n))} ms`;
const line = (c: CaseDuration): string => `  ${ms(c.duration)}${c.alone === undefined ? '' : `, ${ms(c.alone)} alone`}  ${caseKey(c)}`;

/**
 * The fastest alone reading of `c` (`undefined` when no run reported it), stopping at the first
 * within `budget`, and whether every reading was taken on an overloaded machine.
 */
async function readAlone(c: Candidate, budget: number, machine: Machine): Promise<{ alone: number | undefined; busy: boolean }> {
  const readings: (number | undefined)[] = [];
  // Stryker disable next-line ArrayDeclaration: equivalent, a planted string is truthy, as an overloaded reading is, and every reading adds its own
  const loads: boolean[] = [];
  while (readings.length < ALONE_READINGS && !within(fastest(readings), budget)) {
     
    readings.push(await machine.measure(c));
    loads.push(machine.overloaded());
  }
  return { alone: fastest(readings), busy: loads.every(Boolean) };
}

/** The fastest of `readings`, or `undefined` when none was reported. */
export function fastest(readings: readonly (number | undefined)[]): number | undefined {
  const reported = readings.filter((r) => r !== undefined);
  return reported.length === 0 ? undefined : Math.min(...reported);
}

/** Whether a reading is within `budget`: a case at exactly the budget is. */
// Stryker disable next-line ConditionalExpression: equivalent, `undefined <= budget` is false, so the undefined check only names the case
export const within = (reading: number | undefined, budget: number): boolean => reading !== undefined && reading <= budget;

/** The default advice printed under the slow cases. */
export const DEFAULT_HINT = 'Make each case fast without weakening it (share a spawn in beforeAll, import instead of spawning, shrink the fixture), or exempt it with the reason.';

/**
 * The verdict on `candidates`: each measured alone, the ones still over `budget` named. Returns
 * whether the gate passed.
 */
export async function judge(candidates: readonly Candidate[], budget: number, hint: string = DEFAULT_HINT, machine: Machine = realMachine()): Promise<boolean> {
  // Stryker disable next-line ConditionalExpression: equivalent, an empty list measures nothing and passes below; this only skips reading the clock
  if (candidates.length === 0) return true;
  const isStrict = strict(machine.env);
  const started = machine.now();
  const measured: (Candidate & { busy: boolean })[] = [];
  for (const c of candidates) {
    if (skipAlone(isStrict, machine.now() - started, machine.overloaded())) {
      measured.push({ ...c, alone: undefined, busy: true });
      continue;
    }
    // eslint-disable-next-line reliability/no-await-in-loop -- alone means one at a time: readings taken together would load the machine they measure
    measured.push({ ...c, ...(await readAlone(c, budget, machine)) });
  }
  const over = measured.filter((c) => c.alone === undefined || c.alone > budget);
  const unjudged = isStrict ? [] : over.filter((c) => c.busy);
  const slow = over.filter((c) => !unjudged.includes(c));
  const within = measured.filter((c) => !over.includes(c));
  if (within.length > 0) machine.write(`\n${String(within.length)} case(s) read over the ${ms(budget)} budget in a full run and under it alone; not failing on the machine's load:\n${within.map(line).join('\n')}\n`);
  if (unjudged.length > 0) machine.write(`\n${String(unjudged.length)} case(s) over the ${ms(budget)} budget alone, read with the load average above ${String(machine.cores)} cores; unjudged here, judged on CI:\n${unjudged.map(line).join('\n')}\n`);
  if (slow.length === 0) return true;
  machine.write([`\n✗ ${String(slow.length)} test case(s) over the ${ms(budget)} per-case budget:`, ...slow.map(line), `  ${hint}\n`].join('\n'));
  return false;
}

/** Every candidate the battery's runs left in `dir`. */
export function readCandidates(dir: string): Candidate[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    // Stryker disable next-line StringLiteral: equivalent, JSON.parse reads a Buffer as its text
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Candidate[]);
}
