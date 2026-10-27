/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the changeset lock (`scripts/changeset-lock.mts`).
 *
 * burgee 1.5.0 (#1064) and flagstaff 1.2.0 (#827) shipped as minors a behaviour commander 13 and
 * boxen 9 shipped as majors. Their changesets, verbatim below, are refused at `minor` and accepted
 * at `major`; across all 375 changesets ever added to this repository the lock flags those two and
 * no other (measured 2026-10-18).
 *
 * This file was `release-window.test.ts` and also held the 7-day release window's cases, until
 * the owner removed the window (D-20261027-no-release-window); `no-release-window-lock.test.ts`
 * holds that rule now.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { type Changeset, describes, formatChangeset, type IncumbentMajorRow, type Io, lockViolations, main, parseChangeset, readChangesets, sentences } from './changeset-lock.mjs';
import { scratchDirs } from './scratch-dir.js';

/** Every scratch directory this file makes, removed after its last test (`scripts/scratch-dir.ts`). */
const scratchDir = scratchDirs();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROWS = (JSON.parse(readFileSync(join(ROOT, '.sdlc/bands/incumbent-majors.json'), 'utf8')) as { rows: IncumbentMajorRow[] }).rows;

const cs = (file: string, releases: Changeset['releases'], summary = 'A change.'): Changeset => ({ file, releases, summary });

describe('parseChangeset — the file changesets writes', () => {
  it('reads quoted, unquoted and scoped names, skips blank and comment lines, and keeps the summary', () => {
    const text = '---\n"burgee": minor\nroundel: patch\n# a comment\n\n\'@scope/pkg\': major\nflagstaff: "none"\n---\n\nThe summary.\n\nSecond paragraph.\n';
    expect(parseChangeset('a.md', text)).toEqual({
      file: 'a.md',
      releases: [
        { name: 'burgee', type: 'minor' },
        { name: 'roundel', type: 'patch' },
        { name: '@scope/pkg', type: 'major' },
        { name: 'flagstaff', type: 'none' },
      ],
      summary: 'The summary.\n\nSecond paragraph.',
    });
  });

  it('reads an empty changeset (`changeset --empty`) and CRLF line ends', () => {
    expect(parseChangeset('e.md', '---\n---\n')).toEqual({ file: 'e.md', releases: [], summary: '' });
    expect(parseChangeset('c.md', '---\r\n"burgee": patch\r\n---\r\n\r\nFix.\r\n').releases).toEqual([{ name: 'burgee', type: 'patch' }]);
  });

  it('refuses a file with no front matter, or a release line it cannot read', () => {
    expect(() => parseChangeset('x.md', 'no front matter')).toThrow('x.md: no front matter');
    expect(() => parseChangeset('y.md', '---\n"burgee": huge\n---\n\nx\n')).toThrow('y.md: cannot read the release line "\\"burgee\\": huge"');
  });

  it('writes back what it reads', () => {
    const original = cs('r.md', [{ name: 'burgee', type: 'minor' }, { name: 'roundel', type: 'patch' }], 'Text.');
    expect(formatChangeset(original)).toBe('---\n"burgee": minor\n"roundel": patch\n---\n\nText.\n');
    expect(parseChangeset('r.md', formatChangeset(original))).toEqual(original);
  });

  it('reads every changeset in a directory but its README, in name order, and nothing from a missing one', () => {
    const dir = scratchDir('changeset-lock-dir-');
    writeFileSync(join(dir, 'README.md'), '# not a changeset');
    writeFileSync(join(dir, 'config.json'), '{}');
    writeFileSync(join(dir, 'b.md'), '---\n"burgee": patch\n---\n\nb\n');
    writeFileSync(join(dir, 'a.md'), '---\n"roundel": minor\n---\n\na\n');
    expect(readChangesets(dir).map((c) => c.file)).toEqual(['a.md', 'b.md']);
    expect(readChangesets(join(dir, 'nowhere'))).toEqual([]);
  });
});

/** The changesets of the two minors that broke behaviour, verbatim from their commits. */
const PARSE_REFUSALS = readFixture('e8e02faec8', `---
"burgee": minor
---

A native command (\`defineCommand\`, \`defineProgram\`) refuses input it used to drop. Both are usage errors, exit 2, before anything runs:

- **More positionals than the command declares.** \`demo greet ada extra\` against a command that takes one argument now says \`too many arguments: expected 1, got 2 ("extra")\`. Before, \`extra\` was silently dropped and the run exited 0. A variadic last argument still takes the rest, and words after \`--\` are still \`passthrough\`.
- **A single-value option given twice with different values.** \`--level info --level debug\` now says \`--level was given twice: "info" and "debug"\`. Before, \`info\` was silently dropped. The same value twice is still accepted, as are \`multiple\` options and booleans, and a value from the environment or config never conflicts with a flag.

Each refusal carries a \`fix\`: the line as typed with the surplus words removed, or with only the last value of the repeated flag kept, ready to run. Both messages are in the locale catalog, so a locale pack translates them; \`--json\` stays English.

A command that forwards its tail to a child process declares \`allowExcess: true\` to keep today's behaviour: the surplus reaches \`ctx.positionals\`, and \`--schema\` publishes \`excess: true\` for it. The commander and yargs drop-ins are unchanged.
`);
const BOXEN_9 = readFixture('cd345466ed', `---
"flagstaff": minor
---

\`flagstaff/boxen\` is boxen 9.0.0's API, graded 213 / 213 by boxen 9's own suite (control 213 / 213). New options: \`footer\` and \`footerAlignment\`, \`titleColor\`, \`borderBackgroundColor\`, \`maxWidth\`; a tab, a backspace or a cursor move inside the text, a label or a border is written the way a terminal would draw it; a border side may be wider than one column or empty; and a size or spacing that is not a usable number means its default. Two of boxen 8's answers change with boxen 9: a hex colour must be real hex (\`#GGG\` now throws, as it does in boxen 9), and \`vertical\` / \`horizontal\` are a fallback for the sides rather than an override of them.
`);

function readFixture(commit: string, text: string): Changeset {
  return parseChangeset(`${commit}.md`, text);
}

/** Changesets that mention an incumbent's major, or its words, without making the change: each must pass. */
const NEAR_MISSES: Changeset[] = [
  cs('migrate-esm-require.md', [{ name: 'burgee', type: 'patch' }], '`burgee migrate` now rewrites `require()` of the incumbents that ship ESM only: ansi-escapes, chalk 6, ora 9.'),
  cs('completions-negation.md', [{ name: 'burgee', type: 'patch' }], 'so `--no-skip-blank`, `--color` (for a lone `--no-color`) and `--no-version` were each a TAB away and each `unknown option`.'),
  cs('mcp-multiword.md', [{ name: 'burgee', type: 'patch' }], 'Under `burgee/commander`, a lone `--no-color` is advertised as `noColor` (flag `--no-color`) instead of a `--color` commander never accepts.'),
  cs('burgee-boxen-9-dotenv-18.md', [{ name: 'burgee', type: 'minor' }], '`burgee migrate` reads the new graded releases: boxen 9.0.0 (`flagstaff/boxen`, level), dotenv 18.0.5. A project on boxen 8 is now listed under `offMajor` and left alone.'),
  cs('preflight.md', [{ name: 'burgee', type: 'minor' }], '`burgee migrate` reports a project whose `engines.node` is below burgee\'s floor.'),
];

/** One summary each row must match, so no row is dead weight. */
const SAMPLES: Record<string, string> = {
  'excess command-arguments are an error by default': 'A command now refuses excess arguments.',
  'an unsupported option flag throws': 'An unsupported option flag now throws.',
  'a duplicate option flag or command name throws': 'Declaring a duplicate option flag throws.',
  'a lone --no-* option changes its default': 'A lone `--no-color` now defaults to true.',
  'the singleton (`yargs.foo`, `yargs().argv`) is removed, and command names are no longer derived from modules': 'The yargs singleton is gone from burgee/yargs.',
  'a colour that is not real hex throws (`#GGG`)': 'A hex colour that is not valid now throws.',
  '`vertical` / `horizontal` are fallbacks for the sides, not overrides': '`vertical` / `horizontal` are now a fallback.',
  'a numeric FORCE_COLOR is an exact level, not a minimum': 'A numeric `FORCE_COLOR` is now an exact level.',
  'the minimum Node version is raised': 'burgee now requires Node >= 22.',
  'CommonJS `require()` is no longer supported (ESM only)': 'roundel is ESM only now.',
};

/** The same changeset at another bump. */
const as = (c: Changeset, type: Changeset['releases'][number]['type']): Changeset => ({ ...c, releases: c.releases.map((r) => ({ ...r, type })) });

describe('the changeset lock — a behaviour the incumbent shipped as a major is a major here', () => {
  it('refuses burgee 1.5.0 and flagstaff 1.2.0 at minor, naming the incumbent release', () => {
    const v = lockViolations([PARSE_REFUSALS, BOXEN_9], ROWS);
    expect(v.map((x) => [x.file, x.name, x.type, x.row.incumbent, x.row.version])).toEqual([
      ['e8e02faec8.md', 'burgee', 'minor', 'commander', '13.0.0'],
      ['cd345466ed.md', 'flagstaff', 'minor', 'boxen', '9.0.0'],
      ['cd345466ed.md', 'flagstaff', 'minor', 'boxen', '9.0.0'],
    ]);
  });

  it('refuses them at patch, and accepts them at major or none', () => {
    expect(lockViolations([as(PARSE_REFUSALS, 'patch')], ROWS)).toHaveLength(1);
    expect(lockViolations([as(PARSE_REFUSALS, 'major'), as(BOXEN_9, 'major'), as(BOXEN_9, 'none')], ROWS)).toEqual([]);
  });

  it('applies a row only to the packages that drop that incumbent in, or to every package for `*`', () => {
    expect(lockViolations([{ ...PARSE_REFUSALS, releases: [{ name: 'roundel', type: 'minor' }] }], ROWS)).toEqual([]);
    expect(lockViolations([cs('node.md', [{ name: 'roundel', type: 'minor' }], 'roundel now requires Node >= 22.')], ROWS).map((v) => v.row.behaviour)).toEqual(['the minimum Node version is raised']);
  });

  it.each(NEAR_MISSES.map((c) => [c.file, c] as const))('passes %s, which names an incumbent major without making the change', (_, c) => {
    expect(lockViolations([c], ROWS)).toEqual([]);
  });

  it('has a sample for every row, and every row matches its own sample and nothing in a plain summary', () => {
    expect(ROWS.map((r) => r.behaviour).toSorted()).toEqual(Object.keys(SAMPLES).toSorted());
    for (const row of ROWS) {
      const name = row.packages === '*' ? 'burgee' : (row.packages[0] as string);
      expect(lockViolations([cs('s.md', [{ name, type: 'minor' }], SAMPLES[row.behaviour] as string)], [row]), row.behaviour).toHaveLength(1);
      expect(lockViolations([cs('p.md', [{ name, type: 'minor' }], 'Adds a `--json` flag to `burgee check`.')], [row]), row.behaviour).toEqual([]);
    }
  });

  it('passes every changeset on this branch', () => {
    const lines: string[] = [];
    expect(main(io(ROOT, lines)), lines.join('')).toBe(0);
  });
});

/** An `Io` that reads `root` and collects what it writes. */
function io(root: string, out: string[] = []): Io {
  return { root, write: (t) => out.push(t) };
}

/** A scratch repository root: `.changeset/` and the lock's table. */
function scratch(changesets: Record<string, string>): string {
  const root = scratchDir('changeset-lock-root-');
  mkdirSync(join(root, '.changeset'));
  mkdirSync(join(root, '.sdlc/bands'), { recursive: true });
  writeFileSync(join(root, '.sdlc/bands/incumbent-majors.json'), JSON.stringify({ rows: ROWS }));
  for (const [file, text] of Object.entries(changesets)) writeFileSync(join(root, '.changeset', file), text);
  return root;
}

describe('main — what the workflow runs', () => {
  it('an ::error line per violation, naming the file, and exit 1', () => {
    const out: string[] = [];
    expect(main(io(scratch({ 'parse-refusals.md': formatChangeset(PARSE_REFUSALS) }), out))).toBe(1);
    expect(out.join('')).toContain('::error file=.changeset/parse-refusals.md::burgee is a minor, but this changeset describes "excess command-arguments are an error by default", which commander shipped as a major (commander@13.0.0;');
    expect(out.join('')).toContain('Make it "burgee": major');
  });

  it('prints its all-clear only when there is nothing to refuse', () => {
    const out: string[] = [];
    expect(main(io(scratch({ 'ok.md': '---\n"burgee": minor\n---\n\nAdds a flag.\n' }), out))).toBe(0);
    expect(out.join('')).toBe('changeset lock: 1 changeset(s), none below major for a behaviour an incumbent shipped as a major\n');
    const bad: string[] = [];
    main(io(scratch({ 'bad.md': formatChangeset(PARSE_REFUSALS) }), bad));
    expect(bad.join('')).not.toContain('changeset lock:');
  });

  it('runs as a script over this branch', () => {
    const lock = spawnSync(process.execPath, [join(ROOT, 'scripts/changeset-lock.mts')], { cwd: ROOT, encoding: 'utf8' });
    expect(lock.status, lock.stdout + lock.stderr).toBe(0);
    expect(lock.stdout).toMatch(/^changeset lock: \d+ changeset\(s\)/);
  });
});

/*
 * The cases below were written against the survivors of a Stryker run over the script
 * (2026-10-18): each holds a line a mutant changed without a test noticing.
 */

describe('parseChangeset — the edges of a release line', () => {
  it('keeps mismatched or lone quotes as written, and refuses a line that is all bump', () => {
    expect(parseChangeset('q.md', '---\n"x\': patch\n---\n').releases).toEqual([{ name: '"x\'', type: 'patch' }]);
    expect(parseChangeset('q.md', '---\n": patch\n---\n').releases).toEqual([{ name: '"', type: 'patch' }]);
    expect(() => parseChangeset('c.md', '---\n: minor\n---\n')).toThrow('c.md: cannot read the release line ": minor"');
  });

  it('reads an indented release line, skips a whitespace-only one, and keeps a carriage return inside a summary line', () => {
    expect(parseChangeset('i.md', '---\n   "burgee": minor\n   \n---\n\na\rb\n').releases).toEqual([{ name: 'burgee', type: 'minor' }]);
    expect(parseChangeset('i.md', '---\n"burgee": minor\n---\n\na\rb\n').summary).toBe('a\rb');
  });

  it('refuses an unclosed front matter, and one that does not open the file', () => {
    expect(() => parseChangeset('u.md', '---\n"burgee": minor\n\nsummary\n')).toThrow('u.md: no front matter');
    expect(() => parseChangeset('l.md', 'intro\n---\n"burgee": minor\n---\n')).toThrow('l.md: no front matter');
  });
});

describe('sentences and describes — a list of phrases must share one sentence', () => {
  it('splits after . ! or ? that end a word, and at a blank line, trimming each and dropping empties', () => {
    expect(sentences('One. Two! Three? Four\n\nFive.\nSix v1.2 seven')).toEqual(['One.', 'Two!', 'Three?', 'Four', 'Five.', 'Six v1.2 seven']);
    expect(sentences('Ends here.')).toEqual(['Ends here.']);
    expect(sentences('  ')).toEqual([]);
    expect(sentences('a.b. c')).toEqual(['a.b.', 'c']);
    expect(sentences('x\ny')).toEqual(['x\ny']);
  });

  it('matches a list only inside one sentence', () => {
    const row = ROWS.find((r) => r.incumbent === 'commander' && r.version === '15.0.0') as IncumbentMajorRow;
    expect(describes('A lone `--no-color` now defaults to off.', row)).toBe(true);
    expect(describes('A lone `--no-color` is advertised. Its default is untouched.', row)).toBe(false);
    expect(describes('A lone `--no-color` is advertised!\nDefaults follow.', row)).toBe(false);
    expect(describes('A lone `--no-color` is advertised?\n\nDefaults follow.', row)).toBe(false);
  });
});
