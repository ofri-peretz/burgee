/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The colour environment every suite in this repo runs under, pinned.
 *
 * **Why this file exists.** A developer's shell commonly exports `FORCE_COLOR=1` and
 * `COLORTERM=truecolor` — plenty of tools set them, and plenty of people set them on purpose.
 * Ten tests across `flagstaff/cli-table3` and `flagstaff/ora` assert plain output, so under
 * that shell they fail. CI's environment is neutral, so CI never sees it.
 *
 * That is the worst possible combination: **green on the machine that gates merges, red on
 * the machine of whoever is trying to work.** I spent a session bisecting it, blamed a merged
 * PR in a PR description, and wrote it into a code comment as a claim that `main` was broken.
 * It was not. My shell was.
 *
 * The repo already knows better in principle — `Runtime` exists so a test can substitute the
 * world rather than inherit it — but `roundel/chalk` detects the terminal *at import*, on
 * purpose, because that is chalk's contract and chalk's own suite grades it. A module that
 * reads the environment when it is loaded cannot be handed a fake one afterwards. So the
 * environment is fixed before anything loads, which is the only place left to fix it.
 *
 * `NO_COLOR` and `FORCE_COLOR=0` rather than merely unsetting the two: unsetting leaves the
 * decision to whatever `TERM` and the TTY probe say next, which is ambient again by a longer
 * route. A test that wants colour asks for it explicitly, the way `theme.test.ts` does with
 * its own `Runtime` literals.
 */
export function neutralColour(): void {
  process.env['NO_COLOR'] = '1';
  process.env['FORCE_COLOR'] = '0';
  delete process.env['COLORTERM'];
  delete process.env['TERM'];
}

neutralColour();
