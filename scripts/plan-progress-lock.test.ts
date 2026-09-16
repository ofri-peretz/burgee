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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
    const baseline = resolve(ROOT, 'packages/compat-oracle/baseline');
    // A fragment flagged `"planned": true` records a measurement `hosts.ts` deliberately does
    // not publish, so the watcher derives no band for it — see `compat-oracle`'s
    // `baseline-scope.test.ts`, which pins the flag to that host's status.
    const suites = readdirSync(baseline)
      .filter((f) => f.endsWith('.json'))
      .filter((f) => (JSON.parse(readFileSync(join(baseline, f), 'utf8')) as { planned?: boolean }).planned !== true);
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

/**
 * A path a condition names must be a path that could exist.
 *
 * `2.5.4` was keyed on `has('packages/caique/src/prompt.test.ts', 'openpty')` — **a file that
 * has never existed**; caique's raw-mode test is `raw.test.ts`. So the step could not go green
 * however much of it was built, and when a lane finally built a real pty test it had nowhere to
 * land. That is the seventh condition in this file found false for a reason unrelated to its
 * step, and the first one a mechanical check could have caught on the day it was written.
 *
 * Three named paths are legitimately absent and say why below. Everything else must exist, so a
 * renamed file breaks the build rather than quietly turning a step red — which is how `0.1`
 * broke, and how it stayed broken.
 */
describe('every path a step names could exist', () => {
  /** Absent on purpose. A path leaves this list by existing, never by being explained again. */
  const DELIBERATELY_ABSENT: Record<string, string> = {
    'packages/compat-oracle/baseline.json': 'SHARD asserts this is *gone*: the shared file was replaced by a directory of per-host fragments so lanes cannot collide.',
  };

  it('names no path that has never existed', () => {
    // Comments out first. Without this the test reads the path out of the paragraph that
    // *explains* a broken condition and reports it as broken again — which it did on its first
    // run, over the comment two files away describing this very bug. Three checkers in this
    // repository have now been caught reading printed source rather than code.
    const source = readFileSync(resolve(ROOT, 'scripts/plan-progress.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const steps = source.slice(source.indexOf('const STEPS'));
    const named = [...new Set([...steps.matchAll(/'((?:packages|scripts|\.sdlc|\.github|apps|benchmarks)\/[^']+)'/g)].map((m) => m[1] as string))];
    expect(named.length, 'the STEPS array moved or changed shape — this test is reading nothing').toBeGreaterThan(15);

    const missing = named.filter((path) => !existsSync(resolve(ROOT, path)) && DELIBERATELY_ABSENT[path] === undefined);
    expect(missing, 'a condition keyed on a path that is not there can never go green — fix the path, or declare why it is absent').toEqual([]);
  });

  it('keeps that list honest — a path that now exists must leave it', () => {
    const live = Object.keys(DELIBERATELY_ABSENT).filter((path) => existsSync(resolve(ROOT, path)));
    expect(live, 'these exist now; delete them from DELIBERATELY_ABSENT').toEqual([]);
  });
});
