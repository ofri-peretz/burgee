/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * paratext's supports-color fork and roundel's policy agree on every colour question they
 * share, except the rows each is deliberately faithful to a different incumbent on.
 *
 * `paratext/src/hyperlinks.ts` carries supports-color 10.2.2 — the copy supports-hyperlinks
 * 4.5.0 depends on — because `paratext/terminal-link` has to link exactly where the incumbent
 * does, and paratext is a leaf that may not import roundel. roundel's `colorLevel` follows
 * chalk 6's newer vendored copy, and R2 of its spec. Two answers to one question in one family
 * is the drift `inline-implementation-lock` exists to stop; this is what keeps the one fork it
 * admits (KNOWN, D-181) from drifting further than its reasons.
 *
 * A sweep of 23,400 rows on 2026-09-28 — both functions, and the real supports-color 10.2.2 in
 * a fresh module per row — found paratext equal to its incumbent on every one, and paratext
 * different from roundel in exactly the declared classes below. So nothing was fixed: every
 * difference is one of the forks being faithful. A row that differs for any other reason fails
 * here, and names itself.
 */
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: `hasColor` is internal to paratext, which exports only `terminal-link` over it
import { hasColor } from '../packages/paratext/src/hyperlinks.js';
// eslint-disable-next-line import-next/no-relative-packages -- by path, like the fork above: both sides of the comparison are source, never one side a stale dist/
import { colorLevel } from '../packages/roundel/src/policy.js';

interface Row {
  env: Record<string, string>;
  argv: string[];
  tty: boolean;
  platform: string;
}

const OFF_FLAGS = new Set(['--no-color', '--no-colors', '--color=false', '--color=never']);

/**
 * Why the two may answer differently on a row, or undefined when they must agree. Each reason
 * is a sentence about an incumbent, not about this repository.
 */
function declared({ env, argv, platform }: Row): string | undefined {
  if (env['NO_COLOR'] !== undefined && env['NO_COLOR'] !== '') return 'NO_COLOR: supports-color 10.2.2 does not read it; roundel R2 makes it win outright';
  const force = env['FORCE_COLOR'];
  if (force !== undefined && !/^(?:\d+|true|false|)$/.test(force)) return "FORCE_COLOR that is not a bare decimal (`1e1`, ` 2`, `1.0`): 10.2.2 parseInt's it into a level, chalk 6's copy reads it as unset";
  if (force !== undefined && force !== '0' && force !== 'false' && argv.some((a) => OFF_FLAGS.has(a))) return 'an off flag beside a FORCE_COLOR that is on: supports-color lets the variable win, roundel takes the flag typed for this run (R2)';
  if (platform === 'win32') return 'win32: supports-color colours any Windows TTY; roundel refuses platform detection (R2)';
  return undefined;
}

const FORCE = [undefined, '', '0', '1', '2', '3', '9', 'true', 'false', '1e1', ' 2', '1.0', 'unicorn', '-1', '01'];
const NO_COLOR = [undefined, '1', ''];
const FLAGS = [[], ['--no-color'], ['--no-colors'], ['--color'], ['--colors'], ['--color=256'], ['--color=16m'], ['--color=never'], ['--color=always'], ['--color=24bit'], ['--', '--color']];
const TERMS = [undefined, 'xterm-256color', 'xterm', 'dumb', 'screen'];
const RUNS: Record<string, string>[] = [{}, { CI: 'true', GITHUB_ACTIONS: 'true' }, { CI: 'true', TRAVIS: '1' }, { CI: 'true' }, { CI: '' }, { TF_BUILD: '1', AGENT_NAME: 'a' }, { COLORTERM: 'truecolor' }, { COLORTERM: '24bit' }];

/** Every combination of one value from each axis — the grid, without eight nested loops. */
const product = <T>(axes: readonly (readonly T[])[]): T[][] => axes.reduce<T[][]>((acc, axis) => acc.flatMap((prefix) => axis.map((v) => [...prefix, v])), [[]]);

function rows(): Row[] {
  const grid = product<unknown>([['linux', 'win32'], [true, false], FORCE, NO_COLOR, TERMS, RUNS, FLAGS]);
  return grid.map(([platform, tty, force, noColor, term, run, argv]) => {
    const env: Record<string, string> = { ...(run as Record<string, string>) };
    if (typeof force === 'string') env['FORCE_COLOR'] = force;
    if (typeof noColor === 'string') env['NO_COLOR'] = noColor;
    if (typeof term === 'string') env['TERM'] = term;
    return { env, argv: argv as string[], tty: tty as boolean, platform: platform as string };
  });
}

const paratext = ({ env, argv, tty, platform }: Row): boolean => hasColor(env, argv, platform, tty);
const roundel = ({ env, argv, tty }: Row): boolean => colorLevel({ env, argv, isTTY: { stdout: tty } }) > 0;

describe('paratext’s supports-color fork and roundel’s policy', () => {
  const all = rows();
  const differing = all.filter((row) => paratext(row) !== roundel(row));

  it('agree on every row that no declared reason covers', () => {
    const undeclared = differing
      .filter((row) => declared(row) === undefined)
      .slice(0, 10)
      .map((row) => `${JSON.stringify(row)} paratext=${String(paratext(row))} roundel=${String(roundel(row))}`);
    expect(undeclared, 'a new difference between the two colour answers: fix the one that is not faithful to its incumbent').toEqual([]);
  });

  it('declares no reason that no row needs — each one still describes a real difference', () => {
    const reasons = new Set(differing.map(declared));
    const unused = [...new Set(all.map(declared))].filter((r) => r !== undefined && !reasons.has(r));
    expect(unused, 'a declared difference no longer happens — delete it').toEqual([]);
  });

  it('agrees on most of the grid, so agreement is not a vacuous pass', () => {
    expect(all.length).toBeGreaterThan(10_000);
    expect(all.filter((row) => declared(row) === undefined && paratext(row)).length).toBeGreaterThan(1_000);
    expect(all.filter((row) => declared(row) === undefined && !paratext(row)).length).toBeGreaterThan(1_000);
  });
});
