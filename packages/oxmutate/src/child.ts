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
  batch?: { id: string; files: string[] }[] | undefined;
}

const config = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as ServerConfig;
process.env['NODE_ENV'] ??= 'test';

const vitestNode = (await import(resolveEsm('vitest/node', config.root))) as {
  createVitest: (mode: string, options: Record<string, unknown>, viteOverrides?: Record<string, unknown>) => Promise<{
    start(files?: string[]): Promise<unknown>;
    close(): Promise<void>;
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
  },
  { plugins: [instrumentedSources(config.instrumentedMap)] },
);

async function runUnit(unit: Unit): Promise<void> {
  // Workers copy the environment when they start, so each run sees the unit's settings
  // (verified across re-runs of one instance, 2026-10-26).
  process.env['OXMUTATE_MODE'] = unit.mode;
  process.env['OXMUTATE_RESULTS'] = unit.results;
  process.env['OXMUTATE_PROGRESS'] = unit.progress;
  if (unit.plan) process.env['OXMUTATE_PLAN'] = unit.plan;
  delete process.env[ACTIVE_MUTANT_ENV];
  if (unit.mode === 'isolated') {
    for (const item of unit.batch ?? []) {
      process.env[ACTIVE_MUTANT_ENV] = item.id;
      writeFileSync(unit.progress, `${item.id} ${String(Date.now())}\n`);
      await vitest.start(item.files);
    }
    delete process.env[ACTIVE_MUTANT_ENV];
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
    void vitest.close().finally(() => process.exit(0));
  }
});
process.send?.({ type: 'ready' });
