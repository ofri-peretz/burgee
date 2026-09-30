/**
 * B5 — runtime against the incumbent: how long our entry point takes to do the same job as the
 * package it replaces, in-process, as a ratio.
 *
 * "Our packages are not just a wrapper for our competitors; each one should be more than our
 * competitors: leaner, faster, more comprehensive" (owner, 2026-09-29). B4 settles leaner. This
 * settles faster, and it exists because an audit that day found the opposite on almost every
 * pair — `paratext/terminal-link` 28× terminal-link, `linegauge/slice` 7.4× slice-ansi,
 * `roundel/chalk` 4.2× chalk — with nothing in the suite that could have noticed.
 *
 * How, and why each part:
 *
 * - **One workload per pair**, a realistic one (`fixtures/runtime/*.mjs`): the mixed corpus a
 *   CLI prints, a 20-row wrapped table, a prompt typed into and submitted. Each workload's
 *   `check()` proves ours and the incumbent produce the same output before anything is timed —
 *   a ratio between two different jobs is the flattering number this suite exists to refuse.
 * - **A fresh process per pair** (`fixtures/runtime/harness.mjs`), so one pair's JIT and heap
 *   never colour the next: the flagstaff pairs call into linegauge.
 * - **Interleaved rounds, median of the per-round ratio.** Each round times ours and the
 *   incumbent back to back, alternating which goes first, with a collection before each block;
 *   the gated number is the median of the per-round ratios, so machine load that lands on a
 *   round lands on both halves of it. The same reason B2 gates a ratio, not milliseconds (#27).
 * - **Resolved before timed**, through the same `resolvePackage` guard B2 and B4 use, from the
 *   directory the spawned workload resolves from — the version and path go into every record.
 * - **Gated by a downward-only ratchet per pair** (`runtime-ratchets.ts`). The target is ≤ 1.0;
 *   a pair above it is held just above today's CI measurement until the PR that fixes it lowers
 *   the ceiling. Whether the target is met is on every record, beside the ceiling.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { type BenchRecord } from '../record.js';
import { relativeToRepo, type Resolved, resolvePackage } from '../resolve.js';
import { runtimeRatchet } from '../runtime-ratchets.js';
import { median, p95, round } from '../stats.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/runtime/', import.meta.url));
const HARNESS = `${FIXTURES}harness.mjs`;

export interface RuntimePair {
  /** Our entry point, and the ratchet id in `.sdlc/bands/runtime-ratchets.json`. */
  id: string;
  /** The incumbent's specifier. */
  host: string;
  /** The package each side is installed as, for the resolution guard. */
  pkg: string;
  hostPkg: string;
  /** The workload under `fixtures/runtime/`. */
  file: string;
  /**
   * Rounds for this pair, where `ROUNDS` leaves its median too loose for its gate: a spec bar
   * held at 1.0 (`bellpull ÷ tinyexec`), or a pair whose CI spread sat close to its ceiling
   * (D-20260930-b5-ceilings-from-spread). More rounds narrow the median within a run; the
   * ceiling covers what they cannot, one runner's CPU against another's.
   */
  rounds?: number;
}

const pair = (id: string, host: string, file: string, { hostPkg = host, rounds }: { hostPkg?: string; rounds?: number } = {}): RuntimePair => ({ id, host, pkg: id.split('/')[0] as string, hostPkg, file, ...(rounds === undefined ? {} : { rounds }) });

/** For the pairs whose median needs narrowing; odd, like `ROUNDS`, for the reason given there. */
const MORE_ROUNDS = 21;
const SPEC_BAR_ROUNDS = 31;

export const PAIRS: readonly RuntimePair[] = [
  pair('paratext', 'ansi-escapes', 'paratext-ansi-escapes.mjs', { rounds: MORE_ROUNDS }),
  pair('paratext/terminal-link', 'terminal-link', 'paratext-terminal-link.mjs'),
  pair('linegauge', 'string-width', 'linegauge-string-width.mjs'),
  pair('linegauge/strip', 'strip-ansi', 'linegauge-strip-ansi.mjs'),
  pair('linegauge/wrap', 'wrap-ansi', 'linegauge-wrap-ansi.mjs'),
  pair('linegauge/slice', 'slice-ansi', 'linegauge-slice-ansi.mjs', { rounds: MORE_ROUNDS }),
  pair('roundel/chalk', 'chalk', 'roundel-chalk.mjs'),
  pair('bellpull/node-which', 'which', 'bellpull-which.mjs'),
  // bellpull R8's spawn half: `run` against tinyexec's `x`, the zero-dependency rival R8 names.
  // Not a drop-in pair — the weight axis weighs the same two calls (B4's `bellpull` row) — and
  // its ratchet is R8's bar itself, 1.0, rather than a ceiling above a measurement.
  pair('bellpull', 'tinyexec', 'bellpull-tinyexec.mjs', { rounds: SPEC_BAR_ROUNDS }),
  pair('flagstaff/ora', 'ora', 'flagstaff-ora.mjs'),
  pair('flagstaff/log-update', 'log-update', 'flagstaff-log-update.mjs', { rounds: MORE_ROUNDS }),
  pair('flagstaff/boxen', 'boxen', 'flagstaff-boxen.mjs'),
  pair('flagstaff/cli-table3', 'cli-table3', 'flagstaff-cli-table3.mjs'),
  pair('caique/clack', '@clack/prompts', 'caique-clack.mjs'),
  pair('burgee/commander', 'commander', 'burgee-commander.mjs'),
  pair('burgee/yargs', 'yargs', 'burgee-yargs.mjs'),
];

/**
 * Rounds per pair. Odd, so the median is a round that happened rather than the mean of two;
 * eleven, because the per-round ratio's spread on a two-core runner settles by then and every
 * extra round is paid once per pair — sixteen times over.
 */
export const ROUNDS = 11;
const RATIO_PLACES = 3;
const NS_PLACES = 0;
/** A workload that has not finished in this long is broken, not slow. */
const PAIR_TIMEOUT_MS = 300_000;
/** How much of a failed workload's stderr a thrown error carries: the assertion, not the stack. */
const STDERR_LINES = 8;

/**
 * The terminal every workload runs in front of: a TTY (the harness sets `isTTY`), iTerm2, with
 * colour and hyperlinks forced on. See `harness.mjs` for why a pipe would time the wrong job.
 * `NO_COLOR` is removed because it outranks `FORCE_COLOR` in some of these and not others.
 */
export function workloadEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { NO_COLOR: _noColor, ...env } = base;
  return { ...env, FORCE_COLOR: '3', FORCE_HYPERLINK: '1', TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.5.0', COLUMNS: '80' };
}

export interface Resolution {
  ours: Resolved;
  host: Resolved;
}

/** Both sides of every pair, resolved from where the workloads resolve, before anything is timed. */
export function resolvePairs(): Map<string, Resolution> {
  return new Map(PAIRS.map((p) => [p.id, { ours: resolvePackage(p.pkg, FIXTURES), host: resolvePackage(p.hostPkg, FIXTURES) }]));
}

export interface Sample {
  /** ns per workload call, one per round. */
  ours: number[];
  theirs: number[];
  n: number;
}

/** One pair, in its own process. Throws with the workload's own words when its parity check fails. */
export function sample(p: RuntimePair, rounds: number = ROUNDS): Sample {
  const r = spawnSync(process.execPath, ['--expose-gc', HARNESS, `${FIXTURES}${p.file}`, String(rounds)], { encoding: 'utf8', env: workloadEnv(), timeout: PAIR_TIMEOUT_MS });
  if (r.status !== 0) throw new Error(`${p.id} ÷ ${p.host}: the workload failed before or while timing (exit ${String(r.status)}): ${r.stderr.trim().split('\n').slice(0, STDERR_LINES).join('\n')}`);
  return JSON.parse(r.stdout) as Sample;
}

/**
 * The gated record. `median` is the median of the per-round ratios — round *i* of ours over
 * round *i* of the incumbent — never a ratio of two medians, which could come from different
 * minutes of the machine's life.
 */
export function runtimeRecord(p: RuntimePair, s: Sample, resolved?: Resolution): BenchRecord {
  const ratios = s.ours.map((ns, i) => ns / (s.theirs[i] as number));
  const ratchet = runtimeRatchet(p.id);
  const ratio = round(median(ratios), RATIO_PLACES);
  return {
    axis: 'runtime',
    variant: `${p.id} ÷ ${p.host}`,
    metric: 'runtime-ratio',
    unit: 'ratio',
    samples: ratios.length,
    median: ratio,
    p95: round(p95(ratios), RATIO_PLACES),
    gate: {
      max: ratchet.ceiling,
      why: `a downward-only ratchet toward ≤ ${String(ratchet.target)} (at or below the incumbent): just above the last CI measurement, lowered by the PR that makes this pair faster, never raised without a decision (.sdlc/bands/runtime-ratchets.json)`,
    },
    note: `median over ${String(ratios.length)} interleaved rounds of the per-round ratio, ${String(s.n)} workload call(s) per side per round, in a fresh process (fixtures/runtime/${p.file})`,
    detail: {
      workload: p.file,
      target: ratchet.target,
      met: ratio <= ratchet.target,
      oursNsPerCall: round(median(s.ours), NS_PLACES),
      theirsNsPerCall: round(median(s.theirs), NS_PLACES),
      ...(resolved === undefined
        ? {}
        : { ours: `${p.pkg}@${resolved.ours.version}`, host: `${p.hostPkg}@${resolved.host.version}`, oursFrom: relativeToRepo(resolved.ours.dir), hostFrom: relativeToRepo(resolved.host.dir) }),
    },
  };
}

export function run(rounds: number = ROUNDS, pairs: readonly RuntimePair[] = PAIRS): BenchRecord[] {
  const resolved = resolvePairs();
  // A pair's own `rounds` apply to the full run; a caller asking for fewer (a test) gets fewer.
  return pairs.map((p) => runtimeRecord(p, sample(p, rounds === ROUNDS ? (p.rounds ?? rounds) : rounds), resolved.get(p.id)));
}

export const method = `One realistic workload per (package, incumbent) pair, in a fresh Node process per pair with a TTY, iTerm2, FORCE_COLOR=3 and FORCE_HYPERLINK=1; each workload first proves both sides produce the same output. Then three warm-up rounds and ${String(ROUNDS)} interleaved rounds (${String(MORE_ROUNDS)} or ${String(SPEC_BAR_ROUNDS)} for the pairs whose gate needs a tighter median), each timing ours and the incumbent back to back (alternating which goes first, a full GC before each block). The gated number is the median of the per-round ratio ours ÷ incumbent; the target is ≤ 1.0 and the gate is each pair's downward-only ratchet, derived from its CI spread (max of mean + 3 sd and the largest reading), or a spec bar where one is written. Both packages are resolved against the ranges benchmarks/package.json declares before any timing.`;
