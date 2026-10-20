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
  yargs: { reference: 816, passed: 816, rate: 1, control: 814 },
  chalk: { reference: 59, passed: 59, rate: 1, control: 59 },
  ora: { reference: 99, passed: 99, rate: 1, control: 99 },
  'log-update': { reference: 99, passed: 99, rate: 1, control: 99 },
  boxen: { reference: 213, passed: 213, rate: 1, control: 213 },
  'cli-table3': { reference: 29, passed: 29, rate: 1, control: 29 },
  'string-width': { reference: 233, passed: 233, rate: 1, control: 233 },
  'strip-ansi': { reference: 8, passed: 8, rate: 1, control: 8 },
  'cross-spawn': { reference: 68, passed: 68, rate: 1, control: 68 },
  which: { reference: 5, passed: 5, rate: 1, control: 5 },
  rc: { reference: 1, passed: 1, rate: 1, control: 1 },
  'wrap-ansi': { reference: 85, passed: 85, rate: 1, control: 85 },
  'slice-ansi': { reference: 104, passed: 104, rate: 1, control: 104 },
  cosmiconfig: { reference: 243, passed: 242, rate: 0.9958847736625515, control: 242 },
  lilconfig: { reference: 77, passed: 77, rate: 1, control: 77 },
  dotenv: { reference: 193, passed: 193, rate: 1, control: 193 },
  clack: { reference: 16, passed: 16, rate: 1, control: 16 },
  'inquirer-prompts': { reference: 213, passed: 213, rate: 1, control: 213 },
  'inquirer-core': { reference: 41, passed: 41, rate: 1, control: 41 },
  meow: { reference: 148, passed: 146, rate: 0.9864864864864865, control: 146 },
  'ansi-escapes': { reference: 4, passed: 4, rate: 1, control: 4 },
  'terminal-link': { reference: 8, passed: 8, rate: 1, control: 8 },
  'term-img': { reference: 18, passed: 18, rate: 1, control: 18 },
  'restore-cursor': { reference: 6, passed: 6, rate: 1, control: 6 },
  'exit-hook': { reference: 21, passed: 21, rate: 1, control: 21 },
  'signal-exit': { reference: 135, passed: 134, rate: 0.9925925925925926, control: 134 },
  ink: { reference: 1304, passed: 1304, rate: 1, control: 1303 },
  'inkjs-ui': { reference: 102, passed: 102, rate: 1, control: 102 },
  'find-up': { reference: 104, passed: 104, rate: 1, control: 104 },
  onetime: { reference: 6, passed: 6, rate: 1, control: 6 },
  'cli-cursor': { reference: 8, passed: 8, rate: 1, control: 8 },
  'cli-truncate': { reference: 12, passed: 12, rate: 1, control: 12 },
  'widest-line': { reference: 1, passed: 1, rate: 1, control: 1 },
  colorette: { reference: 67, passed: 67, rate: 1, control: 67 },
  picocolors: { reference: 1, passed: 1, rate: 1, control: 1 },
  'supports-color': { reference: 55, passed: 55, rate: 1, control: 55 },
  'extra-typings': { reference: 369, passed: 369, rate: 1, control: 369 },
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
 * incumbent is a separate package, as `yargs-parser` is), `to` is `<target><subpath>`. A
 * host's suite can also reach the incumbent by name from a spawned program — dotenv 18's
 * `import 'dotenv/config'` — and each name in its `selfExports` is graded the same way, so
 * `dotenv/config` and `dotenv/config.js` are pairs too. `scripts/migrate-drop-ins-lock.test.ts`
 * re-derives this list and fails on any difference.
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
  { host: 'dotenv', from: 'dotenv/config', to: 'seniority/dotenv/config' },
  { host: 'dotenv', from: 'dotenv/config.js', to: 'seniority/dotenv/config' },
  { host: 'clack', from: '@clack/prompts', to: 'caique/clack' },
  { host: 'inquirer-prompts', from: '@inquirer/prompts', to: 'caique/inquirer/prompts' },
  { host: 'inquirer-core', from: '@inquirer/core', to: 'caique/inquirer' },
  { host: 'meow', from: 'meow', to: 'burgee/meow' },
  { host: 'ansi-escapes', from: 'ansi-escapes', to: 'paratext' },
  { host: 'terminal-link', from: 'terminal-link', to: 'paratext/terminal-link' },
  { host: 'term-img', from: 'term-img', to: 'paratext/term-img' },
  { host: 'restore-cursor', from: 'restore-cursor', to: 'closeout/restore-cursor' },
  { host: 'exit-hook', from: 'exit-hook', to: 'closeout/exit-hook' },
  { host: 'signal-exit', from: 'signal-exit', to: 'closeout/signal-exit' },
  { host: 'signal-exit', from: 'signal-exit/signals', to: 'closeout/signal-exit/signals' },
  { host: 'ink', from: 'ink', to: 'controlroom/ink' },
  { host: 'find-up', from: 'find-up', to: 'seniority/find-up' },
  { host: 'onetime', from: 'onetime', to: 'closeout/onetime' },
  { host: 'cli-cursor', from: 'cli-cursor', to: 'closeout/cli-cursor' },
  { host: 'cli-truncate', from: 'cli-truncate', to: 'linegauge/cli-truncate' },
  { host: 'widest-line', from: 'widest-line', to: 'linegauge/widest-line' },
  { host: 'colorette', from: 'colorette', to: 'roundel/colorette' },
  { host: 'picocolors', from: 'picocolors', to: 'roundel/picocolors' },
  { host: 'supports-color', from: 'supports-color', to: 'roundel/supports-color' },
  { host: 'extra-typings', from: '@commander-js/extra-typings', to: 'burgee/commander/extra-typings' },
];

/**
 * The version each incumbent package was graded at: `vendor/<host>/.source.json`, or for
 * `yargs-parser` the copy the yargs control resolves. The grade is for that major and no other
 * — `signal-exit` 3 exports a function where 4 exports `onExit`, and `chalk` 4 is CommonJS where
 * 6 is not — so `migrate` leaves a project on another major alone and says so.
 * `scripts/migrate-drop-ins-lock.test.ts` holds each equal to the oracle's.
 */
export const GRADED_VERSIONS: Readonly<Record<string, string>> = {
  '@clack/prompts': '1.8.1',
  '@commander-js/extra-typings': '15.0.0',
  '@inquirer/core': '12.0.4',
  '@inquirer/prompts': '8.7.3',
  'ansi-escapes': '7.3.0',
  boxen: '9.0.0',
  chalk: '6.0.1',
  'cli-cursor': '5.0.0',
  'cli-table3': '0.6.5',
  'cli-truncate': '6.1.1',
  colorette: '2.0.20',
  commander: '15.0.0',
  cosmiconfig: '10.0.1',
  'cross-spawn': '7.0.6',
  dotenv: '18.0.8',
  'exit-hook': '5.1.0',
  'find-up': '8.0.0',
  ink: '8.0.0',
  lilconfig: '3.1.4',
  'log-update': '8.0.0',
  meow: '14.1.0',
  onetime: '8.0.0',
  ora: '9.4.1',
  picocolors: '1.1.1',
  rc: '1.2.8',
  'restore-cursor': '5.1.0',
  'signal-exit': '4.1.0',
  'slice-ansi': '9.0.1',
  'string-width': '8.3.0',
  'strip-ansi': '7.2.0',
  'supports-color': '11.0.0',
  'term-img': '7.1.0',
  'terminal-link': '5.0.0',
  which: '7.0.0',
  'widest-line': '6.0.0',
  'wrap-ansi': '10.0.2',
  yargs: '18.2.0',
  'yargs-parser': '22.0.0',
};

/**
 * C1 — the majors of each incumbent its drop-in claims, per incumbent package, highest last.
 *
 * A major is on this list only when the incumbent's **own suite at that major** grades the
 * drop-in level with the incumbent itself (D-137), so the list is a measurement and not a
 * range somebody believed. The current major is the one in `GRADED_VERSIONS`. An older one
 * needs a row in `compat-oracle`'s `PREVIOUS_MAJORS` — the suite vendored at that major's last
 * tag and graded in CI by `compat.yml`'s ratchet job — whose baseline passes as many cases as
 * its control does.
 *
 * Commander 14 is claimed: its suite grades `burgee/commander/v14` 1331 / 1331, level with
 * commander 14.0.3 itself. That subpath is the front-end with 14's excess-arguments message,
 * which omits the surplus argument 15 names, and `migrate` writes it for a project on 14
 * (`previous-majors` R1, R2, R6).
 *
 * Yargs 17 is claimed: its suite grades `burgee/yargs/v17` 793 / 794, level with yargs 17.7.3
 * itself, whose one miss is the vendored root's own manifest. That entry is the front-end with
 * 17's `require()` singleton, its string table, and its `commandDir()` walk, and `burgee/yargs/v17/yargs`
 * is 17's `yargs/yargs`; `migrate` writes them for a project on 17 (`previous-majors` R3–R6).
 *
 * The other older majors graded today are **not claimed**, because none is level: dotenv 17 grades 107 / 141 (18 moved `config()`'s log line to `console.error` and
 * deleted `.env.vault`, `DOTENV_KEY` and the tips, and the façade speaks 18), and ink 6 grades
 * 540 / 584 (`controlroom/ink` follows ink 8 where the two majors disagree — Delete is
 * backspace, a kitty Ctrl+letter is its own code point, the cursor and frame protocol moved;
 * D-20261006-controlroom-ink-8). The measurements are on the compatibility page; the claim
 * waits for the number.
 *
 * boxen 8 is neither graded nor claimed since boxen 9.0.0: `flagstaff/boxen` follows 9 where
 * the two disagree (a hex colour is real hex, `vertical` is a fallback for `left` rather than
 * an override), so a claim on 8 would need 8's suite vendored as a previous major and graded
 * level first (D-20261006-flagstaff-boxen-9).
 *
 * `migrate` reads this, and not `GRADED_VERSIONS`, to decide a project is on a major it may
 * rewrite — so a major that becomes level here is a major `migrate` serves, with no second
 * edit, except that a major whose behaviour differs has its own entry, which `migrate` writes
 * from {@link PREVIOUS_MAJOR_ENTRIES}. `scripts/supported-majors-lock.test.ts` holds every entry to `GRADED_VERSIONS` and to
 * the oracle's graded rows.
 */
/* eslint-disable conventions/no-magic-numbers -- these are major versions of other packages, data `migrate` reads and a lock holds to the oracle's grades; naming each would be twenty-seven constants that say `15` */
export const SUPPORTED_MAJORS: Readonly<Record<string, readonly number[]>> = {
  '@clack/prompts': [1],
  '@commander-js/extra-typings': [15],
  '@inquirer/core': [12],
  '@inquirer/prompts': [8],
  'ansi-escapes': [7],
  boxen: [9],
  chalk: [6],
  'cli-cursor': [5],
  'cli-table3': [0],
  'cli-truncate': [6],
  colorette: [2],
  commander: [14, 15],
  cosmiconfig: [10],
  'cross-spawn': [7],
  dotenv: [18],
  'exit-hook': [5],
  'find-up': [8],
  ink: [8],
  lilconfig: [3],
  'log-update': [8],
  meow: [14],
  onetime: [8],
  ora: [9],
  picocolors: [1],
  rc: [1],
  'restore-cursor': [5],
  'signal-exit': [4],
  'slice-ansi': [9],
  'string-width': [8],
  'strip-ansi': [7],
  'supports-color': [11],
  'term-img': [7],
  'terminal-link': [5],
  which: [7],
  'widest-line': [6],
  'wrap-ansi': [10],
  yargs: [17, 18],
  'yargs-parser': [22],
};

/**
 * `previous-majors` R6 — the entry `migrate` writes for a specifier whose project is on a
 * claimed older major that behaves differently from the current one, per specifier and major.
 * A claimed older major missing here behaves as the current one does, and is rewritten to
 * `MAPPING`'s target. Each entry is graded: its `PREVIOUS_MAJORS` row's `target` is this value.
 */
export const PREVIOUS_MAJOR_ENTRIES: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  commander: { 14: 'burgee/commander/v14' },
  yargs: { 17: 'burgee/yargs/v17' },
  // 17's `yargs/yargs` is the factory, never the singleton `require('yargs')` returns in 17.
  'yargs/yargs': { 17: 'burgee/yargs/v17/yargs' },
};
/* eslint-enable conventions/no-magic-numbers */

/** Level: the drop-in passes every case the incumbent passes against its own suite (D-137). */
export const isLevel = (host: string): boolean => {
  const row = GRADED[host];
  return row !== undefined && row.passed >= row.control;
};
