import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ambientRuntime, run } from 'bellpull';
import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { type Git } from './git.js';

import { loadChecklist, program, runBrief, runCompile, runMatch, runProtect, runSeed, runStale, VERSION } from './index.js';

const TEXT = Symbol.for('burgee.text');
const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();

const CHECKLIST = `gates: [REVIEW.md, .sdlc/checklist.yaml]
items:
  - id: spawn
    trigger: { paths: ['src/**'], pattern: 'child_process' }
    question: Does it spawn through bellpull?
    check: run the inline-implementation lock
    sources: [scripts/inline-implementation-lock.test.ts]
  - id: docs
    trigger: { paths: ['**/*.md'] }
    question: Is every number sourced?
    check: read REVIEW.md
    sources: [CLAUDE.md]
`;

const DIFF = `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+import 'node:child_process';\n`;
const GATE_DIFF = `${DIFF}diff --git a/REVIEW.md b/REVIEW.md\n--- a/REVIEW.md\n+++ b/REVIEW.md\n@@ -1 +1 @@\n-a\n+b\n`;

const fakeGit = (diff: string, files: Record<string, string>): Git & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    diff: (range) => {
      calls.push(`diff ${range}`);
      return Promise.resolve(diff);
    },
    show: (ref, path) => {
      calls.push(`show ${ref}:${path}`);
      return Promise.resolve(files[`${ref}:${path}`] as string);
    },
  };
};

const scratch = scratchDirs();

const folder = (files: Record<string, string>): string => {
  const dir = scratch('triggerlist-');
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
};

// From a worktree's pre-push, an inherited GIT_DIR would point `git init` at the real repository.
const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const gitIn = async (cwd: string, args: string[]): Promise<void> => {
  const result = await run('git', args, { cwd, runtime: ambientRuntime(), env: withoutGit() });
  if (!result.ok) throw new Error(result.stderr);
};

describe('loadChecklist', () => {
  it('reads the base branch copy by default, and the working tree only when asked', async () => {
    const dir = folder({ 'c.yaml': 'gates: [local]\nitems: []\n' });
    const git = fakeGit('', { 'main:c.yaml': 'gates: [base]\nitems: []\n' });
    expect(await loadChecklist(dir, git, 'c.yaml', 'main')).toEqual({ source: 'main:c.yaml', checklist: { gates: ['base'], items: [] } });
    expect(await loadChecklist(dir, git, 'c.yaml', undefined)).toEqual({ source: 'c.yaml', checklist: { gates: ['local'], items: [] } });
  });
});

describe('runMatch', () => {
  it('reads the checklist from the base and the diff of base...HEAD, and reports what fired', async () => {
    const git = fakeGit(DIFF, { 'origin/main:.sdlc/checklist.yaml': CHECKLIST });
    const data = await runMatch({ repo: '/nowhere', git, base: 'origin/main', checklist: '.sdlc/checklist.yaml', worktree: false });
    expect(git.calls).toEqual(['show origin/main:.sdlc/checklist.yaml', 'diff origin/main...HEAD']);
    expect(JSON.parse(JSON.stringify(data))).toEqual({
      range: 'origin/main...HEAD',
      checklist: 'origin/main:.sdlc/checklist.yaml',
      fired: [{ id: 'spawn', question: 'Does it spawn through bellpull?', check: 'run the inline-implementation lock', sources: ['scripts/inline-implementation-lock.test.ts'], at: ['src/a.ts:1'] }],
    });
    expect(text(data)).toBe('1 checklist item(s) fire for origin/main...HEAD:\n\nspawn: Does it spawn through bellpull?\n  check: run the inline-implementation lock\n  at: src/a.ts:1');
  });

  it('reads the working-tree checklist with worktree', async () => {
    const dir = folder({ 'c.yaml': CHECKLIST });
    const git = fakeGit('', {});
    const data = await runMatch({ repo: dir, git, base: 'b', checklist: 'c.yaml', worktree: true });
    expect(data.checklist).toBe('c.yaml');
    expect(git.calls).toEqual(['diff b...HEAD']);
  });
});

const baseGit = (diff: string) => fakeGit(diff, { 'b:c.yaml': CHECKLIST });

describe('runProtect', () => {

  it('observes by default: flagged, exit 0', async () => {
    const data = await runProtect({ repo: '/', git: baseGit(GATE_DIFF), base: 'b', checklist: 'c.yaml', worktree: false, enforce: false });
    expect(JSON.parse(JSON.stringify(data))).toEqual({ range: 'b...HEAD', checklist: 'b:c.yaml', mode: 'observe', gates: ['REVIEW.md'], code: ['src/a.ts'], flagged: true });
    expect(text(data)).toContain('(observe mode: not failing)');
  });

  it('fails in enforce mode when flagged, with a fix', async () => {
    const data = await runProtect({ repo: '/', git: baseGit(GATE_DIFF), base: 'b', checklist: 'c.yaml', worktree: false, enforce: true });
    expect(data).toMatchObject({ mode: 'enforce', exitCode: ExitCode.RUNTIME, fix: 'land the gate change in its own pull request first' });
    expect(text(data)).not.toContain('observe');
  });

  it('passes in enforce mode when not flagged', async () => {
    const data = await runProtect({ repo: '/', git: baseGit(DIFF), base: 'b', checklist: 'c.yaml', worktree: false, enforce: true });
    expect(data).not.toHaveProperty('exitCode');
    expect(data).not.toHaveProperty('fix');
    expect(text(data)).toBe('b...HEAD does not change a gate together with the code it judges');
  });

  it('reads the gates from the working tree with worktree', async () => {
    const dir = folder({ 'c.yaml': 'gates: [src/**]\nitems: []\n' });
    const data = await runProtect({ repo: dir, git: baseGit(GATE_DIFF), base: 'b', checklist: 'c.yaml', worktree: true, enforce: false });
    expect(data).toMatchObject({ checklist: 'c.yaml', gates: ['src/a.ts'], code: ['REVIEW.md'] });
  });
});

describe('runBrief', () => {
  const REVIEW_BASE = '# REVIEW.md\n- the base rule';

  it('briefs from the base REVIEW.md and checklist, not the copies the change edited', async () => {
    const dir = folder({ 'REVIEW.md': '# REVIEW.md\n- a rule this change wrote', 'c.yaml': 'gates: []\nitems: []\n' });
    const git = fakeGit(DIFF, { 'b:c.yaml': CHECKLIST, 'b:REVIEW.md': REVIEW_BASE });
    const data = await runBrief({ repo: dir, git, base: 'b', checklist: 'c.yaml', worktree: false, head: 'f00d', review: 'REVIEW.md' });
    expect(git.calls).toEqual(['show b:c.yaml', 'diff b...HEAD', 'show b:REVIEW.md']);
    expect(data).toMatchObject({ range: 'b...HEAD', head: 'f00d', review: 'b:REVIEW.md', fired: ['spawn'] });
    expect(data).not.toHaveProperty('previous');
    expect(text(data)).toContain('- the base rule');
    expect(text(data)).not.toContain('a rule this change wrote');
    expect(text(data)).toContain('spawn: Does it spawn through bellpull?');
    expect(text(data)).toContain('<!-- triggerlist:reviewed f00d -->');
  });

  it('carries the last marked comment from a comments file as the previous round', async () => {
    const dir = folder({ 'comments.json': JSON.stringify([{ body: 'round one: src/a.ts:1 spawns directly\n<!-- triggerlist:reviewed beef -->' }, { body: 'ok' }]) });
    const git = fakeGit(DIFF, { 'b:c.yaml': CHECKLIST, 'b:REVIEW.md': REVIEW_BASE });
    const data = await runBrief({ repo: dir, git, base: 'b', checklist: 'c.yaml', worktree: false, head: 'f00d', review: 'REVIEW.md', comments: 'comments.json' });
    expect(data).toMatchObject({ previous: 'beef' });
    expect(text(data)).toContain('round one: src/a.ts:1 spawns directly');
  });

  it('says so when the base branch has no REVIEW.md yet, and briefs the fired items alone', async () => {
    const git = fakeGit('', { 'b:c.yaml': CHECKLIST });
    const failing: Git = { ...git, show: (ref, path) => (path === 'REVIEW.md' ? Promise.reject(new Error('missing')) : git.show(ref, path)) };
    const data = await runBrief({ repo: '/nowhere', git: failing, base: 'b', checklist: 'c.yaml', worktree: false, head: 'f00d', review: 'REVIEW.md' });
    expect(data).toMatchObject({ review: 'none', fired: [] });
    expect(text(data)).toContain('The base branch has no REVIEW.md yet');
  });
});

describe('runStale', () => {
  it('passes when the head is the SHA reviewed, and fails with a fix when it moved', () => {
    const fresh = runStale('abc', 'abc');
    expect(JSON.parse(JSON.stringify(fresh))).toEqual({ reviewed: 'abc', head: 'abc', stale: false });
    expect(text(fresh)).toBe('the review is of the head, abc');
    const moved = runStale('abc', 'def');
    expect(moved).toMatchObject({ stale: true, exitCode: ExitCode.RUNTIME, fix: 'the run on def reviews it' });
    expect(text(moved)).toBe('stale: this review is of abc, and the head is now def. fix: the run on def reviews it');
  });
});

describe('runCompile', () => {
  const options = { checklist: 'c.yaml', out: 'R.md', budget: 150_000, check: false };

  it('writes the file, then reports unchanged on a second run', () => {
    const dir = folder({ 'c.yaml': CHECKLIST });
    const first = runCompile({ ...options, repo: dir });
    expect(first).toMatchObject({ out: 'R.md', rules: 2, changed: true, budget: 150_000 });
    expect(text(first)).toMatch(/^wrote R\.md, 2 rule\(s\), \d+ of 150000 bytes$/);
    const written = readFileSync(join(dir, 'R.md'), 'utf8');
    expect(written).toContain('- `spawn` Does it spawn through bellpull? ([why](scripts/inline-implementation-lock.test.ts))');
    expect(first.bytes).toBe(Buffer.byteLength(written));
    const second = runCompile({ ...options, repo: dir });
    expect(second.changed).toBe(false);
    expect(text(second)).toMatch(/^unchanged: R\.md/);
  });

  it('with check, fails on a stale or missing file and writes nothing; passes on a fresh one', () => {
    const dir = folder({ 'c.yaml': CHECKLIST });
    const missing = runCompile({ ...options, repo: dir, check: true });
    expect(missing).toMatchObject({ stale: true, changed: false, exitCode: ExitCode.RUNTIME, fix: 'run `triggerlist compile` and commit the result' });
    expect(text(missing)).toBe('R.md is not what the checklist compiles to. fix: run `triggerlist compile` and commit the result');
    runCompile({ ...options, repo: dir });
    const fresh = runCompile({ ...options, repo: dir, check: true });
    expect(fresh).toMatchObject({ stale: false });
    expect(fresh).not.toHaveProperty('exitCode');
    expect(text(fresh)).toBe('R.md is up to date');
    writeFileSync(join(dir, 'R.md'), 'edited by hand');
    expect(runCompile({ ...options, repo: dir, check: true }).stale).toBe(true);
    expect(readFileSync(join(dir, 'R.md'), 'utf8')).toBe('edited by hand');
  });

  it('over budget, fails and names the rules to drop, by the firing counts given', () => {
    const dir = folder({ 'c.yaml': CHECKLIST, 'f.json': '{"docs": 3}' });
    const data = runCompile({ ...options, repo: dir, budget: 10, firings: 'f.json' });
    expect(data).toMatchObject({ changed: false, drop: ['spawn', 'docs'], exitCode: ExitCode.RUNTIME, fix: 'drop the least-fired rules: spawn, docs' });
    expect(text(data)).toMatch(/^R\.md would be \d+ bytes, over the 10-byte budget\. fix: drop the least-fired rules: spawn, docs$/);
    expect(() => readFileSync(join(dir, 'R.md'))).toThrow();
  });
});

describe('runSeed', () => {
  it('drafts from lock tests and decisions, skipping ids already in the checklist and files that do not qualify', () => {
    const dir = folder({
      'c.yaml': 'gates: []\nitems:\n  - { id: kept-lock, trigger: { paths: [x] }, question: q, check: c, sources: [s] }\n',
      'scripts/kept-lock.test.ts': '/** Kept. */',
      'scripts/new-lock.test.ts': '/** New rule. */',
      'scripts/plain.test.ts': '/** Not a lock. */',
      'scripts/empty-lock.test.ts': 'no comment',
      'dec/D-1-a.md': '---\nid: D-1-a\nsubject: S\n---',
      'dec/notes.txt': '---\nid: D-2\nsubject: S\n---',
    });
    const data = runSeed({ repo: dir, checklist: 'c.yaml', locks: 'scripts', decisions: 'dec' });
    expect(data).toMatchObject({ drafted: 2, skipped: 1 });
    expect((data.items as { id: string }[]).map((item) => item.id)).toEqual(['new-lock', 'd-1-a']);
    expect(text(data).split('\n')[0]).toBe('# 2 draft item(s) from triggerlist seed. Narrow each trigger before it goes into the checklist.');
  });

  it('works without a checklist or the folders', () => {
    const dir = folder({});
    expect(runSeed({ repo: dir, checklist: 'c.yaml', locks: 'scripts', decisions: 'dec' })).toMatchObject({ drafted: 0, skipped: 0 });
  });
});

describe('the program', () => {
  let repo: string;
  const git = (...args: string[]) => gitIn(repo, args);

  beforeAll(async () => {
    repo = folder({ '.sdlc/checklist.yaml': CHECKLIST, 'src/a.ts': 'x\n', 'REVIEW.md': 'a\n' });
    await git('init', '-q', '-b', 'main');
    await git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
    await git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base');
    await git('checkout', '-qb', 'change');
    writeFileSync(join(repo, 'src/a.ts'), "import 'node:child_process';\n");
    writeFileSync(join(repo, 'REVIEW.md'), 'b\n');
    await git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'change');
    // A change to the checklist on the branch must not change what fires: the base copy is read.
    writeFileSync(join(repo, '.sdlc/checklist.yaml'), 'gates: []\nitems: []\n');
    await git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'weaken');
  });

  it('declares its version and six commands plus burgee completion with their effects', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    const { commands } = JSON.parse(r.stdout) as { commands: { name: string; effects: string }[] };
    expect(Object.fromEntries(commands.map((c) => [c.name, c.effects]))).toEqual({
      match: 'read_only',
      brief: 'read_only',
      stale: 'read_only',
      protect: 'read_only',
      compile: 'idempotent',
      seed: 'read_only',
      completion: 'read_only',
    });
    expect((await runBurgee(program, { argv: ['--version'] })).stdout).toContain(VERSION);
  });

  it('match reads the base copy of the checklist from a real repository', async () => {
    const r = await runBurgee(program, { argv: ['match', 'main', '--repo', repo, '--json'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.json).toMatchObject({ data: { checklist: 'main:.sdlc/checklist.yaml', fired: [{ id: 'spawn', at: ['src/a.ts:1'] }, { id: 'docs', at: ['REVIEW.md:1'] }] } });
  });

  it('match with --worktree reads the weakened copy, and --checklist names another file', async () => {
    const r = await runBurgee(program, { argv: ['match', 'main', '--repo', repo, '--worktree', '--json'] });
    expect(r.json).toMatchObject({ data: { fired: [] } });
    const missing = await runBurgee(program, { argv: ['match', 'main', '--repo', repo, '--checklist', 'nope.yaml', '--json'] });
    expect(missing.code).toBe(ExitCode.RUNTIME);
    expect(JSON.stringify(missing.json)).toMatch(/git show main:nope\.yaml failed: fatal: [^"\\]*\. fix: pass a ref this checkout has/);
  });

  it('brief reads REVIEW.md from the base of a real repository whose branch edited it', async () => {
    const r = await runBurgee(program, { argv: ['brief', 'main', '--repo', repo, '--head', 'f00d'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toContain('\na\n');
    expect(r.stdout).not.toContain('\nb\n');
    expect(r.stdout).toContain('<!-- triggerlist:reviewed f00d -->');
  });

  it('stale exits 1 when the head moved', async () => {
    expect((await runBurgee(program, { argv: ['stale', 'abc', 'abc'] })).code).toBe(ExitCode.OK);
    expect((await runBurgee(program, { argv: ['stale', 'abc', 'def', '--json'] })).code).toBe(ExitCode.RUNTIME);
  });

  it('protect --enforce fails on a gate changed with code', async () => {
    expect((await runBurgee(program, { argv: ['protect', 'main', '--repo', repo, '--json'] })).code).toBe(ExitCode.OK);
    const r = await runBurgee(program, { argv: ['protect', 'main', '--repo', repo, '--enforce', '--json'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.json).toMatchObject({ data: { gates: ['.sdlc/checklist.yaml', 'REVIEW.md'], code: ['src/a.ts'] } });
  });

  it('compile and seed run with their defaults', async () => {
    const dir = folder({ '.sdlc/checklist.yaml': CHECKLIST, 'scripts/x-lock.test.ts': '/** X. */' });
    const compiled = await runBurgee(program, { argv: ['compile', '--repo', dir, '--json'] });
    expect(compiled.json).toMatchObject({ data: { out: 'REVIEW.md', budget: 150_000, changed: true } });
    expect((await runBurgee(program, { argv: ['compile', '--repo', dir, '--check', '--json'] })).json).toMatchObject({ data: { stale: false } });
    expect((await runBurgee(program, { argv: ['compile', '--repo', dir, '--budget', '5', '--json'] })).code).toBe(ExitCode.RUNTIME);
    const seeded = await runBurgee(program, { argv: ['seed', '--repo', dir, '--json'] });
    expect(seeded.json).toMatchObject({ data: { drafted: 1, items: [{ id: 'x-lock' }] } });
    const elsewhere = await runBurgee(program, { argv: ['seed', '--repo', dir, '--locks', 'none', '--decisions', 'none', '--checklist', 'none.yaml', '--json'] });
    expect(elsewhere.json).toMatchObject({ data: { drafted: 0 } });
  });
});
