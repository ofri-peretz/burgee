/**
 * Shared coverage settings — and the one thing a coverage number in this repo has to say
 * out loud before it can be believed.
 *
 * **Most of this repo's strongest tests are invisible to line coverage.** 2,537 upstream
 * tests run through `compat-oracle` in a *separate process* against the built `dist/`
 * (commander 1,360, yargs 804, ora 99, log-update 99, boxen 84, chalk 58, cli-table3 33);
 * the signal tests spawn a child and kill it; the mutation batteries prove a suite bites by
 * breaking the source and watching it go red. None of that moves a v8 counter in the vitest
 * process, so every façade reads as poorly covered while being the most thoroughly graded
 * code in the tree — `flagstaff/ora.ts` at 56% is graded 99/99 by ora's own suite.
 *
 * A gate over the raw number would therefore push exactly the wrong work: writing redundant
 * vitest tests for code an incumbent's own suite already grades. So the façades are excluded
 * here, and their number is the pass rate on the benchmarks page instead. What is left is
 * **code we own the tests for**, where a coverage number means what it says.
 *
 * Coverage is a floor-finder, not a quality metric: it finds code no test touches at all.
 * The mutation batteries are what say whether the tests that do touch it are any good.
 */
import { type ViteUserConfig } from 'vitest/config';

/**
 * Files whose tests run in **another process**, and are therefore invisible to a v8 counter
 * in this one. Not "files that are inconvenient" — the criterion is checkable, and every
 * entry below has a suite that spawns.
 *
 * `flagstaff/src/cli.ts` is the clearest case and the reason this list is framed by *how*
 * the tests run rather than by what the file is: it reports **0%** and has seven passing
 * tests, which drive the built `dist/cli.js` through `execFileSync`. A coverage gate would
 * have read that as untested code and asked for tests that already exist.
 */
export const TESTED_IN_ANOTHER_PROCESS = [
  // burgee — commander 1,360 and yargs 804, through `compat-oracle`.
  'src/commander*.ts',
  'src/yargs*.ts',
  'src/cliui*.ts',
  'src/y18n*.ts',
  // flagstaff — ora 99, log-update 99, boxen 84, cli-table3 33.
  'src/ora.ts',
  'src/log-update.ts',
  'src/boxen.ts',
  'src/cli-table3.ts',
  // roundel — chalk 58.
  'src/chalk.ts',
  // `flagstaff check <file>` — seven cases in `cli.test.ts`, every one of them
  // `execFileSync(dist/cli.js)`, because a CLI's contract is its exit code and its stdout.
  'src/cli.ts',
  // The signal handlers. `loop-signal.test.ts`, `ora.test.ts` and `log-update.test.ts` each
  // spawn a child and kill it, which is the only way to test what node does *not* run on a
  // signal — the entire defect the file exists to fix.
  'src/cursor.ts',
];

export const coverage: NonNullable<NonNullable<ViteUserConfig['test']>['coverage']> = {
  provider: 'v8',
  // `lcov` joins them for the Codecov upload; `.github/workflows/codecov.yml` prefixes
  // each package's `SF:` paths before merging, since these runs are per package.
  reporter: ['text-summary', 'json-summary', 'lcov'],
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.test.ts', ...TESTED_IN_ANOTHER_PROCESS],
  // Reported, not gated, until there are enough observations to ratchet from. A threshold
  // picked today would be a number somebody guessed; the band is the number the repo earns.
  thresholds: undefined,
};
