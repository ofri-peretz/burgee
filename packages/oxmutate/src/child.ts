/**
 * A Vitest server in its own process. It starts the project's Vitest once and then runs work
 * units sent by the coordinator over IPC, re-running the same instance (~0.2 s a run against
 * ~1.5 s for a fresh Vitest). The coordinator kills the process when a mutant loops
 * synchronously, a hang that no in-worker timeout and no `cancelCurrentRun()` can interrupt
 * (both measured, 2026-10-26), and hands the rest of the unit to another server.
 *
 *   node child.js <server.json>     IPC: ← { type: 'run', unit }   → { type: 'ready' | 'done' }
 *
 * Vitest is resolved from the project being tested, like Stryker's vitest-runner does, so the
 * project's own Vitest version and config run its tests.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExitCode } from 'burgee';

import { declaredPool } from './declared-pool.js';
import { VITEST_SAID } from './dry-failure.js';
import { BEAT_ENV, beatFile, CPU_SAMPLE_MS } from './heartbeat.js';
import { resolveEsm } from './resolve.js';
import { ACTIVE_MUTANT_ENV, argv, env, exit, killGroup, pid, serverGroups, stderr } from './runtime.js';
import { instrumentedSources } from './vite-plugin.js';

export interface ServerConfig {
  root: string;
  vitestConfig?: string | undefined;
  workers: number;
  instrumentedMap: string;
  /** `execArgv` for this server (Stryker's `testRunnerNodeArgs`). */
  nodeArgs?: string[] | undefined;
  /**
   * Inline every dependency, so a module-registry reset re-evaluates them too (`static` units:
   * state kept in an externalized dependency would outlive a reset; staticwarm.qnt, INLINE).
   */
  inlineDeps?: boolean | undefined;
}

export interface Unit {
  mode: 'dry' | 'mutant' | 'isolated' | 'static';
  /** Test files to run (absolute). Empty: every file the config includes. */
  files: string[];
  results: string;
  progress: string;
  plan?: string | undefined;
  /** `isolated`: mutants armed one after another from process start, each with its files. */
  batch?: { id: string; files: string[]; tests?: string[] | undefined; hitLimit?: number | undefined; testMs?: Record<string, number> | undefined }[] | undefined;
  /** `static`: the static mutants this one file's run decides in its live worker. */
  staticIds?: string[] | undefined;
  /** `static`: the same mutants as groups armed together, for a file that is not their first (`static.group`). */
  staticGroups?: string[][] | undefined;
  /** `static`, confirming survivors: each mutant's covering tests in this file, the only bodies its run executes. */
  staticTests?: Record<string, string[]> | undefined;
  /** `static`: each mutant's hit-count limit, past which its run is a runaway. */
  hitLimits?: Record<string, number> | undefined;
  /** `dry`: report which tests read each tracked static value (`static.readers`, roadmap 2.4). */
  trackReads?: boolean | undefined;
  /** `dry`: test files whose results the coordinator kept (roadmap 3.3): every other file the config includes runs. */
  skip?: string[] | undefined;
}

// The coordinator is gone (finished, crashed or killed): nothing will read this server's results,
// and a worker thread may still be looping in a mutant. Two such servers were found spinning at
// 100% CPU 11 hours after their run ended, and slowed the next run 50x (2026-10-27). Listened for
// before Vitest loads: a server that listened only after lived on through a load that takes seconds
// on a busy machine (T6, 2026-11-02), and one whose coordinator died before it started exits now.
// A server leads its own process group (scheduler.ts), so it takes the processes its tests started
// with it: they would outlive it, re-parented, with nothing left to end them.
const leave = (): never => {
  if (serverGroups) killGroup(pid);
  return exit(ExitCode.OK);
};
process.on('disconnect', leave);
if (!process.connected) leave();

const config = JSON.parse(readFileSync(argv[2] ?? '', 'utf8')) as ServerConfig;
env['NODE_ENV'] ??= 'test';
// Before Vitest starts any worker, so each one inherits it (heartbeat.ts).
env[BEAT_ENV] = beatFile(path.dirname(config.instrumentedMap), pid);

const vitestNode = (await import(resolveEsm('vitest/node', config.root))) as {
  createVitest: (mode: string, options: Record<string, unknown>, viteOverrides?: Record<string, unknown>) => Promise<{
    start(files?: string[]): Promise<unknown>;
    globTestSpecifications(): Promise<{ moduleId: string }[]>;
    runTestSpecifications(specs: { moduleId: string }[], allTestsRun?: boolean): Promise<unknown>;
    close(): Promise<void>;
    config: { bail: number };
    projects: { config: { runner?: string; isolate?: boolean; testTimeout?: number | undefined; hookTimeout?: number | undefined } }[];
  }>;
};

const runner = fileURLToPath(new URL('./runner.js', import.meta.url));
const silent = { onInit() {}, onFinished() {} };
const vitest = await vitestNode.createVitest(
  'test',
  {
    root: config.root,
    config: config.vitestConfig,
    watch: false,
    run: true,
    // Threads, which a runaway mutant is stopped in, unless the project's own config asks for another (tests that call process.chdir need forks).
    pool: (await declaredPool(config.root, config.vitestConfig)) ?? 'threads',
    maxWorkers: config.workers,
    isolate: true,
    runner,
    reporters: env['OXMUTATE_DEBUG_VITEST'] ? ['default'] : [silent],
    coverage: { enabled: false },
    passWithNoTests: true,
    // Bail is ours (per mutant); Vitest must run every test it is handed.
    bail: 0,
    // Vitest 5's persistent module cache keys on the file on disk, not on what a plugin serves,
    // so it served a previous run's instrumentation: every mutant whose id had changed since got
    // no coverage (burgee/paratext, 2026-10-27: 6% agreement until this was off). Off under both
    // spellings (top-level in Vitest 5, `experimental` in 4.x).
    fsModuleCache: false,
    experimental: { fsModuleCache: false },
    ...(config.inlineDeps && { server: { deps: { inline: true } } }),
  },
  // A private Vite cache per run, so no cache outside this run can answer for a mutated file.
  { plugins: [instrumentedSources(config.instrumentedMap)], cacheDir: path.join(path.dirname(config.instrumentedMap), 'vite-cache') },
);
// A config with `projects` resolves each project's `runner` and `isolate` from its own inline
// config, never from these options, so its tests ran without oxmutate's runner and the dry run
// recorded none (burgee, weekly run 40783405734, 2026-10-28). Each project keeps its own pool:
// burgee's run in forks, and its process.env lock fails under threads.
for (const project of vitest.projects) Object.assign(project.config, { runner, isolate: true });

/**
 * How many times its own `testTimeout` and `hookTimeout` a test gets in a dry run. The dry run counts
 * every mutant switch each test reaches, per test, so the project's code runs slower there than in
 * the project's own run: pathe's `Zeptomatch > exploits` takes 3.6 s under plain Vitest, and failed
 * one oxmutate dry run against the 5 s default as "1 test(s) fail with no mutant active" and read as
 * flaky in another (2026-11-19). A test that passes in the project's own run must not fail here from
 * that alone. 3x is the slack oxmutate already gives a slow run everywhere else (the warm budget's
 * 3x the dry-run time, a busy stop's 3x re-run).
 *
 * Dry runs only. No verdict comes from a dry run: it finds the tests, their coverage and their
 * times, and a failing test in it stops the run. Mutant runs keep the project's own timeouts, so a
 * mutant that makes a test slower than the project allows is judged exactly as before: by the
 * test's own timeout (a slow kill, re-run once, `slowTwice` a Timeout), the watchdog's budget, the
 * hit-count limit or the idle-stall check. None of those reads the dry run's timeout. A timeout a
 * test sets for itself (`it(name, { timeout })`) is the author's, and is left as it is.
 */
const DRY_TIMEOUT_SCALE = 3;
const ownTimeouts = vitest.projects.map((project) => ({ project, testTimeout: project.config.testTimeout, hookTimeout: project.config.hookTimeout }));
/** A timeout of 0 or Infinity is none, and stays none. */
const scaled = (ms: number | undefined): number | undefined => (ms !== undefined && ms > 0 && Number.isFinite(ms) ? ms * DRY_TIMEOUT_SCALE : ms);
/** The project's timeouts, scaled for a dry run: Vitest serializes a project's config at every run. */
function timeoutsFor(mode: Unit['mode']): void {
  for (const own of ownTimeouts) {
    own.project.config.testTimeout = mode === 'dry' ? scaled(own.testTimeout) : own.testTimeout;
    own.project.config.hookTimeout = mode === 'dry' ? scaled(own.hookTimeout) : own.hookTimeout;
  }
}

/** Has the runner recorded a kill for this mutant in this unit's results yet? */
function killed(results: string, id: string): boolean {
  let text = '';
  try {
    text = readFileSync(results, 'utf8');
  } catch {
    return false;
  }
  return text.split('\n').some((line) => line.includes(`"id":"${id}"`) && line.includes('"killed":true'));
}

/** The environment the next mutant's workers inherit: its limits and tests, each set or gone. */
function armEnvironment(item: NonNullable<Unit['batch']>[number]): void {
  env[ACTIVE_MUTANT_ENV] = item.id;
  // The runaway guard warm runs have: a loop the mutant causes stops at the limit, not the watchdog.
  if (item.hitLimit) env['OXMUTATE_HIT_LIMIT'] = String(item.hitLimit);
  else delete env['OXMUTATE_HIT_LIMIT'];
  if (item.tests) env['OXMUTATE_ONLY_TESTS'] = JSON.stringify(item.tests);
  else delete env['OXMUTATE_ONLY_TESTS'];
  // Each covering test's dry-run time, for the watchdog's limit on the test that is running.
  if (item.testMs) env['OXMUTATE_TEST_MS'] = JSON.stringify(item.testMs);
  else delete env['OXMUTATE_TEST_MS'];
}

/** An `isolated` unit: its mutants armed one after another, each across its files. */
async function runIsolated(unit: Unit): Promise<void> {
  // Stop a file at its first failing test: one failure kills the mutant, and the rest of the
  // file is wasted time (burgee/paratext hyperlinks.test.ts: 2.3 s a run, the first failure
  // typically in its first tests). Read per start, so dry and warm runs still run everything
  // (measured on Vitest 4.1, 2026-10-27).
  vitest.config.bail = 1;
  try {
    for (const item of unit.batch ?? []) {
      armEnvironment(item);
      writeFileSync(unit.progress, `${item.id} ${String(Date.now())}\n`);
      // One file at a time, cheapest first (the coordinator orders them), stopping at the first
      // file that kills the mutant: Stryker runs every file for every isolated mutant.
      for (const file of item.files) {
        await vitest.start([file]);
        if (killed(unit.results, item.id)) break;
      }
    }
    delete env[ACTIVE_MUTANT_ENV];
    delete env['OXMUTATE_ONLY_TESTS'];
    delete env['OXMUTATE_HIT_LIMIT'];
  } finally {
    vitest.config.bail = 0;
  }
  writeFileSync(unit.progress, '');
}

/** A dry run of every file the config includes but these, kept by the coordinator (roadmap 3.3). */
async function runAllBut(kept: readonly string[]): Promise<void> {
  const skip = new Set(kept);
  const specs = (await vitest.globTestSpecifications()).filter((s) => !skip.has(s.moduleId));
  // Every file kept: nothing to run, and an empty list would not mean "none" to Vitest.
  if (specs.length > 0) await vitest.runTestSpecifications(specs, false);
}

async function runUnit(unit: Unit): Promise<void> {
  // Workers copy the environment when they start, so each run sees the unit's settings
  // (verified across re-runs of one instance, 2026-10-26).
  env['OXMUTATE_MODE'] = unit.mode;
  if (unit.trackReads) env['__OXMUTATE_TRACK_READS__'] = '1';
  else delete env['__OXMUTATE_TRACK_READS__'];
  env['OXMUTATE_RESULTS'] = unit.results;
  env['OXMUTATE_PROGRESS'] = unit.progress;
  if (unit.plan) env['OXMUTATE_PLAN'] = unit.plan;
  if (unit.staticIds) env['OXMUTATE_STATIC'] = JSON.stringify(unit.staticIds);
  else delete env['OXMUTATE_STATIC'];
  if (unit.staticGroups) env['OXMUTATE_STATIC_GROUPS'] = JSON.stringify(unit.staticGroups);
  else delete env['OXMUTATE_STATIC_GROUPS'];
  if (unit.staticTests) env['OXMUTATE_STATIC_TESTS'] = JSON.stringify(unit.staticTests);
  else delete env['OXMUTATE_STATIC_TESTS'];
  if (unit.hitLimits) env['OXMUTATE_HIT_LIMITS'] = JSON.stringify(unit.hitLimits);
  else delete env['OXMUTATE_HIT_LIMITS'];
  delete env[ACTIVE_MUTANT_ENV];
  timeoutsFor(unit.mode);
  await (unit.mode === 'isolated' ? runIsolated(unit) : runFiles(unit));
}

/** A unit's files, or every file the config includes (less a dry run's kept ones). */
async function runFiles(unit: Unit): Promise<void> {
  // A dry run names itself in the progress file, so the watchdog holds it to its budget.
  if (unit.mode === 'dry') writeFileSync(unit.progress, `dry ${String(Date.now())}\n`);
  if (unit.skip?.length) await runAllBut(unit.skip);
  else await reportErrors(await vitest.start(unit.files.length ? unit.files : undefined));
}

/** The most errors of one `start` written to stderr. */
const MAX_VITEST_ERRORS = 3;

/** Errors Vitest returned instead of throwing (a pool it could not start), for the coordinator to name when nothing ran. */
async function reportErrors(result: unknown): Promise<void> {
  const errors = (result as { unhandledErrors?: readonly { message?: string }[] } | undefined)?.unhandledErrors ?? [];
  for (const e of errors.slice(0, MAX_VITEST_ERRORS)) stderr.write(`${VITEST_SAID}${(e.message ?? 'unknown').split('\n')[0] ?? ''}\n`);
}

/** How long `close` waits for `vitest.close()` before the server exits regardless. */
const CLOSE_GRACE_MS = 2000;

process.on('message', (msg: { type: string; unit?: Unit }) => {
  if (msg.type === 'run' && msg.unit) {
    runUnit(msg.unit).then(
      () => process.send?.({ type: 'done' }),
      (error: unknown) => process.send?.({ type: 'done', error: error instanceof Error ? error.message : String(error) }),
    );
  } else if (msg.type === 'close') {
    // A worker thread stuck in a runaway mutant never lets `vitest.close()` settle: exit anyway.
    setTimeout(() => exit(ExitCode.OK), CLOSE_GRACE_MS).unref();
    void vitest.close().finally(() => exit(ExitCode.OK));
  }
});
// The server's CPU time, every thread (the test worker included), for the watchdog to tell an idle
// stall from a loop (heartbeat.ts). This thread stays free while a worker loops, so the samples come.
const sendCpu = (): void => {
  const { user, system } = process.cpuUsage();
  process.send?.({ type: 'cpu', at: Date.now(), us: user + system });
};
sendCpu();
setInterval(sendCpu, CPU_SAMPLE_MS).unref();
process.send?.({ type: 'ready' });
