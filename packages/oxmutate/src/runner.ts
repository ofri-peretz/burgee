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
 *
 * Before each mutant the runner writes a progress line synchronously, so the coordinator can
 * attribute and kill a worker stuck in a synchronous loop that the hit counter cannot break.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

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
};
type Hook = (...args: unknown[]) => unknown;
type RunnerStatics = {
  getTestFn: (test: AnyTask) => (() => unknown) | undefined;
  getSuiteHooks: (suite: AnyTask) => { beforeEach: Hook[]; afterEach: Hook[] };
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
}
const plan: Plan =
  mode === 'mutant' && env['OXMUTATE_PLAN'] ? (JSON.parse(readFileSync(env['OXMUTATE_PLAN'], 'utf8')) as Plan) : { tests: {}, hitLimits: {}, skip: [] };
const decided = new Set(plan.skip);
/** The replay tests' own bail: a mutant the tests killed is still replayed, and the reverse. */
const specTests = new Set(plan.specTests ?? []);
const decidedBySpec = new Set<string>();
/** `isolated`: when set, only these tests run (the mutant's covering tests); the rest pass untouched. */
const only = mode === 'isolated' && env['OXMUTATE_ONLY_TESTS'] ? new Set(JSON.parse(env['OXMUTATE_ONLY_TESTS']) as string[]) : undefined;
/** Set when a mutant left state behind; the rest of this context runs no mutants. */
let polluted = false;
/** Mutants between canaries; doubles while the canary stays clean, back to 1 when it fails. */
let canaryEvery = 1;
const MAX_CANARY_EVERY = 8;
/** How much of a test's error a `polluted` record keeps, and of a file's collection error. */
const POLLUTION_ERROR_CHARS = 300;
const FILE_ERROR_CHARS = 500;

function emit(record: object): void {
  if (resultsPath) appendFileSync(resultsPath, `${JSON.stringify(record)}\n`);
}

function chain(test: AnyTask): AnyTask[] {
  const suites: AnyTask[] = [];
  for (let s = test.suite; s; s = s.suite) suites.unshift(s);
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

function fullName(t: AnyTask): string {
  const parts = [t.name];
  for (let s = t.suite; s && s.type === 'suite' && s.name; s = s.suite) parts.unshift(s.name);
  return parts.join(' > ');
}

export default class OxmutateRunner extends (Base as new (config: unknown) => {
  onCollectStart?(file: unknown): unknown;
  onBeforeTryTask?(test: AnyTask, options: { retry: number; repeats: number }): unknown;
  onAfterRunFiles?(files: AnyTask[]): unknown;
}) {
  /**
   * Import-time hits (static mutants) are attributed to the test file being collected, so a static
   * mutant is later re-run against the files that load its module, not the whole suite (Stryker
   * re-runs everything for each one).
   */
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
      await fn();
      return;
    }
    const context = test.context;
    // Once a mutant has polluted this context, no further verdict from it can be trusted: the
    // rest of the unit is left unrun, and the coordinator re-queues it into a fresh context.
    const spec = specTests.has(test.id);
    const done = spec ? decidedBySpec : decided;
    const ids = polluted ? [] : (plan.tests[test.id] ?? []).filter((id) => !done.has(id));
    let cleanups: Hook[] = [];
    let attempt = 0;
    const fresh = async (): Promise<void> => {
      await afterEach(test, context, cleanups);
      cleanups = await beforeEach(test, context);
      await this.retryReset(test, ++attempt);
    };
    // Mutants run since the last clean canary. The first of them started from a clean state, so its
    // verdict stands whatever the next canary says; the rest are suspects if it fails.
    let unchecked: string[] = [];
    const canary = async (): Promise<boolean> => {
      if (!unchecked.length) return true;
      await fresh();
      try {
        await fn();
        unchecked = [];
        canaryEvery = Math.min(MAX_CANARY_EVERY, canaryEvery * 2);
        return true;
      } catch (e) {
        polluted = true;
        canaryEvery = 1;
        emit({ type: 'polluted', id: unchecked[0], suspects: unchecked.slice(1), test: test.id, file: test.file?.filepath, error: e instanceof Error ? e.message.slice(0, POLLUTION_ERROR_CHARS) : String(e) });
        return false;
      }
    };
    for (const id of ids) {
      if (done.has(id)) continue;
      if (attempt > 0) await fresh();
      if (progressPath) writeFileSync(progressPath, `${id} ${String(Date.now())}\n`);
      const t0 = performance.now();
      ns.activeMutant = id;
      ns.hitCount = 0;
      ns.hitLimit = plan.hitLimits[id] ?? Number.MAX_SAFE_INTEGER;
      let status: 'Killed' | 'Survived' | 'Timeout' = 'Survived';
      try {
        await fn();
      } catch (e) {
        status = isHitLimit(e) ? 'Timeout' : 'Killed';
      } finally {
        ns.activeMutant = undefined;
        ns.hitCount = undefined;
        ns.hitLimit = undefined;
      }
      if (status !== 'Survived') done.add(id);
      emit({ type: 'mutant', id, test: test.id, status, ms: performance.now() - t0, ...(spec ? { spec: true } : {}) });
      unchecked.push(id);
      // The canary: the same test, unmutated, must still pass. If it fails, a mutant left state
      // behind (a cache, a registry, a fixture) that would decide the next verdicts. Run after every
      // mutant at first, then every 2, 4, 8 while it stays clean: pollution is rare per test, and the
      // canary was half of all executions (burgee/paratext, 2026-10-27).
      if (unchecked.length >= canaryEvery && !(await canary())) break;
    }
    if (!polluted) await canary();
    if (progressPath && ids.length) writeFileSync(progressPath, '');
    if (attempt > 0) await fresh();
    try {
      await fn();
    } finally {
      for (const cleanup of cleanups.reverse()) await cleanup();
    }
  }

  /** Reset per-try state (snapshot counters, assertion counts) the way Vitest does for a retry. */
  private async retryReset(test: AnyTask, attempt: number): Promise<void> {
    await super.onBeforeTryTask?.(test, { retry: attempt, repeats: 0 });
  }

  onAfterRunFiles(files: AnyTask[]): unknown {
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
      emit({ type: 'dry', tests, coverage: ns.mutantCoverage, fileErrors });
    } else if (mode === 'isolated') {
      const failed: string[] = [];
      let ran = 0;
      const visit = (t: AnyTask): void => {
        if (t.type === 'test' && (t.result?.state === 'pass' || t.result?.state === 'fail')) ran++;
        if (t.type === 'test' && t.result?.state === 'fail') failed.push(t.id);
        for (const c of t.tasks ?? []) visit(c);
      };
      for (const f of files) visit(f);
      emit({ type: 'isolated', id: env[ACTIVE_MUTANT_ENV] ?? ns.activeMutant, killed: failed.length > 0, failed, ran });
    }
    return super.onAfterRunFiles?.(files);
  }
}
