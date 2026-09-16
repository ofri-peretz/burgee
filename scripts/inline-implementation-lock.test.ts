/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Nobody keeps an inline implementation of a job a layer owns.
 *
 * `layer-boundaries-lock` forbids *depending* on an incumbent a sibling replaces — reaching for
 * `chalk` instead of `roundel`. That turned out to be the easy half. The expensive half is
 * writing the sibling's code by hand, which carries no dependency for a checker to find, and it
 * is what this repository had actually done:
 *
 *   - `flagstaff/src/cursor.ts` and `caique/src/raw.ts` each reimplemented `closeout`'s
 *     cursor-restore-on-death. With closeout's own copy that made **three**, in a family whose
 *     three files each argue in their comments that a second copy is the danger. Both are gone
 *     now, and removing them found two bugs neither package's suite could see: caique never
 *     restored the cursor on a signal at all (`hide=1 show=0` on SIGINT, SIGTERM and SIGHUP),
 *     and flagstaff's process-wide flag was not a guard against a duplicate restore but a
 *     *lost* one — a spinner and a hoisted frame together left stderr's cursor hidden.
 *   - Four files spawn subprocesses with raw `node:child_process` while `bellpull` — the package
 *     whose whole job that is — was seven lines exporting its own name.
 *
 * A façade may reproduce an incumbent's **API and behaviour** — that is the compatibility claim,
 * and `burgee/commander` exists to do exactly that. What it may not do is reimplement the
 * **mechanism** a layer owns. `burgee/src/yargs/cliui.ts` is the model: a yargs façade that
 * takes `width`, `strip` and `wrap` from linegauge and keeps only yargs' own layout.
 *
 * **What this cannot see, stated plainly.** The most common duplication of all is measuring
 * display text with `.length`, and no pattern can find it: `.length` on a rendered string is
 * indistinguishable from `.length` on anything else without knowing what the variable holds.
 * `burgee/src/help.ts` does it in five places today — a CJK or emoji command name mis-measures
 * its help column — and it was found by a person reading the file, not by this test. Everything
 * below is a shape that cannot be anything but a layer's job; the rest still needs eyes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');

interface Job {
  /** The package whose job this is. Files inside it are exempt by definition. */
  owner: string;
  what: string;
  /** A shape that cannot be anything but that job. */
  shape: RegExp;
}

const JOBS: Job[] = [
  { owner: 'bellpull', what: 'spawning a subprocess', shape: /from\s+['"]node:child_process['"]|require\(\s*['"]child_process['"]/ },
  { owner: 'bellpull', what: 'resolving an executable across platforms', shape: /PATHEXT|['"]npm\.cmd['"]/ },
  { owner: 'closeout', what: 'registering a signal handler', shape: /\.on\(\s*['"]SIG[A-Z]+['"]/ },
  { owner: 'closeout', what: 'hiding or showing the cursor', shape: /\?25[lh]/ },
];

/**
 * Where a job is still done by hand, and why it has not moved yet. This list may only shrink —
 * every entry is a layer that exists and a caller that has not adopted it.
 */
const KNOWN: Record<string, string> = {
  'burgee/src/commander/command.ts':
    "commander's `executableSubcommand` spawns a sub-binary and forwards five signals to it. Both are bellpull's job; bellpull was a seven-line placeholder when this was written, and the engine lane adopts it once bellpull grades against cross-spawn's suite.",
  'compat-oracle/src/run.ts': 'runs each vendored suite in a child process. Internal tooling, never published — but it is still bellpull\'s job, and it is where the executable-resolution bug would bite CI first.',
  'compat-oracle/src/vendor.ts': '`git clone` and `git rev-parse`. Same as above.',
  'compat-oracle/src/upstream.ts':
    "`execFileSync('npm', …)` with no Windows guard — the exact bug bellpull exists to prevent, and the one `burgee/src/shape.test.ts` already works around with `shell: true`, which is the spelling cross-spawn refuses because it reopens command injection.",
};

const sources = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'vendor', '__fixtures__', 'fixtures'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
};

/**
 * Comments removed, string literals kept.
 *
 * Every shape below lives *inside* a string — an import specifier, a signal name, an escape
 * sequence — so blanking quoted spans, which is what the process-reference lock does, finds
 * nothing at all. The first version of this file did exactly that and reported a clean repo
 * while four files spawned subprocesses. A checker that cannot fail is the defect this
 * repository keeps catching in its own checkers.
 *
 * The cost is that prose inside a string can match. `hosts.ts` carries long `note:` fields
 * about signals, which is why the shapes are anchored to syntax — `.on('SIG…')` with the call
 * parenthesis, `from 'node:child_process'` with the keyword — rather than to bare words.
 */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Every package's non-test sources, as repo-relative POSIX paths. */
function sourcesByPackage(): { pkg: string; file: string }[] {
  const out: { pkg: string; file: string }[] = [];
  for (const entry of readdirSync(PACKAGES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let files: string[] = [];
    try {
      files = sources(join(PACKAGES, entry.name, 'src'));
    } catch {
      continue; // no `src` — nothing to check
    }
    for (const f of files) out.push({ pkg: entry.name, file: f.slice(PACKAGES.length + 1).split(sep).join('/') });
  }
  return out;
}

function offenders(): { file: string; job: Job }[] {
  return sourcesByPackage().flatMap(({ pkg, file }) => {
    const body = code(readFileSync(join(PACKAGES, file), 'utf-8'));
    return JOBS.filter((job) => job.owner !== pkg && job.shape.test(body)).map((job) => ({ file, job }));
  });
}

describe('no package keeps an inline implementation of a layer’s job', () => {
  it('finds nothing that is not already written down, with a reason', () => {
    const undeclared = offenders()
      .filter((o) => KNOWN[o.file] === undefined)
      .map((o) => `${o.file} — ${o.job.what}, which is ${o.job.owner}'s job`);
    expect(undeclared, 'use the layer, or add it to KNOWN with the reason it cannot move yet').toEqual([]);
  });

  it('keeps the list honest — an entry that no longer offends must be removed', () => {
    // Otherwise the list is where the problem goes to sit, and the ratchet never notices the
    // work was done. This is the assertion that fires when a lane finally adopts a layer.
    const live = new Set(offenders().map((o) => o.file));
    expect(
      Object.keys(KNOWN).filter((f) => !live.has(f)),
      'these no longer do a layer’s job by hand — delete them from KNOWN',
    ).toEqual([]);
  });

  it('only goes down', () => {
    // Recorded rather than derived, so adding a fifth site is a deliberate edit someone reviews.
    expect(Object.keys(KNOWN).length, 'a new inline implementation was added — use the layer instead').toBeLessThanOrEqual(4);
  });

  it('every shape it looks for is owned by a package that exists', () => {
    const family = readdirSync(PACKAGES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    expect(JOBS.filter((j) => !family.includes(j.owner)).map((j) => j.owner), 'a job is owned by no package').toEqual([]);
  });
});
