import { type RunOptions, type RunResult } from 'burgee/testing';
import { runCommander } from 'compat-oracle/drivers/commander';
import { runYargs } from 'compat-oracle/drivers/yargs';
import { createProgram } from 'demo-cli-commander';
import { buildCli } from 'demo-cli-yargs';

export type Run = (opts: RunOptions) => Promise<RunResult>;

/** The same demo, on each host, behind one call shape. Every case runs on both. */
export const HOSTS: Record<'commander' | 'yargs', Run> = {
  commander: (opts) => runCommander(createProgram, opts),
  yargs: (opts) => runYargs(buildCli, opts),
};
