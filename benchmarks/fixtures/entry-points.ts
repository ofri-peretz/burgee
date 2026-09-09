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
    id: 'flagstaff/log-update',
    ours: { specifier: 'flagstaff/log-update', symbol: DEFAULT_EXPORT },
    incumbent: { specifier: 'log-update', symbol: DEFAULT_EXPORT },
    why: 'the frame façade against log-update',
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
