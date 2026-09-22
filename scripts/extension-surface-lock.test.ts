/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — an extension surface declares how far it is built.
 *
 * PRINCIPLES 7 asks three things of a plugin surface, not one: the plugin is data validated
 * against a published JSON Schema, there is a **`check` command that renders it every way it
 * can be seen**, and the bar is **measured weekly** — an agent given the schema and one
 * example writes a passing plugin in one turn.
 *
 * Measured 2026-09-21, the three halves are not built to the same depth:
 *
 * | | plugin + schema | `validate` | `check` | eval |
 * | :--- | :---: | :---: | :---: | :---: |
 * | flagstaff | yes | yes | yes | yes |
 * | burgee | yes | yes | yes | yes |
 * | bellpull, caique, closeout, linegauge, paratext, roundel, seniority | yes | yes | yes | yes |
 *
 * **`check` is nine of nine since 2026-09-22.** It was one — `flagstaff check` — so an author
 * writing a plugin for any other host found out what it did by shipping it into a program. Each
 * package's is its own (`src/check.ts`, with a ten-line `src/cli.ts` that owns the process),
 * because each renders something different and each package is an independent product. What
 * they share is the contract with the author, and `plugin-check-lock.test.ts` holds that
 * identically across all nine: a readable report ending in `ok`, a refusal with a code and a
 * fix, `E_NO_CONTRIBUTION` for a plugin with nothing for this host, and exit 2 with no file.
 *
 * **And the eval column is nine of nine with it**, because this file's one enforced implication
 * refuses a `check` without a case. Each of the eight new cases under `evals/cases/` was proved
 * to discriminate before it was committed: every shell check green against a correct plugin, and
 * red against the same plugin with one field broken, where that host's `check` refuses with its
 * own code — `E_NO_STATIC_PROJECTION` for paratext's missing fallback, `E_PLUGIN_CONTRACT` for
 * burgee's missing contract, `E_PLUGIN_SCHEMA` for the rest.
 *
 * **Nine of nine since 2026-09-22.** `linegauge` was the empty row, and it was empty honestly:
 * a width function is not obviously extensible, and an extension point invented to fill a table
 * is worse than a gap that says so. It hosts `widths` now — code-point ranges a terminal
 * disagrees with the Unicode tables about, which is a disagreement `width.ts` already documents
 * and had no way for a user to settle.
 *
 * All nine publish `./plugin` and `./schema.json` and every one exports `validate`, so the
 * *data* half is built everywhere. The feedback loop exists once and the
 * weekly measurement exists once, both in `flagstaff`. A surface nobody can check is a
 * surface nobody outside this repository can write against, which is the difference between
 * an extension point and a published interface.
 *
 * This lock does not demand the missing seven — failing on work that is scheduled rather than
 * forgotten is how a gate teaches people to read red as normal. It demands that the table
 * above stays true: a package that grows a `./plugin` export, or a `check` command, or an
 * eval case, moves in this file in the same commit. The gap can close; it cannot drift.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(REPO_ROOT, 'packages');

/** What PRINCIPLES 7 asks for, per package, as it stands. */
const DECLARED = {
  bellpull: { plugin: true, check: true, eval: true },
  burgee: { plugin: true, check: true, eval: true },
  caique: { plugin: true, check: true, eval: true },
  closeout: { plugin: true, check: true, eval: true },
  flagstaff: { plugin: true, check: true, eval: true },
  linegauge: { plugin: true, check: true, eval: true },
  paratext: { plugin: true, check: true, eval: true },
  roundel: { plugin: true, check: true, eval: true },
  seniority: { plugin: true, check: true, eval: true },
} as const;

/** Published packages only — `compat-oracle` and `docs` are private and extend nothing. */
function published(): string[] {
  return readdirSync(PACKAGES).filter((name) => {
    const at = join(PACKAGES, name, 'package.json');
    if (!existsSync(at)) return false;
    return (JSON.parse(readFileSync(at, 'utf8')) as { private?: boolean }).private !== true;
  });
}

const manifest = (name: string): { exports?: Record<string, unknown>; bin?: Record<string, string> } =>
  JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as { exports?: Record<string, unknown>; bin?: Record<string, string> };

/** A `check` command, which is a `cli.ts` that answers to the word. */
function hasCheck(name: string): boolean {
  const cli = join(PACKAGES, name, 'src', 'cli.ts');
  if (!existsSync(cli)) return false;
  return /['"`]check['"`]/u.test(readFileSync(cli, 'utf8'));
}

function hasEval(name: string): boolean {
  const dir = join(REPO_ROOT, 'evals', 'cases');
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.startsWith(`${name}-`));
}

describe('every extension surface declares how far it is built', () => {
  it('names every published package, so a new one cannot arrive undeclared', () => {
    expect(published().sort()).toEqual(Object.keys(DECLARED).sort());
  });

  it('the plugin column is true exactly where `./plugin` is published', () => {
    const actual = Object.fromEntries(published().map((n) => [n, manifest(n).exports?.['./plugin'] !== undefined]));
    expect(actual).toEqual(Object.fromEntries(Object.entries(DECLARED).map(([n, d]) => [n, d.plugin])));
  });

  it('a published `./plugin` exports `validate`, which is the half that is built everywhere', () => {
    const missing = published()
      .filter((n) => DECLARED[n as keyof typeof DECLARED].plugin)
      .filter((n) => !/export function validate/u.test(readFileSync(join(PACKAGES, n, 'src', 'plugin.ts'), 'utf8')));
    expect(missing, 'a plugin surface with no `validate` cannot refuse anything').toEqual([]);
  });

  it('the check column is true exactly where a `check` command exists', () => {
    const actual = Object.fromEntries(published().map((n) => [n, hasCheck(n)]));
    expect(actual).toEqual(Object.fromEntries(Object.entries(DECLARED).map(([n, d]) => [n, d.check])));
  });

  it('the eval column is true exactly where `evals/cases/` carries one', () => {
    const actual = Object.fromEntries(published().map((n) => [n, hasEval(n)]));
    expect(actual).toEqual(Object.fromEntries(Object.entries(DECLARED).map(([n, d]) => [n, d.eval])));
  });

  it('a surface that can be checked is a surface that is measured', () => {
    // The one implication this file does enforce. `check` is the loop an agent writes
    // against; shipping it without a weekly case is claiming the bar without measuring it,
    // which PRINCIPLES 7 names as the thing that must not happen.
    const unmeasured = Object.entries(DECLARED).filter(([, d]) => d.check && !d.eval).map(([n]) => n);
    expect(unmeasured, 'a `check` command with no eval case claims the one-turn bar without measuring it').toEqual([]);
  });
});
