/**
 * truepass: what makes a test suite report green without the code passing.
 *
 * - `truepass/eslint`: the ESLint plugin (`no-focused-test`, `no-unexplained-skip`,
 *   `no-fixed-sleep`, `no-test-retry`) with `recommended` and `adoption` presets.
 * - `truepass diff`: the changed-lines checks a rule cannot see, for a pre-push hook.
 *
 * This entry exports the checks and the program, for a caller that runs them itself.
 */
export { parseUnifiedDiff, unexplainedSnapshots, weakenedAssertions, MATCHER_RANK, type ChangedLine, type FileDiff, type Finding, type Hunk } from './checks.js';
export { check } from './check.js';
export { createProgram, program } from './cli.js';
export { budgetFrom, caseKey, DEFAULT_BUDGET_MS, DEFER_ENV, BUDGET_ENV, judge, overBudget, readCandidates, type Candidate, type CaseDuration, type Exemptions, type Machine } from './budget.js';
