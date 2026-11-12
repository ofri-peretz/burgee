/**
 * One mutation run, end to end:
 *
 *   instrument (native, parallel) → dry run ×2 (coverage, timings, nondeterministic tests)
 *   → incremental reuse → plan → warm units on a work-stealing server pool, under a watchdog
 *   → isolated re-runs (static mutants, canary-flagged files, unfinished work, flaky verdicts)
 *   → verdicts
 *
 * Every decision that can make a verdict wrong is guarded and counted in `stats`, so a run says
 * what it had to correct, not just what it concluded.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ambientRuntime, run as spawn } from 'bellpull';

import { checkSurvivors } from './checker.js';
import type { Unit } from './child.js';
import { runCommandMutants } from './command-runner.js';
import { disables, type Options } from './config.js';
import { rangeDisables } from './directives.js';
import { guardDisk, isClean, type DiskChange } from './diskguard.js';
import { globToRegExp, matchFiles } from './files.js';
import type { FrozenOracle } from './frozen.js';
import { changedLines, parseMutateSpec, shardOf, touches, withinRange, type MutateRange } from './lanes.js';
import { native, type NativeMutant } from './native.js';
import { startProgress } from './progress.js';
import { VERSION } from './reports.js';
import { FILE_KEY, env, stderr } from './runtime.js';
import { createPool, type UnitOutcome } from './scheduler.js';
import { summarizeSpec, tracesFor, type SpecSummary } from './spec-oracle.js';
import { SPEC_TRACES_ENV } from './spec.js';

export type Status = 'Killed' | 'Survived' | 'Timeout' | 'NoCoverage' | 'RuntimeError' | 'CompileError' | 'Ignored';

export interface MutantResult extends NativeMutant {
  file: string;
  status: Status;
  statusReason?: string | undefined;
  coveredBy: string[];
  /** A spec oracle's replay tests that reach this mutant (spec-oracle.ts); not in `coveredBy`. */
  specCoveredBy?: string[] | undefined;
  /** The spec oracle's verdict, beside the tests' `status`. */
  spec?: { oracle: string; status: 'Killed' | 'Survived' | 'Unknown'; killedBy?: string[] | undefined } | undefined;
  killedBy?: string[] | undefined;
  testsCompleted?: number | undefined;
  static?: boolean | undefined;
  /** The verdict changed between re-runs: the covering tests are nondeterministic. */
  flaky?: boolean | undefined;
  /** Reused from the incremental cache, not run. */
  reused?: boolean | undefined;
  /** Paths this mutant's run wrote outside the sandbox, found in its unit and put back (diskguard.ts). */
  wrote?: string[] | undefined;
}

export interface TestInfo {
  id: string;
  file: string;
  name: string;
  ms: number;
}

export interface RunStats {
  files: number;
  mutants: number;
  instrumentMs: number;
  dryRunMs: number;
  mutationMs: number;
  /** Static mutants decided in live workers (section 5b), between the warm and the isolated phases. */
  staticMs: number;
  /** Unarmed re-collections in that phase, the guard each live static verdict waits on (runner.ts). */
  staticRecollections: number;
  isolatedMs: number;
  wallMs: number;
  testExecutions: number;
  /** Warm units, send to outcome, summed over servers: what `mutationMs` is in server time. */
  warmUnitMs: number;
  /** Of `warmUnitMs`, the time inside armed test runs. The rest is starting workers, collecting files, canaries and hooks. */
  warmArmedMs: number;
  /** Isolated runs by what sent the mutant there: the parts of `isolatedRuns`. */
  isolatedByCause: { static: number; stopped: number; unfinished: number; rerun: number; confirm: number; flaky: number };
  watchdogKills: number;
  /** Of `watchdogKills`, the stops whose worker was idle, waiting (heartbeat.ts). In an isolated run each is a Timeout as it stands. */
  idleStalls: number;
  crashes: number;
  canaryFiles: number;
  /** Of the verdicts the incremental cache would have reused, how many were run afresh to check it, and how many disagreed on detected or not. */
  auditSampled: number;
  auditDisagreed: number;
  /** Contexts restarted because a mutant left state behind (the per-execution canary fired). */
  pollutionRestarts: number;
  /** Units after which the project on disk had changed (diskguard.ts): put back, and their verdicts and those of the units running beside them re-run. */
  diskWrites: number;
  /** Survivors of the warm run that a whole-file re-run killed (cross-test effects). */
  survivorsOverturned: number;
  /** Watchdog timeouts that finished when re-run with 3x the budget: the machine was slow, not the mutant. */
  timeoutsOverturned: number;
  /** Survivors the type checker refused (checker.ts): CompileError, out of the score. */
  compileErrors: number;
  isolatedRuns: number;
  reused: number;
  flakyTests: number;
  flakyMutants: number;
  units: number;
  serversSpawned: number;
  /** Mutants whose Timeout their worker called itself, the wait able to end by nothing (quiescence.ts): no watchdog wait, no respawn. */
  deadlocks: number;
}

export interface RunResult {
  root: string;
  options: Options;
  sources: Record<string, string>;
  mutants: MutantResult[];
  tests: TestInfo[];
  stats: RunStats;
  score: { detected: number; undetected: number; total: number; mutationScore: number; covered: number };
  /** Each spec oracle's F metrics (spec-oracle.ts). */
  spec?: SpecSummary[] | undefined;
  /** The frozen oracle's comparison, when `frozenOracle` was set (frozen.ts). */
  frozen?: FrozenOracle | undefined;
  /** Set when the run stopped after the dry run (`dryRunOnly`): no verdicts, no reports. */
  dryRunOnly?: boolean | undefined;
}

export class InstrumentFault extends Error {}

/** One mutant's verdict from its isolated runs. */
interface Verdict {
  status: Status;
  /** A Timeout from an idle stop: the test waited past its budget on an idle worker (heartbeat.ts). */
  idle?: boolean | undefined;
  /** An idle Timeout the worker called itself, its wait able to end by nothing (quiescence.ts). Never re-run, as an idle stop. */
  deadlock?: boolean | undefined;
  killedBy?: string[] | undefined;
  /** A Killed whose failing tests all failed by their own timeout: re-run once before it is believed. */
  slow?: boolean | undefined;
  /** A Timeout from two such runs. */
  slowTwice?: boolean | undefined;
  /** Tests that ran across its files: Stryker's `testsCompleted`. */
  testsCompleted?: number | undefined;
}

interface ChildRecord {
  type: 'dry' | 'mutant' | 'polluted' | 'isolated' | 'static-fallback' | 'recollection';
  id?: string;
  /** `isolated`: the run stopped on the mutant's hit-count limit: a runaway, scored Timeout. */
  timeout?: boolean;
  /** `static-fallback`: static mutants a live worker handed back to the fresh-worker path. */
  ids?: string[];
  test?: string;
  status?: 'Killed' | 'Survived' | 'Timeout';
  file?: string;
  killed?: boolean;
  failed?: string[];
  /** `isolated`: every test that failed did so by its own timeout: on a loaded machine, a slow test and not a kill. */
  slow?: boolean;
  /** `mutant`: how long this execution took. */
  ms?: number;
  /** `mutant`, `isolated`: a Timeout the worker called itself: its wait could never end (quiescence.ts). */
  deadlock?: boolean;
  /** `mutant`: the record came from a spec oracle's replay test. */
  spec?: boolean;
  /** `dry`: per test file, the project files its run evaluated (its module graph, outside node_modules). */
  modules?: Record<string, string[]>;
  /** `isolated`: tests that ran (passed or failed) in this file run. */
  ran?: number;
  /** `polluted`: mutants run after the first since the last clean canary; their verdicts are dropped. */
  suspects?: string[];
  tests?: (TestInfo & { state: string })[];
  coverage?: { static: Record<string, number>; perTest: Record<string, Record<string, number>> };
  fileErrors?: { file: string; error: string }[];
  /** `dry`: unhandled rejections and uncaught errors the unmutated suite raised (runner.ts). */
  unhandled?: number;
  /** `dry`: test files whose tests run once per collection (runner.ts `runOnce`). */
  runOnce?: string[];
}

function readRecords(file: string): ChildRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ChildRecord);
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** The lockfiles a project's dependencies are pinned by, nearest first. */
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];

/** The nearest lockfile's hash, from `root` up: a dependency's code decides verdicts too, and it never enters the module graph. */
function lockfileHash(root: string): string {
  const found = LOCKFILES.map((f) => path.join(root, f)).find((f) => existsSync(f));
  if (found) return sha(readFileSync(found, 'utf8'));
  // Up to the filesystem root, where a directory is its own parent.
  const above = path.dirname(root);
  return above === root ? 'none' : lockfileHash(above);
}

/** The options a verdict depends on: a reused verdict was reached under the same ones. */
const verdictOptions = (o: Options): unknown => ({
  timeoutMS: o.timeoutMS,
  timeoutFactor: o.timeoutFactor,
  excludedMutations: [...o.excludedMutations].sort(),
  ignoreStatic: o.ignoreStatic,
  strykerCompat: o.strykerCompat,
  testOverrides: o.testOverrides,
  vitestConfig: o.vitestConfig && existsSync(o.vitestConfig) ? sha(readFileSync(o.vitestConfig, 'utf8')) : null,
});

/**
 * Work units of at most this many (mutant, test) executions: small enough to steal, large enough
 * that each unit's fresh worker, which imports the test file's whole graph, is paid for few units.
 * At 120, module loading was most of the CPU on burgee/controlroom (React/Ink in every worker); 400
 * cut units 172 -> 93 and wall 44 -> 39 s (paratext 39 -> 35 s), and 1000 gained nothing more
 * (2026-10-30). Smaller stays better for a pollution restart, which re-runs the rest of a unit.
 */
const UNIT_PAIRS = 400;
/** Killed and Timeout are both detected: the audit compares what the score counts. */
const detected = (s: Status | undefined): boolean => s === 'Killed' || s === 'Timeout';

/** The share of reusable cached verdicts each run decides afresh, to check the cache (load-robust.md, L5). */
const AUDIT_SHARE = 0.05;

/** A Timeout whose worker found its wait could never end (quiescence.ts). */
const DEADLOCK_REASON = 'its test deadlocked: nothing left in the worker could resume it (a hang, called in under a second)';

/** Why an isolated run's Timeout is one: its worker called a deadlock, a stop read idle, or two stops. */
function timeoutReason(v: Verdict): string {
  if (v.deadlock) return DEADLOCK_REASON;
  if (v.idle) return 'its test waited past the budget with the worker idle: a hang, not a slow test';
  if (v.slowTwice) return "its tests failed only by their own timeout, in two runs";
  return 'stopped by the watchdog twice, the second time with 3x the budget';
}

/** How many times its isolated budget a busy stop gets on its re-run. */
const RERUN_SLACK = 3;

/**
 * No single test execution is waited on past this (owner, 2026-11-04: "we should not wait longer than
 * that"). Every watchdog budget is capped at it per test the run executes, the 3x re-run of a busy stop
 * included. A hang is mostly called by its worker in about half a second (quiescence.ts); the cap
 * bounds the waits it cannot judge.
 */
export const MAX_TEST_MS = 5000;
const MS_PER_MINUTE = 60_000;
const PERCENT = 100;

/** Every test that reaches a mutant: the score's, then a spec oracle's replay tests. */
const allCovering = (m: MutantResult): string[] => [...m.coveredBy, ...(m.specCoveredBy ?? [])];
const percent = (n: number, of: number): number => (of ? (PERCENT * n) / of : PERCENT);

/** Stryker's score: detected over everything valid and not ignored; `covered` leaves out no-coverage. */
function scoreOf(mutants: MutantResult[]): RunResult['score'] {
  const scored = mutants.filter((m) => !['Ignored', 'CompileError', 'RuntimeError'].includes(m.status));
  const detected = scored.filter((m) => m.status === 'Killed' || m.status === 'Timeout').length;
  const noCoverage = scored.filter((m) => m.status === 'NoCoverage').length;
  return { detected, undetected: scored.length - detected, total: scored.length, mutationScore: percent(detected, scored.length), covered: percent(detected, scored.length - noCoverage) };
}

export async function run(options: Options): Promise<RunResult> {
  const wall0 = performance.now();
  const { root } = options;
  const work = mkdtempSync(path.join(tmpdir(), 'oxmutate-'));
  const stats: RunStats = {
    files: 0, mutants: 0, instrumentMs: 0, dryRunMs: 0, mutationMs: 0, staticMs: 0, staticRecollections: 0, isolatedMs: 0, wallMs: 0, testExecutions: 0, warmUnitMs: 0, warmArmedMs: 0, isolatedByCause: { static: 0, stopped: 0, unfinished: 0, rerun: 0, confirm: 0, flaky: 0 },
    watchdogKills: 0, idleStalls: 0, deadlocks: 0, crashes: 0, canaryFiles: 0, pollutionRestarts: 0, diskWrites: 0, auditSampled: 0, auditDisagreed: 0, survivorsOverturned: 0, timeoutsOverturned: 0, compileErrors: 0, isolatedRuns: 0, reused: 0, flakyTests: 0, flakyMutants: 0, units: 0, serversSpawned: 0,
  };
  let unitSeq = 0;
  const fileFor = (kind: string, ext: string): string => path.join(work, `${kind}-${String(unitSeq++)}.${ext}`);
  const pools: { close(): void; stats: { spawned: number } }[] = [];
  const progress = startProgress(options.reporters, stderr);
  try {
    progress.phase('instrumenting');
    // ── 1. Instrument ─────────────────────────────────────────────────────────────────────────
    // Stryker's `file:line-line` entries select files by their glob and mutants by their range.
    const specs = options.mutate.map(parseMutateSpec);
    const files = matchFiles(root, specs.map((x) => x.glob));
    const rangesFor = (file: string): MutateRange[] | undefined => {
      const here = specs.filter((x) => !x.glob.startsWith('!') && globToRegExp(x.glob).test(file));
      return here.some((x) => !x.range) ? undefined : here.flatMap((x) => (x.range ? [x.range] : []));
    };
    const sources: Record<string, string> = {};
    for (const f of files) sources[f] = readFileSync(path.join(root, f), 'utf8');
    const t0 = performance.now();
    const instrumented = native().instrumentFiles(files.map((f) => ({ path: f, source: sources[f] ?? '' })), { strykerCompat: options.strykerCompat, ignore: options.ignore });
    stats.instrumentMs = performance.now() - t0;
    const parseErrors = instrumented.filter((f) => f.error).map((f) => f.error);
    if (parseErrors.length) throw new InstrumentFault(`cannot parse ${String(parseErrors.length)} file(s): ${parseErrors.slice(0, 3).join('; ')}`);

    const changed = options.since ? await changedLines(root, options.since) : undefined;
    const mutants: MutantResult[] = [];
    const codeMap: Record<string, string> = {};
    const directiveErrors: string[] = [];
    for (const f of instrumented) {
      const { disables: offs, errors } = disables(sources[f.path] ?? '', f.path);
      const ranged = rangeDisables(sources[f.path] ?? '', f.path);
      const ranges = rangesFor(f.path);
      directiveErrors.push(...errors, ...ranged.errors);
      let any = false;
      for (const m of f.mutants) {
        if (changed && !touches(changed, f.path, m.start.line, m.end.line)) continue;
        if (ranges && !ranges.some((r) => withinRange(r, m.start, m.end))) continue;
        if (options.shard && shardOf(m.id, options.shard.count) !== options.shard.index) continue;
        const off = offs.find((d) => d.line === m.start.line && (d.mutators === 'all' || d.mutators.includes(m.mutatorName)));
        const inRange = ranged.reasonFor(m.start.line, m.mutatorName);
        const excluded = options.excludedMutations.includes(m.mutatorName);
        mutants.push({
          ...m,
          file: f.path,
          coveredBy: [],
          status: off || inRange !== undefined || excluded || m.ignoredReason ? 'Ignored' : 'NoCoverage',
          statusReason: off?.reason ?? inRange ?? m.ignoredReason ?? (excluded ? `excluded mutator ${m.mutatorName}` : undefined),
        });
        any = true;
      }
      if (any && f.code) codeMap[path.join(root, f.path)] = f.code;
    }
    if (directiveErrors.length) throw new InstrumentFault(directiveErrors.join('\n'));
    stats.files = files.length;
    stats.mutants = mutants.length;
    const mapFile = path.join(work, 'instrumented.json');
    // The frozen oracle's base-ref test files ride along in the same map (frozen.ts).
    writeFileSync(mapFile, JSON.stringify({ ...codeMap, ...options.testOverrides }));

    // ── 1b. The build, once, before anything runs (Stryker's `buildCommand`) ─────────────────
    if (options.buildCommand) {
      const [command = '', ...args] = options.buildCommand.trim().split(/\s+/);
      const built = await spawn(command, args, { cwd: root, runtime: ambientRuntime() });
      if (!built.ok) throw new InstrumentFault(`buildCommand \`${options.buildCommand}\` exited ${String(built.code)}: ${(built.stderr || built.stdout).trim().slice(-1500)}. fix: make the build pass on its own first`);
    }

    // ── 1c. The command runner: any test command, one process per mutant (command-runner.ts) ──
    if (options.commandRunner) {
      const m0 = performance.now();
      try {
        const ran = await runCommandMutants({ root, command: options.commandRunner, codeMap, concurrency: options.concurrency, timeoutMS: options.timeoutMS, timeoutFactor: options.timeoutFactor, dryRunTimeoutMinutes: options.dryRunTimeoutMinutes }, mutants);
        stats.dryRunMs = ran.dryMs;
        stats.testExecutions = ran.executions;
      } catch (error) {
        throw new InstrumentFault(error instanceof Error ? error.message : String(error));
      }
      stats.mutationMs = performance.now() - m0;
      stats.wallMs = performance.now() - wall0;
      return { root, options, sources, mutants, tests: [], stats, score: scoreOf(mutants) };
    }

    // ── 2. Dry run, twice (the second only to find nondeterministic tests) ────────────────────
    // Spec oracles' traces, generated once; servers inherit where they are (spec.ts reads it).
    const traceDirs: Record<string, string> = {};
    for (const oracle of options.specOracles) traceDirs[oracle.name] = await tracesFor(oracle, root, work);
    if (options.specOracles.length) env[SPEC_TRACES_ENV] = JSON.stringify(traceDirs);
    const dryPool = createPool({ root, vitestConfig: options.vitestConfig, workers: options.concurrency, instrumentedMap: mapFile, nodeArgs: options.testRunnerNodeArgs }, 1, work, 'dry');
    pools.push(dryPool);
    const dryRun = async (): Promise<{ tests: (TestInfo & { state: string })[]; perTest: Record<string, Record<string, number>>; static: Record<string, number>; runOnce: string[]; modules: Record<string, string[]> }> => {
      const unit: Unit = { mode: 'dry', files: [], results: fileFor('dry', 'jsonl'), progress: fileFor('dry', 'progress') };
      let failure: UnitOutcome | undefined;
      let overBudget = false;
      await dryPool.drain([unit], () => options.dryRunTimeoutMinutes * MS_PER_MINUTE, (_, o) => {
        if (o.crashed) failure = o;
        if (o.killedFor) overBudget = true;
        return [];
      });
      if (overBudget) throw new InstrumentFault(`the dry run took longer than dryRunTimeoutMinutes (${String(options.dryRunTimeoutMinutes)}). fix: raise dryRunTimeoutMinutes, or find the test that hangs with no mutant active`);
      const recs = readRecords(unit.results).filter((r) => r.type === 'dry');
      if (failure && recs.length === 0) throw new InstrumentFault(`the dry run did not complete: ${failure.stderr.slice(-1500)}`);
      const perTest: Record<string, Record<string, number>> = {};
      const stat: Record<string, number> = {};
      for (const r of recs) {
        Object.assign(perTest, r.coverage?.perTest ?? {});
        for (const [k, v] of Object.entries(r.coverage?.static ?? {})) stat[k] = (stat[k] ?? 0) + v;
      }
      const fileErrors = recs.flatMap((r) => r.fileErrors ?? []);
      if (fileErrors.length) {
        throw new InstrumentFault(`${String(fileErrors.length)} test file(s) failed to load during the dry run, so their tests would be missing from every verdict: ${fileErrors.slice(0, 3).map((e) => `${path.relative(root, e.file)}: ${e.error}`).join('; ')}`);
      }
      // A mutant that raises one is Killed (runner.ts), so a suite that raises one unmutated would kill every mutant it covers.
      const unhandled = recs.reduce((n, r) => n + (r.unhandled ?? 0), 0);
      if (unhandled > 0) throw new InstrumentFault(`the suite raised ${String(unhandled)} unhandled error(s) with no mutant active, so no verdict can be trusted. fix: make \`vitest run\` pass with no "Unhandled Errors" first`);
      return { tests: recs.flatMap((r) => r.tests ?? []), perTest, static: stat, runOnce: recs.flatMap((r) => r.runOnce ?? []), modules: Object.assign({}, ...recs.map((r) => r.modules ?? {})) as Record<string, string[]> };
    };
    progress.phase('dry run');
    const d0 = performance.now();
    const dry = await dryRun();
    stats.dryRunMs = performance.now() - d0;
    const failing = dry.tests.filter((t) => t.state === 'fail');
    if (failing.length) throw new InstrumentFault(`${String(failing.length)} test(s) fail with no mutant active, so no verdict can be trusted: ${failing.slice(0, 5).map((t) => t.name).join('; ')}. fix: make the suite pass first`);
    if (dry.tests.length === 0 && !options.allowEmpty) throw new InstrumentFault('the dry run ran no tests. fix: check the Vitest config the run used, or set allowEmpty');

    // The second dry run only finds nondeterministic tests, which matter at step 7: it runs beside
    // the warm phase instead of before it (6 s of a 107 s burgee/controlroom run, 2026-10-27).
    const findFlakyTests = async (): Promise<Set<string>> => {
      const flaky = new Set<string>();
      if (options.flakyReruns > 0) {
        const second = await dryRun();
        const keys = (cov: Record<string, number> | undefined): string => Object.keys(cov ?? {}).sort().join(',');
        const again = new Map(second.tests.map((t) => [t.id, t]));
        for (const t of dry.tests) {
          const b = again.get(t.id);
          if (!b || b.state !== t.state || keys(dry.perTest[t.id]) !== keys(second.perTest[t.id])) flaky.add(t.id);
        }
      }
      dryPool.close();
      return flaky;
    };
    const flakyCheck = findFlakyTests();
    flakyCheck.catch(() => undefined); // awaited at step 7; a run that fails first must not also reject unhandled

    const testInfo = new Map(dry.tests.map((t) => [t.id, t]));
    const coveringTests = new Map<string, string[]>();
    const hits = new Map<string, number>();
    /** Static mutant → the test files whose collection (imports, beforeAll) reached it. */
    const staticFiles = new Map<string, Set<string>>();
    for (const [testId, perMutant] of Object.entries(dry.perTest)) {
      if (testId.startsWith(FILE_KEY)) {
        const file = testId.slice(FILE_KEY.length);
        for (const [id, n] of Object.entries(perMutant)) {
          (staticFiles.get(id) ?? staticFiles.set(id, new Set()).get(id))?.add(file);
          hits.set(id, (hits.get(id) ?? 0) + n);
        }
        continue;
      }
      for (const [id, n] of Object.entries(perMutant)) {
        if (!coveringTests.has(id)) coveringTests.set(id, []);
        coveringTests.get(id)?.push(testId);
        hits.set(id, (hits.get(id) ?? 0) + n);
      }
    }
    const staticIds = new Set([...Object.keys(dry.static), ...staticFiles.keys()]);
    // A spec oracle's replay tests, by test id → oracle name. They are not tests of the score:
    // their kills are reported as the spec's, on a track of their own.
    const specOf = new Map<string, string>();
    for (const oracle of options.specOracles) {
      const replay = new Set(matchFiles(root, oracle.replay).map((f) => path.join(root, f)));
      for (const t of dry.tests) if (replay.has(t.file)) specOf.set(t.id, oracle.name);
    }
    const specVerdict = (m: MutantResult, recs: ChildRecord[]): NonNullable<MutantResult['spec']> => {
      const oracle = specOf.get(m.specCoveredBy?.[0] ?? '') ?? '';
      const killers = recs.filter((r) => r.status === 'Killed' || r.status === 'Timeout');
      if (killers.length) return { oracle, status: 'Killed', killedBy: [...new Set(killers.map((r) => r.test ?? ''))] };
      return { oracle, status: recs.length >= (m.specCoveredBy?.length ?? 0) && !unfinished.has(m.id) ? 'Survived' : 'Unknown' };
    };
    const byCostOf = (a: string, b: string): number => (testInfo.get(a)?.ms ?? 0) - (testInfo.get(b)?.ms ?? 0);
    for (const m of mutants) {
      if (m.status === 'Ignored') continue;
      const covering = coveringTests.get(m.id) ?? [];
      m.coveredBy = covering.filter((t) => !specOf.has(t)).sort(byCostOf);
      const specCovering = covering.filter((t) => specOf.has(t)).sort(byCostOf);
      if (specCovering.length) m.specCoveredBy = specCovering;
      if (staticIds.has(m.id)) {
        m.static = true;
        if (options.ignoreStatic) {
          m.status = 'Ignored';
          m.statusReason = 'static mutant (ignoreStatic)';
        }
      }
    }

    if (options.dryRunOnly) {
      stats.wallMs = performance.now() - wall0;
      const tests = dry.tests.map(({ id, file, name, ms }) => ({ id, file, name, ms }));
      return { root, options, sources, mutants, tests, stats, score: { detected: 0, undetected: 0, total: 0, mutationScore: 0, covered: 0 }, dryRunOnly: true };
    }

    // ── 3. Incremental reuse ──────────────────────────────────────────────────────────────────
    const fileHashes = new Map<string, string>();
    const fileHash = (abs: string): string => {
      let h = fileHashes.get(abs);
      if (h === undefined) {
        h = existsSync(abs) ? sha(readFileSync(abs, 'utf8')) : 'missing';
        fileHashes.set(abs, h);
      }
      return h;
    };
    // A reused verdict must be one this run would reach: the mutated source, every test file that
    // runs it (a static mutant's are the files that load its module), every project file those tests
    // evaluated (their module graph from the dry run), and what decides a verdict besides the code
    // (oxmutate's version, Node's, the lockfile, the options). Before, only the source and the covering
    // test files counted, and a static mutant's fingerprint was its source alone.
    const envKey = sha(JSON.stringify({ oxmutate: VERSION, node: process.version, lock: lockfileHash(root), options: verdictOptions(options) }));
    const fingerprint = (m: MutantResult): string => {
      const testFiles = new Set([...m.coveredBy.map((t) => testInfo.get(t)?.file ?? ''), ...(staticFiles.get(m.id) ?? [])]);
      const graph = new Set([...testFiles].flatMap((f) => dry.modules[f] ?? []).filter((f) => !testFiles.has(f) && f !== path.join(root, m.file)));
      return sha([envKey, sha(sources[m.file] ?? ''), ...[...testFiles].sort().map(fileHash), '|', ...[...graph].sort().map((f) => `${f}=${fileHash(f)}`)].join(':'));
    };
    type Cached = { fp: string; status: Status; killedBy?: string[] | undefined; testsCompleted?: number | undefined };
    /** Cached verdicts this run decided afresh to check the cache by, and what the cache said. */
    const audited = new Map<string, Status>();
    const cache: Record<string, Cached> =
      options.incremental && existsSync(options.incrementalFile) ? (JSON.parse(readFileSync(options.incrementalFile, 'utf8')) as { mutants: Record<string, Cached> }).mutants : {};
    for (const m of mutants) {
      if (m.status === 'Ignored' || (!m.static && m.coveredBy.length === 0)) continue;
      const hit = cache[m.id];
      if (hit && hit.fp === fingerprint(m)) {
        // The audit: a share of the verdicts the cache would reuse run anyway, and must agree.
        if (Math.random() < AUDIT_SHARE) {
          audited.set(m.id, hit.status);
          continue;
        }
        m.status = hit.status;
        m.killedBy = hit.killedBy;
        m.testsCompleted = hit.testsCompleted;
        m.reused = true;
        stats.reused++;
      }
    }

    // ── 4. Warm units on the server pool ──────────────────────────────────────────────────────
    // Static mutants, hybrids included, never run warm: a module evaluated without the mutant
    // cannot stand in for one evaluated with it. Tried 2026-10-27: warm kills of hybrids gave 3
    // false kills on burgee/paratext (an import-time registration the tests then read).
    const toRun = mutants.filter((m) => !m.reused && m.status !== 'Ignored' && !m.static && allCovering(m).length > 0);
    const byId = new Map(mutants.map((m) => [m.id, m]));
    /** The switch-taken count past which a run is a runaway: 100x what the dry run saw, at least 1000. */
    const hitLimitOf = (id: string): number => Math.max(1000, (hits.get(id) ?? 1) * 100);
    const hitLimits = Object.fromEntries(toRun.map((m) => [m.id, hitLimitOf(m.id)]));
    const maxTestMs = (id: string): number => { const m = byId.get(id); return Math.max(0, ...(m ? allCovering(m) : []).map((t) => testInfo.get(t)?.ms ?? 0)); };
    // The watchdog is for runaways, which loop in fast code; a slow test under a loaded machine is
    // not one. 3x the covering test's dry-run time, not Stryker's 1.5x: at 1.5x, subprocess-heavy
    // burgee/paratext tests were stopped as false timeouts (2026-10-27).
    const warmBudget = (id: string): number => Math.min(MAX_TEST_MS, options.timeoutMS + Math.max(options.timeoutFactor, 3) * maxTestMs(id) + 250);

    // Files a mutant's covering tests live in, cheapest first (by the covering tests' time there).
    const fileOrder = new Map<string, string[]>();
    for (const m of toRun) {
      const cost = new Map<string, number>();
      for (const t of allCovering(m)) {
        const info = testInfo.get(t);
        if (info) cost.set(info.file, (cost.get(info.file) ?? 0) + info.ms + 0.05);
      }
      fileOrder.set(m.id, [...cost].sort((a, b) => a[1] - b[1]).map(([f]) => f));
    }
    type Plan = Record<string, string[]>;
    /** Each planned test's dry-run time: a worker's deadlock confirm window scales with it (quiescence.ts). */
    const testMsOf = (plan: Plan): Record<string, number> => Object.fromEntries(Object.keys(plan).map((t) => [t, testInfo.get(t)?.ms ?? 0]));
    const planUnits = new Map<string, { file: string; plan: Plan; depth: number }>();
    const unfinished = new Set<string>();
    const makeUnit = (file: string, plan: Plan, depth = 0): Unit => {
      const unit: Unit = { mode: 'mutant', files: [file], results: fileFor('unit', 'jsonl'), progress: fileFor('unit', 'progress'), plan: fileFor('plan', 'json') };
      writeFileSync(unit.plan as string, JSON.stringify({ tests: plan, hitLimits, skip: [], specTests: [...specOf.keys()], runOnce: dry.runOnce, testMs: testMsOf(plan) }));
      planUnits.set(unit.results, { file, plan, depth });
      stats.units++;
      return unit;
    };
    /** Split a file's plan into units of about UNIT_PAIRS executions, by mutant. */
    const unitsFor = (file: string, plan: Plan): Unit[] => {
      const ids = [...new Set(Object.values(plan).flat())];
      const pairs = Object.values(plan).reduce((sum, l) => sum + l.length, 0);
      const parts = Math.max(1, Math.min(ids.length, Math.ceil(pairs / UNIT_PAIRS)));
      return Array.from({ length: parts }, (_, i) => {
        const mine = new Set(ids.filter((_, j) => j % parts === i));
        return makeUnit(file, Object.fromEntries(Object.entries(plan).map(([t, l]) => [t, l.filter((id) => mine.has(id))]).filter(([, l]) => (l as string[]).length > 0)));
      });
    };
    /** Units for these mutants, each planned only in the files `pick` selects for it. */
    const unitsForRound = (mutantsHere: MutantResult[], pick: (m: MutantResult) => string[]): Unit[] => {
      const perFile = new Map<string, Map<string, string[]>>();
      for (const m of mutantsHere) {
        const files = new Set(pick(m));
        for (const t of allCovering(m)) {
          const file = testInfo.get(t)?.file;
          if (!file || !files.has(file)) continue;
          if (!perFile.has(file)) perFile.set(file, new Map());
          const tests = perFile.get(file) as Map<string, string[]>;
          if (!tests.has(t)) tests.set(t, []);
          tests.get(t)?.push(m.id);
        }
      }
      const units = [...perFile].flatMap(([file, tests]) => unitsFor(file, Object.fromEntries(tests)));
      // Sizing and ordering units by dry-run time instead of pair count (longest first) was tried:
      // 30% more units and ~10% more CPU on burgee/controlroom, and no wall-clock gain that this
      // machine's load (average 21 to 76 across the A/B) could show (2026-10-27).
      const weight = (u: Unit): number => Object.values(planUnits.get(u.results)?.plan ?? {}).reduce((sum, l) => sum + l.length, 0);
      return units.sort((a, b) => weight(b) - weight(a));
    };

    const records: ChildRecord[] = [];
    // ── Writes outside the sandbox (diskguard.ts) ──
    // Units run side by side, so a write found when one unit ends may be any running unit's: every
    // unit in flight then is tainted, its verdicts dropped when it ends and its work re-queued in
    // halves. A unit down to one mutant that finds the write names that mutant.
    const disk = env['OXMUTATE_NO_DISKGUARD'] ? undefined : await guardDisk(root);
    const inFlight = new Set<string>();
    const tainted = new Set<string>();
    const writers = new Map<string, string[]>();
    const diskWrittenDuring = async (unit: Unit): Promise<Unit[] | undefined> => {
      const change: DiskChange | undefined = await disk?.check();
      const dirty = change !== undefined && !isClean(change);
      if (dirty) {
        stats.diskWrites++;
        if (!disk?.restore(change)) {
          throw new InstrumentFault(`a mutant wrote outside the sandbox and the project could not be put back: ${[...change.changed, ...change.added, ...change.removed].join(', ')}. fix: restore them (git checkout / git clean), and see which test writes into the project`);
        }
        for (const other of inFlight) tainted.add(other);
      }
      if (!dirty && !tainted.delete(unit.results)) return undefined;
      const entry = planUnits.get(unit.results);
      if (!entry) return [];
      const ids = [...new Set(Object.values(entry.plan).flat())];
      const paths = change ? [...change.changed, ...change.added, ...change.removed] : [];
      if (dirty && ids.length === 1) {
        // One mutant left in the unit that found the write: it is named with the paths. Alone on the
        // machine, it is the writer and its own verdict stands (its run began on a clean project);
        // with units beside it, the isolated path decides it again.
        const id = ids[0] as string;
        writers.set(id, paths);
        if (inFlight.size === 0) records.push(...readRecords(unit.results));
        else unfinished.add(id);
        return [];
      }
      if (entry.depth >= 40) {
        for (const id of ids) unfinished.add(id);
        return [];
      }
      if (ids.length < 2) return [makeUnit(entry.file, entry.plan, entry.depth + 1)];
      const half = new Set(ids.slice(0, Math.ceil(ids.length / 2)));
      const pick = (inHalf: boolean): Plan => Object.fromEntries(Object.entries(entry.plan).map(([t, l]) => [t, l.filter((id) => half.has(id) === inHalf)]).filter(([, l]) => (l as string[]).length > 0));
      return [makeUnit(entry.file, pick(true), entry.depth + 1), makeUnit(entry.file, pick(false), entry.depth + 1)];
    };
    const runaways = new Set<string>();
    const crashedIds = new Set<string>();
    // Dependencies inlined here too, so the static phase (5b) reuses these servers instead of starting its own.
    const pool = createPool({ root, vitestConfig: options.vitestConfig, workers: 1, instrumentedMap: mapFile, nodeArgs: options.testRunnerNodeArgs, inlineDeps: true }, options.concurrency, work, 'mutant');
    pools.push(pool);
    /** Mutants decided on one verdict track: the tests', or a spec oracle's replay tests'. */
    const killedSoFar = (spec: boolean): Set<string> => new Set([...runaways, ...crashedIds, ...records.filter((r) => r.type === 'mutant' && r.status !== 'Survived' && Boolean(r.spec) === spec).map((r) => r.id ?? '')]);
    const afterUnit = async (unit: Unit, outcome: UnitOutcome): Promise<Unit[]> => {
      inFlight.delete(unit.results);
      stats.warmUnitMs += outcome.ms ?? 0;
      const wrote = await diskWrittenDuring(unit);
      if (wrote) return wrote;
      // Verdicts a failed canary cannot vouch for are dropped; their pairs are re-queued below.
      const raw = readRecords(unit.results);
      const suspect = new Set(raw.filter((r) => r.type === 'polluted').flatMap((r) => (r.suspects ?? []).map((id) => `${id}|${r.test ?? ''}`)));
      const recs = raw.filter((r) => !(r.type === 'mutant' && suspect.has(`${r.id ?? ''}|${r.test ?? ''}`)));
      records.push(...recs);
      const wasPolluted = recs.some((r) => r.type === 'polluted');
      if (wasPolluted) stats.pollutionRestarts++;
      if (!outcome.killedFor && !outcome.crashed && !wasPolluted) return [];
      const bad = outcome.killedFor ?? outcome.crashedFor;
      if (outcome.killedFor) runaways.add(outcome.killedFor);
      else if (bad) crashedIds.add(bad);
      // The rest of the unit: pairs not yet run, mutants not yet decided, into a fresh context.
      const ran = new Set(recs.filter((r) => r.type === 'mutant').map((r) => `${r.id ?? ''}|${r.test ?? ''}`));
      const decided = { tests: killedSoFar(false), spec: killedSoFar(true) };
      const { file, plan, depth } = planUnits.get(unit.results) as { file: string; plan: Plan; depth: number };
      const rest: Plan = {};
      for (const [t, ids] of Object.entries(plan)) {
        const done = specOf.has(t) ? decided.spec : decided.tests;
        const left = ids.filter((id) => !done.has(id) && !ran.has(`${id}|${t}`));
        if (left.length) rest[t] = left;
      }
      if (Object.keys(rest).length === 0) return [];
      // A unit that made no progress, or that keeps being polluted, is left to the isolated
      // re-run rather than retried for ever.
      if (ran.size === 0 || depth >= 40) {
        for (const id of new Set(Object.values(rest).flat())) unfinished.add(id);
        return [];
      }
      const ids = [...new Set(Object.values(rest).flat())];
      if (ids.length < 2) return [makeUnit(file, rest, depth + 1)];
      const half = new Set(ids.slice(0, Math.ceil(ids.length / 2)));
      const pickHalf = (inHalf: boolean): Plan => Object.fromEntries(Object.entries(rest).map(([t, l]) => [t, l.filter((id) => half.has(id) === inHalf)]).filter(([, l]) => (l as string[]).length > 0));
      return [makeUnit(file, pickHalf(true), depth + 1), makeUnit(file, pickHalf(false), depth + 1)];
    };
    const killedCount = (): string => `${String(killedSoFar(false).size)} of ${String(toRun.length)} mutants killed so far`;
    progress.phase('warm runs', killedCount);
    const m0 = performance.now();
    // One round, every covering file at once. A two-round plan (cheapest file first, survivors
    // to the rest) cut executions 23% on burgee/paratext but took 2.9x longer: the second round
    // waits for the first to drain, and the expensive files then run as a tail (2026-10-27).
    // Kills are filtered out at dispatch, not when a unit is built: most units wait in the queue while
    // others run, and a mutant another unit has killed (vouched for by its canary) needs no more of its
    // covering tests. 1,022 of 6,550 warm executions on burgee/paratext ran after the mutant's kill
    // (2026-10-30). Verdicts are unchanged: a Killed mutant needs no other pair (dispatch.qnt).
    const beforeUnit = (unit: Unit): boolean => {
      inFlight.add(unit.results);
      const entry = planUnits.get(unit.results);
      if (!entry) return true;
      const decided = { tests: killedSoFar(false), spec: killedSoFar(true) };
      const left: Plan = {};
      for (const [t, ids] of Object.entries(entry.plan)) {
        const done = specOf.has(t) ? decided.spec : decided.tests;
        const keep = ids.filter((id) => !done.has(id));
        if (keep.length) left[t] = keep;
      }
      if (Object.keys(left).length === 0) {
        inFlight.delete(unit.results);
        return false;
      }
      entry.plan = left;
      writeFileSync(unit.plan as string, JSON.stringify({ tests: left, hitLimits, skip: [], specTests: [...specOf.keys()], runOnce: dry.runOnce, testMs: testMsOf(left) }));
      return true;
    };
    await pool.drain(unitsForRound(toRun, (m) => fileOrder.get(m.id) ?? []), (_, id) => warmBudget(id), afterUnit, beforeUnit);
    stats.mutationMs = performance.now() - m0;

    // ── 5. Verdicts from the warm run ─────────────────────────────────────────────────────────
    const byMutant = new Map<string, ChildRecord[]>();
    for (const r of records) if (r.type === 'mutant' && r.id) (byMutant.get(r.id) ?? byMutant.set(r.id, []).get(r.id))?.push(r);
    stats.testExecutions = records.filter((r) => r.type === 'mutant').length;
    stats.warmArmedMs = records.reduce((sum, r) => sum + (r.type === 'mutant' ? (r.ms ?? 0) : 0), 0);
    stats.canaryFiles = new Set(records.filter((r) => r.type === 'polluted' && r.file).map((r) => r.file ?? '')).size;

    const isolatedQueue: MutantResult[] = [];
    for (const m of toRun) {
      const all = byMutant.get(m.id) ?? [];
      const recs = all.filter((r) => !r.spec);
      const killers = recs.filter((r) => r.status === 'Killed' || r.status === 'Timeout');
      if (m.specCoveredBy) m.spec = specVerdict(m, all.filter((r) => r.spec));
      if (m.coveredBy.length === 0 && !runaways.has(m.id) && !crashedIds.has(m.id)) {
        continue; // reached only by a spec oracle: no test covers it, and its status says so
      } else if (runaways.has(m.id)) {
        stats.isolatedByCause.stopped++;
        isolatedQueue.push(m); // a watchdog stop is confirmed before it is reported (6, below)
      } else if (crashedIds.has(m.id)) {
        m.status = 'RuntimeError';
        m.statusReason = 'the worker crashed while this mutant ran';
      } else if (killers.length) {
        m.status = killers.some((r) => r.status === 'Killed') ? 'Killed' : 'Timeout';
        if (m.status === 'Timeout' && killers.some((r) => r.deadlock)) m.statusReason = DEADLOCK_REASON;
        m.killedBy = [...new Set(killers.map((r) => r.test ?? ''))];
        m.testsCompleted = recs.length;
      } else if (!unfinished.has(m.id) && recs.length >= new Set(m.coveredBy).size) {
        m.status = 'Survived';
        m.testsCompleted = recs.length;
      } else {
        stats.isolatedByCause.unfinished++;
        isolatedQueue.push(m); // unfinished: a crash left work undone
      }
    }
    const staticMutants = mutants.filter((m) => m.static && m.status !== 'Ignored' && !m.reused);

    // ── 6. Isolated re-runs: the switch armed before import, Vitest run normally ──────────────
    const allTestFiles = [...new Set(dry.tests.map((t) => t.file))];
    // A static mutant needs the files that load it (plus any whose tests reach it); only a hit
    // with no file to attribute it to (a setup file outside collection) falls back to all files.
    const fileCost = new Map<string, number>();
    for (const t of dry.tests) fileCost.set(t.file, (fileCost.get(t.file) ?? 0) + t.ms);
    const byCost = (files: string[]): string[] => [...files].sort((a, b) => (fileCost.get(a) ?? 0) - (fileCost.get(b) ?? 0));
    // Test file -> source file -> how many of that source's mutants its tests reach. A static mutant
    // rarely has covering tests of its own, so its loaders were tried cheapest first, and the cheapest
    // seldom tests the module: on burgee/controlroom each tabs.ts static mutant ran 75 tests in two
    // files where Stryker needed 37 (2026-10-30). The file that exercises the module goes first.
    const affinity = new Map<string, Map<string, number>>();
    for (const mm of mutants) {
      for (const t of mm.coveredBy) {
        const f = testInfo.get(t)?.file;
        if (!f) continue;
        const bySource = affinity.get(f) ?? affinity.set(f, new Map()).get(f) as Map<string, number>;
        bySource.set(mm.file, (bySource.get(mm.file) ?? 0) + 1);
      }
    }
    const byAffinity = (source: string, files: string[]): string[] =>
      byCost(files).sort((a, b) => (affinity.get(b)?.get(source) ?? 0) - (affinity.get(a)?.get(source) ?? 0));
    const filesFor = (m: MutantResult): string[] => {
      const tests = m.coveredBy.map((t) => testInfo.get(t)?.file ?? '');
      if (!m.static) return byCost([...new Set(tests)]);
      const loaders = staticFiles.get(m.id);
      if (!loaders || m.id in dry.static) return byCost(allTestFiles);
      // Files whose tests reach the mutant first: they kill it. Ordering all loaders by cost alone
      // ran a file that only imports it first, and 288 of 349 isolated kills on burgee/paratext
      // came from a later file (2026-10-27).
      const covering = byCost([...new Set(tests)]);
      return [...covering, ...byAffinity(m.file, [...loaders].filter((f) => !covering.includes(f)))];
    };
    /** How many tests a mutant's isolated run executes: its covering tests, or every test of its files when static. */
    const testsRun = (id: string): number => {
      const m = byId.get(id);
      const fs = m ? filesFor(m) : allTestFiles;
      const covering = new Set(m && !m.static ? m.coveredBy : []);
      return Math.max(1, dry.tests.filter((t) => fs.includes(t.file) && (covering.size === 0 || covering.has(t.id))).length);
    };
    const isolatedBudget = (id: string): number => {
      const m = byId.get(id);
      const fs = m ? filesFor(m) : allTestFiles;
      // A non-static mutant's isolated run executes only its covering tests (`tests` below), so they
      // are its budget; every test of its files made a hang wait 30-40 s on oxmutate's own suite,
      // where its covering tests take a fraction of that (2026-10-30). A static mutant runs them all.
      const covering = new Set(m && !m.static ? m.coveredBy : []);
      const ms = dry.tests.filter((t) => fs.includes(t.file) && (covering.size === 0 || covering.has(t.id))).reduce((sum, t) => sum + t.ms, 0);
      return Math.min(MAX_TEST_MS * testsRun(id), 1500 + options.timeoutMS + options.timeoutFactor * ms * 2);
    };
    /** `slack` times a mutant's isolated budget, still within MAX_TEST_MS per test it runs. */
    const isolatedCapped = (id: string, slack: number): number => Math.min(slack * isolatedBudget(id), MAX_TEST_MS * testsRun(id));
    // A non-static mutant runs only its covering tests, armed across all of them in file order:
    // Stryker's semantics, so cross-test effects still show (a no-op reset() lets state pile up
    // for the next covering test). A static mutant runs every test of its files, because an
    // import-time change reaches tests that never execute the mutated line.
    /**
     * Static mutants decided in live workers, one unit per (test file, batch of its static mutants),
     * on a pool that inlines dependencies. Returns the mutants this path could not decide.
     */
    const decideStaticLive = async (items: MutantResult[]): Promise<MutantResult[]> => {
      if (items.length === 0) return [];
      const STATIC_BATCH = 25;
      /** Units of up to STATIC_BATCH mutants per test file, for the files each mutant gets this round. */
      const unitsFor = (filesOf: (m: MutantResult) => string[]): Unit[] => {
        const byFile = new Map<string, string[]>();
        for (const m of items) for (const f of filesOf(m)) (byFile.get(f) ?? byFile.set(f, []).get(f))?.push(m.id);
        return [...byFile].flatMap(([file, ids]) =>
          Array.from({ length: Math.ceil(ids.length / STATIC_BATCH) }, (_, i): Unit => ({
            mode: 'static', files: [file], results: fileFor('static', 'jsonl'), progress: fileFor('static', 'progress'), staticIds: ids.slice(i * STATIC_BATCH, (i + 1) * STATIC_BATCH),
            hitLimits: Object.fromEntries(ids.slice(i * STATIC_BATCH, (i + 1) * STATIC_BATCH).map((id) => [id, hitLimitOf(id)])),
          })),
        );
      };
      const killed = new Map<string, { killedBy: string[]; ran: number }>();
      /** Decided by the hit-count limit: a runaway, Timeout like a warm one. */
      const timedOut = new Set<string>();
      const passed = new Map<string, Set<string>>(); // mutant -> files that ran it clean
      const back = new Set<string>();
      const ran = new Map<string, number>();
      const staticPool = pool;
      const afterStatic = (unit: Unit, outcome: UnitOutcome): Unit[] => {
        const file = unit.files[0] ?? '';
        const decided = new Set<string>();
        for (const r of readRecords(unit.results)) {
          if (r.type === 'recollection') stats.staticRecollections++;
          if (r.type === 'static-fallback') for (const id of r.ids ?? []) back.add(id);
          if (r.type !== 'isolated' || !r.id) continue;
          decided.add(r.id);
          ran.set(r.id, (ran.get(r.id) ?? 0) + (r.ran ?? 0));
          if (r.timeout) timedOut.add(r.id);
          if (r.killed || r.timeout) killed.set(r.id, { killedBy: [...(killed.get(r.id)?.killedBy ?? []), ...(r.failed ?? [])], ran: 0 });
          else (passed.get(r.id) ?? passed.set(r.id, new Set()).get(r.id))?.add(file);
        }
        // A stop or a crash leaves the rest of the batch undecided: the fresh-worker path decides it.
        if (outcome.killedFor || outcome.crashed) for (const id of unit.staticIds ?? []) if (!decided.has(id)) back.add(id);
        return [];
      };
      const keepUndecided = (unit: Unit): boolean => {
        unit.staticIds = (unit.staticIds ?? []).filter((id) => !killed.has(id) && !back.has(id));
        return unit.staticIds.length > 0;
      };
      // Two rounds: each mutant first in the file most likely to kill it (filesFor puts the files whose
      // tests reach it first, cheapest first), then its other files only if it survived. In one round
      // every loading file ran a mutant at once, and a kill in one did not spare the others: 41 tests a
      // static kill on burgee/controlroom against Stryker's 33.6 (2026-10-30).
      const open = (m: MutantResult): boolean => !killed.has(m.id) && !back.has(m.id);
      const rounds = [(m: MutantResult): string[] => filesFor(m).slice(0, 1), (m: MutantResult): string[] => (open(m) ? filesFor(m).slice(1) : [])];
      // the mutant's run and the unarmed canary after it
      for (const round of rounds) await staticPool.drain(unitsFor(round), (_, id) => isolatedCapped(id, 2), afterStatic, keepUndecided);
      const undecided: MutantResult[] = [];
      for (const m of items) {
        const k = killed.get(m.id);
        if (k) {
          m.status = timedOut.has(m.id) && !k.killedBy.length ? 'Timeout' : 'Killed';
          m.killedBy = [...new Set(k.killedBy)];
          m.testsCompleted = ran.get(m.id) ?? 0;
        } else if (!back.has(m.id) && filesFor(m).every((f) => passed.get(m.id)?.has(f))) {
          m.status = 'Survived';
          m.testsCompleted = ran.get(m.id) ?? 0;
        } else undecided.push(m);
      }
      return undecided;
    };
    const runIsolated = async (items: MutantResult[], slack = 1): Promise<Map<string, Verdict>> => {
      const verdicts = new Map<string, Verdict>();
      if (items.length === 0) return verdicts;
      const mk = (batch: MutantResult[]): Unit => ({ mode: 'isolated', files: [], results: fileFor('iso', 'jsonl'), progress: fileFor('iso', 'progress'), batch: batch.map((m) => ({ id: m.id, files: filesFor(m), tests: m.static ? undefined : m.coveredBy, hitLimit: hitLimitOf(m.id) })) });
      // Packed by estimated cost, heaviest first into the lightest bin, and the heaviest bins run
      // first. Equal mutant counts left one unit at 8.4 s while the others finished in under 3 s on
      // burgee/controlroom (2026-10-30): a mutant's cost is its files' dry-run time, not one.
      const cost = (m: MutantResult): number => isolatedBudget(m.id);
      const bins = Array.from({ length: Math.min(items.length, options.concurrency * 2) }, () => ({ load: 0, batch: [] as MutantResult[] }));
      for (const m of [...items].sort((x, y) => cost(y) - cost(x))) {
        const bin = bins.reduce((lightest, b) => (b.load < lightest.load ? b : lightest));
        bin.load += cost(m);
        bin.batch.push(m);
      }
      const units = bins.sort((x, y) => y.load - x.load).map((b) => mk(b.batch));
      stats.isolatedRuns += items.length;
      await pool.drain(
        units,
        (_, id) => isolatedCapped(id, slack),
        (unit, outcome) => {
          // Vitest reports per test file: a mutant is killed if any of its files failed.
          for (const rec of readRecords(unit.results)) {
            if (rec.type !== 'isolated' || !rec.id) continue;
            const prev = verdicts.get(rec.id);
            const testsCompleted = (prev?.testsCompleted ?? 0) + (rec.ran ?? 0);
            if (rec.timeout) verdicts.set(rec.id, { status: 'Timeout', testsCompleted, ...(rec.deadlock && { idle: true, deadlock: true }) });
            else if (rec.killed) verdicts.set(rec.id, { status: 'Killed', killedBy: [...(prev?.killedBy ?? []), ...(rec.failed ?? [])], testsCompleted, slow: rec.slow === true && (prev?.status !== 'Killed' || prev.slow === true) });
            else verdicts.set(rec.id, { status: prev?.status ?? 'Survived', killedBy: prev?.killedBy, testsCompleted });
          }
          if (outcome.killedFor) verdicts.set(outcome.killedFor, { status: 'Timeout', idle: outcome.stall === 'idle' });
          if (outcome.crashed && outcome.crashedFor) verdicts.set(outcome.crashedFor, { status: 'RuntimeError' });
          if (!outcome.killedFor && !outcome.crashed) return [];
          const done = new Set([...verdicts.keys()]);
          const rest = (unit.batch ?? []).filter((b) => !done.has(b.id)).map((b) => byId.get(b.id) as MutantResult);
          return rest.length ? [mk(rest)] : [];
        },
      );
      for (const m of items) if (!verdicts.has(m.id)) verdicts.set(m.id, { status: 'RuntimeError' });
      return verdicts;
    };
    // ── 5b. Static mutants in live workers (.sdlc/intents/oxmutate/staticwarm.qnt) ─────────────
    // A fresh worker per (static mutant, file) cost ~80 ms of start-up around tests that take a few
    // ms: 29 of 35 s on burgee/paratext (2026-10-30). A live worker re-evaluates the project's modules
    // per mutant instead; whatever it cannot vouch for comes back here for the fresh-worker path.
    // OXMUTATE_ISOLATE_STATIC=1 sends every static mutant down the fresh-worker path, as before.
    const s0 = performance.now();
    const staticBack = env['OXMUTATE_ISOLATE_STATIC'] ? staticMutants : await decideStaticLive(staticMutants);
    stats.staticMs = performance.now() - s0;
    stats.isolatedByCause.static = staticBack.length;
    isolatedQueue.push(...staticBack);
    progress.phase(`isolated runs (static mutants and stragglers: ${String(isolatedQueue.length)})`);
    const i0 = performance.now();
    const first = await runIsolated(isolatedQueue);
    // A watchdog stop on a loaded machine is a slow test, not a runaway: 31 of them on one
    // burgee/paratext run while the load average sat at 40, all Survived for Stryker (2026-10-27).
    // Each stop gets one more run with 3x the budget; only one that is stopped again is a Timeout.
    // An idle stop is not re-run: its worker was waiting with its event loop turning and no CPU spent,
    // on something the mutant never lets happen, which no budget cures; it is a Timeout as Stryker
    // scores it. Re-run at 3x, 375 of them on caique's 10-31 run "finished" only because Vitest's 30 s
    // test timeout failed the test (D-20261101-idle-stall-is-timeout, stall.qnt).
    // A test that failed by its own timeout is the same reading from the other side: Vitest stopped
    // it, not the watchdog. On compat-oracle's `hosts.ts`, with the load average at 45 to 120, 8 of 15
    // static mutants were Killed this way by tests that clone repositories, and survive a quiet run
    // (sc8-profile.md §6, A-20261112-oxmutate-test-timeout-kill). One more run decides it.
    const slowKill = (v: Verdict | undefined): boolean => v?.status === 'Killed' && v.slow === true;
    const stopped = isolatedQueue.filter((m) => (first.get(m.id)?.status === 'Timeout' && !first.get(m.id)?.idle) || slowKill(first.get(m.id)));
    stats.isolatedByCause.rerun += stopped.length;
    const again = await runIsolated(stopped, RERUN_SLACK);
    for (const m of stopped) {
      const v = again.get(m.id);
      if (!v || v.status === 'RuntimeError') continue;
      if (slowKill(first.get(m.id))) {
        // Slow twice is a Timeout, as a second watchdog stop is; anything else is the second run's verdict.
        first.set(m.id, slowKill(v) ? { status: 'Timeout', slowTwice: true, testsCompleted: v.testsCompleted } : v);
        if (v.status === 'Survived') stats.timeoutsOverturned++;
      } else if (v.status !== 'Timeout') {
        first.set(m.id, v);
        stats.timeoutsOverturned++;
      }
    }
    for (const m of isolatedQueue) {
      const v = first.get(m.id);
      if (v) {
        m.status = v.status;
        m.killedBy = v.killedBy;
        m.testsCompleted = v.testsCompleted;
        if (v.status === 'Timeout') m.statusReason = timeoutReason(v);
      }
    }

    // ── 6b. Confirm survivors under whole-file semantics ──────────────────────────────────────
    // The warm runner arms a mutant for one test at a time, so a mutant whose effect only shows
    // across tests (a `reset()` in beforeEach made a no-op, so state piles up for the next test)
    // survives warm and is killed when armed for the whole file, the way Stryker runs it (burgee/
    // paratext plugin.ts, 2026-10-27). Survivors are what a person acts on, so each one is
    // re-run once with the mutant armed across its covering files before it is reported.
    // A survivor with one covering test is not re-run: confirmation runs only covering tests, so there
    // is no later test for its leftover state to reach, and the warm run already armed that test
    // through its hooks from clean state (.sdlc/intents/oxmutate/confirm.qnt).
    const survivors = toRun.filter((m) => m.status === 'Survived' && new Set(m.coveredBy).size > 1);
    stats.isolatedByCause.confirm += survivors.length;
    const confirmed = await runIsolated(survivors);
    // A timeout here is a watchdog stop like any other, and a loaded machine makes them: two
    // closeout survivors were reported killed this way while a docs build shared the machine
    // (2026-10-27). The same rule as section 6: one more run at 3x the budget before believing it.
    const stoppedHere = survivors.filter((m) => (confirmed.get(m.id)?.status === 'Timeout' && !confirmed.get(m.id)?.idle) || slowKill(confirmed.get(m.id)));
    stats.isolatedByCause.rerun += stoppedHere.length;
    const recheck = await runIsolated(stoppedHere, RERUN_SLACK);
    for (const m of stoppedHere) {
      const v = recheck.get(m.id);
      if (v) confirmed.set(m.id, slowKill(confirmed.get(m.id)) && slowKill(v) ? { status: 'Timeout', slowTwice: true, testsCompleted: v.testsCompleted } : v);
    }
    for (const m of survivors) {
      const v = confirmed.get(m.id);
      if (v && v.status !== 'Survived' && v.status !== 'RuntimeError') {
        m.status = v.status;
        m.killedBy = v.killedBy;
        m.statusReason = v.slowTwice ? timeoutReason(v) : 'killed only when the mutant stays active across the whole test file (cross-test effect)';
        stats.survivorsOverturned++;
      }
    }

    // ── 6c. Survivors that do not type-check are CompileErrors (checker.ts) ────────────────────
    if (options.typeCheck) {
      progress.phase('type-checking survivors');
      // Every undetected mutant is one somebody would act on: survivors and the uncovered.
      const survived = mutants.filter((m) => m.status === 'Survived' || m.status === 'NoCoverage');
      const refused = await checkSurvivors({ root, tsconfig: options.tsconfigFile, command: options.typeChecker, concurrency: options.concurrency }, survived).catch((error: unknown) => {
        throw new InstrumentFault(error instanceof Error ? error.message : String(error));
      });
      for (const m of survived.filter((x) => refused.has(x.id))) {
        m.status = 'CompileError';
        m.statusReason = `does not type-check: ${refused.get(m.id) ?? ''}`;
        stats.compileErrors++;
      }
    }

    // ── 7. Flaky verdicts: re-run mutants whose covering tests are nondeterministic ───────────
    const flakyTests = await flakyCheck;
    stats.flakyTests = flakyTests.size;
    const flakyCandidates = toRun.filter((m) => m.coveredBy.some((t) => flakyTests.has(t)));
    const seen = new Map(flakyCandidates.map((m) => [m.id, new Set<string>([m.status === 'Timeout' ? 'Killed' : m.status])]));
    for (let n = 1; n <= options.flakyReruns && flakyCandidates.length; n++) {
      stats.isolatedByCause.flaky += flakyCandidates.length;
      const again = await runIsolated(flakyCandidates);
      for (const m of flakyCandidates) {
        const v = again.get(m.id);
        if (v) seen.get(m.id)?.add(v.status === 'Timeout' ? 'Killed' : v.status);
      }
    }
    for (const m of flakyCandidates) {
      const verdicts = seen.get(m.id) ?? new Set();
      if (verdicts.size > 1) {
        m.flaky = true;
        m.statusReason = `verdict changed across ${String(options.flakyReruns + 1)} runs (${[...verdicts].join(', ')}); covering tests are nondeterministic`;
        stats.flakyMutants++;
      }
    }
    stats.isolatedMs = performance.now() - i0;
    stats.watchdogKills = pool.stats.killed;
    stats.idleStalls = pool.stats.idle;
    for (const [id, paths] of writers) {
      const m = byId.get(id);
      if (m) m.wrote = paths;
    }
    stats.deadlocks = mutants.filter((m) => m.statusReason === DEADLOCK_REASON).length;
    stats.crashes = pool.stats.crashed;

    // ── 8. Score, cache, result ───────────────────────────────────────────────────────────────
    if (options.incremental) {
      mkdirSync(path.dirname(options.incrementalFile), { recursive: true });
      // A cache that disagrees with a fresh run about whether a mutant was detected is not trusted
      // again: only this run's own verdicts are kept, and the next run decides the rest afresh.
      stats.auditSampled = audited.size;
      stats.auditDisagreed = [...audited].filter(([id, was]) => detected(byId.get(id)?.status) !== detected(was)).length;
      if (stats.auditDisagreed > 0) stderr.write(`oxmutate: ${String(stats.auditDisagreed)} of ${String(audited.size)} audited cached verdicts disagree with a fresh run; the incremental cache is rebuilt from this run\n`);
      const next: Record<string, Cached> = stats.auditDisagreed > 0 ? {} : { ...cache };
      for (const m of mutants) {
        if (['Killed', 'Survived', 'Timeout'].includes(m.status) && !m.flaky) next[m.id] = { fp: fingerprint(m), status: m.status, killedBy: m.killedBy, testsCompleted: m.testsCompleted };
      }
      writeFileSync(options.incrementalFile, JSON.stringify({ version: 1, mutants: next }));
    }
    const spec = options.specOracles.map((oracle) => {
      const dir = traceDirs[oracle.name] ?? '';
      const traces = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.itf.json')).length : 0;
      const ms = records.filter((r) => r.type === 'mutant' && r.spec && specOf.get(r.test ?? '') === oracle.name).map((r) => r.ms ?? 0);
      const located = mutants.map((m) => ({ ...m, line: m.start.line }));
      return summarizeSpec({ oracle, modelledFiles: new Set(matchFiles(root, oracle.files)), traces, mutants: located, testName: (t) => testInfo.get(t)?.name ?? t, specMs: ms });
    });
    stats.serversSpawned = pools.reduce((s, p) => s + p.stats.spawned, 0);
    stats.wallMs = performance.now() - wall0;
    return {
      root,
      options,
      sources,
      mutants,
      tests: dry.tests.map(({ id, file, name, ms }) => ({ id, file, name, ms })),
      stats,
      spec: spec.length ? spec : undefined,
      score: scoreOf(mutants),
    };
  } finally {
    progress.stop();
    for (const p of pools) p.close();
    if (env['OXMUTATE_KEEP']) stderr.write(`oxmutate: work directory kept at ${work}\n`);
    else rmSync(work, { recursive: true, force: true });
  }
}
