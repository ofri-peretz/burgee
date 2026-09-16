/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The checker has to be able to disagree with the tree.
 *
 * `plan-progress.ts` decides whether each roadmap step has landed, and three of its
 * conditions have now been false for reasons that had nothing to do with their step:
 *
 * - **0.1** shelled out to `git grep`, which exits 1 when it finds nothing, so the *success*
 *   case threw and was read as not-done.
 * - **0.4** spawned the control-band watcher, which takes its own measurements; two racing
 *   inside one process flaked the grade.
 * - **2.17** read the band listing off stdout. `control-bands.ts` prints it to stderr, so the
 *   condition saw **0** bands against 19 suites and could not go green whatever the
 *   repository did.
 *
 * All three failed silently, as a `·` indistinguishable from real work left to do — which is
 * worse than a crash, because it reads like an honest backlog. The pattern is one this
 * repository already names elsewhere: a verification step that cannot fail for the reason the
 * thing fails is not a verification step. Here it is the mirror image — a step that cannot
 * *pass* for the reason the work is done.
 *
 * So each condition that shells out is pinned against the tool it is asking. Not the step's
 * verdict — that is allowed to move as work lands — but the agreement between the checker's
 * view and the tool's own output. When they disagree, one of them is broken, and this says so.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * Both streams, and a command name Windows can actually find.
 *
 * `npx` is `npx.cmd` there, and `spawnSync` does not search `PATHEXT` — so this returned two
 * empty strings on `windows-latest` and both assertions below failed for a reason that had
 * nothing to do with the roadmap. Which is the joke: a lock written to catch checkers that
 * cannot fail, shipped with the defect it was written about, in the same week `bellpull` was
 * built because four other files had it too.
 *
 * `shell` on Windows is what the repository already does in `burgee/src/shape.test.ts`, and it
 * is safe *here* only because every argument is a literal in this file. It is not a pattern to
 * copy — `bellpull/which` is the answer, and this should use it once bellpull lands.
 */
const WINDOWS = process.platform === 'win32';
const BOTH = (cmd: string, args: string[]): string => {
  const run = spawnSync(WINDOWS ? `${cmd}.cmd` : cmd, args, { cwd: ROOT, encoding: 'utf8', shell: WINDOWS });
  return `${run.stdout ?? ''}${run.stderr ?? ''}`;
};
const COMPAT_BAND = /\bcompat-[a-z0-9-]+-pass-rate\b/g;

describe('the roadmap checker agrees with the tools it asks', () => {
  it('sees every compat band the watcher derives — on whichever stream it prints to', () => {
    const derived = new Set([...BOTH('npx', ['tsx', 'scripts/control-bands.ts']).matchAll(COMPAT_BAND)].map((m) => m[0]));
    const suites = readdirSync(resolve(ROOT, 'packages/compat-oracle/baseline')).filter((f) => f.endsWith('.json'));
    // One band per baseline fragment is 2.17's own done-condition; the point here is that the
    // checker and the watcher are counting the same thing.
    expect(derived.size, 'the watcher derives one band per baseline fragment').toBe(suites.length);
    const verdict = BOTH('npx', ['tsx', 'scripts/plan-progress.ts']);
    expect(verdict, 'the checker read a different stream than the watcher writes').toContain('✓ 2.17');
  }, 300_000);

  it('never reports a step as not-landed because its condition threw', () => {
    // `landed()` catches, deliberately — a condition that reaches for a file that is not there
    // yet must not crash the whole report. The cost is that a *broken* condition is
    // indistinguishable from unfinished work, so the report has to say which it was.
    const out = BOTH('npx', ['tsx', 'scripts/plan-progress.ts']);
    expect(out, 'the report should not be an error dump').not.toMatch(/ENOENT|command not found|is not a function/);
    expect(out).toMatch(/^\d+\/\d+ landed\./m);
  }, 300_000);
});
