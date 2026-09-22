/**
 * B4's subject: every published entry point of ours, and the package each one replaces.
 *
 * The fixture for a pair is generated from this table rather than committed twice, so a
 * new entry point cannot arrive with a fixture that imports something slightly different
 * from the incumbent's — which would make the two columns incomparable while looking
 * fine. `weight.test.ts` pins the generated source.
 */

export interface EntryPair {
  /** Row id, and the `from.variant` a band matches for our side. */
  id: string;
  /** Our specifier, and the one symbol the fixture uses. */
  ours: { specifier: string; symbol: string };
  /** What it replaces. `default` means the fixture imports the default export. */
  incumbent: { specifier: string; symbol: string };
  /**
   * The claim id, when `lighter-than-<incumbent>` would collide: a package can have a drop-in
   * façade *and* a native API against the same incumbent (flagstaff/ora and flagstaff/spinner),
   * and one id may only ever name one row.
   */
  claim?: string;
  /** Why this is the right comparison, for the table. */
  why: string;
}

export const DEFAULT_EXPORT = 'default';

export const PAIRS: readonly EntryPair[] = [
  {
    id: 'burgee',
    ours: { specifier: 'burgee', symbol: 'run' },
    incumbent: { specifier: 'cac', symbol: 'cac' },
    why: 'core against the published target: cac, the lightest framework in the landscape (§6)',
  },
  {
    id: 'burgee/commander',
    ours: { specifier: 'burgee/commander', symbol: 'Command' },
    incumbent: { specifier: 'commander', symbol: 'Command' },
    why: 'the commander front-end against commander itself',
  },
  {
    id: 'burgee/yargs',
    ours: { specifier: 'burgee/yargs', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'yargs', symbol: DEFAULT_EXPORT },
    why: 'the yargs front-end against yargs and its five dependencies',
  },
  {
    id: 'roundel/chalk',
    ours: { specifier: 'roundel/chalk', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'chalk', symbol: DEFAULT_EXPORT },
    why: 'the colour façade against chalk',
  },
  {
    // The roadmap's second bet — "roundel ships at 0.1 under picocolors' weight" — and the
    // only headline comparison with no measured pair here. Everything else on this list got
    // one; the bet the plan rests on was carried by a budget of 3,300 in roundel's own
    // weight lock, described in its comment as "the ceiling is picocolors: 3.3 KB". That is
    // the rounded prose figure, not a measurement of picocolors, and it is loose enough that
    // roundel could pass its own lock while being heavier than the package it is named
    // against.
    //
    // Not a drop-in pair: `roundel/tokens` is semantic (`error`, `ok`, `heading`) where
    // picocolors is `red`, `green`, and they share no symbol. picocolors is the *weight bar*
    // the bet names, not a package roundel replaces — so each side is entered by its own
    // entry point and the ratio is what a program pays for colour on each.
    id: 'roundel/tokens',
    ours: { specifier: 'roundel/tokens', symbol: 'error' },
    incumbent: { specifier: 'picocolors', symbol: DEFAULT_EXPORT },
    why: "the roadmap's second bet: colour under picocolors' weight",
  },
  {
    id: 'flagstaff/ora',
    ours: { specifier: 'flagstaff/ora', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'ora', symbol: DEFAULT_EXPORT },
    why: 'the spinner façade against ora',
  },
  {
    id: 'flagstaff/boxen',
    ours: { specifier: 'flagstaff/boxen', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'boxen', symbol: DEFAULT_EXPORT },
    why: 'the box façade against boxen',
  },
  {
    id: 'flagstaff/cli-table3',
    ours: { specifier: 'flagstaff/cli-table3', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'cli-table3', symbol: DEFAULT_EXPORT },
    why: 'the table façade against cli-table3',
  },
  {
    id: 'flagstaff/spinner',
    claim: 'flagstaff-spinner-lighter-than-ora',
    ours: { specifier: 'flagstaff/spinner', symbol: 'spinner' },
    incumbent: { specifier: 'ora', symbol: DEFAULT_EXPORT },
    why: 'flagstaff R10: the native spinner may not weigh more than ora',
  },
  {
    id: 'flagstaff/box',
    claim: 'flagstaff-box-lighter-than-boxen',
    ours: { specifier: 'flagstaff/box', symbol: 'box' },
    incumbent: { specifier: 'boxen', symbol: DEFAULT_EXPORT },
    why: 'flagstaff R10: the native box may not weigh more than boxen',
  },
  {
    id: 'flagstaff/table',
    claim: 'flagstaff-table-lighter-than-cli-table3',
    ours: { specifier: 'flagstaff/table', symbol: 'table' },
    incumbent: { specifier: 'cli-table3', symbol: DEFAULT_EXPORT },
    why: 'flagstaff R10: the native table may not weigh more than cli-table3',
  },
  {
    id: 'flagstaff/log-update',
    ours: { specifier: 'flagstaff/log-update', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'log-update', symbol: DEFAULT_EXPORT },
    why: 'the frame façade against log-update',
  },
  // The foundation layers, added 2026-09-16. Two roadmap rows were red on their absence and
  // said so in the same words: `linegauge`'s R9 `notBuilt` list reads *"benchmarks/
  // fixtures/entry-points.ts has no `linegauge` pair, so B4 computes no tree-inclusive ratio
  // for this package — also the integrator lane's path"*, and `paratext`'s R11 reads *"the
  // B4 row is Not built: `grep -rl paratext benchmarks/` returns nothing"*. Both were right,
  // and neither lane could write this file.
  //
  // The incumbents are pinned to the **exact versions compat-oracle grades** rather than to
  // a range, which is the only pairing that means anything: the weight we compare against
  // has to be the weight of the release whose own suite we pass. `slice-ansi` is 7.1.2 here
  // and 9.0.0 on npm for that reason.
  {
    id: 'linegauge',
    ours: { specifier: 'linegauge', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'string-width', symbol: DEFAULT_EXPORT },
    why: 'the width layer against string-width, whose own suite grades it 229 / 229',
  },
  {
    id: 'linegauge/wrap',
    ours: { specifier: 'linegauge/wrap', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'wrap-ansi', symbol: DEFAULT_EXPORT },
    why: 'the wrap façade against wrap-ansi, 80 / 80',
  },
  {
    id: 'linegauge/slice',
    ours: { specifier: 'linegauge/slice', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'slice-ansi', symbol: DEFAULT_EXPORT },
    why: 'the slice façade against slice-ansi, 15 / 15',
  },
  {
    id: 'linegauge/strip',
    ours: { specifier: 'linegauge/strip', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'strip-ansi', symbol: DEFAULT_EXPORT },
    why: 'the strip façade against strip-ansi, 8 / 8',
  },
  {
    // paratext's root default is an object of capabilities, not a function, and
    // `ansi-escapes`' is the same shape — so the fixture imports the default on both sides
    // and the bundler keeps whatever each one reaches.
    id: 'paratext',
    ours: { specifier: 'paratext', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'ansi-escapes', symbol: DEFAULT_EXPORT },
    why: 'the OSC layer against ansi-escapes — R11\'s B4 row, and the layer that is over its D1 ceiling',
  },
];

/**
 * The fixture: import exactly one entry point, use exactly one symbol, re-export it so
 * the bundler cannot shake away the thing being measured. What comes out is the number a
 * user's bundle grows by when they import that entry point — which is a different
 * question from the package's tarball size, and the only one a user acts on (design R7).
 */
export function fixtureSource({ specifier, symbol }: { specifier: string; symbol: string }): string {
  return symbol === DEFAULT_EXPORT
    ? `import x from ${JSON.stringify(specifier)};\nexport default x;\n`
    : `import { ${symbol} } from ${JSON.stringify(specifier)};\nexport { ${symbol} };\n`;
}

/**
 * One capability our entry point supplies, and the incumbent package a user of the bare
 * incumbent installs to get it.
 */
export interface ParityAdd {
  /** The package they add, and the one symbol the fixture uses. */
  specifier: string;
  symbol: string;
  /** What it buys, in the words of the thing it buys. */
  capability: string;
  /** Our graded drop-in for it — the evidence that we do this job, not a claim that we do. */
  gradedBy: string;
}

/**
 * **The premium, measured rather than asserted.**
 *
 * `bundled-bytes-ratio` compares our entry point against one incumbent package, and for the
 * façades it is the wrong shape of question. `burgee` is 27 KB against `cac`'s 10 KB, and the
 * row reads as a 2.6x loss — but a program that picks `cac` and then wants its config file
 * read, its shutdown bounded and its cursor handed back on Ctrl-C does not get those from
 * `cac`. It installs three more packages. The comparison a reader is actually making is
 * *what do I pay for this capability set*, and until this table existed the suite only
 * answered *what do I pay for this import*.
 *
 * ## The rule that keeps this from being a rigged denominator
 *
 * **An incumbent may be added only where this repository publishes a graded drop-in for it** —
 * a `compat-oracle` row with a pass rate against that package's own suite. That is the
 * evidence our entry point does the same job, rather than our word for it, and
 * `parity.test.ts` fails if an addition here names a package with no active row.
 *
 * It is a self-limiting rule on purpose. We cannot pad a stack with packages we merely
 * resemble, and the capabilities we have that no incumbent supplies — `--schema`, `--mcp`,
 * the `{ ok, data }` envelope, agent detection, option relations — are listed in `unmatched`
 * and contribute **zero bytes**. They are the part of the premium that is real and unpriced,
 * and saying so is worth more than finding a package to charge for them.
 *
 * Both ratios are published on every row. The bare one does not go away and does not stop
 * being the number it was: D-074's scar tissue is about *changing* a measurement while it is
 * failing, and this adds one beside it.
 */
export interface ParityStack {
  /** The `EntryPair` this augments. */
  id: string;
  adds: readonly ParityAdd[];
  /** What we supply that nothing on npm does, and which therefore costs the stack nothing. */
  unmatched: readonly string[];
}

/**
 * The three additions every framework row shares, because none of the three incumbents
 * resolves a config file, bounds its own shutdown, or hands the terminal back.
 */
const FRAMEWORK_ADDS: readonly ParityAdd[] = [
  {
    specifier: 'cosmiconfig',
    symbol: 'cosmiconfig',
    capability: 'find and load a config file, and merge it under the flags',
    gradedBy: 'seniority/cosmiconfig',
  },
  {
    specifier: 'exit-hook',
    symbol: DEFAULT_EXPORT,
    capability: 'run cleanup on every path out, including a signal',
    gradedBy: 'closeout/exit-hook',
  },
  {
    specifier: 'restore-cursor',
    symbol: DEFAULT_EXPORT,
    capability: 'hand the terminal back with the cursor visible',
    gradedBy: 'closeout/restore-cursor',
  },
];

/** What the three framework entries do that nothing on npm packages up. */
const FRAMEWORK_UNMATCHED = [
  '`--schema`: the whole program as one JSON document',
  '`--mcp`: the program as an MCP server over stdio',
  'the `{ ok, data }` envelope on `--json`, on every command',
  'agent detection, and the non-interactive floor that follows from it',
  'option relations (`dependsOn`, `exclusive`) and Standard Schema validation',
] as const;

export const PARITY: readonly ParityStack[] = [
  { id: 'burgee', adds: FRAMEWORK_ADDS, unmatched: FRAMEWORK_UNMATCHED },
  { id: 'burgee/commander', adds: FRAMEWORK_ADDS, unmatched: FRAMEWORK_UNMATCHED },
  { id: 'burgee/yargs', adds: FRAMEWORK_ADDS, unmatched: FRAMEWORK_UNMATCHED },
];

/**
 * The stack's fixture: the incumbent and everything a user adds to it, each used by one
 * symbol so the bundler keeps what each one reaches and nothing more. Exactly the shape
 * `fixtureSource` makes for one package, over several.
 */
export function stackFixtureSource(sides: readonly { specifier: string; symbol: string }[]): string {
  const lines = sides.map((side, i) =>
    side.symbol === DEFAULT_EXPORT
      ? `import x${String(i)} from ${JSON.stringify(side.specifier)};`
      : `import { ${side.symbol} as x${String(i)} } from ${JSON.stringify(side.specifier)};`,
  );
  const names = sides.map((_, i) => `x${String(i)}`);
  return `${lines.join('\n')}\nexport default [${names.join(', ')}];\n`;
}
