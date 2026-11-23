/**
 * contractdiff-bench R3: one adapter per tool. Each one is installed at an exact version into a
 * temporary folder (npm packages through `install.ts`, oasdiff through `go install`, whose module
 * checksum database pins its bytes), never into the repository's lockfile.
 *
 * A differ answers the backward-compatibility question for one pair: `breaking`, `non-breaking`, or
 * `crash` when it printed nothing it is known to print. A linter (Spectral, Redocly) has no such
 * question: it runs once on each document and reports its time, `ran` or `crash`.
 *
 * Each verdict is read the way that tool's own CI integration reads it: its exit code, with the
 * text it prints on that exit when the code alone is ambiguous. contractdiff reads `--json`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { spawnSync } from '../spawn.js';

import { errorLine } from './corpus-lib.js';
import { bin, install } from './install.js';

export type Verdict = 'breaking' | 'non-breaking' | 'crash' | 'ran';

export interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Judged {
  readonly verdict: Verdict;
  readonly error: string | null;
}

export interface Tool {
  readonly name: string;
  readonly kind: 'diff' | 'lint';
  /** What is installed, exactly: the meta file records it beside the reading. */
  readonly pin: string;
  /** The install folder (or the checkout, for ours); called once per run. */
  readonly prepare: () => string;
  /** The command for one pair (a differ) or one document (a linter, `nu` only). */
  readonly command: (dir: string, old: string, nu: string) => { file: string; args: string[] };
  readonly judge: (ran: Ran) => Judged;
}

const REPO = path.resolve(import.meta.dirname, '../..');
const CONTRACTDIFF = path.join(REPO, 'packages', 'apicontract', 'dist', 'bin.js');
const ERROR_CHARS = 2000;

const errorOf = (ran: Ran): string => errorLine(`${ran.stderr}\n${ran.stdout}`) || `exit ${String(ran.status)}, no output`;
const crash = (ran: Ran): Judged => ({ verdict: 'crash', error: errorOf(ran) });
const ok = (verdict: Verdict): Judged => ({ verdict, error: null });

/** contractdiff: `data.verdict` of `--json`; `unknown` fails a run as `breaking` does, so it counts as one. */
export function judgeOurs(ran: Ran): Judged {
  try {
    const { data } = JSON.parse(ran.stdout) as { data: { verdict?: unknown } };
    if (data.verdict === 'breaking' || data.verdict === 'unknown') return ok('breaking');
    if (data.verdict === 'non-breaking' || data.verdict === 'dangerous') return ok('non-breaking');
  } catch {
    return crash(ran);
  }
  return crash(ran);
}

/** oasdiff `breaking --fail-on ERR`: 1 when an ERR-level change is found, 0 when none; anything else is its own failure. */
export function judgeOasdiff(ran: Ran): Judged {
  if (ran.status === 0) return ok('non-breaking');
  return ran.status === 1 ? ok('breaking') : crash(ran);
}

/** openapi-diff: exit 1 with "Breaking changes found" for a break, 0 for none; exit 1 without it is an error. */
export function judgeOpenapiDiff(ran: Ran): Judged {
  if (ran.status === 0) return ok('non-breaking');
  return ran.status === 1 && /breaking changes found/i.test(ran.stdout) ? ok('breaking') : crash(ran);
}

/** optic `diff --check`: exit 1 when a check fails, 0 when every check passes; a failure to read prints an error. */
export function judgeOptic(ran: Ran): Judged {
  if (ran.status === 0) return ok('non-breaking');
  return ran.status === 1 && !/^\s*error\b/im.test(`${ran.stderr}\n${ran.stdout}`) ? ok('breaking') : crash(ran);
}

/** A linter ran when it exited 0 (clean) or 1 (problems found); anything else is a crash. */
export const judgeLint = (ran: Ran): Judged => (ran.status === 0 || ran.status === 1 ? ok('ran') : crash(ran));

export const OASDIFF_VERSION = 'v1.36.0';

/** oasdiff through `go install` at an exact version into a folder keyed by it; reused when present. */
function installOasdiff(): string {
  const dir = path.join(tmpdir(), 'apicontract-corpus-tools', `oasdiff-${OASDIFF_VERSION}`);
  if (existsSync(path.join(dir, 'oasdiff'))) return dir;
  mkdirSync(dir, { recursive: true });
  const ran = spawnSync('go', ['install', `github.com/oasdiff/oasdiff@${OASDIFF_VERSION}`], { encoding: 'utf8', env: { ...process.env, GOBIN: dir, GOFLAGS: '-mod=mod' } });
  if (ran.status !== 0) throw new Error(`go install oasdiff@${OASDIFF_VERSION} failed: ${(ran.stderr || ran.stdout).trim().slice(0, ERROR_CHARS)}. fix: install Go 1.22 or later`);
  return dir;
}

const SPECTRAL_RULESET = '.spectral.yaml';

/** Spectral needs a ruleset file; this one is its own OpenAPI ruleset, nothing added. */
function installSpectral(): string {
  const dir = install(['@stoplight/spectral-cli@6.17.1']);
  writeFileSync(path.join(dir, SPECTRAL_RULESET), 'extends: ["spectral:oas"]\n');
  return dir;
}

const npmTool = (specs: readonly string[]) => (): string => install(specs);

export const TOOLS: readonly Tool[] = [
  {
    name: 'contractdiff',
    kind: 'diff',
    pin: 'file:packages/apicontract',
    prepare: () => {
      if (!existsSync(CONTRACTDIFF)) throw new Error('apicontract is not built. fix: npx turbo run build --filter=apicontract');
      return REPO;
    },
    command: (_, old, nu) => ({ file: process.execPath, args: [CONTRACTDIFF, 'diff', old, nu, '--json'] }),
    judge: judgeOurs,
  },
  {
    name: 'oasdiff',
    kind: 'diff',
    pin: `github.com/oasdiff/oasdiff@${OASDIFF_VERSION}`,
    prepare: installOasdiff,
    command: (dir, old, nu) => ({ file: path.join(dir, 'oasdiff'), args: ['breaking', old, nu, '--fail-on', 'ERR'] }),
    judge: judgeOasdiff,
  },
  {
    name: 'openapi-diff',
    kind: 'diff',
    pin: 'openapi-diff@0.24.1',
    prepare: npmTool(['openapi-diff@0.24.1']),
    command: (dir, old, nu) => ({ file: bin(dir, 'openapi-diff'), args: [old, nu] }),
    judge: judgeOpenapiDiff,
  },
  {
    name: 'optic',
    kind: 'diff',
    pin: '@useoptic/optic@1.0.9',
    prepare: npmTool(['@useoptic/optic@1.0.9']),
    command: (dir, old, nu) => ({ file: bin(dir, 'optic'), args: ['diff', old, nu, '--check'] }),
    judge: judgeOptic,
  },
  {
    name: 'spectral',
    kind: 'lint',
    pin: '@stoplight/spectral-cli@6.17.1',
    prepare: installSpectral,
    command: (dir, _, nu) => ({ file: bin(dir, 'spectral'), args: ['lint', nu, '--ruleset', path.join(dir, SPECTRAL_RULESET), '--format', 'json'] }),
    judge: judgeLint,
  },
  {
    name: 'redocly',
    kind: 'lint',
    pin: '@redocly/cli@2.76.0',
    prepare: npmTool(['@redocly/cli@2.76.0']),
    command: (dir, _, nu) => ({ file: bin(dir, 'redocly'), args: ['lint', nu, '--format', 'json'] }),
    judge: judgeLint,
  },
];
