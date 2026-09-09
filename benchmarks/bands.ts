/**
 * The producer registry: every Stage 6 control band this suite feeds, and the exact
 * record it is fed from.
 *
 * Two files have to agree — `.sdlc/bands/control-bands.json` names the bands, this file
 * names what produces each — and `bands.test.ts` fails when they do not. Without that,
 * a band can reference a number nothing emits, which is what
 * `agent-tokens-per-task` did from the day it was written until this suite existed: the
 * collector read `benchmarks/results/agent-cli-bench/`, a directory that did not exist,
 * and reported "band not computed yet" forever. A band watching nothing looks exactly
 * like a band watching something healthy.
 */
import { type AxisName } from './record.js';

/**
 * Suites are cadence, not subject matter: B1 costs money and runs weekly, the other
 * three are free and gate every PR (intent, open questions). Two directories keep one
 * cadence from writing dated files the other's band then reads as its own history.
 */
export const SUITE = {
  cheap: 'cli-benchmarks',
  agent: 'agent-cli-bench',
} as const;

export type SuiteName = (typeof SUITE)[keyof typeof SUITE];

export interface BandSpec {
  /** Must equal the `id` in `.sdlc/bands/control-bands.json`. */
  id: string;
  /** The axis that produces it. A skipped axis produces no value for its bands. */
  axis: AxisName;
  suite: SuiteName;
  /** Where `scripts/control-bands.ts` reads it from inside the dated results file. */
  jsonPath: string;
  /** The record it is read out of. */
  from: { variant: string; metric: string };
}

/** `bands.<id>.value` for every band: one shape, so the collector never learns an axis. */
const at = (id: string): string => `bands.${id}.value`;

const compatBand = (host: string): BandSpec => ({
  id: `compat-${host}-pass-rate`,
  axis: 'compat',
  suite: SUITE.cheap,
  jsonPath: at(`compat-${host}-pass-rate`),
  from: { variant: host, metric: 'pass-rate' },
});

/** The six hosts `compat-oracle` grades today. Adding a seventh is an entry here. */
export const COMPAT_HOSTS = ['commander', 'yargs', 'chalk', 'ora', 'log-update', 'boxen'] as const;

export const BANDS: readonly BandSpec[] = [
  // B2. The banded number is a ratio, not a millisecond count: absolute cold start is a
  // property of the machine (a GitHub runner and this laptop differ by more than the
  // effect), so a band over raw ms would be a band over which runner picked up the job.
  // The ratio of the same two spawns, interleaved in one run, cancels that out.
  {
    id: 'cold-start-ratio',
    axis: 'perf',
    suite: SUITE.cheap,
    jsonPath: at('cold-start-ratio'),
    from: { variant: 'burgee/commander ÷ commander', metric: 'cold-start-ratio' },
  },
  // B3. One band per graded host, read from the oracle's own results — never recomputed
  // (intent constraint 8). This is the band whose absence was the last gap between
  // `commander-compat`, `yargs-compat` and `shipped`.
  ...COMPAT_HOSTS.map(compatBand),
  // B1's deterministic half. These are the numbers an agent acts on, and they are banded
  // because they can move without any test failing: a refactor that started answering `1`
  // to a usage error would pass every suite in the repo and quietly cost an agent every
  // retry it has. Only burgee's are banded — a band watches our number, not the field's.
  {
    id: 'agent-exit-code-accuracy',
    axis: 'reliability',
    suite: SUITE.cheap,
    jsonPath: at('agent-exit-code-accuracy'),
    from: { variant: 'burgee', metric: 'exit-code-accuracy' },
  },
  {
    id: 'agent-structured-output-rate',
    axis: 'reliability',
    suite: SUITE.cheap,
    jsonPath: at('agent-structured-output-rate'),
    from: { variant: 'burgee', metric: 'structured-output-rate' },
  },
  {
    id: 'agent-hangs-per-100',
    axis: 'reliability',
    suite: SUITE.cheap,
    jsonPath: at('agent-hangs-per-100'),
    from: { variant: 'burgee', metric: 'hangs-per-100' },
  },
  // agent-headroom R7. A serialisation choice reverts silently — every test still passes
  // when `--schema` starts printing 42% more whitespace — so the size of the document an
  // agent reads to discover the CLI is watched rather than trusted.
  {
    id: 'agent-schema-bytes',
    axis: 'reliability',
    suite: SUITE.cheap,
    jsonPath: at('agent-schema-bytes'),
    from: { variant: 'burgee', metric: 'schema-bytes' },
  },
  // B4. Bytes, not KB: a 400-byte regression is invisible in a number rounded to KB, and
  // the ratchet exists to catch exactly the accidental kind of growth.
  {
    id: 'core-bundled-bytes',
    axis: 'weight',
    suite: SUITE.cheap,
    jsonPath: at('core-bundled-bytes'),
    from: { variant: 'burgee', metric: 'bundled-bytes' },
  },
  {
    id: 'commander-front-end-bundled-bytes',
    axis: 'weight',
    suite: SUITE.cheap,
    jsonPath: at('commander-front-end-bundled-bytes'),
    from: { variant: 'burgee/commander', metric: 'bundled-bytes' },
  },
  {
    id: 'yargs-front-end-bundled-bytes',
    axis: 'weight',
    suite: SUITE.cheap,
    jsonPath: at('yargs-front-end-bundled-bytes'),
    from: { variant: 'burgee/yargs', metric: 'bundled-bytes' },
  },
  // B1. Declared, and deliberately unfed: the axis needs a credential this repo does not
  // have, so it reports `skipped` and these two carry a reason instead of a number.
  {
    id: 'agent-tokens-per-task',
    axis: 'agent',
    suite: SUITE.agent,
    jsonPath: at('agent-tokens-per-task'),
    from: { variant: 'burgee', metric: 'tokens-per-task' },
  },
  {
    id: 'agent-turns-per-task',
    axis: 'agent',
    suite: SUITE.agent,
    jsonPath: at('agent-turns-per-task'),
    from: { variant: 'burgee', metric: 'turns-per-task' },
  },
];

export const bandsForAxis = (axis: AxisName): readonly BandSpec[] => BANDS.filter((b) => b.axis === axis);

export function suiteOf(axis: AxisName): SuiteName {
  return axis === 'agent' ? SUITE.agent : SUITE.cheap;
}

/** One band as `.sdlc/bands/control-bands.json` declares it. */
export interface ConfiguredBand {
  id: string;
  collector: string;
  suite?: string;
  jsonPath?: string;
}

/**
 * Every way the band configuration and this registry can disagree.
 *
 * A band whose collector is `benchmark-json` reads a file this suite writes, so it must
 * name a suite and a path this suite actually produces. Without this check the failure is
 * silent in the worst way: `scripts/control-bands.ts` prints "band not computed yet" both
 * for a band waiting for its eighth observation and for a band whose collector has been
 * reading an empty directory since the day it was written.
 *
 * Pure, and takes the configuration as an argument, so `bands.test.ts` can hand it a
 * band with no producer and watch this go red — then hand it the real file.
 */
export function producerProblems(configured: readonly ConfiguredBand[], specs: readonly BandSpec[] = BANDS): string[] {
  const problems: string[] = [];
  const byId = new Map(specs.map((s) => [s.id, s]));
  const fromBench = configured.filter((b) => b.collector === 'benchmark-json');
  for (const band of fromBench) {
    const spec = byId.get(band.id);
    if (spec === undefined) {
      problems.push(`band ${band.id} reads benchmark results but no axis in benchmarks/bands.ts produces it`);
      continue;
    }
    if (band.suite !== spec.suite) problems.push(`band ${band.id}: config reads suite ${String(band.suite)}, ${spec.axis} writes ${spec.suite}`);
    if (band.jsonPath !== spec.jsonPath) problems.push(`band ${band.id}: config reads ${String(band.jsonPath)}, the results document puts it at ${spec.jsonPath}`);
  }
  const declared = new Set(fromBench.map((b) => b.id));
  for (const spec of specs) {
    if (!declared.has(spec.id)) problems.push(`benchmarks/bands.ts produces ${spec.id} but no band in control-bands.json reads it`);
  }
  return problems;
}
