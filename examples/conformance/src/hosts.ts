import { runBurgee, type RunOptions, type RunResult } from 'burgee/testing';
import burgeeYargs from 'burgee/yargs';
import { runCommander } from 'compat-oracle/drivers/commander';
import { runYargs, type YargsFactory } from 'compat-oracle/drivers/yargs';
import { program } from 'demo-cli-burgee';
import { createProgram } from 'demo-cli-commander';
import { createProgramOnBurgee } from 'demo-cli-commander/burgee';
import { buildCli } from 'demo-cli-yargs';

export type Run = (opts: RunOptions) => Promise<RunResult>;

/** The same demo, on each host, behind one call shape. Every case runs on both. */
export type HostName = 'commander' | 'burgee-commander' | 'yargs' | 'burgee-yargs' | 'burgee';

/**
 * Hosts whose `--json` is the O1 envelope `{ ok, data }` rather than the handler's raw
 * shape. The incumbents' demos print raw JSON because they predate the floor; burgee
 * wraps by design, so the same data arrives in two encodings and the conformance case
 * asserts each honestly instead of pretending they are identical.
 */
export const ENVELOPE: ReadonlySet<HostName> = new Set<HostName>(['burgee']);

export const HOSTS: Record<HostName, Run> = {
  commander: (opts) => runCommander(createProgram, opts),
  // The same commander-syntax program on burgee/commander, through the same driver.
  // Its own `--json` option is respected, so it prints the raw record like commander does.
  'burgee-commander': (opts) => runCommander(createProgramOnBurgee, opts),
  yargs: (opts) => runYargs(buildCli, opts),
  // The same yargs-syntax program on burgee/yargs, through the same driver. The cast is
  // the drop-in claim itself — burgee/yargs has yargs' shape — and yargs-parity.test.ts
  // proves it byte for byte.
  'burgee-yargs': (opts) => runYargs(buildCli, opts, burgeeYargs as unknown as YargsFactory),
  burgee: (opts) => runBurgee(program, opts),
};
