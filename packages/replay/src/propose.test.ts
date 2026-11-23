import { describe, expect, it } from 'vitest';

import { blamed, type Commit, LOG_ARGS, parseLog, prOf, propose, toYaml } from './propose.js';

const commit = (sha: string, subject: string, size: number, body = ''): Commit => ({ sha, parent: `p${sha}`, subject, body, size });

describe('prOf', () => {
  it('reads the squash suffix, and nothing else', () => {
    expect(prOf('feat(x): y (#123)')).toBe(123);
    expect(prOf('feat(x): y (#123)  ')).toBe(123);
    expect(prOf('feat(x): (#123) y')).toBeUndefined();
    expect(prOf('feat(x): y #123')).toBeUndefined();
  });
});

describe('blamed', () => {
  it('names the pull request a revert undoes', () => {
    expect(blamed(commit('a', 'Revert "feat(x): y (#12)"', 1))).toEqual([12]);
    expect(blamed(commit('a', 'Revert "feat(x): y (#12)" (#13)', 1))).toEqual([]);
    expect(blamed(commit('a', 'Revert "feat(x): y"', 1))).toEqual([]);
    expect(blamed(commit('a', 'chore: Revert "feat(x): y (#12)"', 1))).toEqual([]);
  });

  it('names the pull request a fix says it fixes, in the subject or body', () => {
    expect(blamed(commit('a', 'fix(x): y (#20)', 1, 'Regressed in #14.'))).toEqual([14]);
    expect(blamed(commit('a', 'fix: Fixes #15', 1))).toEqual([15]);
    expect(blamed(commit('a', 'fix(x): y', 1, 'introduced in #16'))).toEqual([16]);
    expect(blamed(commit('a', 'fix(x): y', 1, 'broken by  #17'))).toEqual([17]);
    expect(blamed(commit('a', 'fix(x): y', 1, 'Since #19, migrate drops it.'))).toEqual([19]);
    expect(blamed(commit('a', 'fix(x): y', 1, 'log-update shipped in #22 with'))).toEqual([22]);
    expect(blamed(commit('a', 'fix(x): y', 1, 'see #18'))).toEqual([]);
    expect(blamed(commit('a', 'feat(x): y', 1, 'fixes #19'))).toEqual([]);
    expect(blamed(commit('a', 'fix(x): y', 1, 'prefixes #21'))).toEqual([]);
  });
});

describe('parseLog', () => {
  it('reads each commit, its first parent, its body and its size from the shortstat', () => {
    const log = [
      '\0aaaa\tp1 p2\tfeat: a (#1)\tline one\n\twith a tab\n\u0001\n\n 2 files changed, 10 insertions(+), 3 deletions(-)\n',
      '\0bbbb\tp3\tfix: b\t\u0001\n\n 1 file changed, 1 deletion(-)\n',
      '\0cccc\t\tinit\t\u0001\n',
    ].join('');
    expect(parseLog(log)).toEqual([
      { sha: 'aaaa', parent: 'p1', subject: 'feat: a (#1)', body: 'line one\n\twith a tab', size: 13 },
      { sha: 'bbbb', parent: 'p3', subject: 'fix: b', body: '', size: 1 },
      { sha: 'cccc', parent: '', subject: 'init', body: '', size: 0 },
    ]);
    expect(parseLog('')).toEqual([]);
    expect(parseLog('\0abc\u0001')).toEqual([{ sha: 'abc', parent: '', subject: '', body: '', size: 0 }]);
  });

  it('asks git for exactly that shape', () => {
    expect(LOG_ARGS).toEqual(['log', '--first-parent', '--shortstat', '--format=%x00%H%x09%P%x09%s%x09%b%x01']);
  });
});

describe('propose', () => {
  const HISTORY: Commit[] = [
    commit('r1aaaaaaaaaaaaa', 'Revert "feat: big (#10)"', 5),
    commit('f1aaaaaaaaaaaaa', 'fix: thing (#30)', 4, 'Fixes #11'),
    commit('c1aaaaaaaaaaaaa', 'feat: clean small (#40)', 12),
    commit('c2aaaaaaaaaaaaa', 'feat: clean big (#41)', 95),
    commit('c3aaaaaaaaaaaaa', 'docs: clean mid (#42)', 50),
    commit('b2aaaaaaaaaaaaa', 'feat: small (#11)', 10),
    commit('b1aaaaaaaaaaaaa', 'feat: big (#10)', 100),
    commit('xaaaaaaaaaaaaaa', 'fix: blames a pr not on this branch', 1, 'Fixes #99'),
  ];

  it('drafts the blamed pull requests newest first, alternating test and tune, each with the nearest-sized clean control', () => {
    const { bugs, controls } = propose(HISTORY, 10);
    expect(bugs).toEqual([
      { id: 'bug-10', kind: 'bug', pr: 10, base: 'pb1aaaaaaaaa', head: 'b1aaaaaaaaaa', set: 'test' },
      { id: 'bug-11', kind: 'bug', pr: 11, base: 'pb2aaaaaaaaa', head: 'b2aaaaaaaaaa', set: 'tune' },
    ]);
    expect(controls.map((found) => [found.id, found.set, found.kind])).toEqual([
      ['control-41', 'test', 'control'],
      ['control-40', 'tune', 'control'],
    ]);
  });

  it('honours the limit, and stops when no control is left', () => {
    expect(propose(HISTORY, 1).bugs.map((found) => found.pr)).toEqual([10]);
    const scarce = propose([commit('a', 'Revert "x (#1)"', 1), commit('b', 'x (#1)', 1), commit('c', 'y (#2)', 1), commit('d', 'Revert "z (#3)"', 1), commit('e', 'z (#3)', 1)], 10);
    expect(scarce.bugs).toHaveLength(2);
    expect(scarce.controls.map((found) => found.pr)).toEqual([2]);
  });
});

describe('propose, choosing', () => {
  it('alternates test and tune past the second bug', () => {
    const history = [1, 2, 3].flatMap((pr) => [commit(`r${String(pr)}`, `Revert "x (#${String(pr)})"`, 1), commit(`b${String(pr)}`, `x (#${String(pr)})`, 1)]);
    expect(propose(history, 10).bugs.map((found) => found.set)).toEqual(['test', 'tune', 'test']);
  });

  it('takes a control only from a pull request, never a direct push, and never a fix', () => {
    const history = [commit('r', 'Revert "x (#1)"', 1), commit('b', 'x (#1)', 10), commit('d', 'direct push', 10), commit('f', 'fix: y (#3)', 10), commit('p', 'feat: a prefix option (#2)', 50)];
    expect(propose(history, 10).controls.map((found) => found.pr)).toEqual([2]);
  });
});

describe('toYaml', () => {
  it('writes a bug with an answer to fill in, and a control without one', () => {
    expect(toYaml({ id: 'bug-1', kind: 'bug', pr: 1, base: 'aaaaaaa', head: 'bbbbbbb', set: 'test' }, 'feat: x (#1)')).toBe(
      '# feat: x (#1)\nid: bug-1\nkind: bug\npr: 1\nbase: "aaaaaaa"\nhead: "bbbbbbb"\nanswer: TODO one sentence saying what the bug is, from the revert or the fix\nset: test\n',
    );
    expect(toYaml({ id: 'control-2', kind: 'control', pr: 2, base: '1234567', head: '7654321', set: 'tune' }, 's')).toContain('base: "1234567"\nhead: "7654321"\n');
    expect(toYaml({ id: 'control-2', kind: 'control', pr: 2, base: 'aaaaaaa', head: 'bbbbbbb', set: 'tune' }, 's')).toBe('# s\nid: control-2\nkind: control\npr: 2\nbase: "aaaaaaa"\nhead: "bbbbbbb"\nset: tune\n');
  });
});
