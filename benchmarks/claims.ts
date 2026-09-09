/**
 * Every number this repository states in public, and the record that settles it.
 *
 * `source` is not decoration: it is the list of files a reader has to go and correct when
 * a claim turns out to be false, and a claim written somewhere this list does not name is
 * a claim nothing keeps honest. `apps/docs/content/docs/comparison.mdx` was exactly that
 * — the repository's most prominent public table, absent from this file, and disagreeing
 * with the measurements on four rows. It is named here now, and `docs.test.ts` pins the
 * figures it shares with the suite.
 *
 * The intent asks for one outcome above all others: "the umbrella's ≥40% / ≥30% claim is
 * either confirmed or rewritten with the measured number. Both are acceptable outcomes; a
 * claim without a number is not." That cannot live in a footnote, so it lives here — each
 * claim names its source file, the record that decides it, and the threshold it asserts,
 * and the results document reports `met: true`, `met: false`, or `unmeasured` with the
 * reason.
 *
 * `unmeasured` is a first-class outcome and never collapses into `false`: "we did not
 * measure it" and "we measured it and it is not true" are different facts about the
 * project, and a suite that printed the same thing for both would be hiding the more
 * important one.
 */
import { PAIRS } from './fixtures/entry-points.js';
import { type AxisName } from './record.js';

export interface ClaimSpec {
  id: string;
  /** The claim, as it is written in public. */
  claim: string;
  /** Where it is written, so a reader can go and correct it. */
  source: string;
  from: { axis: AxisName; variant: string; metric: string };
  /** What has to be true of the record's median for the claim to hold. */
  test: { max?: number; min?: number };
}

/** 52 KB, the figure `replacement-parser` #3 publishes, in bytes. */
const KB = 1024;
const CORE_BUNDLE_TARGET = 52 * KB;

const COMPAT_TARGETS = [
  ['commander', 1360],
  ['yargs', 804],
  ['chalk', 58],
  ['ora', 99],
  ['log-update', 99],
  ['boxen', 84],
] as const;

export const CLAIMS: readonly ClaimSpec[] = [
  {
    id: 'agent-tokens-40pct',
    claim: 'an agent spends at least 40% fewer tokens per task against a CLI that meets the floor',
    source: '.sdlc/intents/agent-native-cli-layer/intent.md — the roadmap headline',
    from: { axis: 'agent', variant: 'burgee ÷ commander', metric: 'tokens-per-task-ratio' },
    test: { max: 0.6 },
  },
  {
    id: 'agent-turns-30pct',
    claim: 'an agent takes at least 30% fewer turns per task against a CLI that meets the floor',
    source: '.sdlc/intents/agent-native-cli-layer/intent.md — the roadmap headline',
    from: { axis: 'agent', variant: 'burgee ÷ commander', metric: 'turns-per-task-ratio' },
    test: { max: 0.7 },
  },
  {
    id: 'cold-start-at-or-below-cac',
    claim: 'the engine starts at or below cac, the lightest framework in the landscape',
    source: '.sdlc/intents/replacement-parser/intent.md #2, the scoreboard row in .sdlc/intents/README.md, and the speed row of apps/docs/content/docs/comparison.mdx',
    from: { axis: 'perf', variant: 'burgee ÷ cac', metric: 'cold-start-ratio' },
    test: { max: 1 },
  },
  {
    id: 'core-under-52kb-bundled',
    claim: 'the core entry point is under 52 KB bundled',
    source: '.sdlc/intents/replacement-parser/intent.md #3',
    from: { axis: 'weight', variant: 'burgee', metric: 'bundled-bytes' },
    test: { max: CORE_BUNDLE_TARGET },
  },
  ...PAIRS.map((pair) => ({
    id: `lighter-than-${pair.incumbent.specifier}`,
    claim: `\`${pair.ours.specifier}\` is lighter in a user's bundle than \`${pair.incumbent.specifier}\`, the package it replaces`,
    source: 'U5 in .sdlc/intents/README.md — "lighter per subpath than the incumbent it replaces"',
    from: { axis: 'weight' as const, variant: `${pair.id} ÷ ${pair.incumbent.specifier}`, metric: 'bundled-bytes-ratio' },
    test: { max: 1 },
  })),
  ...COMPAT_TARGETS.map(([host, passing]) => ({
    id: `compat-${host}`,
    claim: `${host}'s own test suite passes ${String(passing)} of ${String(passing)} against our entry point`,
    source: 'packages/compat-oracle/baseline.json, published at /docs/compatibility and in the capabilities table of apps/docs/content/docs/comparison.mdx',
    from: { axis: 'compat' as const, variant: host, metric: 'passing-tests' },
    test: { min: passing },
  })),
];
