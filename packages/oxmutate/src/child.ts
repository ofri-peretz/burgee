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

import { resolveEsm } from './resolve.js';
import { ACTIVE_MUTANT_ENV } from './runtime.js';
import { instrumentedSources } from './vite-plugin.js';

export interface ServerConfig {
  root: string;
  vitestConfig?: string | undefined;
  workers: number;
  instrumentedMap: string;
}

export interface Unit {
  mode: 'dry' | 'mutant' | 'isolated';
  /** Test files to run (absolute). Empty: every file the config includes. */
  files: string[];
  results: string;
  progress: string;
  plan?: string | undefined;
  /** `isolated`: mutants armed one after another from process start, each with its files. */
  batch?: { id: string; files: string[]; tests?: string[] | undefined }[] | undefined;
}

const config = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as ServerConfig;
process.env['NODE_ENV'] ??= 'test';

const vitestNode = (await import(resolveEsm('vitest/node', config.root))) as {
  createVitest: (mode: string, options: Record<string, unknown>, viteOverrides?: Record<string, unknown>) => Promise<{
    start(files?: string[]): Promise<unknown>;
    close(): Promise<void>;
    config: { bail: number };
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
    pool: 'threads',
    maxWorkers: config.workers,
    isolate: true,
    runner,
    reporters: process.env['OXMUTATE_DEBUG_VITEST'] ? ['default'] : [silent],
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
  },
  // A private Vite cache per run, so no cache outside this run can answer for a mutated file.
  { plugins: [instrumentedSources(config.instrumentedMap)], cacheDir: path.join(path.dirname(config.instrumentedMap), 'vite-cache') },
);

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

async function runUnit(unit: Unit): Promise<void> {
  // Workers copy the environment when they start, so each run sees the unit's settings
  // (verified across re-runs of one instance, 2026-10-26).
  process.env['OXMUTATE_MODE'] = unit.mode;
  process.env['OXMUTATE_RESULTS'] = unit.results;
  process.env['OXMUTATE_PROGRESS'] = unit.progress;
  if (unit.plan) process.env['OXMUTATE_PLAN'] = unit.plan;
  delete process.env[ACTIVE_MUTANT_ENV];
  if (unit.mode === 'isolated') {
    // Stop a file at its first failing test: one failure kills the mutant, and the rest of the
    // file is wasted time (burgee/paratext hyperlinks.test.ts: 2.3 s a run, the first failure
    // typically in its first tests). Read per start, so dry and warm runs still run everything
    // (measured on Vitest 4.1, 2026-10-27).
    vitest.config.bail = 1;
    try {
      for (const item of unit.batch ?? []) {
        process.env[ACTIVE_MUTANT_ENV] = item.id;
        if (item.tests) process.env['OXMUTATE_ONLY_TESTS'] = JSON.stringify(item.tests);
        else delete process.env['OXMUTATE_ONLY_TESTS'];
        writeFileSync(unit.progress, `${item.id} ${String(Date.now())}\n`);
        // One file at a time, cheapest first (the coordinator orders them), stopping at the first
        // file that kills the mutant: Stryker runs every file for every isolated mutant.
        for (const file of item.files) {
          await vitest.start([file]);
          if (killed(unit.results, item.id)) break;
        }
      }
      delete process.env[ACTIVE_MUTANT_ENV];
      delete process.env['OXMUTATE_ONLY_TESTS'];
    } finally {
      vitest.config.bail = 0;
    }
    writeFileSync(unit.progress, '');
  } else {
    await vitest.start(unit.files.length ? unit.files : undefined);
  }
}

process.on('message', (msg: { type: string; unit?: Unit }) => {
  if (msg.type === 'run' && msg.unit) {
    runUnit(msg.unit).then(
      () => process.send?.({ type: 'done' }),
      (error: unknown) => process.send?.({ type: 'done', error: error instanceof Error ? error.message : String(error) }),
    );
  } else if (msg.type === 'close') {
    // A worker thread stuck in a runaway mutant never lets `vitest.close()` settle: exit anyway.
    setTimeout(() => process.exit(0), 2000).unref();
    void vitest.close().finally(() => process.exit(0));
  }
});
// The coordinator is gone (finished, crashed or killed): nothing will read this server's results,
// and a worker thread may still be looping in a mutant. Two such servers were found spinning at
// 100% CPU 11 hours after their run ended, and slowed the next run 50x (2026-10-27).
process.on('disconnect', () => process.exit(0));
process.send?.({ type: 'ready' });
