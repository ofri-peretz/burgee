import { runBurgee, type RunOptions, type RunResult } from 'burgee/testing';
import { runCommander } from 'compat-oracle/drivers/commander';
import { runYargs } from 'compat-oracle/drivers/yargs';
import { program } from 'demo-cli-burgee';
import { createProgram } from 'demo-cli-commander';
import { buildCli } from 'demo-cli-yargs';

export type Run = (opts: RunOptions) => Promise<RunResult>;

/** The same demo, on each host, behind one call shape. Every case runs on both. */
export type HostName = 'commander' | 'yargs' | 'burgee';

/**
 * Hosts whose `--json` is the O1 envelope `{ ok, data }` rather than the handler's raw
 * shape. The incumbents' demos print raw JSON because they predate the floor; burgee
 * wraps by design, so the same data arrives in two encodings and the conformance case
 * asserts each honestly instead of pretending they are identical.
 */
export const ENVELOPE: ReadonlySet<HostName> = new Set<HostName>(['burgee']);

export const HOSTS: Record<HostName, Run> = {
  commander: (opts) => runCommander(createProgram, opts),
  yargs: (opts) => runYargs(buildCli, opts),
  burgee: (opts) => runBurgee(program, opts),
};
