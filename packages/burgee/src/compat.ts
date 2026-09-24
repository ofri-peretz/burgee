/**
 * A7 — the graded pass rate per host, as `burgee migrate` reports it.
 *
 * These are `compat-oracle`'s own numbers: the incumbent's test suite, vendored and run
 * against burgee's front-end, which is what "drop-in" means here and the only claim in the
 * package that is measured rather than argued.
 *
 * **They live here as a data module rather than as a literal in the report**, and
 * `compat-baseline-lock.test.ts` holds this file equal to
 * `packages/compat-oracle/baseline/<host>.json` — the same files the compat page renders.
 * Changing a number here without the measurement moving fails that lock, which is the
 * whole point: a number typed into a report template is a number that goes stale silently,
 * and this repository has published four of those and caught them all late.
 *
 * It cannot be read from the oracle at run time. `compat-oracle` is `private: true` and is
 * never published, so a user who installs `burgee` has no baseline directory to read; a
 * copy with a lock on it is the strongest control available on the published side, and the
 * lock is what makes it a copy rather than a claim.
 */

/** One row of the baseline, in the shape `baseline/<host>.json` stores it. */
export interface Graded {
  /** Cases in the incumbent's own suite. */
  reference: number;
  /** Cases that pass against burgee's front-end. */
  passed: number;
  /** `passed / reference`, carried rather than recomputed so it is the oracle's own division. */
  rate: number;
}

/** One host's grade, with the control beside it: the incumbent's own suite run against the incumbent in the same harness. */
export interface Row extends Graded {
  /**
   * Cases the incumbent itself passes here — from the published compatibility page, which
   * `npm run compat:page` generates on ubuntu. A drop-in that passes as many as the control
   * is **level**: every case it misses, the incumbent misses too, in this harness.
   */
  control: number;
}

/**
 * Every host the oracle grades, keyed by its `hosts.ts` name. The lock holds `reference`,
 * `passed` and `rate` equal to `baseline/<host>.json` and `control` equal to the page's
 * control column.
 */
export const GRADED: Readonly<Record<string, Row>> = {
  commander: { reference: 1360, passed: 1360, rate: 1, control: 1360 },
  yargs: { reference: 804, passed: 804, rate: 1, control: 802 },
  chalk: { reference: 58, passed: 58, rate: 1, control: 58 },
  ora: { reference: 99, passed: 99, rate: 1, control: 99 },
  'log-update': { reference: 99, passed: 99, rate: 1, control: 99 },
  boxen: { reference: 84, passed: 84, rate: 1, control: 84 },
  'cli-table3': { reference: 29, passed: 29, rate: 1, control: 29 },
  'string-width': { reference: 229, passed: 229, rate: 1, control: 229 },
  'strip-ansi': { reference: 8, passed: 8, rate: 1, control: 8 },
  'cross-spawn': { reference: 68, passed: 68, rate: 1, control: 68 },
  which: { reference: 5, passed: 5, rate: 1, control: 5 },
  rc: { reference: 1, passed: 1, rate: 1, control: 1 },
  'wrap-ansi': { reference: 80, passed: 80, rate: 1, control: 80 },
  'slice-ansi': { reference: 15, passed: 15, rate: 1, control: 15 },
  cosmiconfig: { reference: 243, passed: 186, rate: 0.7654320987654321, control: 240 },
  lilconfig: { reference: 77, passed: 67, rate: 0.8701298701298701, control: 67 },
  dotenv: { reference: 141, passed: 106, rate: 0.75177304964539, control: 141 },
  clack: { reference: 17, passed: 14, rate: 0.8235294117647058, control: 17 },
  'inquirer-core': { reference: 41, passed: 41, rate: 1, control: 41 },
  meow: { reference: 148, passed: 132, rate: 0.8918918918918919, control: 146 },
  'ansi-escapes': { reference: 4, passed: 4, rate: 1, control: 4 },
  'terminal-link': { reference: 8, passed: 8, rate: 1, control: 8 },
  'term-img': { reference: 18, passed: 12, rate: 0.6666666666666666, control: 18 },
  'restore-cursor': { reference: 6, passed: 6, rate: 1, control: 6 },
  'exit-hook': { reference: 21, passed: 21, rate: 1, control: 21 },
  'signal-exit': { reference: 135, passed: 134, rate: 0.9925925925925926, control: 134 },
};

/** One graded path: an incumbent's specifier, and the family specifier that replaces it. */
export interface DropIn {
  /** The `hosts.ts` name, which keys `GRADED`. */
  host: string;
  from: string;
  to: string;
}

/**
 * Every drop-in pair the oracle grades, derived from `hosts.ts`: `from` is what the
 * incumbent's own tests import (`<host><subpath>`, or the import's `control` where the
 * incumbent is a separate package, as `yargs-parser` is), `to` is `<target><subpath>`.
 * `scripts/migrate-drop-ins-lock.test.ts` re-derives this list and fails on any difference.
 */
export const DROP_INS: readonly DropIn[] = [
  { host: 'commander', from: 'commander', to: 'burgee/commander' },
  { host: 'yargs', from: 'yargs', to: 'burgee/yargs' },
  { host: 'yargs', from: 'yargs/helpers', to: 'burgee/yargs/helpers' },
  { host: 'yargs', from: 'yargs-parser', to: 'burgee/yargs/parser' },
  { host: 'chalk', from: 'chalk', to: 'roundel/chalk' },
  { host: 'ora', from: 'ora', to: 'flagstaff/ora' },
  { host: 'log-update', from: 'log-update', to: 'flagstaff/log-update' },
  { host: 'boxen', from: 'boxen', to: 'flagstaff/boxen' },
  { host: 'cli-table3', from: 'cli-table3', to: 'flagstaff/cli-table3' },
  { host: 'string-width', from: 'string-width', to: 'linegauge' },
  { host: 'strip-ansi', from: 'strip-ansi', to: 'linegauge/strip' },
  { host: 'cross-spawn', from: 'cross-spawn', to: 'bellpull/cross-spawn' },
  { host: 'which', from: 'which', to: 'bellpull/node-which' },
  { host: 'rc', from: 'rc', to: 'seniority/rc' },
  { host: 'wrap-ansi', from: 'wrap-ansi', to: 'linegauge/wrap' },
  { host: 'slice-ansi', from: 'slice-ansi', to: 'linegauge/slice' },
  { host: 'cosmiconfig', from: 'cosmiconfig', to: 'seniority' },
  { host: 'lilconfig', from: 'lilconfig', to: 'seniority/lilconfig' },
  { host: 'dotenv', from: 'dotenv', to: 'seniority/dotenv' },
  { host: 'clack', from: '@clack/prompts', to: 'caique/clack' },
  { host: 'inquirer-core', from: '@inquirer/core', to: 'caique/inquirer' },
  { host: 'meow', from: 'meow', to: 'burgee/meow' },
  { host: 'ansi-escapes', from: 'ansi-escapes', to: 'paratext' },
  { host: 'terminal-link', from: 'terminal-link', to: 'paratext/terminal-link' },
  { host: 'term-img', from: 'term-img', to: 'paratext/term-img' },
  { host: 'restore-cursor', from: 'restore-cursor', to: 'closeout/restore-cursor' },
  { host: 'exit-hook', from: 'exit-hook', to: 'closeout/exit-hook' },
  { host: 'signal-exit', from: 'signal-exit', to: 'closeout/signal-exit' },
  { host: 'signal-exit', from: 'signal-exit/signals', to: 'closeout/signal-exit/signals' },
];

/**
 * The version each incumbent package was graded at: `vendor/<host>/.source.json`, or for
 * `yargs-parser` the copy the yargs control resolves. The grade is for that major and no other
 * — `signal-exit` 3 exports a function where 4 exports `onExit`, and `chalk` 4 is CommonJS where
 * 6 is not — so `migrate` leaves a project on another major alone and says so.
 * `scripts/migrate-drop-ins-lock.test.ts` holds each equal to the oracle's.
 */
/* eslint-disable conventions/prefer-dependency-version-strategy -- these are the exact versions the oracle graded, not dependency ranges: this object is data read by `migrate`, never a manifest npm installs from */
export const GRADED_VERSIONS: Readonly<Record<string, string>> = {
  '@clack/prompts': '1.8.1',
  '@inquirer/core': '12.0.3',
  'ansi-escapes': '7.3.0',
  boxen: '8.0.1',
  chalk: '6.0.0',
  'cli-table3': '0.6.5',
  commander: '15.0.0',
  cosmiconfig: '10.0.1',
  'cross-spawn': '7.0.6',
  dotenv: '17.4.2',
  'exit-hook': '5.1.0',
  lilconfig: '3.1.3',
  'log-update': '8.0.0',
  meow: '14.1.0',
  ora: '9.4.1',
  rc: '1.2.8',
  'restore-cursor': '5.1.0',
  'signal-exit': '4.1.0',
  'slice-ansi': '7.1.2',
  'string-width': '8.2.2',
  'strip-ansi': '7.2.0',
  'term-img': '7.1.0',
  'terminal-link': '5.0.0',
  which: '7.0.0',
  'wrap-ansi': '10.0.1',
  yargs: '18.1.0',
  'yargs-parser': '22.0.0',
};
/* eslint-enable conventions/prefer-dependency-version-strategy */

/** Level: the drop-in passes every case the incumbent passes against its own suite (D-137). */
export const isLevel = (host: string): boolean => {
  const row = GRADED[host];
  return row !== undefined && row.passed >= row.control;
};
