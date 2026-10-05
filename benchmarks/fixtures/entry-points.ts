/**
 * B4's subject: every published entry point of ours, and the package each one replaces.
 *
 * The fixture for a pair is generated from this table rather than committed twice, so a
 * new entry point cannot arrive with a fixture that imports something slightly different
 * from the incumbent's — which would make the two columns incomparable while looking
 * fine. `weight.test.ts` pins the generated source.
 */

/** One import a fixture makes: a specifier, and the one symbol it uses. */
export interface Import {
  specifier: string;
  symbol: string;
}

/**
 * One side of a pair. Most sides are one import; an Ink program is not, because it imports the
 * `react` it renders beside `ink`, and the drop-in's user installs `react-reconciler` as well.
 */
export interface Side extends Import {
  /**
   * The rest of the program's imports, each used by one symbol and bundled as one program with
   * the first — what a user's bundler does, so a module two of them share is paid for once.
   */
  with?: readonly Import[];
  /**
   * Left out of the bundle. For an optional peer the package reaches only behind a branch that
   * does not run at startup (ink's `react-devtools-core`, under `DEV=true`), which no bundler can
   * resolve when the peer is not installed — and for ink measured "alone", without React (W3).
   */
  external?: readonly string[];
  /**
   * Every chunk is on the startup path. `controlroom/ink` loads its optional peers with `import()`
   * under top-level await, so the edges `initialBytes` treats as lazy run when the module loads;
   * counting only the statically imported closure would leave the `import()` stubs out, in our
   * favour.
   */
  eager?: true;
}

export interface EntryPair {
  /** Row id, and the `from.variant` a band matches for our side. */
  id: string;
  /** Our specifier, and the one symbol the fixture uses. */
  ours: Side;
  /** What it replaces. `default` means the fixture imports the default export. */
  incumbent: Side;
  /**
   * Gate the installed tree too, in packages and in bytes (controlroom W2). Off for every other
   * pair: installed size is per package, not per entry point, so it is reported and not gated —
   * except where a requirement states its bar on it.
   */
  installed?: true;
  /**
   * The claim id, when `lighter-than-<incumbent>` would collide: a package can have a drop-in
   * façade *and* a native API against the same incumbent (flagstaff/ora and flagstaff/spinner),
   * and one id may only ever name one row.
   */
  claim?: string;
  /** Where the claim is written, when it is a package's own bar rather than U5's. */
  source?: string;
  /** Why this is the right comparison, for the table. */
  why: string;
}

/** Where controlroom's weight bars are written: the claims these rows settle cite it. */
export const CONTROLROOM_WEIGHT = '.sdlc/intents/controlroom/intent.md — the size gates W1–W4 — and spec R14';

export const DEFAULT_EXPORT = 'default';

/** The package a specifier belongs to: `burgee/commander` is published by `burgee`. */
export function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string);
}

/** Every package a side installs, in import order, each once. */
export function packagesOf(side: Side): string[] {
  return [...new Set([side, ...(side.with ?? [])].map((s) => packageOf(s.specifier)))];
}

/**
 * How a side is named on its rows: its specifier, then each further package it imports. A
 * one-import side is named by its specifier, so no row written before a side could be several
 * packages changes its name.
 */
export function sideLabel(side: Side): string {
  const [, ...rest] = packagesOf(side);
  return [side.specifier, ...rest].join(' + ');
}

/** The ratio row's variant, which claims and bands key on: ours ÷ theirs. */
export const ratioVariant = (pair: EntryPair): string => `${sideLabel(pair.ours)} ÷ ${sideLabel(pair.incumbent)}`;

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
  // has to be the weight of the release whose own suite we pass. `slice-ansi` sat at 7.1.2
  // here while npm had 9 for that reason, and moved to 9.0.1 with its suite (burgee#317).
  {
    id: 'linegauge',
    ours: { specifier: 'linegauge', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'string-width', symbol: DEFAULT_EXPORT },
    why: 'the width layer against string-width, whose own suite grades it 233 / 233',
  },
  {
    id: 'linegauge/wrap',
    ours: { specifier: 'linegauge/wrap', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'wrap-ansi', symbol: DEFAULT_EXPORT },
    why: 'the wrap façade against wrap-ansi, 85 / 85',
  },
  {
    id: 'linegauge/slice',
    ours: { specifier: 'linegauge/slice', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'slice-ansi', symbol: DEFAULT_EXPORT },
    why: 'the slice façade against slice-ansi, 104 / 104',
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
  {
    // bellpull R8's ceiling, measured rather than named (GAPS A10, D-160). `tinyexec` is the
    // zero-dependency rival the requirement sets the bar at — not `execa`, which would be a free
    // pass. Not a drop-in pair: `run` resolves a record on every outcome where `x` returns a
    // process that rejects on a non-zero exit, so each side is entered by the one call a
    // program makes to spawn something, and the ratio is what that costs on each.
    id: 'bellpull',
    ours: { specifier: 'bellpull', symbol: 'run' },
    incumbent: { specifier: 'tinyexec', symbol: 'x' },
    why: "bellpull R8: `run` against tinyexec's `x`, the zero-dependency rival the ceiling names",
  },
  // controlroom R14, the intent's weight table. The incumbent is ink 6.8.0 on React 19.3.0, the
  // versions compat-oracle grades it at. ink's `react-devtools-core` is an optional peer it
  // imports only under `DEV=true`, through a dynamic import, so it is left external on every
  // ink side: it is never installed, and it is not on the startup path when it is.
  {
    // W1 — what an Ink program bundles today against what the same program bundles on the
    // drop-in: the program's own React on both sides, and the reconciler ink used to bring along
    // on ours. `eager`, because the drop-in reaches both peers under top-level await.
    id: 'controlroom/ink',
    claim: 'controlroom-ink-no-heavier-than-ink',
    source: CONTROLROOM_WEIGHT,
    ours: { specifier: 'controlroom/ink', symbol: 'render', with: [{ specifier: 'react', symbol: DEFAULT_EXPORT }, { specifier: 'react-reconciler', symbol: DEFAULT_EXPORT }], eager: true },
    incumbent: { specifier: 'ink', symbol: 'render', with: [{ specifier: 'react', symbol: DEFAULT_EXPORT }], external: ['react-devtools-core'] },
    // W2 is the same two programs installed: packages and bytes, both gated.
    installed: true,
    why: 'controlroom W1 and W2: the drop-in with the React and reconciler it renders through, against ink and the React it renders through',
  },
  {
    // W3, the root half: the native API against ink alone, with React external as the intent
    // measured it. The demo half waits on `examples/dashboard` (spec R14).
    id: 'controlroom',
    claim: 'controlroom-lighter-than-ink',
    source: CONTROLROOM_WEIGHT,
    ours: { specifier: 'controlroom', symbol: 'open' },
    incumbent: { specifier: 'ink', symbol: 'render', external: ['react', 'react-devtools-core'] },
    why: "controlroom W3: the native API's screen against ink alone — where \"lighter than Ink\" may be claimed once measured",
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

/** A side's fixture: one import as above, or, for a side of several, the stack shape below. */
export function sideSource(side: Side): string {
  return side.with === undefined ? fixtureSource(side) : stackFixtureSource([side, ...side.with]);
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
