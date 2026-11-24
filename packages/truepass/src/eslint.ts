/**
 * truepass's ESLint plugin: the ways a test suite is made to pass without the code passing.
 *
 * | rule                  | catches                                             |
 * | :-------------------- | :-------------------------------------------------- |
 * | `no-focused-test`     | `.only`, `fit`, `fdescribe`                         |
 * | `no-unexplained-skip` | `.skip`, `.todo`, `xit`, constant `skipIf`          |
 * | `no-fixed-sleep`      | `setTimeout` promises, `sleep(n)`, `waitForTimeout` |
 * | `no-test-retry`       | `retry` / `retries` in tests and runner configs     |
 *
 * A call counts as a test only when its root is a test-runner name that is an unbound global or
 * imported from a test-runner module. Named exports only: `plugins: { truepass: plugin }`, or a
 * preset from `configs`. The checks a rule cannot see (a weakened assertion, a
 * snapshot rewritten with no reason) are `truepass diff`.
 */
import type { ESLint, Linter, Rule } from 'eslint';

import { noFixedSleep } from './no-fixed-sleep.js';
import { noFocusedTest } from './no-focused-test.js';
import { noTestRetry } from './no-test-retry.js';
import { noUnexplainedSkip } from './no-unexplained-skip.js';

export const rules: Record<string, Rule.RuleModule> = {
  'no-fixed-sleep': noFixedSleep,
  'no-focused-test': noFocusedTest,
  'no-test-retry': noTestRetry,
  'no-unexplained-skip': noUnexplainedSkip,
};

export const plugin: ESLint.Plugin = { meta: { name: 'truepass' }, rules };

/** Every rule at one severity, derived from `rules` so a new rule cannot miss a preset. */
function preset(severity: 'error' | 'warn'): Linter.Config {
  return {
    plugins: { truepass: plugin },
    rules: Object.fromEntries(Object.keys(rules).map((name) => [`truepass/${name}`, severity])),
  };
}

/**
 * `recommended`: every rule as an error. `adoption`: every rule as a warning, for a repo
 * paying down a backlog with `--max-warnings` as the ratchet.
 */
export const configs = { recommended: preset('error'), adoption: preset('warn') };

export { noFixedSleep, noFocusedTest, noTestRetry, noUnexplainedSkip };
