import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ambientRuntime, run } from 'bellpull';
import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { type Git } from './git.js';

import { loadChecklist, program, runCompile, runMatch, runProtect, runSeed, VERSION } from './index.js';

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

  it('matches nothing, and says so, when the base ref has no checklist file yet', async () => {
    const calls: string[] = [];
    const git: Git = {
      diff: (range) => (calls.push(range), Promise.resolve(DIFF)),
      show: () => Promise.reject(new Error("fatal: path 'c.yaml' does not exist in 'b'")),
    };
    const data = await runMatch({ repo: '/nowhere', git, base: 'b', checklist: 'c.yaml', worktree: false });
    expect(JSON.parse(JSON.stringify(data))).toEqual({ range: 'b...HEAD', checklist: 'b:c.yaml', fired: [], bootstrap: true });
    expect(text(data)).toBe('b:c.yaml does not exist yet: no checklist item to match');
    // The diff still runs, so a ref the checkout lacks fails there, with its fix.
    expect(calls).toEqual(['b...HEAD']);
    const missingRef: Git = { ...git, diff: () => Promise.reject(new Error('git diff failed. fix: pass a ref this checkout has')) };
    await expect(runMatch({ repo: '/nowhere', git: missingRef, base: 'b', checklist: 'c.yaml', worktree: false })).rejects.toThrow('fix: pass a ref');
    await expect(runMatch({ repo: '/nowhere', git, base: 'b', checklist: 'c.yaml', worktree: true })).rejects.toThrow();
  });

  it('still fails on a base checklist that is there and does not parse', async () => {
    const git = fakeGit(DIFF, { 'b:c.yaml': 'items: {' });
    await expect(runMatch({ repo: '/nowhere', git, base: 'b', checklist: 'c.yaml', worktree: false })).rejects.toThrow();
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

  it('passes, checking nothing, when the base branch has no checklist yet', async () => {
    const git: Git = { diff: () => Promise.resolve(GATE_DIFF), show: () => Promise.reject(new Error("fatal: path 'c.yaml' does not exist in 'b'")) };
    const data = await runProtect({ repo: '/', git, base: 'b', checklist: 'c.yaml', worktree: false, enforce: true });
    expect(JSON.parse(JSON.stringify(data))).toEqual({ range: 'b...HEAD', checklist: 'b:c.yaml', mode: 'enforce', gates: [], code: [], flagged: false, bootstrap: true });
    expect(text(data)).toBe('b:c.yaml does not exist yet: no gate to protect, so nothing is checked');
    await expect(runProtect({ repo: '/nowhere', git, base: 'b', checklist: 'c.yaml', worktree: true, enforce: true })).rejects.toThrow();
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

  it('drafts each lock check with the command that fits the repository it reads', () => {
    const lock = { 'scripts/a-lock.test.ts': '/** A. */' };
    const check = (files: Record<string, string>): string => (runSeed({ repo: folder({ ...lock, ...files }), checklist: 'c.yaml', locks: 'scripts', decisions: 'dec' }).items as { check: string }[])[0]?.check as string;
    expect(check({ 'vitest.config.ts': '', 'vitest.root.config.ts': "include: ['scripts/*.test.ts']", 'vitest-x.config.ts': 'scripts/' })).toBe('npx vitest run --config vitest.root.config.ts scripts/a-lock.test.ts');
    expect(check({ 'package.json': '{ "devDependencies": { "vitest": "4" } }' })).toBe('npx vitest run scripts/a-lock.test.ts');
    expect(check({ 'package.json': '{}' })).toBe('run scripts/a-lock.test.ts');
    expect(check({})).toBe('run scripts/a-lock.test.ts');
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

  it('declares its version and five commands plus burgee completion with their effects', async () => {
    const r = await runBurgee(program, { argv: ['--schema'] });
    const { commands } = JSON.parse(r.stdout) as { commands: { name: string; effects: string }[] };
    expect(Object.fromEntries(commands.map((c) => [c.name, c.effects]))).toEqual({ brief: 'read_only', match: 'read_only', protect: 'read_only', compile: 'idempotent', seed: 'read_only', completion: 'read_only' });
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
    expect(missing.code).toBe(ExitCode.OK);
    expect(missing.json).toMatchObject({ data: { checklist: 'main:nope.yaml', fired: [], bootstrap: true } });
  });

  it('match fails with the fix only for a ref the checkout does not have', async () => {
    const missing = await runBurgee(program, { argv: ['match', 'nosuchref', '--repo', repo, '--json'] });
    expect(missing.code).toBe(ExitCode.RUNTIME);
    expect(JSON.stringify(missing.json)).toMatch(/git diff [^"]*nosuchref\.\.\.HEAD -- failed: fatal: [^"\\]*\. fix: pass a ref this checkout has/);
  });

  it('brief hands over the base REVIEW.md, not the one the branch rewrote (R5)', async () => {
    const r = await runBurgee(program, { argv: ['brief', 'main', '--repo', repo, '--head', 'c0ffee'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toContain('## The rules (main:REVIEW.md, as the base branch has them)\n\na\n\n## The rules this diff fires');
    expect(r.stdout).not.toContain('\nb\n');
    expect(r.stdout).toContain('2 checklist item(s) fire for main...HEAD');
    expect(r.stdout).toContain('None: this is the first review of this pull request.');
    expect(r.stdout.trimEnd().endsWith('<!-- triggerlist-review head=c0ffee -->')).toBe(true);
  });

  it('brief still briefs when the base branch has no rules file or checklist yet', async () => {
    const r = await runBurgee(program, { argv: ['brief', 'main', '--repo', repo, '--head', 'c0ffee', '--review', 'NONE.md', '--checklist', 'none.yaml', '--json'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.json).toMatchObject({ data: { rules: 'main:NONE.md', checklist: 'main:none.yaml', fired: [] } });
    const text = await runBurgee(program, { argv: ['brief', 'main', '--repo', repo, '--head', 'c0ffee', '--review', 'NONE.md', '--checklist', 'none.yaml'] });
    expect(text.stdout).toContain("(main:NONE.md does not exist yet: review against the repo's own instructions)");
  });

  it('brief reads the previous round from the comments file, and --review names another rules file', async () => {
    writeFileSync(join(repo, 'comments.json'), JSON.stringify([{ body: 'thanks' }, { body: 'old\n<!-- triggerlist-review head=1111 -->' }, { body: 'newer\n<!-- triggerlist-review head=2222 -->' }]));
    const r = await runBurgee(program, { argv: ['brief', 'main', '--repo', repo, '--head', '3333', '--comments', 'comments.json', '--json'] });
    expect(r.json).toMatchObject({ data: { rules: 'main:REVIEW.md', checklist: 'main:.sdlc/checklist.yaml', fired: [{ id: 'spawn', at: ['src/a.ts:1'] }, { id: 'docs', at: ['REVIEW.md:1'] }], previous: true, head: '3333', marker: '<!-- triggerlist-review head=3333 -->' } });
    const text = await runBurgee(program, { argv: ['brief', 'main', '--repo', repo, '--head', '3333', '--comments', 'comments.json'] });
    expect(text.stdout).toContain('Reviewed at 2222.');
    expect(text.stdout).toContain('newer');
    const other = await runBurgee(program, { argv: ['brief', 'main', '--repo', repo, '--head', '3333', '--review', 'src/a.ts', '--json'] });
    expect(other.json).toMatchObject({ data: { rules: 'main:src/a.ts', previous: false } });
    expect((await runBurgee(program, { argv: ['brief', 'main', '--repo', repo, '--json'] })).code).toBe(ExitCode.USAGE);
  });

  it("brief quotes the author's replies posted after the previous round, and none before it", async () => {
    writeFileSync(join(repo, 'round.json'), JSON.stringify([{ body: 'changeset-for-package-change\n<!-- triggerlist-review head=1111 -->', created_at: '2026-11-20T10:00:00Z' }]));
    writeFileSync(
      join(repo, 'replies.json'),
      JSON.stringify([
        { body: 'stale reply', created_at: '2026-11-20T09:00:00Z', user: { login: 'author', type: 'User' } },
        { body: 'a test file is not shipped', created_at: '2026-11-20T11:00:00Z', user: { login: 'author', type: 'User' }, path: 'src/a.test.ts', line: 2 },
      ]),
    );
    const argv = ['brief', 'main', '--repo', repo, '--head', '3333', '--comments', 'round.json', '--replies', 'replies.json'];
    const json = await runBurgee(program, { argv: [...argv, '--json'] });
    expect(json.json).toMatchObject({ data: { previous: true, replies: 1 } });
    const text = await runBurgee(program, { argv });
    expect(text.stdout).toContain("## The author's replies since that round");
    expect(text.stdout).toContain('- @author, 2026-11-20T11:00:00Z on src/a.test.ts:2:\n\n> a test file is not shipped');
    expect(text.stdout).not.toContain('stale reply');
    const first = await runBurgee(program, { argv: ['brief', 'main', '--repo', repo, '--head', '3333', '--replies', 'replies.json', '--json'] });
    expect(first.json).toMatchObject({ data: { previous: false, replies: 0 } });
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
