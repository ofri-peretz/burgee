import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { runScorecard } from './cli.js';
import { type Report } from './score.js';
import {
  blameShas,
  breaches,
  isCode,
  isFix,
  isInert,
  isRelease,
  type MainCommit,
  MAX_RANGES,
  oldRanges,
  parseMainLog,
  scorecard,
  scorecardText,
  traceFix,
} from './scorecard.js';

const TEXT = Symbol.for('burgee.text');
const RECEIPT = 'Verified-by: npx vitest run -> exit 0 (abc)';
const at = (sha: string, date: string, subject: string, body = ''): MainCommit => ({ sha, date, subject, body });

describe('parseMainLog', () => {
  it('reads sha, date, subject and body per record', () => {
    const log = `\0aaa\t2026-11-20\tfeat: x (#1)\tline one\tstill body\u0001\n\0bbb\t2026-11-21\tfix: y (#2)\t\u0001\n`;
    expect(parseMainLog(log)).toEqual([at('aaa', '2026-11-20', 'feat: x (#1)', 'line one\tstill body'), at('bbb', '2026-11-21', 'fix: y (#2)')]);
    expect(parseMainLog('no records here')).toEqual([]);
  });
});

describe('classifiers', () => {
  it('counts a fix to behaviour, not to docs, and not a feature that mentions a fix', () => {
    expect(['fix: a', 'fix(x): a', 'fix!: a', 'fix(x)!: a'].map(isFix)).toEqual([true, true, true, true]);
    expect(['fix(docs): a', 'fix(doc): a', 'fix(deps): a', 'feat: fix a', 'fixup: a', 'Fix: a'].map(isFix)).toEqual([false, false, false, false, false, false]);
  });

  it('does not count following an upstream release as a fix to our own bug', () => {
    expect(['fix(caique): follow @inquirer/core 12.1.1', 'fix(x): re-vendor y', 'fix(x): revendor y', 'fix: bump z'].map(isFix)).toEqual([false, false, false, false]);
    expect(isFix('fix(x): the follower list drops one')).toBe(true);
  });

  it('knows a release commit', () => {
    expect(isRelease('chore(release): version packages (#9)')).toBe(true);
    expect(isRelease('Version Packages (#9)')).toBe(true);
    expect(isRelease('chore: release notes (#9)')).toBe(false);
  });

  it('traces code, never tests, fixtures, declarations or docs', () => {
    expect(['src/a.ts', 'a.mjs', 'x/b.tsx', 'c.vue', 'd.sh', 'e.cts'].map(isCode)).toEqual([true, true, true, true, true, true]);
    expect(['src/a.test.ts', 'src/a.spec.js', 'src/__fixtures__/a.ts', 'test/fixtures/a.js', 'dist/a.js', 'a.d.ts', 'README.md', 'a.json', 'b.bench.ts'].map(isCode)).toEqual(
      Array.from({ length: 9 }, () => false),
    );
  });
});

describe('isInert', () => {
  it('knows the lines that carry no behaviour', () => {
    expect(['', '  ', '// x', ' /** x', ' * x', '# x', "import { a } from './a.js';", "export { a } from './a.js';"].map(isInert)).toEqual(Array.from({ length: 8 }, () => true));
    expect(['const a = 1;', '#!/usr/bin/env node', 'return a; // x', "export const a = 'import';"].map(isInert)).toEqual([false, false, false, false]);
  });
});

describe('oldRanges', () => {
  it('takes the removed code lines of code files as ranges, skipping inert lines, tests and additions', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -3,3 +3,3 @@ x',
      '-const a = 1;',
      '-// a comment',
      '-const b = 2;',
      '+const a = 2;',
      '@@ -10,2 +11 @@',
      '-const c = 3;',
      '-const d = 4;',
      '+const cd = 7;',
      '@@ -20,0 +22,1 @@',
      '+const e = 5;',
      'diff --git a/src/a.test.ts b/src/a.test.ts',
      '--- a/src/a.test.ts',
      '+++ b/src/a.test.ts',
      '@@ -1 +1 @@',
      '-expect(1);',
      '+expect(2);',
      'diff --git a/src/new.ts b/src/new.ts',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1 @@',
      '+const f = 1;',
    ].join('\n');
    expect(oldRanges(diff)).toEqual([
      { path: 'src/a.ts', start: 3, count: 1 },
      { path: 'src/a.ts', start: 5, count: 1 },
      { path: 'src/a.ts', start: 10, count: 2 },
    ]);
  });
});

describe('blameShas', () => {
  it('names each blamed commit once', () => {
    const a = 'a'.repeat(40);
    const b = 'b'.repeat(40);
    expect(blameShas(`${a} 1 1 2\nauthor x\n\tline\n${a} 2 2\n\tline\n${b} 9 3 1\n\tline\nnot ${a} 1 1`)).toEqual([a, b]);
  });
});

describe('traceFix', () => {
  it('blames each old range at the fix parent, at most MAX_RANGES of them', async () => {
    const hunks = Array.from({ length: MAX_RANGES + 3 }, (_, index) => `@@ -${String(index * 2 + 1)} +${String(index * 2 + 1)} @@`);
    const calls: string[][] = [];
    const git = (args: readonly string[]): Promise<string> => {
      calls.push([...args]);
      if (args[0] === 'diff') return Promise.resolve(['--- a/src/a.ts', '+++ b/src/a.ts', ...hunks.flatMap((hunk) => [hunk, '-const x = 1;', '+const x = 2;'])].join('\n'));
      return Promise.resolve(`${'c'.repeat(40)} 1 1 1\n`);
    };
    expect(await traceFix(git, 'fff')).toEqual(['c'.repeat(40)]);
    expect(calls[0]).toEqual(['diff', '-U0', '--no-color', '--no-ext-diff', 'fff^', 'fff']);
    expect(calls[1]).toEqual(['blame', '-w', '-M', '-C', '--porcelain', '-L', '1,+1', 'fff^', '--', 'src/a.ts']);
    expect(calls).toHaveLength(1 + MAX_RANGES);
  });
});

const COMMITS: MainCommit[] = [
  at('s9', '2026-11-24', 'chore(release): version packages (#9)'),
  at('s8', '2026-11-23', 'fix(x): repair the parser (#8)', RECEIPT),
  at('s7', '2026-11-22', 'Revert "feat(y): cache (#5)" (#7)'),
  at('s6', '2026-11-21', 'fix: straight push with no pr', ''),
  at('s5', '2026-11-20', 'feat(y): cache (#5)', RECEIPT),
  at('s4', '2026-11-19', 'feat(x): parser (#4)'),
  at('s3', '2026-11-18', 'feat(z): z (#3)', 'Verified-by: none (docs only)'),
  at('s2', '2026-10-01', 'feat(old): old (#2)'),
];

describe('scorecard', () => {
  const traced = new Map([
    ['s8', ['s4', 's8', 'unknown']],
    ['s6', ['s2']],
  ]);
  const card = scorecard({ commits: COMMITS, since: '2026-11-01', traced, cased: new Set([5]) });

  it('counts merged pull requests in the window, without releases or straight pushes', () => {
    expect(card.merged).toBe(5);
    expect(card.fixes).toBe(3);
    expect(card.untraced).toBe(0);
  });

  it('finds escapes by name and by trace, keeps older ones out of the rate, never blames a fix on itself', () => {
    expect(card.escapes).toEqual([
      { pr: 5, subject: 'feat(y): cache (#5)', date: '2026-11-20', fixedBy: ['#7'], how: 'named', status: 'confirmed' },
      { pr: 4, subject: 'feat(x): parser (#4)', date: '2026-11-19', fixedBy: ['#8'], how: 'traced', status: 'suspect' },
      { pr: 2, subject: 'feat(old): old (#2)', date: '2026-10-01', fixedBy: ['s6'], how: 'traced', status: 'suspect' },
    ]);
    expect(card.escapeRate).toMatchObject({ value: 0.4, of: '2 of 5 merged pull requests: 1 confirmed, 1 to triage, 0 dismissed' });
    expect(card.triage).toEqual({ confirmed: 1, dismissed: 0, suspect: 1 });
  });

  it('points the escape rate at the suspects in the window that are neither a case nor dismissed', () => {
    expect(card.uncased).toEqual([4]);
    expect(card.escapeRate.next).toBe('confirm each suspect as a replz case with an answer key, or dismiss it in .sdlc/replz/triage.json with a reason: #4');
  });

  it('takes a dismissed escape out of the rate, and says when every escape is triaged', () => {
    const triaged = scorecard({ commits: COMMITS, since: '2026-11-01', traced, cased: new Set([5]), dismissed: new Map([[4, 'the fix reworded a message']]) });
    expect(triaged.escapes.map((escape) => escape.status)).toEqual(['confirmed', 'dismissed', 'suspect']);
    expect(triaged.escapeRate).toMatchObject({ value: 0.2, of: '1 of 5 merged pull requests: 1 confirmed, 0 to triage, 1 dismissed' });
    expect(triaged.escapeRate.next).toContain('every escape is triaged');
  });

  it('counts a receipt, including a reasoned none, and lists the pull requests without one', () => {
    expect(card.receipts).toMatchObject({ value: 0.6, of: '3 of 5 merged pull requests' });
    expect(card.unreceipted).toEqual([7, 4]);
  });

  it('leaves recall and false alarms unmeasured until replz has run, and says how to run it', () => {
    expect(card.recall.value).toBeNull();
    expect(card.falseAlarms.value).toBeNull();
    expect(card.recall.next).toContain('replz run --set test --record');
  });

  it('reads recall at the last stage and false alarms from the last run', () => {
    const report: Pick<Report, 'bugs' | 'controls' | 'recall' | 'falseAlarms'> = { bugs: 4, controls: 5, recall: [{ stage: 'raw', found: 4 }, { stage: 'final', found: 3 }], falseAlarms: 1 };
    const ran = scorecard({ commits: COMMITS, since: '2026-11-01', traced, cased: new Set(), history: { date: '2026-11-20', set: 'test', report } });
    expect(ran.recall).toMatchObject({ value: 0.75, of: '3 of 4 bug cases at stage final, 2026-11-20' });
    expect(ran.falseAlarms).toMatchObject({ value: 0.2, of: '1 of 5 clean controls' });
  });

  it('calls a fix with no suspects untraceable, and scores an empty window as unmeasured', () => {
    const none = scorecard({ commits: COMMITS, since: '2026-11-01', traced: new Map(), cased: new Set() });
    expect(none.untraced).toBe(2);
    expect(scorecard({ commits: COMMITS, since: '2027-01-01', traced, cased: new Set() }).escapeRate.value).toBeNull();
  });

  it('says what to keep doing when nothing is missing', () => {
    const clean = scorecard({ commits: [at('s1', '2026-11-20', 'feat: a (#1)', RECEIPT)], since: '2026-11-01', traced: new Map(), cased: new Set() });
    expect(clean.escapeRate.next).toBe('no escape: keep the checks');
    expect(clean.receipts.next).toContain('every merged pull request carries a receipt');
  });

  it('prints one line per measure with its next action, and the escapes', () => {
    const text = scorecardText(card);
    expect(text).toContain('verification scorecard since 2026-11-01: 5 merged pull requests, 3 fixes or reverts (0 untraceable)');
    expect(text).toContain('escape rate        40.0%  2 of 5 merged pull requests: 1 confirmed, 1 to triage, 0 dismissed');
    expect(text).toContain('recall        unmeasured  no recorded run');
    expect(text).toContain('  #4 2026-11-19 suspect   traced fixed by #8  feat(x): parser (#4)');
  });
});

describe('breaches', () => {
  const card = scorecard({ commits: COMMITS, since: '2026-11-01', traced: new Map([['s8', ['s4']]]), cased: new Set() });

  it('names each band the card breaks, with its fix', () => {
    const broken = breaches(card, { maxEscapeRate: 0.3, minReceipts: 0.7, minRecall: 0.5 });
    expect(broken).toHaveLength(2);
    expect(broken[0]).toMatch(/^escape rate 40\.0% is above its band 30\.0%\. fix: /u);
    expect(broken[1]).toMatch(/^receipts 60\.0% are below their band 70\.0%\. fix: /u);
  });

  it('holds an unmeasured value to no band, and a card inside its bands to none', () => {
    expect(breaches(card, { maxEscapeRate: 0.4, minReceipts: 0.6 })).toEqual([]);
    expect(breaches(card, {})).toEqual([]);
  });
});

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-20T10:00:00Z', GIT_COMMITTER_DATE: '2026-11-20T10:00:00Z' } });

describe('runScorecard on a real repository', () => {
  const scratch = scratchDirs();

  it('traces a fix to the pull request that wrote the line it changed, and holds the card to its ratchet', async () => {
    const dir = scratch('scorecard-');
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.email', 'a@b.c');
    git(dir, 'config', 'user.name', 'a');
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\nexport const b = 2;\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', `feat: a and b (#1)\n\n${RECEIPT}`);
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\nexport const b = 3;\n');
    git(dir, 'commit', '-qam', 'fix: b is three (#2)');
    const options = { repo: dir, ref: 'main', days: 30, cases: '.sdlc/replz/cases', git: (args: readonly string[]) => Promise.resolve(git(dir, ...args)), now: () => new Date('2026-11-25T00:00:00Z') };
    const data = await runScorecard(options);
    expect(data).toMatchObject({ merged: 2, fixes: 1, untraced: 0, uncased: [1] });
    expect((data[TEXT] as () => string)()).toContain('escape rate        50.0%');
    writeFileSync(join(dir, 'bands.json'), JSON.stringify({ maxEscapeRate: 0.25 }));
    await expect(runScorecard({ ...options, ratchet: 'bands.json' })).rejects.toThrow('the scorecard left its bands: escape rate 50.0% is above its band 25.0%. fix: confirm each suspect as a replz case');
    mkdirSync(join(dir, '.sdlc/replz/cases'), { recursive: true });
    writeFileSync(join(dir, '.sdlc/replz/triage.json'), JSON.stringify({ dismissed: { 1: 'b changed on purpose' } }));
    expect(await runScorecard(options)).toMatchObject({ triage: { confirmed: 0, dismissed: 1, suspect: 0 }, uncased: [] });
    writeFileSync(join(dir, '.sdlc/replz/triage.json'), JSON.stringify({ dismissed: {} }));
    writeFileSync(join(dir, '.sdlc/replz/cases/bug-1.yaml'), 'id: bug-1\n');
    writeFileSync(join(dir, '.sdlc/replz/cases/control-2.yaml'), 'id: control-2\n');
    expect(await runScorecard(options)).toMatchObject({ triage: { confirmed: 1, dismissed: 0, suspect: 0 } });
    writeFileSync(join(dir, '.sdlc/replz/triage.json'), JSON.stringify({ dismissed: { x: '', 1: ' ' } }));
    await expect(runScorecard(options)).rejects.toThrow('.sdlc/replz/triage.json dismisses 1, x without a pull request number and a reason');
  });
});
