/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the release cadence (`.sdlc/intents/release-cadence/`).
 *
 * Two rules, and the workflows that run them:
 *
 * - **The window.** No non-fix release of a package within 7 days of its previous one; a fix is
 *   never delayed. `scripts/release-window.mts plan` decides before each Version PR refresh,
 *   `version` sets the held changesets aside while `changeset version` runs, and `publishable`
 *   is `release.yml`'s backstop. `.sdlc/intents/release-cadence/release-window.qnt` models it.
 * - **The changeset lock.** burgee 1.5.0 (#1064) and flagstaff 1.2.0 (#827) shipped as minors a
 *   behaviour commander 13 and boxen 9 shipped as majors. Their changesets, verbatim below, are
 *   refused at `minor` and accepted at `major`; across all 375 changesets ever added to this
 *   repository the lock flags those two and no other (measured 2026-10-18).
 *
 * Every case here fails on `main` before this change: the script, the table and the workflow
 * steps did not exist.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  changelogSection,
  type Changeset,
  daysOldEnough,
  describes,
  formatChangeset,
  type IncumbentMajorRow,
  type Io,
  isFix,
  isNonFixVersion,
  lockViolations,
  main,
  manifests,
  opensAt,
  parseChangeset,
  parts,
  planWindow,
  previousNonFix,
  publishable,
  readChangesets,
  registryTimes,
  runVersion,
  securityTagged,
  sentences,
  type Times,
  version,
  WINDOW_DAYS,
  type WindowPlan,
} from './release-window.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-18T12:00:00Z');
const ago = (days: number): string => new Date(NOW - days * DAY).toISOString();
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
    const dir = mkdtempSync(join(tmpdir(), 'release-window-dir-'));
    writeFileSync(join(dir, 'README.md'), '# not a changeset');
    writeFileSync(join(dir, 'config.json'), '{}');
    writeFileSync(join(dir, 'b.md'), '---\n"burgee": patch\n---\n\nb\n');
    writeFileSync(join(dir, 'a.md'), '---\n"roundel": minor\n---\n\na\n');
    expect(readChangesets(dir).map((c) => c.file)).toEqual(['a.md', 'b.md']);
    expect(readChangesets(join(dir, 'nowhere'))).toEqual([]);
  });
});

describe('what counts as a fix', () => {
  it('a patch or none bump, or any bump whose summary opens with Security:', () => {
    const plain = cs('p.md', []);
    expect(isFix(plain, { type: 'patch' })).toBe(true);
    expect(isFix(plain, { type: 'none' })).toBe(true);
    expect(isFix(plain, { type: 'minor' })).toBe(false);
    expect(isFix(plain, { type: 'major' })).toBe(false);
    expect(isFix(cs('s.md', [], 'Security: refuse a path outside the project.'), { type: 'minor' })).toBe(true);
    expect(securityTagged('  security : x')).toBe(true);
    expect(securityTagged('Not a Security: fix, the word is later.')).toBe(false);
  });

  it('a non-fix release is an x.y.0, and nothing but a plain version is read', () => {
    expect(isNonFixVersion('1.6.0')).toBe(true);
    expect(isNonFixVersion('2.0.0')).toBe(true);
    expect(isNonFixVersion('1.6.1')).toBe(false);
    expect(isNonFixVersion('1.7.0-rc.0')).toBe(false);
    expect(isNonFixVersion('created')).toBe(false);
    expect(parts('10.20.30')).toEqual([10, 20, 30]);
    expect(parts('1.2')).toBeUndefined();
  });
});

describe('previousNonFix — when the package last shipped a minor or a major', () => {
  const times: Times = { created: ago(90), modified: ago(1), '0.9.0': ago(60), '1.0.0': ago(20), '1.1.0': ago(9), '1.1.1': ago(2), '1.2.0-rc.0': ago(1), '1.10.0': 'not a date' };

  it('is the newest x.y.0 by version, ignoring fixes, prereleases, unreadable dates and the created / modified keys', () => {
    expect(previousNonFix(times)).toBe(Date.parse(ago(9)));
  });

  it('orders 1.10.0 above 1.9.0, minor before patch', () => {
    expect(previousNonFix({ '1.9.0': ago(3), '1.10.0': ago(30) })).toBe(Date.parse(ago(30)));
  });

  it('is in flight when main holds a newer x.y.0 than npm has', () => {
    expect(previousNonFix(times, '1.2.0')).toBe(Number.POSITIVE_INFINITY);
    expect(previousNonFix(times, '1.2.3'), 'patches on an unpublished 1.2.0 are still that release in flight').toBe(Number.POSITIVE_INFINITY);
  });

  it('is not in flight when main is on a published minor or behind npm', () => {
    expect(previousNonFix(times, '1.1.1')).toBe(Date.parse(ago(9)));
    expect(previousNonFix(times, '1.1.0')).toBe(Date.parse(ago(9)));
    expect(previousNonFix(times, '1.0.5'), 'an older manifest is not a release in flight').toBe(Date.parse(ago(9)));
    expect(previousNonFix(times, 'workspace:*')).toBe(Date.parse(ago(9)));
  });

  it('is nothing for a package npm has never seen, whatever main holds', () => {
    expect(previousNonFix({}, '0.1.0')).toBeUndefined();
    expect(previousNonFix({ '0.0.1': ago(3) }, '0.1.0'), 'a reservation patch is not a non-fix release').toBeUndefined();
  });

  it('counts only versions older than `before`, for the release that is publishing one', () => {
    expect(previousNonFix(times, undefined, '1.1.0')).toBe(Date.parse(ago(20)));
    expect(previousNonFix(times, undefined, '1.0.0')).toBe(Date.parse(ago(60)));
    expect(previousNonFix(times, undefined, '0.9.0')).toBeUndefined();
  });

  it('opens the window 7 days after it, and at once when there was none', () => {
    expect(WINDOW_DAYS).toBe(7);
    expect(opensAt(Date.parse(ago(9)))).toBe(Date.parse(ago(2)));
    expect(opensAt(undefined)).toBe(Number.NEGATIVE_INFINITY);
  });
});

/** Registry times per package, and main's manifest versions, as `planWindow` reads them. */
const state = (entries: Record<string, Times | undefined>, manifest: Record<string, string> = {}) =>
  new Map(Object.entries(entries).map(([name, times]) => [name, times === undefined ? undefined : { times, manifest: manifest[name] }]));

describe('planWindow — what the next Version PR carries', () => {

  it('releases a fix whatever the window says, and holds nothing', () => {
    const plan = planWindow([cs('f.md', [{ name: 'burgee', type: 'patch' }])], state({ burgee: { '1.6.0': ago(1) } }), NOW);
    expect(plan).toEqual({ releasable: true, changesets: [{ file: 'f.md', release: [{ name: 'burgee', type: 'patch' }], hold: [] }], held: [] });
  });

  it('releases a minor once the previous non-fix release is 7 days old, to the millisecond', () => {
    const week = planWindow([cs('m.md', [{ name: 'burgee', type: 'minor' }])], state({ burgee: { '1.6.0': ago(7) } }), NOW);
    expect(week.held).toEqual([]);
    expect(week.releasable).toBe(true);
    const justShort = planWindow([cs('m.md', [{ name: 'burgee', type: 'minor' }])], state({ burgee: { '1.6.0': new Date(NOW - 7 * DAY + 1).toISOString() } }), NOW);
    expect(justShort.held).toHaveLength(1);
  });

  it('holds a minor and a major inside the window, and says when it opens', () => {
    const plan = planWindow(
      [cs('m.md', [{ name: 'burgee', type: 'minor' }]), cs('M.md', [{ name: 'burgee', type: 'major' }])],
      state({ burgee: { '1.6.0': ago(3) } }),
      NOW,
    );
    expect(plan.releasable).toBe(false);
    expect(plan.held).toEqual([
      { file: 'm.md', name: 'burgee', type: 'minor', opens: new Date(NOW + 4 * DAY).toISOString() },
      { file: 'M.md', name: 'burgee', type: 'major', opens: new Date(NOW + 4 * DAY).toISOString() },
    ]);
  });

  it('splits a changeset: the fix in it releases now and the held minor waits', () => {
    const plan = planWindow([cs('mixed.md', [{ name: 'roundel', type: 'patch' }, { name: 'burgee', type: 'minor' }])], state({ burgee: { '1.6.0': ago(3) }, roundel: { '1.1.0': ago(30) } }), NOW);
    expect(plan.releasable).toBe(true);
    expect(plan.changesets).toEqual([{ file: 'mixed.md', release: [{ name: 'roundel', type: 'patch' }], hold: [{ name: 'burgee', type: 'minor' }] }]);
  });

  it('releases a patch for a package whose minor is held, in another changeset', () => {
    const plan = planWindow([cs('m.md', [{ name: 'burgee', type: 'minor' }]), cs('p.md', [{ name: 'burgee', type: 'patch' }])], state({ burgee: { '1.6.0': ago(3) } }), NOW);
    expect(plan.changesets.map((c) => [c.file, c.release.length, c.hold.length])).toEqual([
      ['m.md', 0, 1],
      ['p.md', 1, 0],
    ]);
    expect(plan.releasable).toBe(true);
  });

  it('releases a security minor inside the window', () => {
    const plan = planWindow([cs('s.md', [{ name: 'burgee', type: 'minor' }], 'Security: a new option to refuse symlinks.')], state({ burgee: { '1.6.0': ago(1) } }), NOW);
    expect(plan.held).toEqual([]);
  });

  it('holds a minor while the previous one is in flight, and when the registry did not answer', () => {
    const inFlight = planWindow([cs('m.md', [{ name: 'burgee', type: 'minor' }])], state({ burgee: { '1.6.0': ago(30) } }, { burgee: '1.7.0' }), NOW);
    expect(inFlight.held[0]?.opens).toBe('in flight');
    const unknown = planWindow([cs('m.md', [{ name: 'burgee', type: 'minor' }])], state({ burgee: undefined }), NOW);
    expect(unknown.held[0]?.opens).toBe('unknown: the registry did not answer');
    expect(planWindow([cs('f.md', [{ name: 'burgee', type: 'patch' }])], state({ burgee: undefined }), NOW).releasable, 'a fix never waits on the registry').toBe(true);
  });

  it('releases the first minor of a package npm has never seen, and holds nothing for an empty changeset', () => {
    expect(planWindow([cs('n.md', [{ name: 'newpkg', type: 'minor' }])], state({ newpkg: {} }), NOW).releasable).toBe(true);
    expect(planWindow([cs('e.md', [])], state({}), NOW)).toEqual({ releasable: false, changesets: [{ file: 'e.md', release: [], hold: [] }], held: [] });
  });

  it('judges each package by its own window', () => {
    const plan = planWindow([cs('two.md', [{ name: 'burgee', type: 'minor' }, { name: 'roundel', type: 'minor' }])], state({ burgee: { '1.6.0': ago(3) }, roundel: { '1.1.0': ago(8) } }), NOW);
    expect(plan.changesets[0]).toEqual({ file: 'two.md', release: [{ name: 'roundel', type: 'minor' }], hold: [{ name: 'burgee', type: 'minor' }] });
  });
});

/** A `.changeset/` with one wholly held changeset, one split and one that releases, and its plan. */
function workdir(): { dir: string; changesets: Changeset[]; plan: WindowPlan } {
  const dir = mkdtempSync(join(tmpdir(), 'release-window-version-'));
  const files = {
    'held.md': '---\n"burgee": minor\n---\n\nHeld whole.\n',
    'split.md': '---\n"roundel": patch\n"burgee": minor\n---\n\nSplit.\n',
    'go.md': '---\n"flagstaff": patch\n---\n\nReleases.\n',
  };
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
  writeFileSync(join(dir, 'README.md'), '# readme');
  const changesets = readChangesets(dir);
  const known = new Map([
    ['burgee', { times: { '1.6.0': ago(3) } }],
    ['roundel', { times: { '1.1.0': ago(30) } }],
    ['flagstaff', { times: { '1.7.0': ago(30) } }],
  ]);
  return { dir, changesets, plan: planWindow(changesets, known, NOW) };
}

/** `changeset version`: consume every changeset in the directory. */
const consume = (dir: string) => (): number => {
  for (const f of readdirSync(dir).filter((name) => name.endsWith('.md') && name !== 'README.md')) unlinkSync(join(dir, f));
  return 0;
};

describe('version — changeset version with the held changesets set aside', () => {
  it('runs changeset version over the releasable half only, then puts the held half back', () => {
    const { dir, changesets, plan } = workdir();
    let during: Record<string, string> = {};
    const status = version(dir, changesets, plan, () => {
      during = Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
      return consume(dir)();
    });
    expect(status).toBe(0);
    expect(during).toEqual({
      'README.md': '# readme',
      'go.md': '---\n"flagstaff": patch\n---\n\nReleases.\n',
      'split.md': '---\n"roundel": patch\n---\n\nSplit.\n',
    });
    expect(Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')]))).toEqual({
      'README.md': '# readme',
      'held.md': '---\n"burgee": minor\n---\n\nHeld whole.\n',
      'split.md': '---\n"burgee": minor\n---\n\nSplit.\n',
    });
  });

  it('puts every held changeset back even when changeset version fails, and passes its status on', () => {
    const { dir, changesets, plan } = workdir();
    expect(version(dir, changesets, plan, () => 3)).toBe(3);
    expect(readFileSync(join(dir, 'held.md'), 'utf8')).toBe('---\n"burgee": minor\n---\n\nHeld whole.\n');
    expect(() =>
      version(dir, readChangesets(dir), planWindow(readChangesets(dir), new Map([['burgee', { times: { '1.6.0': ago(3) } }], ['roundel', { times: {} }], ['flagstaff', { times: {} }]]), NOW), () => {
        throw new Error('changeset version crashed');
      }),
    ).toThrow('changeset version crashed');
    expect(readFileSync(join(dir, 'held.md'), 'utf8')).toBe('---\n"burgee": minor\n---\n\nHeld whole.\n');
    expect(readFileSync(join(dir, 'split.md'), 'utf8')).toBe('---\n"burgee": minor\n---\n\nSplit.\n');
  });

  it('touches nothing when nothing is held, and skips a planned file that is gone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-window-none-'));
    writeFileSync(join(dir, 'a.md'), '---\n"burgee": patch\n---\n\na\n');
    const changesets = readChangesets(dir);
    let seen: string[] = [];
    version(dir, changesets, { releasable: true, changesets: [{ file: 'a.md', release: changesets[0]?.releases ?? [], hold: [] }, { file: 'gone.md', release: [], hold: [{ name: 'x', type: 'minor' }] }], held: [] }, () => {
      seen = readdirSync(dir);
      return 0;
    });
    expect(seen).toEqual(['a.md']);
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

  it('passes every changeset on this branch', async () => {
    const lines: string[] = [];
    expect(await main(['lock'], io({ root: ROOT, write: (t) => lines.push(t) })), lines.join('')).toBe(0);
  });
});

/** An `Io` with no network, no process and a fixed clock. */
function io(over: Partial<Io> = {}): Io {
  return { root: ROOT, times: async () => ({}), now: NOW, write: () => {}, stdin: () => '[]', env: {}, version: () => 0, ...over };
}

/** A scratch repository root: `.changeset/`, the lock's table, and packages. */
function scratch(changesets: Record<string, string>, packages: Record<string, { version: string; private?: boolean }> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'release-window-root-'));
  mkdirSync(join(root, '.changeset'));
  mkdirSync(join(root, '.sdlc/bands'), { recursive: true });
  writeFileSync(join(root, '.sdlc/bands/incumbent-majors.json'), JSON.stringify({ rows: ROWS }));
  for (const [file, text] of Object.entries(changesets)) writeFileSync(join(root, '.changeset', file), text);
  for (const [name, m] of Object.entries(packages)) {
    mkdirSync(join(root, 'packages', name), { recursive: true });
    writeFileSync(join(root, 'packages', name, 'package.json'), JSON.stringify({ name, ...m }));
  }
  mkdirSync(join(root, 'packages', 'no-manifest'), { recursive: true });
  return root;
}

/** Registry stubs. */
const refuses = async (): Promise<Times> => {
  throw new Error('asked the registry');
};
const minorYesterday = async (): Promise<Times> => ({ '1.6.0': ago(1) });
const burgeeOnly = async (name: string): Promise<Times | undefined> => (name === 'burgee' ? { '1.0.0': ago(20), '1.1.0': ago(5) } : undefined);

describe('main — the commands the workflows run', () => {
  it('lock: an ::error line per violation, naming the file, and exit 1', async () => {
    const root = scratch({ 'parse-refusals.md': formatChangeset(PARSE_REFUSALS) });
    const out: string[] = [];
    expect(await main(['lock'], io({ root, write: (t) => out.push(t) }))).toBe(1);
    expect(out.join('')).toContain('::error file=.changeset/parse-refusals.md::burgee is a minor, but this changeset describes "excess command-arguments are an error by default", which commander shipped as a major (commander@13.0.0;');
    expect(out.join('')).toContain('Make it "burgee": major');
  });

  it('plan: the plan on stdout, in --out, and releasable / held as step outputs, with a summary', async () => {
    const root = scratch({ 'm.md': '---\n"burgee": minor\n---\n\nm\n', 'p.md': '---\n"roundel": patch\n---\n\np\n' }, { burgee: { version: '1.6.0' }, roundel: { version: '1.1.1' } });
    const out = join(root, 'plan.json');
    const outputs = join(root, 'outputs');
    const stepSummary = join(root, 'summary');
    const asked: string[] = [];
    const written: string[] = [];
    const times = async (name: string): Promise<Times> => (asked.push(name), name === 'burgee' ? { '1.6.0': ago(2) } : { '1.1.0': ago(30) });
    expect(await main(['plan', '--out', out], io({ root, times, env: { GITHUB_OUTPUT: outputs, GITHUB_STEP_SUMMARY: stepSummary }, write: (t) => written.push(t) }))).toBe(0);
    expect(asked.toSorted()).toEqual(['burgee', 'roundel']);
    const plan = JSON.parse(readFileSync(out, 'utf8')) as WindowPlan;
    expect(plan.held).toEqual([{ file: 'm.md', name: 'burgee', type: 'minor', opens: new Date(NOW + 5 * DAY).toISOString() }]);
    expect(JSON.parse(written.join(''))).toEqual(plan);
    expect(readFileSync(outputs, 'utf8')).toBe('releasable=true\nheld=1\n');
    expect(readFileSync(stepSummary, 'utf8')).toContain(`- \`burgee\` minor from \`.changeset/m.md\`: opens ${new Date(NOW + 5 * DAY).toISOString()}`);
  });

  it('plan: says nothing is held, and writes no file without --out or outputs without GITHUB_OUTPUT', async () => {
    const root = scratch({ 'p.md': '---\n"roundel": patch\n---\n\np\n' });
    const stepSummary = join(root, 'summary');
    expect(await main(['plan'], io({ root, env: { GITHUB_STEP_SUMMARY: stepSummary } }))).toBe(0);
    expect(readFileSync(stepSummary, 'utf8')).toContain('Nothing held: every pending changeset releases on this Version PR.');
    expect(readdirSync(root).toSorted()).toEqual(['.changeset', '.sdlc', 'packages', 'summary']);
  });

  it('version: holds exactly what the plan file says, without asking the registry again', async () => {
    const root = scratch({ 'm.md': '---\n"burgee": minor\n---\n\nm\n' });
    const planFile = join(root, 'plan.json');
    writeFileSync(planFile, JSON.stringify({ releasable: true, changesets: [{ file: 'm.md', release: [], hold: [{ name: 'burgee', type: 'minor' }] }], held: [] }));
    let during: string[] = [];
    expect(await main(['version'], io({ root, times: refuses, env: { RELEASE_WINDOW_PLAN: planFile }, version: () => ((during = readdirSync(join(root, '.changeset'))), 0) }))).toBe(0);
    expect(during).toEqual([]);
    expect(readdirSync(join(root, '.changeset'))).toEqual(['m.md']);
  });

  it('version: plans for itself when no plan file is there', async () => {
    const root = scratch({ 'm.md': '---\n"burgee": minor\n---\n\nm\n' }, { burgee: { version: '1.6.0' } });
    let during: string[] = [];
    expect(await main(['version'], io({ root, times: minorYesterday, env: { RELEASE_WINDOW_PLAN: join(root, 'missing.json') }, version: () => ((during = readdirSync(join(root, '.changeset'))), 0) }))).toBe(0);
    expect(during, 'the minor is a day inside its window').toEqual([]);
  });

  it('publishable: defers a non-fix version inside its window, writes the rest to --out, and needs --out', async () => {
    const root = scratch({}, { burgee: { version: '1.7.0' } });
    const rows = [
      { dir: 'roundel', name: 'roundel', version: '1.1.2', deps: [] },
      { dir: 'burgee', name: 'burgee', version: '1.7.0', deps: [] },
    ];
    const out = join(root, 'publishable.json');
    const asked: string[] = [];
    const written: string[] = [];
    const times = async (name: string): Promise<Times> => (asked.push(name), { '1.6.0': ago(2), '1.7.0': ago(0) });
    expect(await main(['publishable', '--out', out], io({ root, times, stdin: () => JSON.stringify(rows), write: (t) => written.push(t) }))).toBe(0);
    expect(asked, 'only a non-fix version needs the registry').toEqual(['burgee']);
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual([rows[0]]);
    expect(written.join('')).toBe(`::notice::Not publishing burgee@1.7.0 yet: its previous non-fix release was under 7 days ago; the window opens ${new Date(NOW + 5 * DAY).toISOString()}. A later run publishes it (release-cadence).\n`);
    const usage: string[] = [];
    expect(await main(['publishable'], io({ root, write: (t) => usage.push(t) }))).toBe(2);
    expect(usage.join('')).toContain('usage:');
  });

  it('publishable: reads the version’s own changelog section for a Security: entry', async () => {
    const root = scratch({}, { burgee: { version: '1.7.0' } });
    writeFileSync(join(root, 'packages/burgee/CHANGELOG.md'), '# burgee\n\n## 1.7.0\n\n### Minor Changes\n\n- abc: Security: refuse a symlinked config.\n\n## 1.6.0\n\n- old\n');
    const out = join(root, 'p.json');
    const rows = [{ dir: 'burgee', name: 'burgee', version: '1.7.0', deps: [] }];
    expect(await main(['publishable', '--out', out], io({ root, times: async () => ({ '1.6.0': ago(2) }), stdin: () => JSON.stringify(rows) }))).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual(rows);
  });

  it('measure: each public package’s days with latest at least --age days old, from the registry', async () => {
    const root = scratch({}, { burgee: { version: '1.6.0' }, docs: { version: '0.0.0', private: true }, roundel: { version: '1.0.0' } });
    const written: string[] = [];
    expect(await main(['measure', '--from', ago(30), '--to', ago(0), '--age', '7'], io({ root, times: burgeeOnly, write: (t) => written.push(t) }))).toBe(0);
    expect(JSON.parse(written.join(''))).toEqual({
      from: ago(30),
      to: ago(0),
      age: 7,
      span: 30,
      packages: [
        { name: 'burgee', days: 8, share: 0.267 },
        { name: 'roundel', days: null, share: null },
      ],
    });
  });

  it('measure: defaults to the 30 days to now and a 7-day age', async () => {
    const root = scratch({}, { burgee: { version: '1.6.0' } });
    const written: string[] = [];
    expect(await main(['measure'], io({ root, times: async () => ({ '1.0.0': ago(40) }), write: (t) => written.push(t) }))).toBe(0);
    expect(JSON.parse(written.join(''))).toMatchObject({ from: ago(30), to: ago(0), age: 7, span: 30, packages: [{ name: 'burgee', days: 30, share: 1 }] });
  });

  it('refuses an unknown command with the usage line', async () => {
    const out: string[] = [];
    expect(await main(['ship-it'], io({ write: (t) => out.push(t) }))).toBe(2);
    expect(out.join('')).toMatch(/^usage: release-window\.mts plan/);
  });

  it('reads the workspace manifests with their privacy', () => {
    const root = scratch({}, { burgee: { version: '1.6.0' }, docs: { version: '0.0.0', private: true } });
    writeFileSync(join(root, 'packages', 'nameless.json'), '{}');
    mkdirSync(join(root, 'packages', 'nameless'));
    writeFileSync(join(root, 'packages', 'nameless', 'package.json'), '{"version":"1.0.0"}');
    expect([...manifests(root)]).toEqual([
      ['burgee', { dir: 'burgee', version: '1.6.0', private: false }],
      ['docs', { dir: 'docs', version: '0.0.0', private: true }],
    ]);
  });
});

/** A row of release.yml's plan, and a package with no changelog. */
const row = (name: string, version: string, deps: { name: string; version: string }[] = []) => ({ dir: name, name, version, deps });
const none = (): string => '';

describe('publishable — release.yml’s backstop', () => {
  it('keeps fixes, and a non-fix version whose window is open', () => {
    const result = publishable([row('roundel', '1.1.2'), row('burgee', '1.7.0')], new Map([['burgee', { '1.6.0': ago(8), '1.7.0': ago(0) }]]), none, NOW);
    expect(result).toEqual({ rows: [row('roundel', '1.1.2'), row('burgee', '1.7.0')], deferred: [] });
  });

  it('defers a non-fix version inside its window, and a package that depends on it at that version', () => {
    const result = publishable(
      [row('roundel', '1.2.0'), row('flagstaff', '1.7.1', [{ name: 'roundel', version: '1.2.0' }]), row('caique', '1.4.2', [{ name: 'roundel', version: '1.1.1' }])],
      new Map([['roundel', { '1.1.0': ago(3) }]]),
      none,
      NOW,
    );
    expect(result.rows.map((r) => r.name)).toEqual(['caique']);
    expect(result.deferred).toEqual([
      { name: 'roundel', version: '1.2.0', why: `its previous non-fix release was under 7 days ago; the window opens ${new Date(NOW + 4 * DAY).toISOString()}` },
      { name: 'flagstaff', version: '1.7.1', why: 'it depends on roundel@1.2.0, which waits' },
    ]);
  });

  it('defers when the registry did not answer, and publishes a security release at once', () => {
    expect(publishable([row('burgee', '1.7.0')], new Map([['burgee', undefined]]), none, NOW).deferred[0]?.why).toBe('the registry did not answer');
    expect(publishable([row('burgee', '1.7.0')], new Map([['burgee', { '1.6.0': ago(1) }]]), () => '### Minor Changes\n\n- [#1](x) Thanks! - Security: refuse it.\n', NOW).rows).toHaveLength(1);
    expect(publishable([row('burgee', '1.7.0')], new Map([['burgee', { '1.6.0': ago(1) }]]), () => 'Mentions Security: in prose, not as an entry.\n', NOW).rows).toHaveLength(0);
  });

  it('cuts one version’s changelog section, up to the next', () => {
    const text = '# x\n\n## 1.7.0\n\nseven\n\n## 1.6.0\n\nsix\n';
    expect(changelogSection(text, '1.7.0')).toBe('\nseven\n');
    expect(changelogSection(text, '1.6.0')).toBe('\nsix\n');
    expect(changelogSection(text, '1.5.0')).toBe('');
  });
});

/** burgee's registry `time`, read 2026-10-18 (`npm view burgee time --json`): Part C's data. */
const BURGEE_TIMES: Times = JSON.parse(
  '{"created":"2026-09-07T05:34:22.313Z","modified":"2026-10-18T14:25:17.528Z","0.0.0":"2026-09-07T05:34:22.724Z","0.2.0":"2026-09-08T05:49:53.056Z","0.3.0":"2026-09-09T00:27:45.970Z","0.4.0":"2026-09-13T05:49:08.169Z","0.5.0":"2026-09-13T22:19:37.152Z","0.6.0":"2026-09-14T03:01:14.878Z","0.6.1":"2026-09-14T05:51:24.271Z","0.7.0":"2026-09-18T00:10:58.987Z","0.7.1":"2026-09-21T05:50:02.019Z","0.8.0":"2026-09-21T13:31:04.127Z","0.9.0":"2026-09-22T20:11:59.961Z","0.9.1":"2026-09-23T01:43:03.023Z","0.9.2":"2026-09-23T03:18:15.751Z","0.10.0":"2026-09-23T05:34:36.372Z","0.11.0":"2026-09-23T12:14:10.263Z","0.11.1":"2026-09-23T13:52:07.519Z","0.12.0":"2026-09-24T08:52:47.924Z","0.12.1":"2026-09-24T10:36:06.379Z","0.13.0":"2026-09-25T03:51:54.620Z","0.13.1":"2026-09-25T04:28:29.685Z","0.13.2":"2026-09-27T21:38:47.318Z","0.14.0":"2026-09-27T22:54:28.960Z","0.14.1":"2026-09-29T23:46:41.360Z","0.14.2":"2026-09-30T16:02:01.026Z","0.14.3":"2026-09-30T16:35:25.442Z","0.15.0":"2026-09-30T19:15:44.497Z","0.16.0":"2026-10-05T02:48:14.084Z","0.17.0":"2026-10-05T03:08:38.380Z","0.17.1":"2026-10-05T03:46:36.173Z","0.18.0":"2026-10-06T06:04:02.918Z","0.19.0":"2026-10-06T20:34:10.769Z","0.21.0":"2026-10-06T23:49:35.268Z","0.21.1":"2026-10-08T06:24:43.914Z","0.22.1":"2026-10-08T06:38:04.527Z","0.22.2":"2026-10-09T06:08:41.582Z","0.22.3":"2026-10-09T08:15:11.105Z","0.22.4":"2026-10-09T09:21:18.880Z","0.23.0":"2026-10-09T09:53:08.213Z","1.0.0":"2026-10-09T22:04:39.844Z","1.0.1":"2026-10-10T03:21:01.185Z","1.1.0":"2026-10-11T14:05:55.975Z","1.2.0":"2026-10-12T11:13:00.420Z","1.3.0":"2026-10-12T15:13:24.004Z","1.4.0":"2026-10-12T16:47:39.919Z","1.5.0":"2026-10-13T04:00:53.974Z","1.6.0":"2026-10-18T14:25:17.164Z"}',
) as Times;

describe('daysOldEnough — Part C’s measure, which the 30-day criterion reuses', () => {
  const from = Date.parse('2026-09-18T17:00:00Z');
  const to = Date.parse('2026-10-18T17:00:00Z');

  it('reproduces Part C: burgee’s latest was 7 days old on 0 of the 30 days, and 3 days old on about 3.9', () => {
    expect(daysOldEnough(BURGEE_TIMES, from, to, 7)).toBe(0);
    expect(daysOldEnough(BURGEE_TIMES, from, to, 3)).toBeCloseTo(3.98, 2);
  });

  it('counts the part of each gap more than `age` days after a publish, clipped to the window', () => {
    const t = (days: number): string => new Date(from + days * DAY).toISOString();
    // Publishes on day -3, 10 and 12 of a 20-day window: [4, 10) and [19, 20).
    expect(daysOldEnough({ a: 'x', '1.0.0': t(-3), '1.0.1': t(10), '1.1.0': t(12), '1.2.0-rc.0': t(15) }, from, from + 20 * DAY, 7)).toBe(7);
    expect(daysOldEnough({}, from, from + 20 * DAY, 7), 'nothing published, nothing old enough').toBe(0);
    expect(daysOldEnough({ '1.0.0': 'not a date' }, from, from + 20 * DAY, 7)).toBe(0);
    expect(daysOldEnough({ '1.0.0': t(-30) }, from, from + 20 * DAY, 7)).toBe(20);
  });
});

/** A workflow's text, which is how the other release locks read them (no YAML dependency). */
const workflow = (file: string): string => readFileSync(join(ROOT, '.github/workflows', file), 'utf8');

describe('the workflows run the window and the lock', () => {
  it('changesets-pr.yml plans the window before refreshing the Version PR, and runs daily', () => {
    const text = workflow('changesets-pr.yml');
    const job = text.slice(text.indexOf('\n  version:'), text.indexOf('\n  checks:'));
    expect(text).toMatch(/\n {2}schedule:\n(?: {4}#.*\n)* {4}- cron: "[^"]+"/);
    expect(job).toContain("github.event_name == 'schedule'");
    const plan = job.indexOf('node scripts/release-window.mts plan --out "$RUNNER_TEMP/release-window.json"');
    const action = job.indexOf('uses: changesets/action@');
    expect(plan).toBeGreaterThan(-1);
    expect(plan, 'the plan runs before the Version PR is refreshed').toBeLessThan(action);
    const step = job.slice(job.lastIndexOf('- name:', action), job.indexOf('- name:', action + 1));
    expect(step).toContain("if: steps.window.outputs.releasable == 'true'");
    expect(step).toContain('version-script: node scripts/release-window.mts version');
    expect(step).toContain('RELEASE_WINDOW_PLAN: ${{ runner.temp }}/release-window.json');
    expect(job).toContain("if: steps.window.outputs.releasable != 'true' && steps.window.outputs.held != '0'");
  });

  it('changesets-pr.yml runs the changeset lock on every PR that adds a changeset', () => {
    const text = workflow('changesets-pr.yml');
    const job = text.slice(text.indexOf('\n  required:'));
    const at = job.indexOf('run: node scripts/release-window.mts lock');
    expect(at).toBeGreaterThan(-1);
    expect(job.slice(job.lastIndexOf('- name:', at), at)).toContain("if: steps.check.outputs.status == 'present'");
  });

  it('release.yml filters the plan through the window before it publishes, and runs daily', () => {
    const text = workflow('release.yml');
    const detect = text.slice(text.indexOf('\n  detect:'), text.indexOf('\n  build:'));
    const filter = detect.indexOf('node scripts/release-window.mts publishable --out "$RUNNER_TEMP/publishable.json" <<<"$publish"');
    expect(filter).toBeGreaterThan(-1);
    expect(filter, 'filtered before the plan is emitted').toBeLessThan(detect.indexOf('echo "plan=$publish"'));
    expect(detect.indexOf('publish=$(cat "$RUNNER_TEMP/publishable.json")')).toBeGreaterThan(filter);
    expect(text).toMatch(/\n {2}schedule:\n(?: {4}#.*\n)* {4}- cron: "[^"]+"/);
  });

  it('models.yml keeps the model’s rejected designs failing', () => {
    const text = workflow('models.yml');
    expect(text).toContain('for inv in unsplitHolds npmOnlyHolds shippedNeverReleasesAFeature; do');
    expect(text).toContain('.sdlc/intents/release-cadence/release-window.qnt');
    const model = readFileSync(join(ROOT, '.sdlc/intents/release-cadence/release-window.qnt'), 'utf8');
    for (const name of ['safety', 'unsplitHolds', 'npmOnlyHolds', 'shippedNeverReleasesAFeature']) expect(model).toContain(`val ${name} =`);
  });
});

/*
 * The cases below were written against the survivors of a Stryker run over
 * `release-window.mts` (2026-10-18): each holds a line a mutant changed without a test noticing.
 */

const SCRIPT = join(ROOT, 'scripts/release-window.mts');
/** The script as the workflows run it: a separate process, its own argv and stdout. */
const cli = (args: string[], input = '') => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, input, encoding: 'utf8' });

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

describe('versions — the comparisons a mutant can flip', () => {
  it('reads nothing that does not start with the version', () => {
    expect(parts('v1.2.3')).toBeUndefined();
    expect(parts('1.2.3.4')).toBeUndefined();
  });

  it('compares patches: 1.1.0 is older than 1.1.1', () => {
    expect(previousNonFix({ '1.0.0': ago(30), '1.1.0': ago(9) }, undefined, '1.1.1')).toBe(Date.parse(ago(9)));
  });

  it('is in flight only when the manifest’s x.y is newer than npm’s newest non-fix release', () => {
    expect(previousNonFix({ '1.1.0': ago(9) }, '0.5.3'), 'an older line is not in flight').toBe(Date.parse(ago(9)));
    expect(previousNonFix({ '1.0.0': ago(20), '1.1.0': 'garbage' }, '1.1.0'), 'a release npm lists with no readable date is not known to be out').toBe(Number.POSITIVE_INFINITY);
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

/** How many rows publish when burgee 1.7.0, a day inside its window, has this changelog section. */
const security = (section: string): number => publishable([row('burgee', '1.7.0')], new Map([['burgee', { '1.6.0': ago(1) }]]), () => section, NOW).rows.length;

describe('planWindow and publishable — the boundaries', () => {
  it('publishes a non-fix version exactly 7 days after the previous one', () => {
    expect(publishable([row('burgee', '1.7.0')], new Map([['burgee', { '1.6.0': ago(7) }]]), none, NOW).rows).toHaveLength(1);
  });

  it('holds a dependent on the deferred package at that version only, and says it is the dependency', () => {
    const result = publishable(
      [row('roundel', '1.2.0'), row('linegauge', '1.2.0'), row('a', '1.0.1', [{ name: 'linegauge', version: '1.2.0' }]), row('b', '2.0.0', [{ name: 'roundel', version: '1.2.0' }])],
      new Map([
        ['roundel', { '1.1.0': ago(3) }],
        ['linegauge', { '1.1.0': ago(30) }],
        ['b', { '1.0.0': ago(30) }],
      ]),
      none,
      NOW,
    );
    expect(result.rows.map((r) => r.name)).toEqual(['linegauge', 'a']);
    expect(result.deferred.map((d) => [d.name, d.why])).toEqual([
      ['roundel', expect.stringContaining('the window opens') as string],
      ['b', 'it depends on roundel@1.2.0, which waits'],
    ]);
  });

  it('reads a changelog heading with trailing space, an indented Security: entry, and no other entry as one', () => {
    expect(changelogSection('## 1.7.0 \n\nseven\n## 1.6.0\n', '1.7.0')).toBe('\nseven');
    expect(security('  - abc Thanks! - Security: refuse it.')).toBe(1);
    expect(security('- a plain entry\nSecurity: in prose after it')).toBe(0);
  });
});

describe('main — the registry and the outputs', () => {
  it('plan holds a minor whose registry did not answer', async () => {
    const root = scratch({ 'm.md': '---\n"burgee": minor\n---\n\nm\n' });
    const written: string[] = [];
    expect(await main(['plan'], io({ root, times: async () => undefined, write: (t) => written.push(t) }))).toBe(0);
    expect((JSON.parse(written.join('')) as WindowPlan).held[0]?.opens).toBe('unknown: the registry did not answer');
  });

  it('plan writes the whole summary', async () => {
    const root = scratch({ 'm.md': '---\n"burgee": minor\n---\n\nm\n' });
    const stepSummary = join(root, 'summary');
    await main(['plan'], io({ root, times: async () => ({ '1.6.0': ago(2) }), env: { GITHUB_STEP_SUMMARY: stepSummary } }));
    expect(readFileSync(stepSummary, 'utf8')).toBe(
      `### Release window (7 days between non-fix releases of a package)\n\nHeld on \`main\` until the window opens; a fix in the same changeset releases now:\n- \`burgee\` minor from \`.changeset/m.md\`: opens ${new Date(NOW + 5 * DAY).toISOString()}\n`,
    );
  });

  it('lock prints its all-clear only when there is nothing to refuse', async () => {
    const out: string[] = [];
    expect(await main(['lock'], io({ root: scratch({ 'ok.md': '---\n"burgee": minor\n---\n\nAdds a flag.\n' }), write: (t) => out.push(t) }))).toBe(0);
    expect(out.join('')).toBe('changeset lock: 1 changeset(s), none below major for a behaviour an incumbent shipped as a major\n');
    const bad: string[] = [];
    await main(['lock'], io({ root: scratch({ 'bad.md': formatChangeset(PARSE_REFUSALS) }), write: (t) => bad.push(t) }));
    expect(bad.join('')).not.toContain('changeset lock:');
  });

  it('measure reads --from, --to and --age', async () => {
    const root = scratch({}, { burgee: { version: '1.6.0' } });
    const written: string[] = [];
    await main(['measure', '--from', ago(20), '--to', ago(2), '--age', '3'], io({ root, times: async () => ({ '1.0.0': ago(10) }), write: (t) => written.push(t) }));
    expect(JSON.parse(written.join(''))).toEqual({ from: ago(20), to: ago(2), age: 3, span: 18, packages: [{ name: 'burgee', days: 5, share: 0.278 }] });
  });

  it('measure orders publishes by time whatever order the registry lists them in', () => {
    const from = NOW - 20 * DAY;
    expect(daysOldEnough({ '1.1.0': ago(5), '1.0.0': ago(30) }, from, NOW, 7)).toBe(15);
    expect(daysOldEnough({ created: ago(30), modified: ago(1), '1.0.0': ago(30) }, from, NOW, 7), 'created and modified are not releases').toBe(20);
    expect(daysOldEnough({ '1.0.0': ago(30), '1.0.1': 'garbage' }, from, NOW, 7), 'an unreadable date is not a publish').toBe(20);
  });
});

describe('the registry, and the version run, as the real process reaches them', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads npm’s time field, a 404 as never published, anything else unreadable as no answer', async () => {
    const calls: { url: string; signal: unknown }[] = [];
    const reply = (status: number, body: unknown) => async (url: string, init: { signal: unknown }) => (calls.push({ url, signal: init.signal }), { status, ok: status === 200, json: async () => body });
    vi.stubGlobal('fetch', reply(200, { time: { '1.0.0': ago(3) } }));
    expect(await registryTimes('@scope/pkg')).toEqual({ '1.0.0': ago(3) });
    expect(calls[0]?.url).toBe('https://registry.npmjs.org/@scope%2Fpkg');
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    vi.stubGlobal('fetch', reply(200, {}));
    expect(await registryTimes('x')).toEqual({});
    vi.stubGlobal('fetch', reply(404, {}));
    expect(await registryTimes('x')).toEqual({});
    vi.stubGlobal('fetch', reply(500, { time: { '1.0.0': ago(3) } }));
    expect(await registryTimes('x')).toBeUndefined();
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    expect(await registryTimes('x')).toBeUndefined();
  });

  it('runs npm run changeset:version at the root, and a signal is a failure', () => {
    const seen: unknown[] = [];
    expect(runVersion((command, args, options) => (seen.push([command, args, options]), { status: 0 }))).toBe(0);
    expect(seen).toEqual([['npm', ['run', 'changeset:version'], { cwd: ROOT, stdio: 'inherit' }]]);
    expect(runVersion(() => ({ status: 4 }))).toBe(4);
    expect(runVersion(() => ({ status: null }))).toBe(1);
  });

  it('runs as a script: the lock over this branch, a usage error, and publishable from stdin', () => {
    const lock = cli(['lock']);
    expect(lock.status).toBe(0);
    expect(lock.stdout).toMatch(/^changeset lock: \d+ changeset\(s\)/);
    const usage = cli(['nope']);
    expect(usage.status).toBe(2);
    expect(usage.stdout).toMatch(/^usage: release-window\.mts/);
    const out = join(mkdtempSync(join(tmpdir(), 'release-window-cli-')), 'p.json');
    const fixes = cli(['publishable', '--out', out], JSON.stringify([row('roundel', '1.1.2')]));
    expect(fixes.status).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual([row('roundel', '1.1.2')]);
  });
});

describe('the last edges Stryker found', () => {
  it('leaves out a workspace manifest with a name and no version', () => {
    const root = scratch({}, { burgee: { version: '1.6.0' } });
    mkdirSync(join(root, 'packages', 'unversioned'));
    writeFileSync(join(root, 'packages', 'unversioned', 'package.json'), '{"name":"unversioned"}');
    expect([...manifests(root).keys()]).toEqual(['burgee']);
  });

  it('holds a dependent of either of two deferred packages', () => {
    const result = publishable(
      [row('roundel', '1.2.0'), row('linegauge', '1.2.0'), row('flagstaff', '1.7.1', [{ name: 'linegauge', version: '1.2.0' }])],
      new Map([
        ['roundel', { '1.1.0': ago(3) }],
        ['linegauge', { '1.1.0': ago(3) }],
      ]),
      none,
      NOW,
    );
    expect(result.rows).toEqual([]);
    expect(result.deferred.map((d) => d.name)).toEqual(['roundel', 'linegauge', 'flagstaff']);
  });

  it('does nothing when imported rather than run', () => {
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(SCRIPT)});`], { cwd: ROOT, encoding: 'utf8' });
    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe('');
  });
});
