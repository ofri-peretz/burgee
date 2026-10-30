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
import { globToRegExp, matchFiles } from './files.js';
import type { FrozenOracle } from './frozen.js';
import { changedLines, parseMutateSpec, shardOf, touches, withinRange, type MutateRange } from './lanes.js';
import { native, type NativeMutant } from './native.js';
import { startProgress } from './progress.js';
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
  isolatedMs: number;
  wallMs: number;
  testExecutions: number;
  watchdogKills: number;
  crashes: number;
  canaryFiles: number;
  /** Contexts restarted because a mutant left state behind (the per-execution canary fired). */
  pollutionRestarts: number;
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
  killedBy?: string[] | undefined;
  /** Tests that ran across its files: Stryker's `testsCompleted`. */
  testsCompleted?: number | undefined;
}

interface ChildRecord {
  type: 'dry' | 'mutant' | 'polluted' | 'isolated';
  id?: string;
  test?: string;
  status?: 'Killed' | 'Survived' | 'Timeout';
  file?: string;
  killed?: boolean;
  failed?: string[];
  /** `mutant`: how long this execution took. */
  ms?: number;
  /** `mutant`: the record came from a spec oracle's replay test. */
  spec?: boolean;
  /** `isolated`: tests that ran (passed or failed) in this file run. */
  ran?: number;
  /** `polluted`: mutants run after the first since the last clean canary; their verdicts are dropped. */
  suspects?: string[];
  tests?: (TestInfo & { state: string })[];
  coverage?: { static: Record<string, number>; perTest: Record<string, Record<string, number>> };
  fileErrors?: { file: string; error: string }[];
}

function readRecords(file: string): ChildRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ChildRecord);
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Work units of at most this many (mutant, test) executions: small enough to steal. */
const UNIT_PAIRS = 120;
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
    files: 0, mutants: 0, instrumentMs: 0, dryRunMs: 0, mutationMs: 0, isolatedMs: 0, wallMs: 0, testExecutions: 0,
    watchdogKills: 0, crashes: 0, canaryFiles: 0, pollutionRestarts: 0, survivorsOverturned: 0, timeoutsOverturned: 0, compileErrors: 0, isolatedRuns: 0, reused: 0, flakyTests: 0, flakyMutants: 0, units: 0, serversSpawned: 0,
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
      const ranges = rangesFor(f.path);
      directiveErrors.push(...errors);
      let any = false;
      for (const m of f.mutants) {
        if (changed && !touches(changed, f.path, m.start.line, m.end.line)) continue;
        if (ranges && !ranges.some((r) => withinRange(r, m.start, m.end))) continue;
        if (options.shard && shardOf(m.id, options.shard.count) !== options.shard.index) continue;
        const off = offs.find((d) => d.line === m.start.line && (d.mutators === 'all' || d.mutators.includes(m.mutatorName)));
        const excluded = options.excludedMutations.includes(m.mutatorName);
        mutants.push({
          ...m,
          file: f.path,
          coveredBy: [],
          status: off || excluded || m.ignoredReason ? 'Ignored' : 'NoCoverage',
          statusReason: off?.reason ?? m.ignoredReason ?? (excluded ? `excluded mutator ${m.mutatorName}` : undefined),
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
    const dryRun = async (): Promise<{ tests: (TestInfo & { state: string })[]; perTest: Record<string, Record<string, number>>; static: Record<string, number> }> => {
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
      return { tests: recs.flatMap((r) => r.tests ?? []), perTest, static: stat };
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
        for (const id of Object.keys(perMutant)) (staticFiles.get(id) ?? staticFiles.set(id, new Set()).get(id))?.add(file);
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
    const fingerprint = (m: MutantResult): string =>
      sha([sha(sources[m.file] ?? ''), ...[...new Set(m.coveredBy.map((t) => testInfo.get(t)?.file ?? ''))].sort().map(fileHash)].join(':'));
    type Cached = { fp: string; status: Status; killedBy?: string[] | undefined; testsCompleted?: number | undefined };
    const cache: Record<string, Cached> =
      options.incremental && existsSync(options.incrementalFile) ? (JSON.parse(readFileSync(options.incrementalFile, 'utf8')) as { mutants: Record<string, Cached> }).mutants : {};
    for (const m of mutants) {
      if (m.status === 'Ignored' || (!m.static && m.coveredBy.length === 0)) continue;
      const hit = cache[m.id];
      if (hit && hit.fp === fingerprint(m)) {
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
    const hitLimits = Object.fromEntries(toRun.map((m) => [m.id, Math.max(1000, (hits.get(m.id) ?? 1) * 100)]));
    const maxTestMs = (id: string): number => { const m = byId.get(id); return Math.max(0, ...(m ? allCovering(m) : []).map((t) => testInfo.get(t)?.ms ?? 0)); };
    // The watchdog is for runaways, which loop in fast code; a slow test under a loaded machine is
    // not one. 3x the covering test's dry-run time, not Stryker's 1.5x: at 1.5x, subprocess-heavy
    // burgee/paratext tests were stopped as false timeouts (2026-10-27).
    const warmBudget = (id: string): number => options.timeoutMS + Math.max(options.timeoutFactor, 3) * maxTestMs(id) + 250;

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
    const planUnits = new Map<string, { file: string; plan: Plan; depth: number }>();
    const unfinished = new Set<string>();
    const makeUnit = (file: string, plan: Plan, depth = 0): Unit => {
      const unit: Unit = { mode: 'mutant', files: [file], results: fileFor('unit', 'jsonl'), progress: fileFor('unit', 'progress'), plan: fileFor('plan', 'json') };
      writeFileSync(unit.plan as string, JSON.stringify({ tests: plan, hitLimits, skip: [], specTests: [...specOf.keys()] }));
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
    const runaways = new Set<string>();
    const crashedIds = new Set<string>();
    const pool = createPool({ root, vitestConfig: options.vitestConfig, workers: 1, instrumentedMap: mapFile, nodeArgs: options.testRunnerNodeArgs }, options.concurrency, work, 'mutant');
    pools.push(pool);
    /** Mutants decided on one verdict track: the tests', or a spec oracle's replay tests'. */
    const killedSoFar = (spec: boolean): Set<string> => new Set([...runaways, ...crashedIds, ...records.filter((r) => r.type === 'mutant' && r.status !== 'Survived' && Boolean(r.spec) === spec).map((r) => r.id ?? '')]);
    const afterUnit = (unit: Unit, outcome: UnitOutcome): Unit[] => {
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
      const entry = planUnits.get(unit.results);
      if (!entry) return true;
      const decided = { tests: killedSoFar(false), spec: killedSoFar(true) };
      const left: Plan = {};
      for (const [t, ids] of Object.entries(entry.plan)) {
        const done = specOf.has(t) ? decided.spec : decided.tests;
        const keep = ids.filter((id) => !done.has(id));
        if (keep.length) left[t] = keep;
      }
      if (Object.keys(left).length === 0) return false;
      entry.plan = left;
      writeFileSync(unit.plan as string, JSON.stringify({ tests: left, hitLimits, skip: [], specTests: [...specOf.keys()] }));
      return true;
    };
    await pool.drain(unitsForRound(toRun, (m) => fileOrder.get(m.id) ?? []), (_, id) => warmBudget(id), afterUnit, beforeUnit);
    stats.mutationMs = performance.now() - m0;

    // ── 5. Verdicts from the warm run ─────────────────────────────────────────────────────────
    const byMutant = new Map<string, ChildRecord[]>();
    for (const r of records) if (r.type === 'mutant' && r.id) (byMutant.get(r.id) ?? byMutant.set(r.id, []).get(r.id))?.push(r);
    stats.testExecutions = records.filter((r) => r.type === 'mutant').length;
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
        isolatedQueue.push(m); // a watchdog stop is confirmed before it is reported (6, below)
      } else if (crashedIds.has(m.id)) {
        m.status = 'RuntimeError';
        m.statusReason = 'the worker crashed while this mutant ran';
      } else if (killers.length) {
        m.status = killers.some((r) => r.status === 'Killed') ? 'Killed' : 'Timeout';
        m.killedBy = [...new Set(killers.map((r) => r.test ?? ''))];
        m.testsCompleted = recs.length;
      } else if (!unfinished.has(m.id) && recs.length >= new Set(m.coveredBy).size) {
        m.status = 'Survived';
        m.testsCompleted = recs.length;
      } else {
        isolatedQueue.push(m); // unfinished: a crash left work undone
      }
    }
    for (const m of mutants) if (m.static && m.status !== 'Ignored' && !m.reused) isolatedQueue.push(m);

    // ── 6. Isolated re-runs: the switch armed before import, Vitest run normally ──────────────
    const allTestFiles = [...new Set(dry.tests.map((t) => t.file))];
    // A static mutant needs the files that load it (plus any whose tests reach it); only a hit
    // with no file to attribute it to (a setup file outside collection) falls back to all files.
    const fileCost = new Map<string, number>();
    for (const t of dry.tests) fileCost.set(t.file, (fileCost.get(t.file) ?? 0) + t.ms);
    const byCost = (files: string[]): string[] => [...files].sort((a, b) => (fileCost.get(a) ?? 0) - (fileCost.get(b) ?? 0));
    const filesFor = (m: MutantResult): string[] => {
      const tests = m.coveredBy.map((t) => testInfo.get(t)?.file ?? '');
      if (!m.static) return byCost([...new Set(tests)]);
      const loaders = staticFiles.get(m.id);
      if (!loaders || m.id in dry.static) return byCost(allTestFiles);
      // Files whose tests reach the mutant first: they kill it. Ordering all loaders by cost alone
      // ran a file that only imports it first, and 288 of 349 isolated kills on burgee/paratext
      // came from a later file (2026-10-27).
      const covering = byCost([...new Set(tests)]);
      return [...covering, ...byCost([...loaders].filter((f) => !covering.includes(f)))];
    };
    const isolatedBudget = (id: string): number => {
      const m = byId.get(id);
      const fs = m ? filesFor(m) : allTestFiles;
      const ms = dry.tests.filter((t) => fs.includes(t.file)).reduce((sum, t) => sum + t.ms, 0);
      return 1500 + options.timeoutMS + options.timeoutFactor * ms * 2;
    };
    // A non-static mutant runs only its covering tests, armed across all of them in file order:
    // Stryker's semantics, so cross-test effects still show (a no-op reset() lets state pile up
    // for the next covering test). A static mutant runs every test of its files, because an
    // import-time change reaches tests that never execute the mutated line.
    const runIsolated = async (items: MutantResult[], slack = 1): Promise<Map<string, Verdict>> => {
      const verdicts = new Map<string, Verdict>();
      if (items.length === 0) return verdicts;
      const mk = (batch: MutantResult[]): Unit => ({ mode: 'isolated', files: [], results: fileFor('iso', 'jsonl'), progress: fileFor('iso', 'progress'), batch: batch.map((m) => ({ id: m.id, files: filesFor(m), tests: m.static ? undefined : m.coveredBy })) });
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
        (_, id) => slack * isolatedBudget(id),
        (unit, outcome) => {
          // Vitest reports per test file: a mutant is killed if any of its files failed.
          for (const rec of readRecords(unit.results)) {
            if (rec.type !== 'isolated' || !rec.id) continue;
            const prev = verdicts.get(rec.id);
            const testsCompleted = (prev?.testsCompleted ?? 0) + (rec.ran ?? 0);
            if (rec.killed) verdicts.set(rec.id, { status: 'Killed', killedBy: [...(prev?.killedBy ?? []), ...(rec.failed ?? [])], testsCompleted });
            else verdicts.set(rec.id, { status: prev?.status ?? 'Survived', killedBy: prev?.killedBy, testsCompleted });
          }
          if (outcome.killedFor) verdicts.set(outcome.killedFor, { status: 'Timeout' });
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
    progress.phase(`isolated runs (static mutants and stragglers: ${String(isolatedQueue.length)})`);
    const i0 = performance.now();
    const first = await runIsolated(isolatedQueue);
    // A watchdog stop on a loaded machine is a slow test, not a runaway: 31 of them on one
    // burgee/paratext run while the load average sat at 40, all Survived for Stryker (2026-10-27).
    // Each stop gets one more run with 3x the budget; only one that is stopped again is a Timeout.
    const stopped = isolatedQueue.filter((m) => first.get(m.id)?.status === 'Timeout');
    const again = await runIsolated(stopped, 3);
    for (const m of stopped) {
      const v = again.get(m.id);
      if (v && v.status !== 'Timeout' && v.status !== 'RuntimeError') {
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
        if (v.status === 'Timeout') m.statusReason = 'stopped by the watchdog twice, the second time with 3x the budget';
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
    const confirmed = await runIsolated(survivors);
    // A timeout here is a watchdog stop like any other, and a loaded machine makes them: two
    // closeout survivors were reported killed this way while a docs build shared the machine
    // (2026-10-27). The same rule as section 6: one more run at 3x the budget before believing it.
    const stoppedHere = survivors.filter((m) => confirmed.get(m.id)?.status === 'Timeout');
    const recheck = await runIsolated(stoppedHere, 3);
    for (const m of stoppedHere) {
      const v = recheck.get(m.id);
      if (v) confirmed.set(m.id, v);
    }
    for (const m of survivors) {
      const v = confirmed.get(m.id);
      if (v && v.status !== 'Survived' && v.status !== 'RuntimeError') {
        m.status = v.status;
        m.killedBy = v.killedBy;
        m.statusReason = 'killed only when the mutant stays active across the whole test file (cross-test effect)';
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
    stats.crashes = pool.stats.crashed;

    // ── 8. Score, cache, result ───────────────────────────────────────────────────────────────
    if (options.incremental) {
      mkdirSync(path.dirname(options.incrementalFile), { recursive: true });
      const next: Record<string, Cached> = { ...cache };
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
