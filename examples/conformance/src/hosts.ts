import { type RunOptions, type RunResult } from '@interlace/cli-core';
import { runCommander } from 'commander-harness';
import { createProgram } from 'demo-cli-commander';
import { buildCli } from 'demo-cli-yargs';
import { runYargs } from 'yargs-testing';

export type Run = (opts: RunOptions) => Promise<RunResult>;

/** The same demo, on each host, behind one call shape. Every case runs on both. */
export const HOSTS: Record<'commander' | 'yargs', Run> = {
  commander: (opts) => runCommander(createProgram, opts),
  yargs: (opts) => runYargs(buildCli, opts),
};
