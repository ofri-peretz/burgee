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
 *   - An audit on 2026-09-28 found the same thing thirteen more ways — a repaint that counted
 *     `\n`s and ignored wrap, a prompt that asked `isTTY && !CI` and so prompted an agent, a
 *     raw-mode toggle that took the keyboard from its owner — and each became a shape below.
 *
 * A façade may reproduce an incumbent's **API and behaviour** — that is the compatibility claim,
 * and `burgee/commander` exists to do exactly that. What it may not do is reimplement the
 * **mechanism** a layer owns. `burgee/src/yargs/cliui.ts` is the model: a yargs façade that
 * takes `width`, `strip` and `wrap` from linegauge and keeps only yargs' own layout.
 *
 * **What this cannot see, stated plainly.** The most common duplication of all is measuring
 * display text with `.length`, and no pattern can find it: `.length` on a rendered string is
 * indistinguishable from `.length` on anything else without knowing what the variable holds.
 * `burgee/src/help.ts` did it in five places — a CJK or emoji command name mis-measured its help
 * column — until it took `width` and `widest` from linegauge (`help-width.test.ts` pins that),
 * and it was found by a person reading the file, not by this test. `config-explain.ts` had the
 * same `.padEnd` and was found the same way. Everything below is a shape that cannot be anything
 * but a layer's job; the rest still needs eyes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');

interface Job {
  /**
   * The packages whose job this is. Files inside any of them are exempt by definition. Usually
   * one; a CSI or OSC literal has four, because the cursor, the grid, colour and the escape
   * table each legitimately spell one.
   */
  owners: string[];
  what: string;
  /** A shape that cannot be anything but that job. Exactly one of `shape` and `all`. */
  shape?: RegExp;
  /** Shapes that are that job only together, in one file — `split('\n').length` beside a cursor-up. */
  all?: RegExp[];
  /**
   * A file matching this is not doing the job by hand. Used where the owner's own import is what
   * makes an otherwise suspicious shape correct: `split('\n').length` over text `linegauge/wrap`
   * hard-wrapped *is* the row count, and a function named `wrap` in a file importing linegauge is
   * the façade name over linegauge's `wrap` (`yargs/cliui.ts`'s `stripAnsi` and `stringWidth`).
   */
  except?: RegExp;
}

/**
 * An escape introducer, however it is spelled in source: `\u001b`, `\x1b`, `\u{1b}`, `\033`, the
 * raw byte, or `${ESC}` — the name every file in this repository gives it.
 */
const E = String.raw`(?:\\u001[bB]|\\x1[bB]|\\u\{1[bB]\}|\\033|\x1b|\$\{ESC\})`;
/** A file that imports linegauge, root or subpath. */
const IMPORTS_LINEGAUGE = /from\s+['"]linegauge(?:\/[a-z-]+)?['"]/;
const MEASURERS = 'wrap|wordWrap|textWrap|truncate|stripAnsi|stringWidth|visibleWidth';

const JOBS: Job[] = [
  { owners: ['bellpull'], what: 'spawning a subprocess', shape: /from\s+['"]node:child_process['"]|require\(\s*['"]child_process['"]/ },
  { owners: ['bellpull'], what: 'resolving an executable across platforms', shape: /PATHEXT|['"]npm\.cmd['"]/ },
  { owners: ['bellpull'], what: 'looking a command up on PATH', shape: /env\s*(?:\[\s*['"](?:PATH|Path)['"]\s*\]|\.(?:PATH|Path)\b)/ },
  { owners: ['closeout'], what: 'registering a signal handler', shape: /\.on\(\s*['"]SIG[A-Z]+['"]/ },
  { owners: ['closeout'], what: 'hiding or showing the cursor', shape: /\?25[lh]/ },
  { owners: ['closeout'], what: 'switching raw mode', shape: /\.setRawMode(?:\?\.)?\(/ },
  { owners: ['closeout'], what: 'hooking process exit', shape: /\.on\(\s*['"](?:exit|beforeExit|unhandledRejection|uncaughtException)['"]/ },
  { owners: ['roundel'], what: 'reading a colour variable', shape: /\[\s*['"](?:NO_COLOR|FORCE_COLOR|COLORTERM|CLICOLOR(?:_FORCE)?)['"]\s*\]/ },
  { owners: ['roundel'], what: 'deciding whether this is CI', shape: /\[\s*['"]CI['"]\s*\]|['"]CI['"]\s+in\b/ },
  // `x = dirname(y)`, then `x` compared: how every hand-written upward walk knows it hit the root.
  { owners: ['seniority'], what: 'walking up the directory tree', shape: /(\w+)\s*=\s*dirname\(\s*\w+\s*\)[\s\S]{0,200}?(?:\b\1\s*===|===\s*\1\b)/ },
  { owners: ['seniority'], what: 'naming a .env file', shape: /['"`]\.env(?![\w$])/ },
  { owners: ['caique'], what: 'decoding keypresses', shape: /emitKeypressEvents|['"]keypress['"]/ },
  { owners: ['flagstaff'], what: 'carrying spinner frames', shape: /['"`]⠋/ },
  {
    owners: ['linegauge'],
    what: 'matching ANSI escapes with a regex',
    shape: new RegExp(String.raw`(?:(?:^|[=(,:;!&|?{}[\s])\/(?![/*])|RegExp\(\s*[\x60'"])[^\n]*?${E}\\{0,2}\[`, 'm'),
  },
  {
    owners: ['linegauge'],
    what: 'counting painted rows by their newlines',
    all: [/\.split\(\s*['"]\\n['"]\s*\)\.length/, new RegExp(String.raw`cursorUp\(|(?:${E}\[|\$\{CSI\})(?:\d*|\$\{[^}]+\})A`)],
    except: IMPORTS_LINEGAUGE,
  },
  {
    owners: ['linegauge'],
    what: 'measuring, wrapping or stripping text by hand',
    shape: new RegExp(String.raw`\bfunction\s+(?:${MEASURERS})\s*[(<]|\b(?:const|let|var)\s+(?:${MEASURERS})\s*(?::[^=;\n]+)?=\s*(?:async\s*)?(?:function\b|\([^()]*\)\s*(?::[^=;\n]+)?=>|[A-Za-z_$][\w$]*\s*=>)`),
    except: IMPORTS_LINEGAUGE,
  },
  { owners: ['paratext', 'linegauge', 'roundel', 'closeout'], what: 'spelling a CSI or OSC sequence', shape: new RegExp(String.raw`['"\x60]${E}[\[\]]`) },
];

/**
 * Where a job is still done by hand, and why it has not moved yet. This list may only shrink —
 * every entry is a layer that exists and a caller that has not adopted it, or a façade whose
 * incumbent does the job itself and is graded on doing it the same way.
 *
 * Entries marked **moves in #NNN** have an open PR that removes them; the "keeps the list
 * honest" test below is what deletes each one when it lands.
 */
const KNOWN: Record<string, string> = {
  // ── Standing: a façade reproducing its incumbent, or a job that cannot move, each with the why.
  'paratext/src/csi.ts':
    "`cursorHide` and `cursorShow` are two members of `ansi-escapes`' public surface, which the drop-in has to export as constants (D-138). `closeout/cursor` owns *doing* it; importing closeout here would add its whole installed tree (~103 KB) to paratext's, against paratext's own weight ceiling, for two string literals.",
  'paratext/src/hyperlinks.ts':
    "a declared fork of supports-color 10.2.2 — the copy supports-hyperlinks 4.5.0 depends on — for `paratext/terminal-link`, graded case by case against the real package. paratext is a leaf and may not import roundel (no leaf-to-leaf edge); roundel follows chalk 6's newer vendored copy, which differs on purpose in a few rows, so the fork's colour and CI reads stay.",
  'burgee/src/commander/command.ts':
    "`useColor()` is commander 14's own rule — `NO_COLOR` and `FORCE_COLOR=0|false` off, `FORCE_COLOR` or `CLICOLOR_FORCE` on, otherwise the stream decides — graded by commander's suite (1360 / 1360). roundel's policy answers a different question, and routing commander through it would change what a migrated program prints.",
  'flagstaff/src/cli-table3.ts':
    "cli-table3's own `utils` — its SGR regex and the escape codes it re-opens across a wrapped cell — ported for the façade and graded by cli-table3's suite. Measurement itself is linegauge's (`measure`); what stays is the incumbent's cell-colour bookkeeping.",
  'flagstaff/src/ora.ts':
    "is-interactive as ora inlines it — the *stream's* TTY, `TERM=dumb`, `'CI' in env` — which is ora's own definition of an animated spinner and differs from roundel's `interactive()` (stdin, agents), so it stays ora's. Its raw mode moved in #680 and the synchronized-output pair in #684.",
  'flagstaff/src/projection.ts':
    "a release branch is fixing this file's row count now; it is left alone here until that lands, and then its repaint belongs to linegauge's `lineCount` and paratext's CSI like every other one.",
  'caique/src/inquirer-theme.ts':
    "`@inquirer/core`'s default theme carries its own spinner frames and interval, which `usePrefix` reads and the incumbent's suite asserts; they are theme data of a façade, not a spinner flagstaff could draw.",
  'caique/src/clack-core.ts':
    "caique/clack's port of `@clack/core` (#638, after this audit): its raw-mode toggle, `isCI()` and cursor sequences are the incumbent's, graded 16 / 16. Moving them onto closeout, roundel and paratext is the same work #680, #684 and #678 do for the rest of caique, and has not been done for this file yet.",
  'caique/src/clack-output.ts': "caique/clack's spinner and progress output (#638), with `@clack/prompts`' cursor sequences; the same follow-up as `clack-core.ts`.",
  'burgee/src/brand.ts':
    "wraps the subtitle of an SVG brand card, set in a monospace face where one character is one advance by construction. It is layout on a drawing, not text measured against a terminal, and has nothing of linegauge's to call.",
  'burgee/src/pkg.ts':
    "`nearestPackage` runs on every start-up (V4), and burgee's core bundle is 24,277 B against a 24,282 B ceiling. `findUpSync` from `seniority/find-up` measured 24,924 B (+647) and the `seniority` root's `search` 29,639 B; neither nets out (D-182, #683).",
  'burgee/src/yargs/shim.ts':
    "escalade's `findUp(start, callback)` for the yargs façade: a callback handed each directory's `readdir` listing. seniority's spec keeps its walk an override target for `find-up` only and declines to publish a second discovery product in escalade's shape (R5, D-182).",
  'compat-oracle/src/run.ts': 'runs each vendored suite in a child process. Internal tooling, never published — but it is still bellpull\'s job, and it is where the executable-resolution bug would bite CI first.',
  'compat-oracle/src/vendor.ts': '`git clone` and `git rev-parse`. Same as above.',
  'burgee/src/pkg.ts':
    "`nearestPackage` runs on every start-up (V4), and burgee's core bundle is 24,277 B against a 24,282 B ceiling. `findUpSync` from `seniority/find-up` measured 24,924 B (+647: the symlink-cycle guard, the depth limit and the generator), and `search` from the `seniority` root 29,639 B. Neither nets out, so the eighteen-line walk stays until the core finds the bytes.",
  'burgee/src/yargs/shim.ts':
    "escalade's `findUp(start, callback)`, ported for the yargs façade: the callback receives each directory and its `readdir` listing and returns a name, and a `start` that is a file begins at its directory. seniority's spec (R5, and its rejected alternative on publishing the discovery plumbing) keeps the walk an override target for `find-up` only, not a second plumbing product with escalade's shape, so there is nothing of seniority's for it to call.",
  'burgee/src/commander/command.ts':
    "`useColor()` is commander 14's own colour rule, ported as commander has it — `NO_COLOR` and `FORCE_COLOR=0|false` off, `FORCE_COLOR` or `CLICOLOR_FORCE` on, otherwise the stream decides. It is the façade's graded behaviour (1360 / 1360), not a mechanism: roundel's policy answers a different question (a level, with `--color` flags and CI vendors) and routing commander through it would change what a migrated program prints.",
  'paratext/src/hyperlinks.ts':
    "a declared fork of supports-color 10.2.2, the version supports-hyperlinks 4.5.0 depends on, graded against the real package case by case. paratext is a leaf and may not import roundel (PLAN's architecture rule: no leaf-to-leaf edge), and roundel follows chalk 6's newer vendored copy, which differs from 10.2.2 on purpose in three rows. `scripts/colour-fork-parity.test.ts` holds the two to agreement everywhere else.",
  'compat-oracle/src/upstream.ts':
    "`execFileSync('npm', …)` with no Windows guard — the exact bug bellpull exists to prevent, and the one `burgee/src/shape.test.ts` already works around with `shell: true`, which is the spelling cross-spawn refuses because it reopens command injection.",
  // ── Moving: an open PR takes each of these onto its owner.
};

/**
 * The ceiling on KNOWN, re-baselined on 2026-09-28 (D-180). The rule used to be "at most 4",
 * written when the lock knew four shapes; it now knows seventeen, and they found eighteen more
 * files. It was 22 on the day the shapes were written; #683 moved meow's walk, #677
 * testing-helpers' regex and #684 the CSI in inquirer-screen and log-update, and #678 help's
 * colour policy and caique's `decide`, all before this landed: sixteen. Like every
 * ratchet here it only goes down: lower it when an entry leaves, never raise it to admit one.
 */
const CEILING = 16;

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

/** Whether `body` does `job` by hand. */
function does(job: Job, body: string): boolean {
  if (job.except?.test(body) === true) return false;
  if (job.all !== undefined) return job.all.every((shape) => shape.test(body));
  return job.shape?.test(body) === true;
}

function offenders(): { file: string; job: Job }[] {
  return sourcesByPackage().flatMap(({ pkg, file }) => {
    const body = code(readFileSync(join(PACKAGES, file), 'utf8'));
    return JOBS.filter((job) => !job.owners.includes(pkg) && does(job, body)).map((job) => ({ file, job }));
  });
}

describe('no package keeps an inline implementation of a layer’s job', () => {
  it('finds nothing that is not already written down, with a reason', () => {
    const undeclared = offenders()
      .filter((o) => KNOWN[o.file] === undefined)
      .map((o) => `${o.file} — ${o.job.what}, which is ${o.job.owners[0] ?? '?'}'s job`);
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
    // Recorded rather than derived, so adding an entry is a deliberate edit someone reviews.
    expect(Object.keys(KNOWN).length, 'a new inline implementation was added — use the layer instead').toBeLessThanOrEqual(CEILING);
  });

  it('every shape it looks for is owned by packages that exist', () => {
    const family = readdirSync(PACKAGES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    expect(JOBS.flatMap((j) => j.owners).filter((o) => !family.includes(o)), 'a job is owned by no package').toEqual([]);
  });

  it('every job is either one shape or all of several, never both and never neither', () => {
    expect(JOBS.filter((j) => (j.shape === undefined) === (j.all === undefined)).map((j) => j.what)).toEqual([]);
  });
});

/** The job named `what`, or a thrown error naming the case that asked for it. */
function job(what: string): Job {
  const found = JOBS.find((j) => j.what === what);
  if (found === undefined) throw new Error(`no job ${what}`);
  return found;
}

/**
 * Each shape against a line it must find and a line it must not. A shape that matches nothing
 * would pass the suite above on any repository, which is the defect the header describes; these
 * are what prove every shape can fail.
 */
describe('every shape finds its job and only its job', () => {
  const CASES: [string, string, string][] = [
    ['looking a command up on PATH', "const dirs = env['PATH'].split(delimiter);", "const PATH_LIKE = 'path';"],
    ['switching raw mode', 'stdin.setRawMode?.(true);', 'setRawMode?(raw: boolean): unknown;'],
    ['hooking process exit', "process.on('exit', restore);", "emitter.on('exits', f);"],
    ['reading a colour variable', "if (env['NO_COLOR']) return 0;", "const NAME = 'NO_COLOR_DOCS';"],
    ['deciding whether this is CI', "return 'CI' in env;", "const CIRCLE = env['CIRCLECI'];"],
    ['walking up the directory tree', 'const up = dirname(dir);\n    if (up === dir) return;', 'const parent = dirname(file);'],
    ['naming a .env file', "const at = join(cwd, '.env.local');", "const e = '.environment';"],
    ['decoding keypresses', "input.on('keypress', onKey);", "const keys = 'press';"],
    ['carrying spinner frames', "const frames = ['⠋', '⠙'];", "const dot = '·';"],
    ['matching ANSI escapes with a regex', 'text.replace(/\\u001b\\[[0-9;]*m/g, "")', "const s = '\\u001b[31m';"],
    ['counting painted rows by their newlines', "painted = frame.split('\\n').length;\nwrite(`${CSI}${n}A`);", "const rows = text.split('\\n').length;"],
    ['measuring, wrapping or stripping text by hand', 'function wrap(text: string, cols: number) {}', 'const wrap = (this.options.wordWrap as boolean) ?? true;'],
    ['spelling a CSI or OSC sequence', 'const up = `${ESC}[1A`;', "const ESC = '\\u001B';"],
  ];
  it.each(CASES)('%s', (what, hit, miss) => {
    expect(does(job(what), hit), hit).toBe(true);
    expect(does(job(what), miss), miss).toBe(false);
  });

  it('lets a file that imports linegauge name its façade functions after the incumbent', () => {
    const cliui = "import { strip } from 'linegauge/strip';\nexport const stripAnsi = (s: string) => strip(s);";
    expect(does(job('measuring, wrapping or stripping text by hand'), cliui)).toBe(false);
    expect(does(job('measuring, wrapping or stripping text by hand'), 'export const stripAnsi = (s: string) => s.replace(/x/g, "");')).toBe(true);
  });
});
