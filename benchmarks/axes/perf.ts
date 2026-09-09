/**
 * B2 — cold start, as a process, because process time is what a user and an agent pay.
 * An in-process micro-benchmark of the parse function would exclude Node's own startup,
 * which is most of the real cost, and would flatter every number we publish.
 *
 * Two things this axis is careful about, both learned the hard way in this repo:
 *
 * 1. **No absolute millisecond gate.** Issue #27 red-lit two PRs that had touched none of
 *    the code, first on a 20/40 ms ceiling and then on a floor that was wrong for the
 *    machine. Absolute cold start is a property of the runner. The gated and banded
 *    number here is a *ratio* between two spawns taken in the same run.
 * 2. **Interleaved samples.** All 40 spawns of one variant, then all 40 of the next, dates
 *    each variant to a different minute of the machine's life. One round spawns every
 *    variant once, rotating which goes first, so a burst of background load lands on all
 *    of them and cancels in the ratio.
 *
 * And the failure mode a green benchmark hides: a fixture that stopped parsing would
 * still produce a beautiful, and beautifully wrong, number. Every sample's stdout is
 * checked, and before sampling starts each parsing variant must prove it parses by
 * honouring `--shout`.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { type BenchRecord } from '../record.js';
import { median, p95, round } from '../stats.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/cold-start/', import.meta.url));

export interface Variant {
  /** The row label, and the name a band's `from.variant` matches. */
  id: string;
  file: string;
  /** The variant this one layers over, for the ratio rows. */
  host?: string;
  /** Whether it has a parser at all: the bare-node floor does not, by design. */
  parses: boolean;
}

/** `bare node` is mandatory (intent constraint 5): it is most of every other row. */
export const VARIANTS: readonly Variant[] = [
  { id: 'bare node', file: 'node.mjs', parses: false },
  { id: 'commander', file: 'commander.mjs', parses: true },
  { id: 'burgee/commander', file: 'burgee-commander.mjs', host: 'commander', parses: true },
  { id: 'yargs', file: 'yargs.mjs', parses: true },
  { id: 'burgee/yargs', file: 'burgee-yargs.mjs', host: 'yargs', parses: true },
  // cac is the published cold-start and weight target (`.sdlc/research/competitor-landscape.md`
  // §6) and the row `replacement-parser` is graded against, so it is measured, not assumed.
  { id: 'cac', file: 'cac.mjs', parses: true },
  { id: 'burgee', file: 'burgee.mjs', host: 'cac', parses: true },
];

const ARGV = ['greet', 'ada'];
const EXPECTED = 'Hello, ada!\n';
const SHOUT_ARGV = ['greet', 'ada', '--shout'];
const SHOUT_EXPECTED = 'HELLO, ADA!\n';
const ROUNDS = 40;
const RATIO_PLACES = 3;
const MS_PLACES = 2;

function spawn(file: string, argv: readonly string[]): { ms: number; stdout: string; status: number | null } {
  const started = performance.now();
  const r = spawnSync(process.execPath, [`${FIXTURES}${file}`, ...argv], { encoding: 'utf8' });
  return { ms: performance.now() - started, stdout: r.stdout, status: r.status };
}

/**
 * Before anything is timed: every variant prints the expected line, and every variant
 * that claims a parser proves it by uppercasing under `--shout`. A fixture that quietly
 * stopped parsing is the one way this axis could stay green while measuring nothing.
 */
export function proveFixtures(): void {
  for (const v of VARIANTS) {
    const plain = spawn(v.file, ARGV);
    if (plain.status !== 0 || plain.stdout !== EXPECTED) {
      throw new Error(`${v.id}: expected ${JSON.stringify(EXPECTED)} exit 0, got ${JSON.stringify(plain.stdout)} exit ${String(plain.status)}`);
    }
    if (!v.parses) continue;
    const shout = spawn(v.file, SHOUT_ARGV);
    if (shout.stdout !== SHOUT_EXPECTED) {
      throw new Error(`${v.id}: does not parse — \`--shout\` produced ${JSON.stringify(shout.stdout)}, not ${JSON.stringify(SHOUT_EXPECTED)}`);
    }
  }
}

/** One round: every variant once, starting from `offset` so no variant is always first. */
function round1(samples: Map<string, number[]>, offset: number): void {
  for (let i = 0; i < VARIANTS.length; i++) {
    const v = VARIANTS[(i + offset) % VARIANTS.length] as Variant;
    const r = spawn(v.file, ARGV);
    if (r.status !== 0 || r.stdout !== EXPECTED) throw new Error(`${v.id}: sample produced ${JSON.stringify(r.stdout)} exit ${String(r.status)}`);
    (samples.get(v.id) as number[]).push(r.ms);
  }
}

function timings(rounds: number): Map<string, number[]> {
  const samples = new Map<string, number[]>(VARIANTS.map((v) => [v.id, []]));
  // Discarded warm-up round: the first spawn of each file pays for reading it off disk.
  round1(new Map(VARIANTS.map((v) => [v.id, []])), 0);
  for (let i = 0; i < rounds; i++) round1(samples, i);
  return samples;
}

export function msRecord(v: Variant, xs: number[], floor: number): BenchRecord {
  return {
    axis: 'perf',
    variant: v.id,
    metric: 'cold-start-ms',
    unit: 'ms',
    samples: xs.length,
    median: round(median(xs), MS_PLACES),
    p95: round(p95(xs), MS_PLACES),
    note: v.parses ? `spawned \`node ${v.file} greet ada\`; ${round(median(xs) - floor, MS_PLACES)} ms of this is above the bare-node floor` : 'the floor: Node starting and writing one line, no parser',
    detail: { fixture: v.file },
  };
}

/**
 * The banded number. Paired per round — round *i* of the layer against round *i* of its
 * host — so the ratio is taken between two spawns seconds apart on the same machine
 * rather than between two summary statistics that may have been measured under different
 * load. Machine-independent by construction, which is what makes it bandable at all.
 */
export function ratioRecord(v: Variant, ours: number[], host: number[], gateMax: number): BenchRecord {
  const paired = ours.map((ms, i) => ms / (host[i] as number));
  return {
    axis: 'perf',
    variant: `${v.id} ÷ ${v.host ?? ''}`,
    metric: 'cold-start-ratio',
    unit: 'ratio',
    samples: paired.length,
    median: round(median(paired), RATIO_PLACES),
    p95: round(p95(paired), RATIO_PLACES),
    gate: {
      max: gateMax,
      why: `the front-end must not cost meaningfully more to start than the package it replaces; a ceiling, not a promise — the measured value is what the band watches`,
    },
    note: `median of ${String(paired.length)} paired spawns, each round's ${v.id} against the same round's ${v.host ?? ''}`,
  };
}

/**
 * Ceilings, set on 2026-09-09 from the first measured run on the machine recorded in the
 * results file, with headroom: tight enough to fail a front-end that grows a startup cost
 * its host does not have, loose enough that a loaded runner does not red-light a PR that
 * touched nothing (#27). The *band* is what catches drift below this; the gate catches a
 * step change.
 */
export const RATIO_CEILING: Readonly<Record<string, number>> = {
  'burgee/commander': 1.4,
  // Measured 0.66-0.72 across three runs: the yargs front-end starts *faster* than yargs,
  // because burgee depends on nothing while yargs loads five packages. The gate protects
  // that, and goes red the day it stops being true.
  'burgee/yargs': 0.9,
  // The published target is at or below cac (`replacement-parser` #2), and it is not met:
  // 1.37, 1.43 and 1.47 across three runs on 2026-09-09. The gate is a ratchet above the
  // measured spread, not the claim — gating at the claim would leave the build red for a
  // state this suite did not cause, and gating at 1.5 would red-light a loaded runner for
  // a 2% excursion, which is the mistake #27 already made twice. The claim itself is
  // settled in the `claims` block of the results document, where it reads `met: false`
  // with the measured number beside it and nothing hides it.
  burgee: 1.7,
};

export function run(rounds = ROUNDS): BenchRecord[] {
  proveFixtures();
  const samples = timings(rounds);
  const floor = median(samples.get('bare node') as number[]);
  const records: BenchRecord[] = VARIANTS.map((v) => msRecord(v, samples.get(v.id) as number[], floor));
  for (const v of VARIANTS) {
    if (v.host === undefined) continue;
    records.push(ratioRecord(v, samples.get(v.id) as number[], samples.get(v.host) as number[], RATIO_CEILING[v.id] ?? 1));
  }
  return records;
}

export const method = `${String(ROUNDS)} interleaved rounds; each round spawns every variant once as \`node <fixture> greet ada\`, rotating the order, after one discarded warm-up round. Absolute ms are a property of the machine recorded above and are not comparable across machines; the banded number is the paired ratio.`;
