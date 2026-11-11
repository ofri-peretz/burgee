/**
 * oxmutate's Vitest runner: loaded by Vitest (`test.runner`) inside its own worker, so hooks,
 * `expect`, `vi`, `vi.mock` and the environment stay Vitest's.
 *
 * Three modes, set by the coordinator through the environment (`OXMUTATE_MODE`):
 *
 * - `dry`: run the suite unmutated once, recording which tests reach which mutant (the
 *   instrumented code counts hits into the namespace while `currentTestId` is set).
 * - `mutant`: for each test, re-invoke the test's own function once per covering mutant with
 *   the switch flipped, each invocation bracketed by the suite's `beforeEach`/`afterEach` and the
 *   runner's own per-try reset (the mechanism Vitest uses for retries, so snapshot counters
 *   start over). Then run the test once more, unmutated: that run is what Vitest reports, and a
 *   failure there means an earlier mutant polluted shared state (the canary).
 * - `isolated`: one mutant was armed before import (static mutants and canary re-runs). Run
 *   normally; any failed test kills it.
 * - `static`: a batch of static mutants decided in this live worker (staticwarm.qnt). Before the file
 *   runs, each mutant is armed, the module registry is reset and the file is collected again, so
 *   its tests close over modules evaluated under the mutant; they run with their hooks, then an
 *   unarmed re-collection must pass. A file whose own collection touches globals, or a mutant that
 *   leaves a trace, sends the rest of the batch back to the fresh-worker path (`static-fallback`).
 *
 * Before each mutant the runner writes a progress line synchronously, so the coordinator can
 * attribute and kill a worker stuck in a synchronous loop that the hit counter cannot break.
 */
import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism, loadavg } from 'node:os';
import path from 'node:path';

import { BEAT_ENV, markTest, realNow, startHeartbeat } from './heartbeat.js';
import { isDeadlock, takeFloor, trackRpc, trackTimers, watch } from './quiescence.js';
import { resolveEsm } from './resolve.js';
import { ACTIVE_MUTANT_ENV, FILE_KEY, NAMESPACE, cwd, env, type Namespace } from './runtime.js';

type AnyTask = {
  id: string;
  name: string;
  type: string;
  file?: { filepath: string };
  /** A file task's own path. */
  filepath?: string;
  suite?: AnyTask | undefined;
  result?: { state?: string; duration?: number };
  tasks?: AnyTask[] | undefined;
  mode?: string;
  context?: unknown;
};
type Hook = (...args: unknown[]) => unknown;
type RunnerStatics = {
  getTestFn: (test: AnyTask) => (() => unknown) | undefined;
  getSuiteHooks: (suite: AnyTask) => { beforeEach: Hook[]; afterEach: Hook[]; beforeAll: Hook[]; afterAll: Hook[] };
};

/**
 * The project's own Vitest, never the one beside this file: two Vitest instances in one worker
 * disagree about the current test, the snapshot state and `expect`.
 */
const fromProject = async (specifier: string, dir = cwd()): Promise<unknown> => import(resolveEsm(specifier, dir));

/** The family's refusal shape for a missing optional peer (as `controlroom/ink`'s): a code and a fix. */
export class PeerMissingError extends Error {
  readonly code = 'E_PEER_MISSING';
  readonly fix = "npm install vitest — oxmutate runs the project's own Vitest, so the project brings it";
  constructor(cause: unknown) {
    super('oxmutate/runner needs `vitest`, an optional peer that is not installed', { cause });
    this.name = 'PeerMissingError';
  }
}

const missing = (cause: unknown): boolean => {
  const code = (cause as { code?: unknown } | null)?.code;
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
};

/** Vitest 5 exports `TestRunner` from `vitest`; Vitest 4 from `vitest/runners` + `@vitest/runner`. */
async function loadBase(): Promise<{ Base: new (config: unknown) => object; statics: RunnerStatics }> {
  const vitest = (await fromProject('vitest').catch((cause: unknown) => {
    if (missing(cause)) throw new PeerMissingError(cause);
    throw new Error('oxmutate/runner could not load the project\'s Vitest', { cause });
  })) as Record<string, unknown>;
  const v5 = vitest['TestRunner'] as (new (config: unknown) => object) & Partial<RunnerStatics> | undefined;
  if (v5 && typeof v5.getTestFn === 'function' && typeof v5.getSuiteHooks === 'function') {
    return { Base: v5, statics: { getTestFn: v5.getTestFn, getSuiteHooks: v5.getSuiteHooks } };
  }
  const runners = (await fromProject('vitest/runners')) as { VitestTestRunner: new (config: unknown) => object };
  const vitestDir = path.dirname(createRequire(path.join(cwd(), 'package.json')).resolve('vitest/package.json'));
  const core = (await fromProject('@vitest/runner', vitestDir)) as {
    getFn: RunnerStatics['getTestFn'];
    getHooks: RunnerStatics['getSuiteHooks'];
  };
  return { Base: runners.VitestTestRunner, statics: { getTestFn: core.getFn, getSuiteHooks: core.getHooks } };
}

const { Base, statics } = await loadBase();

const mode = env['OXMUTATE_MODE'] ?? 'dry';
const resultsPath = env['OXMUTATE_RESULTS'];
const progressPath = env['OXMUTATE_PROGRESS'];
startHeartbeat(env[BEAT_ENV]); // the watchdog tells a wait from a loop by it (heartbeat.ts)
const ns = ((globalThis as Record<string, unknown>)[NAMESPACE] ??= {}) as Namespace;
ns.mutantCoverage ??= { static: {}, perTest: {} };

interface Plan {
  /** test id → mutant ids to run, cheapest first. */
  tests: Record<string, string[]>;
  hitLimits: Record<string, number>;
  /** Mutants already decided (an earlier attempt of this shard finished or timed them out). */
  skip: string[];
  /** A spec oracle's replay tests: they keep a verdict track of their own (spec-oracle.ts). */
  specTests?: string[];
  /** Test files the dry run found run-once (rerun.qnt). */
  runOnce?: string[];
  /** Each planned test's dry-run time, in ms: its deadlock confirm window scales with it. */
  testMs?: Record<string, number>;
}
const plan: Plan =
  mode === 'mutant' && env['OXMUTATE_PLAN'] ? (JSON.parse(readFileSync(env['OXMUTATE_PLAN'], 'utf8')) as Plan) : { tests: {}, hitLimits: {}, skip: [] };
const decided = new Set(plan.skip);
/** The replay tests' own bail: a mutant the tests killed is still replayed, and the reverse. */
const specTests = new Set(plan.specTests ?? []);
const decidedBySpec = new Set<string>();
/** `isolated`: when set, only these tests run (the mutant's covering tests); the rest pass untouched. */
const only = mode === 'isolated' && env['OXMUTATE_ONLY_TESTS'] ? new Set(JSON.parse(env['OXMUTATE_ONLY_TESTS']) as string[]) : undefined;
/** `static`: the static mutants this file run decides in the live worker. */
const staticIds = mode === 'static' && env['OXMUTATE_STATIC'] ? (JSON.parse(env['OXMUTATE_STATIC']) as string[]) : [];
/** `static`: each mutant's hit-count limit. */
const staticLimits = mode === 'static' && env['OXMUTATE_HIT_LIMITS'] ? (JSON.parse(env['OXMUTATE_HIT_LIMITS']) as Record<string, number>) : {};
// `isolated`: the mutant is armed from process start, so its hit counter is too. A loop it causes
// stops at the limit, as in warm runs, instead of holding the worker until the watchdog's budget:
// on oxmutate's own suite 17 runaways left the isolated phase idle 140 of 186 s (2026-10-30).
if (mode === 'isolated' && env['OXMUTATE_HIT_LIMIT']) {
  ns.hitCount = 0;
  ns.hitLimit = Number(env['OXMUTATE_HIT_LIMIT']);
}
/** Did the armed mutant's switch pass its limit, i.e. was this run stopped as a runaway? */
const ranAway = (): boolean => ns.hitCount !== undefined && ns.hitLimit !== undefined && ns.hitCount > ns.hitLimit;

// ── Unhandled errors ──────────────────────────────────────────────────────────────────────────
// Vitest fails a run that raised an unhandled rejection or an uncaught error even when every test
// passed, so a mutant that causes one is detected. Uncounted, they were Survived: two caique
// mutants left `undefined` where a later callback read it, and Stryker detected both
// (sc8-profile.md, 2026-11-06). Vitest's worker keeps its own listeners; these only count.
let unhandled = 0;
process.on('unhandledRejection', () => void unhandled++);
process.on('uncaughtException', () => void unhandled++);
/** Taken before any test runs: `vi.useFakeTimers()` replaces the global, and a frozen one never fires. */
const realSetImmediate = globalThis.setImmediate;
/**
 * One macrotask, so a rejection the run left without a handler is reported before its verdict is
 * read. ponytail: one rejected from a later timer is missed; widen the wait if one ever matters.
 */
const settle = (): Promise<void> => new Promise((resolve) => realSetImmediate(resolve));

// ── Deadlocks (quiescence.ts) ─────────────────────────────────────────────────────────────────
/** Every mode but the dry run, whose hangs are the suite's own and fail it. */
const deadlocks = mode === 'dry' ? undefined : watch();
/** `isolated`: the run's test deadlocked, so its mutant is a Timeout, as a runaway is. */
let deadlocked = false;
/** `mutant`: a deadlock tore this worker down; nothing more runs in it (runTask). */
let tornDown = false;
/**
 * How long a wait must stay quiet before it is a deadlock: twice the test's dry-run time (never under
 * MIN_CONFIRM_MS), stretched by the machine's load. Quiet already means nothing can resume the wait,
 * so the window only absorbs sampling gaps; a loaded machine samples less evenly.
 */
const confirmFor = (testId: string | undefined): number => 2 * (plan.testMs?.[testId ?? ''] ?? 0) * Math.max(1, (loadavg()[0] ?? 0) / availableParallelism());
/** `fn` under the deadlock guard (rejects with DeadlockError), or as it is in the dry run. */
const guarded = <T>(testId: string | undefined, fn: () => T | Promise<T>): Promise<T> => (deadlocks ? deadlocks.guard(fn, confirmFor(testId)) : Promise.resolve().then(fn));

// ── `static` mode: what a registry reset does not reset ─────────────────────────────────────────
/** Built-ins a module may patch in place; their own methods are compared by identity. */
const PROTOTYPES: Record<string, object> = {
  Object: Object.prototype, Array: Array.prototype, String: String.prototype, Number: Number.prototype,
  Boolean: Boolean.prototype, Function: Function.prototype, Promise: Promise.prototype, Map: Map.prototype,
  Set: Set.prototype, RegExp: RegExp.prototype, Date: Date.prototype, Error: Error.prototype,
};
/** Keys Vitest and oxmutate own: they change by design while a file runs. */
const OWN_GLOBAL = /^(__vitest|__oxmutate__$|__VITEST|__vite)/;

/** globalThis, process.env and the built-in prototypes, as a map a later look can be compared with. */
function snapshot(): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const g = globalThis as Record<string, unknown>;
  for (const k of Object.getOwnPropertyNames(g)) {
    if (OWN_GLOBAL.test(k)) continue;
    const d = Object.getOwnPropertyDescriptor(g, k);
    out.set(`g:${k}`, d && 'value' in d ? d.value : d?.get);
  }
  for (const [k, v] of Object.entries(env)) out.set(`env:${k}`, v);
  for (const [name, proto] of Object.entries(PROTOTYPES)) {
    for (const k of Object.getOwnPropertyNames(proto)) out.set(`proto:${name}.${k}`, Object.getOwnPropertyDescriptor(proto, k)?.value);
  }
  return out;
}

/** How many differing keys a `static-fallback` record names. */
const DIFF_KEYS = 8;

/** The keys whose presence or value differs between two snapshots (the first few, for a report). */
const snapshotDiff = (a: Map<string, unknown>, b: Map<string, unknown>): string[] =>
  [...new Set([...a.keys(), ...b.keys()])].filter((k) => !(a.has(k) && b.has(k) && Object.is(a.get(k), b.get(k)))).slice(0, DIFF_KEYS);
const sameSnapshot = (a: Map<string, unknown>, b: Map<string, unknown>): boolean => snapshotDiff(a, b).length === 0;

/** The state before this worker evaluated the test file: the baseline every later look compares with. */
let pristine: Map<string, unknown> | undefined;

/** Set when a mutant left state behind; the rest of this context runs no mutants. */
let polluted = false;
/** `static` mode: the most mutants decided between two unarmed re-collections (staticwarm.qnt `grouped`). */
const STATIC_CANARY_MAX = 4;
/** Mutants between canaries; doubles while the canary stays clean, back to 1 when it fails. */
let canaryEvery = 1;
const MAX_CANARY_EVERY = 8;
/**
 * Test files whose tests run once per collection. ESLint's RuleTester records each case as its test
 * runs and fails one it has seen ("detected duplicate test case"), so every canary failed and read as
 * pollution: each mutant cost a context restart (eslint-plugin-mongodb-security, 279 mutants in 69 min,
 * 13,868 restarts, 2026-11-03). The dry run finds them by running the first passing test of each
 * suite twice: a file can open with plain tests and hold a RuleTester block further down. In mutant mode each run after a test's first takes the test from a fresh collection of the
 * file (rerun.qnt). The imports stay evaluated, so a mutant's leftovers in them still fail the canary.
 */
const runOnce = new Set<string>(mode === 'mutant' ? (plan.runOnce ?? []) : []);
/** `dry`: suites (or files, for a test outside any) whose first passing test has been run a second time. */
const probed = new Set<string>();
/** A `runOnce` file's fresh collections; each test takes its own copy from each, in order. */
const collections = new Map<string, AnyTask[]>();
/** test id → how many fresh collections it has taken a copy from. */
const taken = new Map<string, number>();
/**
 * Runs of one test after its first, per mutant: the armed run, the canary and second armed run a kill
 * after unchecked runs triggers, the interval canary. The loop's closing canary and the reported run
 * add 2. Collecting this many copies before the test starts means a run-once test never runs out.
 */
const RUNS_PER_MUTANT = 4;
const RUNS_AFTER = 2;
type Collect = (specs: string[], runner: unknown) => Promise<AnyTask[]>;
/** Vitest's public collect: from `vitest/internal/browser` on Vitest 5, `@vitest/runner` on Vitest 4. */
async function findCollect(): Promise<Collect | undefined> {
  const browser = (await fromProject('vitest/internal/browser').catch(() => ({}))) as { collectTests?: Collect };
  if (browser.collectTests) return browser.collectTests;
  const vitestDir = path.dirname(createRequire(path.join(cwd(), 'package.json')).resolve('vitest/package.json'));
  return ((await fromProject('@vitest/runner', vitestDir).catch(() => ({}))) as { collectTests?: Collect }).collectTests;
}
let collector: Promise<Collect | undefined> | undefined;
const loadCollect = (): Promise<Collect | undefined> => (collector ??= findCollect());

const find = (t: AnyTask, id: string): AnyTask | undefined => (t.id === id ? t : t.tasks?.reduce<AnyTask | undefined>((hit, c) => hit ?? find(c, id), undefined));
/** A `beforeAll` ran for the collection Vitest runs, never for a fresh one: such a file keeps the restart. */
const hasBeforeAll = (t: AnyTask): boolean => t.type !== 'test' && (statics.getSuiteHooks(t).beforeAll.length > 0 || (t.tasks ?? []).some(hasBeforeAll));

/** A fresh collection's `afterAll` hooks, innermost first, run once its file is done (the dual RuleTester registers one). */
async function afterAllOf(t: AnyTask): Promise<void> {
  if (t.type === 'test') return;
  for (const c of t.tasks ?? []) await afterAllOf(c);
  for (const hook of statics.getSuiteHooks(t).afterAll) await hook(t);
}

/** The test's copy from the next fresh collection of its file it has not run from. */
function takeCopy(test: AnyTask): AnyTask | undefined {
  const n = taken.get(test.id) ?? 0;
  taken.set(test.id, n + 1);
  const file = collections.get(test.file?.filepath ?? '')?.[n];
  return file && find(file, test.id);
}

/** `dry`: each test file's module graph, project files only (onAfterRunSuite). */
const dryModules = new Map<string, string[]>();

/** `dry`: the probe's hits are counted here and dropped, or they would double the hit limits. */
const PROBE_ID = '__oxmutate_probe__';

/**
 * `dry`: run a suite's first passing test again, with its hooks, as the canary will. Failing there, its
 * file is run-once. `reset` starts the per-try state over, as before each canary: without it the
 * second run's `toMatchSnapshot()` was the test's second snapshot, which Vitest wrote into the
 * project's snapshot file (burgee's completions and help snapshots, 2026-11-06). Where Vitest writes
 * no new snapshot (CI), it would fail as missing and mark the file run-once.
 */
async function probe(test: AnyTask, fn: () => unknown, reset: () => Promise<void>): Promise<void> {
  const file = test.file?.filepath;
  const scope = test.suite?.id ?? file;
  if (!file || !scope || probed.has(scope) || runOnce.has(file)) return;
  probed.add(scope);
  await afterEach(test, test.context, []);
  const cleanups = await beforeEach(test, test.context);
  await reset();
  ns.currentTestId = PROBE_ID;
  try {
    await fn();
  } catch {
    runOnce.add(file);
  } finally {
    ns.currentTestId = test.id;
    if (ns.mutantCoverage) delete ns.mutantCoverage.perTest[PROBE_ID];
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
}

/** How much of a test's error a `polluted` record keeps, and of a file's collection error. */
const POLLUTION_ERROR_CHARS = 300;
const FILE_ERROR_CHARS = 500;

// Both files are written once per mutant run, so each is opened once and kept open. Opening and
// closing them per write cost 6.6 ms a run on a laptop whose endpoint scanner inspects every close,
// against 0.003 ms on an open descriptor, where a median test took 0.07 ms (burgee/paratext,
// 2026-11-11). A write on an open descriptor is in the kernel before the next mutant starts, so a
// server the watchdog kills has still left its records and its mark.
let resultsFd: number | undefined;
let progressFd: number | undefined;
let markLength = 0;

function emit(record: object): void {
  if (!resultsPath) return;
  resultsFd ??= openSync(resultsPath, 'a');
  writeSync(resultsFd, `${JSON.stringify(record)}\n`);
}

/**
 * The scheduler's watchdog reads this file: the mutant now running and when it started, or nothing.
 * Each mark is padded to the longest one written, so it replaces the last in one write and the
 * file is never truncated: truncating it for every mutant was 1.8 s of a 53 s run (2026-11-11).
 * The reader trims, so the padding reads as nothing.
 */
function mark(text: string): void {
  if (!progressPath) return;
  progressFd ??= openSync(progressPath, 'w');
  const padded = text.trimEnd().padEnd(markLength);
  markLength = padded.length;
  if (padded) writeSync(progressFd, padded, 0);
}

/** A worker thread's descriptors outlive it in a threads pool, so the end of its run closes them. */
function closeFiles(): void {
  for (const fd of [resultsFd, progressFd]) if (fd !== undefined) closeSync(fd);
  resultsFd = undefined;
  progressFd = undefined;
  markLength = 0;
}

// The suites whose hooks wrap `test`, outermost first. Vitest 5 leaves a top-level `describe`'s
// `suite` unset and keeps file-level hooks on `test.file`, so the walk adds the file itself: without
// it a file-level `beforeEach` reset never re-ran between mutants and every canary read as pollution.
function chain(test: AnyTask): AnyTask[] {
  const suites: AnyTask[] = [];
  for (let s = test.suite; s; s = s.suite) suites.unshift(s);
  const file = test.file as AnyTask | undefined;
  if (file && suites[0] !== file) suites.unshift(file);
  return suites;
}

async function beforeEach(test: AnyTask, context: unknown): Promise<Hook[]> {
  const cleanups: Hook[] = [];
  for (const suite of chain(test)) {
    for (const hook of statics.getSuiteHooks(suite).beforeEach) {
      const cleanup = await hook(context, suite);
      if (typeof cleanup === 'function') cleanups.push(cleanup as Hook);
    }
  }
  return cleanups;
}

async function afterEach(test: AnyTask, context: unknown, cleanups: Hook[]): Promise<void> {
  for (const suite of chain(test).reverse()) {
    for (const hook of statics.getSuiteHooks(suite).afterEach) await hook(context, suite);
  }
  for (const cleanup of cleanups.reverse()) await cleanup();
}

const isHitLimit = (e: unknown): boolean => e instanceof Error && /Hit count limit/.test(e.message);

/**
 * Runs a file collected outside Vitest's own run (`static` mode): each suite's beforeAll/afterAll,
 * each test with its beforeEach/afterEach chain, stopping at the first failure, which is all a
 * mutant's verdict needs.
 */
async function runCollected(file: AnyTask, runnable: Set<string>): Promise<{ failed: string[]; ran: number; error?: string }> {
  const failed: string[] = [];
  let error: string | undefined;
  const note = (t: AnyTask, e: unknown): void => {
    error ??= `${fullName(t)}: ${e instanceof Error ? e.message : String(e)}`.slice(0, POLLUTION_ERROR_CHARS);
  };
  let ran = 0;
  const runSuite = async (suite: AnyTask): Promise<void> => {
    const hooks = statics.getSuiteHooks(suite);
    for (const hook of hooks.beforeAll) await hook(suite);
    try {
      for (const t of suite.tasks ?? []) {
        if (failed.length) return;
        if (t.type === 'suite') {
          await runSuite(t);
          continue;
        }
        const fn = runnable.has(t.id) ? statics.getTestFn(t) : undefined;
        if (!fn) continue;
        const cleanups = await beforeEach(t, t.context);
        ran++;
        try {
          await guarded(t.id, fn);
        } catch (e) {
          if (isDeadlock(e)) deadlocked = true;
          failed.push(t.id);
          note(t, e);
          if (isDeadlock(e)) return; // the pending test still holds this collection: no more of it runs
        } finally {
          if (!deadlocked) await afterEach(t, t.context, cleanups);
        }
      }
    } finally {
      for (const hook of hooks.afterAll) await hook(suite);
    }
  };
  try {
    await runSuite(file);
  } catch (e) {
    failed.push(file.id); // a hook threw: the file failed under the mutant, as Stryker scores it
    note(file, e);
  }
  return { failed, ran, ...(error !== undefined && { error }) };
}

function fullName(t: AnyTask): string {
  const parts = [t.name];
  for (let s = t.suite; s && s.type === 'suite' && s.name; s = s.suite) parts.unshift(s.name);
  return parts.join(' > ');
}

export default class OxmutateRunner extends (Base as new (config: unknown) => {
  onBeforeCollect?(paths: string[]): unknown;
  importFile?(filepath: string, source: string): unknown;
  onBeforeRunSuite?(suite: AnyTask): unknown;
  onAfterRunSuite?(suite: AnyTask): unknown;
  onBeforeRunTask?(test: AnyTask): unknown;
  onCollectStart?(file: unknown): unknown;
  /** Vitest's own: the current task, and the module graph a test file is invalidated in (Vitest 4). */
  workerState?: { current?: unknown; evaluatedModules?: { getModuleById: (id: string) => unknown; invalidateModule: (node: unknown) => void; fileToModulesMap?: Map<string, unknown> } };
  _currentSpecification?: unknown;
  onBeforeTryTask?(test: AnyTask, options: { retry: number; repeats: number }): unknown;
  onAfterRunFiles?(files: AnyTask[]): unknown;
}) {
  /**
   * Import-time hits (static mutants) are attributed to the test file being collected, so a static
   * mutant is later re-run against the files that load its module, not the whole suite (Stryker
   * re-runs everything for each one).
   */
  /**
   * Before any test file is imported: count the timers it and the code under test will create, count
   * Vitest's calls to its main thread, and take the resource floor a deadlock is measured against
   * (quiescence.ts).
   */
  onBeforeCollect(paths: string[]): unknown {
    if (deadlocks) {
      trackTimers();
      trackRpc(this.workerState as { rpc?: object } | undefined);
      takeFloor();
    }
    return super.onBeforeCollect?.(paths);
  }

  onCollectStart(file: AnyTask): unknown {
    if (mode === 'dry') ns.currentTestId = `${FILE_KEY}${file.filepath ?? file.file?.filepath ?? ''}`;
    return (super.onCollectStart as ((f: unknown) => unknown) | undefined)?.call(this, file);
  }

  onBeforeTryTask(test: AnyTask, options: { retry: number; repeats: number }): unknown {
    if (mode === 'dry') ns.currentTestId = test.id;
    return super.onBeforeTryTask?.(test, options);
  }

  async runTask(test: AnyTask & { context?: unknown }): Promise<void> {
    const fn = statics.getTestFn(test);
    if (!fn) throw new Error(`oxmutate: no function for test ${test.name}`);
    if (mode !== 'mutant') {
      if (only && !only.has(test.id)) return;
      // Only a wait inside a test body can be an idle stall; collection at low CPU is a slow machine.
      markTest(true);
      try {
        await guarded(test.id, fn);
        if (mode === 'dry') await probe(test, fn, () => this.retryReset(test, 1));
      } catch (e) {
        if (isDeadlock(e)) deadlocked = true;
        throw e;
      } finally {
        markTest(false);
      }
      return;
    }
    // A deadlock tore this worker down: the file's other tests do not run beside its pending run.
    if (tornDown) return;
    let current = test;
    let run = fn;
    let context = test.context;
    let invoked = false;
    // Once a mutant has polluted this context, no further verdict from it can be trusted: the
    // rest of the unit is left unrun, and the coordinator re-queues it into a fresh context.
    const spec = specTests.has(test.id);
    const done = spec ? decidedBySpec : decided;
    const ids = polluted ? [] : (plan.tests[test.id] ?? []).filter((id) => !done.has(id));
    let cleanups: Hook[] = [];
    let attempt = 0;
    const teardown = async (): Promise<void> => {
      await guarded(current.id, () => afterEach(current, context, cleanups));
      cleanups = [];
    };
    const setup = async (): Promise<void> => {
      // A run-once test runs from a fresh copy every time after its first; the copy's own hooks wrap it.
      if (invoked && test.file && runOnce.has(test.file.filepath)) {
        const copy = takeCopy(test);
        // Unreachable: onBeforeRunTask collected a copy for every run this test can make.
        if (!copy) throw new Error('oxmutate: a run-once test ran out of fresh collections');
        current = copy;
        run = statics.getTestFn(copy) ?? fn;
        context = copy.context;
      }
      invoked = true;
      cleanups = await guarded(current.id, () => beforeEach(current, context));
      await this.retryReset(test, ++attempt);
    };
    const fresh = async (): Promise<void> => {
      await teardown();
      await setup();
    };
    // Mutants run since the last clean canary. The first of them started from a clean state, so its
    // verdict stands whatever the next canary says; the rest are suspects if it fails.
    let unchecked: string[] = [];
    /** The context is past trusting: the unchecked runs are suspects, and the rest of the unit goes to a fresh one. */
    const pollutedBy = (e: unknown): false => {
      polluted = true;
      canaryEvery = 1;
      emit({ type: 'polluted', id: unchecked[0], suspects: unchecked.slice(1), test: test.id, file: test.file?.filepath, error: e instanceof Error ? e.message.slice(0, POLLUTION_ERROR_CHARS) : String(e) });
      return false;
    };
    const canary = async (): Promise<boolean> => {
      if (!unchecked.length) return true;
      try {
        await fresh();
      } catch (e) {
        // A hook that waits for ever, unmutated, is a mutant's leftover; any other hook error is the suite's.
        if (!isDeadlock(e)) throw e;
        return pollutedBy(e);
      }
      try {
        await guarded(test.id, run);
        unchecked = [];
        canaryEvery = Math.min(MAX_CANARY_EVERY, canaryEvery * 2);
        return true;
      } catch (e) {
        return pollutedBy(e);
      }
    };
    // The mutant is armed through the test's own `beforeEach`, as Stryker arms it: the dry run credits
    // code a hook runs to the test, so a mutant in a fixture builder or a seed is planned here, and with
    // the hooks run unarmed it always survived, to be killed later by an isolated run that costs a
    // fresh process (58 of 400 on a Mongo-backed suite, 2026-10-29). The previous run's `afterEach`
    // runs first, unarmed: its cleanup belongs to that run.
    const runArmed = async (id: string): Promise<{ status: 'Killed' | 'Survived' | 'Timeout' | 'Polluted'; ms: number; deadlock?: true }> => {
      try {
        await teardown();
      } catch (e) {
        // The previous run's afterEach, unarmed, waits for ever: that run left the context broken.
        if (!isDeadlock(e)) throw e;
        pollutedBy(e);
        return { status: 'Polluted', ms: 0 };
      }
      const t0 = performance.now();
      ns.activeMutant = id;
      ns.hitCount = 0;
      ns.hitLimit = plan.hitLimits[id] ?? Number.MAX_SAFE_INTEGER;
      let status: 'Killed' | 'Survived' | 'Timeout' = 'Survived';
      let deadlock = false;
      const before = unhandled;
      try {
        await setup();
        await guarded(current.id, run);
        await settle();
        if (unhandled > before) status = 'Killed';
      } catch (e) {
        deadlock = isDeadlock(e);
        status = isHitLimit(e) || deadlock ? 'Timeout' : 'Killed';
      } finally {
        ns.activeMutant = undefined;
        ns.hitCount = undefined;
        ns.hitLimit = undefined;
      }
      return { status, ms: performance.now() - t0, ...(deadlock && { deadlock: true as const }) };
    };
    for (const id of ids) {
      if (done.has(id)) continue;
      // The real clock: a test that froze it (`vi.useFakeTimers()`, never undone) made every later
      // mutant read as running since the freeze, and the watchdog stopped it at once (caique, 2026-11-02).
      mark(`${id} ${String(realNow())}\n`);
      let { status, ms, deadlock } = await runArmed(id);
      if (status === 'Polluted') break;
      // A kill that follows unchecked runs may be one of their leftovers, which this run's own cleanup
      // (a `finally`) then wipes, so the batch canary would pass and vouch for a wrong kill. Survivors
      // are confirmed in isolation later; kills are checked here: a failing canary is pollution as
      // usual (this verdict goes back with the unit), a passing one leaves the state clean to decide
      // the mutant again from (.sdlc/intents/oxmutate/canary.qnt).
      if (status !== 'Survived' && unchecked.length > 0) {
        if (!(await canary())) break;
        ({ status, ms, deadlock } = await runArmed(id));
        if (status === 'Polluted') break;
      }
      if (status !== 'Survived') done.add(id);
      emit({ type: 'mutant', id, test: test.id, status, ms, ...(spec ? { spec: true } : {}), ...(deadlock && { deadlock: true }) });
      unchecked.push(id);
      // The canary: the same test, unmutated, must still pass. If it fails, a mutant left state
      // behind (a cache, a registry, a fixture) that would decide the next verdicts. Run after every
      // mutant at first, then every 2, 4, 8 while it stays clean: pollution is rare per test, and the
      // canary was half of all executions (burgee/paratext, 2026-10-27).
      // A deadlocked run is still pending in this worker, its timers and handles with it: tear the
      // context down. The unit ends here; the verdicts no canary has vouched for since the last
      // clean one go back with the rest of the unit to a fresh context, and Vitest drops this worker.
      if (deadlock) {
        pollutedBy(new Error('torn down: a deadlocked run is still pending in this worker'));
        tornDown = true;
        break;
      }
      if (unchecked.length >= canaryEvery && !(await canary())) break;
    }
    // Torn down: nothing more runs in this worker, not even the test's own unmutated run.
    if (tornDown) {
      mark('');
      return;
    }
    if (!polluted) await canary();
    if (ids.length) mark('');
    if (attempt > 0) await fresh();
    try {
      await run();
    } finally {
      for (const cleanup of cleanups.reverse()) await cleanup();
    }
  }

  /**
   * The baseline is taken as the test file itself is imported (`source: 'collect'`), after setup
   * files: those run before every collection, re-collections included, and write the same values
   * each time (the family's colour setup sets TERM, COLORTERM and NO_COLOR), so they are not leaks.
   */
  importFile(filepath: string, source: string): unknown {
    if (mode === 'static' && source === 'collect' && !pristine) pristine = snapshot();
    return super.importFile?.(filepath, source);
  }

  async onAfterRunSuite(suite: AnyTask): Promise<unknown> {
    // `dry`: the project files this test file's run evaluated, for the incremental fingerprint. Each
    // file runs isolated, so the worker's module graph is its own.
    if (mode === 'dry' && suite.filepath) {
      const files = [...(this.workerState?.evaluatedModules?.fileToModulesMap?.keys() ?? [])];
      dryModules.set(suite.filepath, files.filter((f) => path.isAbsolute(f) && !f.split(path.sep).includes('node_modules')));
    }
    const copies = suite.filepath ? collections.get(suite.filepath) : undefined;
    if (suite.filepath && copies) {
      collections.delete(suite.filepath);
      for (const copy of copies) await afterAllOf(copy);
    }
    return super.onAfterRunSuite?.(suite);
  }

  async onBeforeRunSuite(suite: AnyTask): Promise<unknown> {
    if (mode === 'static' && suite.filepath && staticIds.length) await this.decideStatic(suite);
    return super.onBeforeRunSuite?.(suite);
  }

  /**
   * `static` mode (.sdlc/intents/oxmutate/staticwarm.qnt). Re-evaluating the project's modules in
   * this worker costs ~0.5 ms where a fresh worker per (mutant, file) cost ~80 ms (burgee/paratext,
   * 2026-10-30). What a registry reset leaves behind is guarded three ways: the file's own unarmed
   * collection must leave globalThis, process.env and the built-in prototypes as they were; so must
   * each mutant; and an unarmed re-collection after each mutant must pass. Anything else hands the
   * rest of the batch back to the fresh-worker path.
   */
  private async decideStatic(suite: AnyTask): Promise<void> {
    const filepath = suite.filepath as string;
    // The tests this run will execute, after Vitest's own filters (a name pattern, `.only`, `.skip`):
    // a re-collected file has the same test ids, and runs exactly these.
    const runnable = new Set<string>();
    const visit = (t: AnyTask): void => {
      if (t.type === 'test' && t.mode === 'run') runnable.add(t.id);
      for (const c of t.tasks ?? []) visit(c);
    };
    visit(suite);
    const rest = [...staticIds];
    const fallback = (reason: string, keys: string[] = []): void => {
      emit({ type: 'static-fallback', ids: rest.splice(0), reason, keys });
    };
    const before = pristine;
    if (!before) return fallback('no baseline');
    const atCollect = snapshotDiff(before, snapshot());
    if (atCollect.length) return fallback('the file changed globals while it was collected', atCollect);
    const vitest = (await fromProject('vitest')) as { vi?: { resetModules: () => void } };
    // `collectTests` is exported for Vitest's browser runner from an internal subpath: if a Vitest
    // moves or drops it, the import fails and the fresh-worker path decides, as on Vitest 4.
    const browser = (await fromProject('vitest/internal/browser').catch(() => ({}))) as {
      collectTests?: (specs: string[], runner: unknown) => Promise<AnyTask[]>;
    };
    const { collectTests } = browser;
    const { vi } = vitest;
    if (!collectTests || !vi) return fallback('this Vitest has no public collect'); // Vitest 4: the fresh path decides
    const evaluate = async (armed: string | undefined): Promise<{ failed: string[]; ran: number; timeout: boolean; deadlock?: boolean; error?: string }> => {
      ns.activeMutant = armed;
      ns.hitCount = armed ? 0 : undefined;
      ns.hitLimit = armed ? (staticLimits[armed] ?? Number.MAX_SAFE_INTEGER) : undefined;
      deadlocked = false;
      const before = unhandled;
      try {
        vi.resetModules();
        const [file] = await collectTests([filepath], this);
        const result = file ? await runCollected(file, runnable) : { failed: [filepath], ran: 0 };
        await settle();
        if (unhandled > before && result.failed.length === 0) result.failed.push(filepath);
        return { ...result, timeout: ranAway() || deadlocked, ...(deadlocked ? { deadlock: true } : {}) };
      } finally {
        ns.activeMutant = undefined;
        ns.hitCount = undefined;
        ns.hitLimit = undefined;
      }
    };
    // Verdicts since the last clean unarmed re-collection are held, not emitted: the re-collection runs
    // after the first mutant, then after every 2, then every STATIC_CANARY_MAX while it stays clean, and
    // one that fails sends every held mutant back with the rest. Each mutant's own snapshot diff still
    // runs at once. The re-collection runs the file's tests unarmed, and after every mutant it was half
    // of the live static phase, 6,713 s of compat-oracle's 11,193 s weekly run (sc8-profile.md,
    // staticwarm.qnt `grouped`).
    let held: { id: string; verdict: Awaited<ReturnType<typeof evaluate>> }[] = [];
    let every = 1;
    const back = (reason: string, keys: string[] = []): void => {
      rest.unshift(...held.map((h) => h.id));
      held = [];
      fallback(reason, keys);
    };
    while (rest.length) {
      const id = rest.shift() as string;
      // The real clock, as above: the file's tests run again here, and may freeze it.
      mark(`${id} ${String(realNow())}\n`);
      held.push({ id, verdict: await evaluate(id) });
      // A deadlocked run is still pending in this worker: tear it down. The batch, held verdicts and
      // all, goes back to the fresh-worker path, where each run has its own process.
      if (held.at(-1)?.verdict.deadlock) return back('torn down: a deadlocked run is still pending in this worker');
      const left = snapshotDiff(before, snapshot());
      if (left.length) return back('the mutant left a trace', left);
      if (held.length < every && rest.length) continue;
      const unarmed = await evaluate(undefined);
      emit({ type: 'recollection' });
      if (unarmed.failed.length > 0) return back('the unarmed re-collection failed', unarmed.error ? [unarmed.error] : []);
      const after = snapshotDiff(before, snapshot());
      if (after.length) return back('the unarmed re-collection left a trace', after);
      for (const { id: done, verdict } of held) emit({ type: 'isolated', id: done, killed: verdict.failed.length > 0 && !verdict.timeout, failed: verdict.failed, ran: verdict.ran, ...(verdict.timeout && { timeout: true }), ...(verdict.deadlock && { deadlock: true }) });
      held = [];
      every = Math.min(STATIC_CANARY_MAX, every * 2);
    }
    mark('');
    vi.resetModules();
  }

  /**
   * Collected here, before Vitest marks the test running: it refuses `it()` inside a running test.
   * A file whose copies cannot be collected falls back to the canary restarting its context.
   */
  async onBeforeRunTask(test: AnyTask): Promise<unknown> {
    const filepath = test.file?.filepath;
    if (mode === 'mutant' && !polluted && filepath && runOnce.has(filepath)) {
      const done = specTests.has(test.id) ? decidedBySpec : decided;
      const runs = (plan.tests[test.id] ?? []).filter((id) => !done.has(id)).length * RUNS_PER_MUTANT + RUNS_AFTER;
      if (!(await this.collectCopies(filepath, (taken.get(test.id) ?? 0) + runs))) runOnce.delete(filepath);
    }
    return super.onBeforeRunTask?.(test);
  }

  /**
   * Fresh collections of `filepath` until there are `count`. Only the test file is evaluated again
   * (Vitest 5 re-imports it; on Vitest 4 its module is invalidated first), so each costs the file's
   * own top level, not its imports.
   */
  private async collectCopies(filepath: string, count: number): Promise<boolean> {
    const files = collections.get(filepath) ?? [];
    collections.set(filepath, files);
    if (files.length >= count) return true;
    const collect = await loadCollect();
    if (!collect) return false;
    const { workerState } = this;
    // Collecting points Vitest's current task and spec at the new file; the running file keeps them.
    const was = { current: workerState?.current, spec: this._currentSpecification };
    try {
      while (files.length < count) {
        const node = workerState?.evaluatedModules?.getModuleById(filepath);
        if (node) workerState?.evaluatedModules?.invalidateModule(node);
        const [file] = await collect([filepath], this);
        if (!file || file.result?.state === 'fail' || hasBeforeAll(file)) return false;
        files.push(file);
      }
      return true;
    } finally {
      if (workerState) workerState.current = was.current;
      this._currentSpecification = was.spec;
    }
  }

  /** Reset per-try state (snapshot counters, assertion counts) the way Vitest does for a retry. */
  private async retryReset(test: AnyTask, attempt: number): Promise<void> {
    await super.onBeforeTryTask?.(test, { retry: attempt, repeats: 0 });
  }

  async onAfterRunFiles(files: AnyTask[]): Promise<unknown> {
    await settle();
    if (mode === 'dry') {
      const tests: { id: string; file: string; name: string; state: string; ms: number }[] = [];
      const visit = (t: AnyTask, file: string): void => {
        if (t.type === 'test') tests.push({ id: t.id, file, name: fullName(t), state: t.result?.state ?? 'skip', ms: t.result?.duration ?? 0 });
        for (const c of t.tasks ?? []) visit(c, file);
      };
      const fileErrors: { file: string; error: string }[] = [];
      for (const f of files) {
        const filepath = (f.file?.filepath ?? f.filepath) as string;
        visit(f, filepath);
        // A file that fails to collect has no failing test to show for it: report the file.
        const result = f.result as { state?: string; errors?: { message?: string }[] } | undefined;
        if (result?.state === 'fail' && !f.tasks?.length) fileErrors.push({ file: filepath, error: (result.errors?.[0]?.message ?? 'failed to collect').slice(0, FILE_ERROR_CHARS) });
      }
      emit({ type: 'dry', tests, coverage: ns.mutantCoverage, fileErrors, runOnce: [...runOnce], modules: Object.fromEntries(dryModules), unhandled });
    } else if (mode === 'isolated') {
      const failed: string[] = [];
      let ran = 0;
      const visit = (t: AnyTask): void => {
        if (t.type === 'test' && (t.result?.state === 'pass' || t.result?.state === 'fail')) ran++;
        if (t.type === 'test' && t.result?.state === 'fail') failed.push(t.id);
        for (const c of t.tasks ?? []) visit(c);
      };
      for (const f of files) {
        visit(f);
        // A file that failed with no failing test (it threw at import, or in a hook) failed under
        // the mutant: a kill, as Stryker scores it. Its id stands in for the test that failed.
        if (f.result?.state === 'fail' && !failed.length) failed.push(f.id);
      }
      const [first] = files;
      if (unhandled > 0 && !failed.length && first) failed.push(first.id);
      const timeout = ranAway() || deadlocked;
      emit({ type: 'isolated', id: env[ACTIVE_MUTANT_ENV] ?? ns.activeMutant, killed: failed.length > 0 && !timeout, failed, ran, ...(timeout && { timeout }), ...(deadlocked && { deadlock: true }) });
    }
    closeFiles();
    return super.onAfterRunFiles?.(files);
  }
}
