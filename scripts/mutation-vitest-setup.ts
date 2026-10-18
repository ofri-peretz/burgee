/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Makes the test filter `@stryker-mutator/vitest-runner@10.0.0` sends match under vitest 5.
 *
 * Measured 2026-10-18 on `roundel/src/contrast.ts`: the runner names a test by joining its
 * suite names with a space (`contrast accepts short hex and rejects nonsense`) and filters a
 * mutant's run with that name as `testNamePattern`. vitest 5 matches the pattern against the
 * test's full name, whose separator is ` > ` (`contrast > accepts short hex and rejects
 * nonsense`). Nothing matches, every file is skipped, the run reports zero tests and no
 * failure — and Stryker records the mutant as **Survived**. Every runtime mutant covered only
 * by tests inside a `describe` survived that way: 2 of 27 on that one function, both killed by
 * an assertion that was sitting right there (`toThrow(/not a hex colour/)`).
 *
 * This file runs in the worker before the test file is collected and widens each space in the
 * pattern to also match ` > `. The cost is that a name differing only in where a suite boundary
 * falls also runs, which is one extra test, never one fewer. If a later runner fixes the join,
 * the widened pattern still matches the plain name.
 *
 * It reaches into vitest's worker state, which is internal. If that moves, the filter stops
 * being widened and the old symptom returns — and `scripts/mutation.ts` refuses a report with a
 * covered mutant that ran no test (`silentSurvivors`), so the run fails rather than lying.
 */
interface WorkerState {
  config?: { testNamePattern?: RegExp | string };
}

/** The runner's pattern with each space also matching vitest 5's ` > ` suite separator. */
export function widenTestNamePattern(pattern: RegExp | string): RegExp {
  // The runner's own flags, never `u`: its escaping writes `\-`, which `u` rejects.
  const [source, flags] = pattern instanceof RegExp ? [pattern.source, pattern.flags] : [pattern, ''];
  // eslint-disable-next-line secure-coding/detect-non-literal-regexp, secure-coding/no-unsafe-regex-construction -- the pattern is the one Stryker built from escaped test names (regex-escaped by the runner) and its flags are the runner's; this only widens a literal space
  return new RegExp(source.replaceAll(' ', '(?: | > )'), flags);
}

const state = (globalThis as { __vitest_worker__?: WorkerState }).__vitest_worker__;
const pattern = state?.config?.testNamePattern;
if (state?.config && pattern !== undefined) state.config.testNamePattern = widenTestNamePattern(pattern);
