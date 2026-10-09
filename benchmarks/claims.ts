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
import { claimRatchet, RATCHETED } from './claim-ratchets.js';
import { CONTROLROOM_WEIGHT, packageOf, PAIRS, PARITY, ratioVariant, type Side, sideLabel } from './fixtures/entry-points.js';
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

const U5 = 'U5 in .sdlc/intents/README.md — "lighter per subpath than the incumbent it replaces"';

/** A side as prose: each package it imports, in code. */
const code = (side: Side): string =>
  sideLabel(side)
    .split(' + ')
    .map((s) => `\`${s}\``)
    .join(' + ');

/** 52 KB, the figure `replacement-parser` #3 publishes, in bytes. */
const KB = 1024;
const CORE_BUNDLE_TARGET = 52 * KB;

const COMPAT_TARGETS = [
  ['commander', 1360],
  ['yargs', 816],
  ['chalk', 58],
  ['ora', 99],
  ['log-update', 99],
  ['boxen', 84],
] as const;

export const CLAIMS: readonly ClaimSpec[] = [
  /**
   * B1's two claims are settled on totals over every task-run, burgee's over commander's, since
   * D-20261009-b1-totals-and-explain. They read the pooled median until then, and with five
   * runs a task commander's median landed at 4 or 6 turns from one run to the next, so the
   * verdict was a coin flip on the incumbent's luck. The ids stay: they key every results
   * document that has settled them.
   */
  {
    id: 'agent-tokens-40pct',
    claim: 'an agent spends at least 40% fewer tokens over the benchmark tasks against a CLI that meets the floor (total over every task-run)',
    source: '.sdlc/intents/burgee/intent.md — the roadmap headline; measured as totals since D-20261009-b1-totals-and-explain',
    from: { axis: 'agent', variant: 'burgee ÷ commander', metric: 'tokens-total-ratio' },
    test: { max: 0.6 },
  },
  {
    id: 'agent-turns-30pct',
    claim: 'an agent takes at least 30% fewer turns over the benchmark tasks against a CLI that meets the floor (total over every task-run)',
    source: '.sdlc/intents/burgee/intent.md — the roadmap headline; measured as totals since D-20261009-b1-totals-and-explain',
    from: { axis: 'agent', variant: 'burgee ÷ commander', metric: 'turns-total-ratio' },
    test: { max: 0.7 },
  },
  /**
   * This and the two bare weight rows for `burgee` and `burgee/commander` were ≤ 1 and have a
   * measured floor above it (D-102, D-148). Since D-157 each is a **downward-only ratchet**: the
   * claim is the ceiling in `.sdlc/bands/claim-ratchets.json`, set just above the measurement,
   * and it says so in its own words rather than keeping a sentence it cannot meet. The ids stay,
   * because they key every results document and D-row that has ever settled them.
   */
  {
    id: 'cold-start-at-or-below-cac',
    claim: `the engine's cold start stays within ${String(claimRatchet('cold-start-at-or-below-cac'))}× of cac's, the lightest framework in the landscape (a downward-only ratchet; the ≤ 1 bar is not reachable, D-102)`,
    source: '.sdlc/intents/replacement-parser/intent.md #2, the scoreboard row in .sdlc/intents/README.md, and the speed row of apps/docs/content/docs/comparison.mdx; the ceiling is .sdlc/bands/claim-ratchets.json (D-157)',
    from: { axis: 'perf', variant: 'burgee ÷ cac', metric: 'cold-start-ratio' },
    test: { max: claimRatchet('cold-start-at-or-below-cac') },
  },
  {
    id: 'core-under-52kb-bundled',
    claim: 'the core entry point is under 52 KB bundled',
    source: '.sdlc/intents/replacement-parser/intent.md #3',
    from: { axis: 'weight', variant: 'burgee', metric: 'bundled-bytes' },
    test: { max: CORE_BUNDLE_TARGET },
  },
  ...PAIRS.map((pair) => {
    const id = pair.claim ?? `lighter-than-${pair.incumbent.specifier}`;
    const base = { id, from: { axis: 'weight' as const, variant: ratioVariant(pair), metric: 'bundled-bytes-ratio' } };
    if (!RATCHETED.has(id)) {
      return {
        ...base,
        claim: `${code(pair.ours)} is lighter in a user's bundle than ${code(pair.incumbent)}, ${pair.incumbent.with === undefined ? 'the package' : 'what'} it replaces`,
        source: pair.source ?? U5,
        test: { max: 1 },
      };
    }
    const ceiling = claimRatchet(id);
    return {
      ...base,
      claim: `\`${pair.ours.specifier}\` stays within ${String(ceiling)}× of \`${pair.incumbent.specifier}\` alone in a user's bundle (a downward-only ratchet, lowered as it shrinks; ≤ 1 is not reachable, D-102)`,
      source: 'U5 in .sdlc/intents/README.md, restated as a ratchet by D-157; the ceiling is .sdlc/bands/claim-ratchets.json',
      test: { max: ceiling },
    };
  }),
  /**
   * controlroom W2: the drop-in's installed tree against ink's, in both of the intent's units.
   * The hypothesis is a large reduction, because none of ink's other dependencies come along; it
   * stays a hypothesis until these two rows print it.
   */
  ...PAIRS.filter((pair) => pair.installed === true).flatMap((pair) =>
    (['bytes', 'packages'] as const).map((unit) => ({
      id: `${pair.id.replaceAll('/', '-')}-installs-no-more-${unit}-than-${packageOf(pair.incumbent.specifier)}`,
      claim: `${code(pair.ours)} installs no more ${unit} than ${code(pair.incumbent)}`,
      source: pair.source ?? U5,
      from: { axis: 'weight' as const, variant: ratioVariant(pair), metric: `installed-${unit}-ratio` },
      test: { max: 1 },
    })),
  ),
  /**
   * controlroom W4: importing either entry point starts no slower than importing ink and the
   * React it renders through, as the B2 axis's same-run paired ratio. There is no baseline before
   * this row, so the number is the measurement and the bar is the intent's.
   */
  ...(['controlroom/ink', 'controlroom'] as const).map((variant) => ({
    id: `${variant.replace('/', '-')}-starts-no-slower-than-ink`,
    claim: `importing \`${variant}\` starts no slower than importing \`ink\` + \`react\`, as a same-run ratio`,
    source: CONTROLROOM_WEIGHT,
    from: { axis: 'perf' as const, variant: `${variant} ÷ ink + react`, metric: 'cold-start-ratio' },
    test: { max: 1 },
  })),
  /**
   * The same claim as `lighter-than-*`, asked the way a reader actually chooses.
   *
   * `lighter-than-cac` compares a framework against a parser and reads 2.317, gated since D-157
   * as a ratchet rather than at 1. That is a true number and it stays on the page, but it is not
   * the decision anybody makes: a program that picks `cac` and then wants its config file read,
   * its shutdown bounded and its cursor handed back installs three more packages, and *that* is
   * what our one import is competing with.
   *
   * These rows are gated at 1 rather than ratcheted, because unlike the bare ratio there is no
   * structural reason we should ever lose them — and if we do, the right response is to find
   * out why rather than to move a ceiling. What keeps them honest is `parity.test.ts`: a stack
   * may only contain packages this repository publishes a *graded* drop-in for, so the
   * denominator cannot be padded with things we merely resemble.
   */
  ...PARITY.map((stack) => {
    const pair = PAIRS.find((p) => p.id === stack.id);
    const incumbent = pair?.incumbent.specifier ?? '';
    const added = stack.adds.map((a) => a.specifier).join(' + ');
    return {
      id: `lighter-than-${incumbent}-at-parity`,
      claim: `\`${stack.id}\` is lighter in a user's bundle than \`${incumbent}\` plus the ${String(stack.adds.length)} packages a user of it installs to reach the same capability set`,
      source: 'U5 in .sdlc/intents/README.md, read as the choice a reader makes; the stack and the rule that decides it are `PARITY` in benchmarks/fixtures/entry-points.ts',
      from: { axis: 'weight' as const, variant: `${stack.id} ÷ (${incumbent} + ${added})`, metric: 'bundled-bytes-ratio-parity' },
      test: { max: 1 },
    };
  }),
  ...COMPAT_TARGETS.map(([host, passing]) => ({
    id: `compat-${host}`,
    claim: `${host}'s own test suite passes ${String(passing)} of ${String(passing)} against our entry point`,
    source: 'packages/compat-oracle/baseline/, published at /docs/compatibility and in the capabilities table of apps/docs/content/docs/comparison.mdx',
    from: { axis: 'compat' as const, variant: host, metric: 'passing-tests' },
    test: { min: passing },
  })),
];
