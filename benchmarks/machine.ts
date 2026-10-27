/**
 * What the numbers were measured on. B2's milliseconds are a property of this machine as
 * much as of the code, so every results file carries it and every table prints it —
 * constraint 6, and the reason the banded perf number is a ratio rather than a duration.
 */
import os from 'node:os';

import { execFile } from './spawn.js';

export interface Machine {
  os: string;
  release: string;
  arch: string;
  cpu: string;
  cores: number;
  memoryGb: number;
  node: string;
  ci: boolean;
}

const BYTES_PER_GB = 1024 ** 3;

export function machine(): Machine {
  const cpus = os.cpus();
  return {
    os: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: cpus[0]?.model ?? 'unknown',
    cores: cpus.length,
    memoryGb: Math.round(os.totalmem() / BYTES_PER_GB),
    node: process.version,
    ci: process.env['CI'] === 'true',
  };
}

/**
 * The commit the numbers describe. `unknown` outside a checkout, never a guess — and
 * suffixed `-dirty` when the tree has uncommitted changes, because otherwise a results
 * file measured on a work in progress reads as a measurement of the commit it names.
 */
export function commit(cwd: string): string {
  try {
    const sha = execFile('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const dirty = execFile('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim() !== '';
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return 'unknown';
  }
}
