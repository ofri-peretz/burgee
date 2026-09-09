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
 * And the two failure modes a green benchmark hides:
 *
 * - **A fixture that stopped parsing** would still produce a beautiful, and beautifully
 *   wrong, number. Every sample's stdout is checked, and before sampling starts each
 *   parsing variant must prove it parses by honouring `--shout`.
 * - **A fixture that raced the wrong package.** The fixtures are plain `.mjs` resolved by
 *   Node's upward walk, and the workspace root has commander **8.3.0** hoisted while this
 *   axis is written against **15.0.0** in `benchmarks/node_modules`. With that directory
 *   moved aside — the CI cache state that produced B4's first red run — this axis
 *   reported `burgee/commander ÷ commander` at **1.298** against **1.139** minutes
 *   earlier: a 14% shift, comfortably under its gate, written straight into the
 *   `cold-start-ratio` band, with `detail` saying only which file had been spawned. So
 *   every parsing variant's package is resolved through the same `resolvePackage` guard
 *   B4 uses, from the fixture directory the spawned processes themselves resolve from,
 *   **before anything is timed** — and the version and resolved path go into every record.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { type BenchRecord } from '../record.js';
import { relativeToRepo, type Resolved, resolvePackage } from '../resolve.js';
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
  /**
   * The package the fixture imports, whose version decides what this row measured.
   * Absent only for `bare node`, which imports nothing — the one row where "which
   * package was this" has no answer, rather than an unchecked one.
   */
  pkg?: string;
}

/** `bare node` is mandatory (intent constraint 5): it is most of every other row. */
export const VARIANTS: readonly Variant[] = [
  { id: 'bare node', file: 'node.mjs', parses: false },
  { id: 'commander', file: 'commander.mjs', parses: true, pkg: 'commander' },
  { id: 'burgee/commander', file: 'burgee-commander.mjs', host: 'commander', parses: true, pkg: 'burgee' },
  { id: 'yargs', file: 'yargs.mjs', parses: true, pkg: 'yargs' },
  { id: 'burgee/yargs', file: 'burgee-yargs.mjs', host: 'yargs', parses: true, pkg: 'burgee' },
  // cac is the published cold-start and weight target (`.sdlc/research/competitor-landscape.md`
  // §6) and the row `replacement-parser` is graded against, so it is measured, not assumed.
  { id: 'cac', file: 'cac.mjs', parses: true, pkg: 'cac' },
  { id: 'burgee', file: 'burgee.mjs', host: 'cac', parses: true, pkg: 'burgee' },
];

/**
 * Which copy of each package the fixtures will actually import, checked against what
 * `benchmarks/package.json` declares. Resolved from `FIXTURES` rather than from
 * `benchmarks/` because that is the directory the spawned `node <fixture>` resolves
 * from: the version this returns is the version that ran, not an approximation of it.
 *
 * Called before `proveFixtures()` and therefore before any timing, so a shadowed package
 * stops the run instead of producing a plausible ratio nobody can audit afterwards.
 */
export function resolveVariants(): Map<string, Resolved> {
  const out = new Map<string, Resolved>();
  for (const v of VARIANTS) {
    if (v.pkg === undefined) continue;
    out.set(v.id, resolvePackage(v.pkg, FIXTURES));
  }
  return out;
}

const ARGV = ['greet', 'ada'];
const EXPECTED = 'Hello, ada!\n';
const SHOUT_ARGV = ['greet', 'ada', '--shout'];
const SHOUT_EXPECTED = 'HELLO, ADA!\n';
/**
 * 42, not 40, and the three is the reason: `round1` rotates the starting offset by the
 * round number modulo seven variants, so 40 rounds give offsets 0-4 six turns each and
 * offsets 5-6 only five. A whole multiple of the variant count makes every variant go
 * first, second and last exactly six times, which is the only thing the rotation is for.
 */
export const ROUNDS = 42;
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

/**
 * `detail` carries the version and the resolved path, the way B4's rows always have.
 * Without them a row records only which file was spawned, and the question a reader of a
 * shifted ratio has to be able to answer six months later — *which commander was that?* —
 * has no answer in the document at all.
 */
export function msRecord(v: Variant, xs: number[], floor: number, resolved?: Resolved): BenchRecord {
  return {
    axis: 'perf',
    variant: v.id,
    metric: 'cold-start-ms',
    unit: 'ms',
    samples: xs.length,
    median: round(median(xs), MS_PLACES),
    p95: round(p95(xs), MS_PLACES),
    note: v.parses ? `spawned \`node ${v.file} greet ada\`; ${round(median(xs) - floor, MS_PLACES)} ms of this is above the bare-node floor` : 'the floor: Node starting and writing one line, no parser',
    detail: {
      fixture: v.file,
      ...(v.pkg === undefined || resolved === undefined ? {} : { package: v.pkg, version: resolved.version, resolvedFrom: relativeToRepo(resolved.dir) }),
    },
  };
}

/**
 * The banded number. Paired per round — round *i* of the layer against round *i* of its
 * host — so the ratio is taken between two spawns seconds apart on the same machine
 * rather than between two summary statistics that may have been measured under different
 * load. Machine-independent by construction, which is what makes it bandable at all.
 */
export interface RatioInput {
  v: Variant;
  /** Round *i* of the layer, and round *i* of its host. */
  ours: number[];
  host: number[];
  gateMax: number;
  /** The two resolved versions, so the banded row records what it raced. */
  versions?: { ours: string; host: string };
}

export function ratioRecord({ v, ours, host, gateMax, versions }: RatioInput): BenchRecord {
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
    // The banded record, so this is the row where "against which version?" most needs an
    // answer: `cold-start-ratio` moves 14% between commander 8 and commander 15.
    ...(versions === undefined ? {} : { detail: { ours: `${v.pkg ?? v.id}@${versions.ours}`, host: `${v.host ?? ''}@${versions.host}` } }),
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
  // The yargs front-end starts *faster* than yargs, because burgee depends on nothing
  // while yargs loads five packages: 0.66-0.72 on an M4 Pro, 0.835 on a two-core CI
  // runner. The gate keeps the claim — under 1.0 is "faster than what it replaces" — with
  // enough headroom that a busy runner does not red-light a PR that touched nothing,
  // which is the mistake #27 made twice with tighter bounds.
  'burgee/yargs': 0.95,
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
  // Resolution first, before the fixture proof and long before anything is timed: a
  // shadowed package must stop the run, not colour forty rounds of it.
  const resolved = resolveVariants();
  proveFixtures();
  const samples = timings(rounds);
  const floor = median(samples.get('bare node') as number[]);
  const records: BenchRecord[] = VARIANTS.map((v) => msRecord(v, samples.get(v.id) as number[], floor, resolved.get(v.id)));
  for (const v of VARIANTS) {
    if (v.host === undefined) continue;
    const ours = resolved.get(v.id);
    const host = resolved.get(v.host);
    records.push(
      ratioRecord({
        v,
        ours: samples.get(v.id) as number[],
        host: samples.get(v.host) as number[],
        gateMax: RATIO_CEILING[v.id] ?? 1,
        ...(ours === undefined || host === undefined ? {} : { versions: { ours: ours.version, host: host.version } }),
      }),
    );
  }
  return records;
}

export const method = `${String(ROUNDS)} interleaved rounds — a whole multiple of the seven variants, so the rotation gives every variant each starting position equally often; each round spawns every variant once as \`node <fixture> greet ada\`, after one discarded warm-up round. Every parsing variant's package is resolved against the range \`benchmarks/package.json\` declares before any timing, and its version and resolved path are on every row. Absolute ms are a property of the machine recorded above and are not comparable across machines; the banded number is the paired ratio.`;
