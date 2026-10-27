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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Unit } from './child.js';
import { disables, type Options } from './config.js';
import { matchFiles } from './files.js';
import { changedLines, shardOf, touches } from './lanes.js';
import { native, type NativeMutant } from './native.js';
import { FILE_KEY } from './runtime.js';
import { createPool, type UnitOutcome } from './scheduler.js';

export type Status = 'Killed' | 'Survived' | 'Timeout' | 'NoCoverage' | 'RuntimeError' | 'CompileError' | 'Ignored';

export interface MutantResult extends NativeMutant {
  file: string;
  status: Status;
  statusReason?: string | undefined;
  coveredBy: string[];
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
}

export class InstrumentFault extends Error {}

interface ChildRecord {
  type: 'dry' | 'mutant' | 'polluted' | 'isolated';
  id?: string;
  test?: string;
  status?: 'Killed' | 'Survived' | 'Timeout';
  file?: string;
  killed?: boolean;
  failed?: string[];
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

export async function run(options: Options): Promise<RunResult> {
  const wall0 = performance.now();
  const { root } = options;
  const work = mkdtempSync(path.join(tmpdir(), 'oxmutate-'));
  const stats: RunStats = {
    files: 0, mutants: 0, instrumentMs: 0, dryRunMs: 0, mutationMs: 0, isolatedMs: 0, wallMs: 0, testExecutions: 0,
    watchdogKills: 0, crashes: 0, canaryFiles: 0, pollutionRestarts: 0, survivorsOverturned: 0, timeoutsOverturned: 0, isolatedRuns: 0, reused: 0, flakyTests: 0, flakyMutants: 0, units: 0, serversSpawned: 0,
  };
  let unitSeq = 0;
  const fileFor = (kind: string, ext: string): string => path.join(work, `${kind}-${String(unitSeq++)}.${ext}`);
  const pools: { close(): void; stats: { spawned: number } }[] = [];
  try {
    // ── 1. Instrument ─────────────────────────────────────────────────────────────────────────
    const files = matchFiles(root, options.mutate);
    const sources: Record<string, string> = {};
    for (const f of files) sources[f] = readFileSync(path.join(root, f), 'utf8');
    const t0 = performance.now();
    const instrumented = native().instrumentFiles(files.map((f) => ({ path: f, source: sources[f] ?? '' })), { strykerCompat: options.strykerCompat });
    stats.instrumentMs = performance.now() - t0;
    const parseErrors = instrumented.filter((f) => f.error).map((f) => f.error);
    if (parseErrors.length) throw new InstrumentFault(`cannot parse ${String(parseErrors.length)} file(s): ${parseErrors.slice(0, 3).join('; ')}`);

    const changed = options.since ? changedLines(root, options.since) : undefined;
    const mutants: MutantResult[] = [];
    const codeMap: Record<string, string> = {};
    const directiveErrors: string[] = [];
    for (const f of instrumented) {
      const { disables: offs, errors } = disables(sources[f.path] ?? '', f.path);
      directiveErrors.push(...errors);
      let any = false;
      for (const m of f.mutants) {
        if (changed && !touches(changed, f.path, m.start.line, m.end.line)) continue;
        if (options.shard && shardOf(m.id, options.shard.count) !== options.shard.index) continue;
        const off = offs.find((d) => d.line === m.start.line && (d.mutators === 'all' || d.mutators.includes(m.mutatorName)));
        const excluded = options.excludedMutations.includes(m.mutatorName);
        mutants.push({
          ...m,
          file: f.path,
          coveredBy: [],
          status: off || excluded ? 'Ignored' : 'NoCoverage',
          statusReason: off?.reason ?? (excluded ? `excluded mutator ${m.mutatorName}` : undefined),
        });
        any = true;
      }
      if (any && f.code) codeMap[path.join(root, f.path)] = f.code;
    }
    if (directiveErrors.length) throw new InstrumentFault(directiveErrors.join('\n'));
    stats.files = files.length;
    stats.mutants = mutants.length;
    const mapFile = path.join(work, 'instrumented.json');
    writeFileSync(mapFile, JSON.stringify(codeMap));

    // ── 2. Dry run, twice (the second only to find nondeterministic tests) ────────────────────
    const dryPool = createPool({ root, vitestConfig: options.vitestConfig, workers: options.concurrency, instrumentedMap: mapFile }, 1, work, 'dry');
    pools.push(dryPool);
    const dryRun = async (): Promise<{ tests: (TestInfo & { state: string })[]; perTest: Record<string, Record<string, number>>; static: Record<string, number> }> => {
      const unit: Unit = { mode: 'dry', files: [], results: fileFor('dry', 'jsonl'), progress: fileFor('dry', 'progress') };
      let failure: UnitOutcome | undefined;
      await dryPool.drain([unit], () => Infinity, (_, o) => {
        if (o.crashed) failure = o;
        return [];
      });
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
    const d0 = performance.now();
    const dry = await dryRun();
    stats.dryRunMs = performance.now() - d0;
    const failing = dry.tests.filter((t) => t.state === 'fail');
    if (failing.length) throw new InstrumentFault(`${String(failing.length)} test(s) fail with no mutant active, so no verdict can be trusted: ${failing.slice(0, 5).map((t) => t.name).join('; ')}. fix: make the suite pass first`);
    if (dry.tests.length === 0) throw new InstrumentFault('the dry run ran no tests. fix: check the Vitest config the run used');

    const flakyTests = new Set<string>();
    if (options.flakyReruns > 0) {
      const second = await dryRun();
      const keys = (cov: Record<string, number> | undefined): string => Object.keys(cov ?? {}).sort().join(',');
      const again = new Map(second.tests.map((t) => [t.id, t]));
      for (const t of dry.tests) {
        const b = again.get(t.id);
        if (!b || b.state !== t.state || keys(dry.perTest[t.id]) !== keys(second.perTest[t.id])) flakyTests.add(t.id);
      }
    }
    dryPool.close();
    stats.flakyTests = flakyTests.size;

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
    for (const m of mutants) {
      if (m.status === 'Ignored') continue;
      m.coveredBy = (coveringTests.get(m.id) ?? []).sort((a, b) => (testInfo.get(a)?.ms ?? 0) - (testInfo.get(b)?.ms ?? 0));
      if (staticIds.has(m.id)) {
        m.static = true;
        if (options.ignoreStatic) {
          m.status = 'Ignored';
          m.statusReason = 'static mutant (ignoreStatic)';
        }
      }
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
    const toRun = mutants.filter((m) => !m.reused && m.status !== 'Ignored' && !m.static && m.coveredBy.length > 0);
    const byId = new Map(mutants.map((m) => [m.id, m]));
    const hitLimits = Object.fromEntries(toRun.map((m) => [m.id, Math.max(1000, (hits.get(m.id) ?? 1) * 100)]));
    const maxTestMs = (id: string): number => Math.max(0, ...(byId.get(id)?.coveredBy ?? []).map((t) => testInfo.get(t)?.ms ?? 0));
    // The watchdog is for runaways, which loop in fast code; a slow test under a loaded machine is
    // not one. 3x the covering test's dry-run time, not Stryker's 1.5x: at 1.5x, subprocess-heavy
    // burgee/paratext tests were stopped as false timeouts (2026-10-27).
    const warmBudget = (id: string): number => options.timeoutMS + Math.max(options.timeoutFactor, 3) * maxTestMs(id) + 250;

    // Files a mutant's covering tests live in, cheapest first (by the covering tests' time there).
    const fileOrder = new Map<string, string[]>();
    for (const m of toRun) {
      const cost = new Map<string, number>();
      for (const t of m.coveredBy) {
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
      writeFileSync(unit.plan as string, JSON.stringify({ tests: plan, hitLimits, skip: [] }));
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
        for (const t of m.coveredBy) {
          const file = testInfo.get(t)?.file;
          if (!file || !files.has(file)) continue;
          if (!perFile.has(file)) perFile.set(file, new Map());
          const tests = perFile.get(file) as Map<string, string[]>;
          if (!tests.has(t)) tests.set(t, []);
          tests.get(t)?.push(m.id);
        }
      }
      const units = [...perFile].flatMap(([file, tests]) => unitsFor(file, Object.fromEntries(tests)));
      const weight = (u: Unit): number => Object.values(planUnits.get(u.results)?.plan ?? {}).reduce((sum, l) => sum + l.length, 0);
      return units.sort((a, b) => weight(b) - weight(a));
    };

    const records: ChildRecord[] = [];
    const runaways = new Set<string>();
    const crashedIds = new Set<string>();
    const pool = createPool({ root, vitestConfig: options.vitestConfig, workers: 1, instrumentedMap: mapFile }, options.concurrency, work, 'mutant');
    pools.push(pool);
    const killedSoFar = (): Set<string> => new Set([...runaways, ...crashedIds, ...records.filter((r) => r.type === 'mutant' && r.status !== 'Survived').map((r) => r.id ?? '')]);
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
      const decided = killedSoFar();
      const { file, plan, depth } = planUnits.get(unit.results) as { file: string; plan: Plan; depth: number };
      const rest: Plan = {};
      for (const [t, ids] of Object.entries(plan)) {
        const left = ids.filter((id) => !decided.has(id) && !ran.has(`${id}|${t}`));
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
    const m0 = performance.now();
    // One round, every covering file at once. A two-round plan (cheapest file first, survivors
    // to the rest) cut executions 23% on burgee/paratext but took 2.9x longer: the second round
    // waits for the first to drain, and the expensive files then run as a tail (2026-10-27).
    await pool.drain(unitsForRound(toRun, (m) => fileOrder.get(m.id) ?? []), (_, id) => warmBudget(id), afterUnit);
    stats.mutationMs = performance.now() - m0;

    // ── 5. Verdicts from the warm run ─────────────────────────────────────────────────────────
    const byMutant = new Map<string, ChildRecord[]>();
    for (const r of records) if (r.type === 'mutant' && r.id) (byMutant.get(r.id) ?? byMutant.set(r.id, []).get(r.id))?.push(r);
    stats.testExecutions = records.filter((r) => r.type === 'mutant').length;
    stats.canaryFiles = new Set(records.filter((r) => r.type === 'polluted' && r.file).map((r) => r.file ?? '')).size;

    const isolatedQueue: MutantResult[] = [];
    for (const m of toRun) {
      const recs = byMutant.get(m.id) ?? [];
      const killers = recs.filter((r) => r.status === 'Killed' || r.status === 'Timeout');
      if (runaways.has(m.id)) {
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
    const runIsolated = async (items: MutantResult[], slack = 1): Promise<Map<string, { status: Status; killedBy?: string[] | undefined }>> => {
      const verdicts = new Map<string, { status: Status; killedBy?: string[] | undefined }>();
      if (items.length === 0) return verdicts;
      const chunk = Math.max(1, Math.ceil(items.length / (options.concurrency * 2)));
      const mk = (batch: MutantResult[]): Unit => ({ mode: 'isolated', files: [], results: fileFor('iso', 'jsonl'), progress: fileFor('iso', 'progress'), batch: batch.map((m) => ({ id: m.id, files: filesFor(m), tests: m.static ? undefined : m.coveredBy })) });
      const units: Unit[] = [];
      for (let i = 0; i < items.length; i += chunk) units.push(mk(items.slice(i, i + chunk)));
      stats.isolatedRuns += items.length;
      await pool.drain(
        units,
        (_, id) => slack * isolatedBudget(id),
        (unit, outcome) => {
          // Vitest reports per test file: a mutant is killed if any of its files failed.
          for (const rec of readRecords(unit.results)) {
            if (rec.type !== 'isolated' || !rec.id) continue;
            const prev = verdicts.get(rec.id);
            if (rec.killed) verdicts.set(rec.id, { status: 'Killed', killedBy: [...(prev?.killedBy ?? []), ...(rec.failed ?? [])] });
            else if (!prev) verdicts.set(rec.id, { status: 'Survived' });
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
        if (v.status === 'Timeout') m.statusReason = 'stopped by the watchdog twice, the second time with 3x the budget';
      }
    }

    // ── 6b. Confirm survivors under whole-file semantics ──────────────────────────────────────
    // The warm runner arms a mutant for one test at a time, so a mutant whose effect only shows
    // across tests (a `reset()` in beforeEach made a no-op, so state piles up for the next test)
    // survives warm and is killed when armed for the whole file, the way Stryker runs it (burgee/
    // paratext plugin.ts, 2026-10-27). Survivors are what a person acts on, so each one is
    // re-run once with the mutant armed across its covering files before it is reported.
    const survivors = toRun.filter((m) => m.status === 'Survived');
    const confirmed = await runIsolated(survivors);
    for (const m of survivors) {
      const v = confirmed.get(m.id);
      if (v && v.status !== 'Survived' && v.status !== 'RuntimeError') {
        m.status = v.status;
        m.killedBy = v.killedBy;
        m.statusReason = 'killed only when the mutant stays active across the whole test file (cross-test effect)';
        stats.survivorsOverturned++;
      }
    }

    // ── 7. Flaky verdicts: re-run mutants whose covering tests are nondeterministic ───────────
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
    const scored = mutants.filter((m) => !['Ignored', 'CompileError', 'RuntimeError'].includes(m.status));
    const detected = scored.filter((m) => m.status === 'Killed' || m.status === 'Timeout').length;
    const noCoverage = scored.filter((m) => m.status === 'NoCoverage').length;
    if (options.incremental) {
      mkdirSync(path.dirname(options.incrementalFile), { recursive: true });
      const next: Record<string, Cached> = { ...cache };
      for (const m of mutants) {
        if (['Killed', 'Survived', 'Timeout'].includes(m.status) && !m.flaky) next[m.id] = { fp: fingerprint(m), status: m.status, killedBy: m.killedBy, testsCompleted: m.testsCompleted };
      }
      writeFileSync(options.incrementalFile, JSON.stringify({ version: 1, mutants: next }));
    }
    stats.serversSpawned = pools.reduce((s, p) => s + p.stats.spawned, 0);
    stats.wallMs = performance.now() - wall0;
    return {
      root,
      options,
      sources,
      mutants,
      tests: dry.tests.map(({ id, file, name, ms }) => ({ id, file, name, ms })),
      stats,
      score: {
        detected,
        undetected: scored.length - detected,
        total: scored.length,
        mutationScore: scored.length ? (100 * detected) / scored.length : 100,
        covered: scored.length - noCoverage ? (100 * detected) / (scored.length - noCoverage) : 100,
      },
    };
  } finally {
    for (const p of pools) p.close();
    if (process.env['OXMUTATE_KEEP']) process.stderr.write(`oxmutate: work directory kept at ${work}\n`);
    else rmSync(work, { recursive: true, force: true });
  }
}
