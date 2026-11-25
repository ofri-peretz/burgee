import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { packageRoot } from './core.js';

const scratch = scratchDirs();

const CLAUDE = join(packageRoot(), 'claude');
const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

/** Run one pack hook as Claude Code does: the payload on stdin, the decision on stdout. */
function hook(file: string, payload: unknown, env: Record<string, string> = {}): string {
  const r = spawnSync(process.execPath, [join(CLAUDE, file)], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...env } });
  expect(r.status).toBe(0);
  return r.stdout;
}

const decision = (out: string): string | undefined => (out ? (JSON.parse(out) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision : undefined);

describe('guard-bash', () => {
  it('passes its own deny, allow and ask cases', () => {
    const r = spawnSync(process.execPath, [join(CLAUDE, 'guard-bash.mjs'), '--self-test'], { encoding: 'utf8' });
    expect(r.stdout).toMatch(/^ok: \d+ denied, \d+ allowed, \d+ asked, \d+ timed, \d+ edits\n$/);
    expect(r.status).toBe(0);
  });

  it.each([
    ['git push --no-verify', 'deny'],
    ['LEFTHOOK=0 git push', 'deny'],
    ['git config core.hooksPath .nohooks', 'deny'],
    ['npm publish', 'ask'],
    ['git push origin main', undefined],
  ])('answers %s with %s', (command, want) => {
    expect(decision(hook('guard-bash.mjs', { tool_name: 'Bash', tool_input: { command, timeout: 600000 } }))).toBe(want);
  });

  it.each([
    [{}, 'deny'],
    [{ timeout: 120000 }, 'deny'],
    [{ timeout: 600000 }, undefined],
    [{ run_in_background: true }, undefined],
  ])('answers a foreground git push with %o by %s: its hooks outlive the default timeout', (input, want) => {
    const out = hook('guard-bash.mjs', { tool_name: 'Bash', tool_input: { command: 'git push -u origin x', ...input } });
    expect(decision(out)).toBe(want);
    if (want) expect(out).toContain('timeout: 600000');
  });

  it("asks before a command the repo lists and denies an edit under a frozen glob, from the repo's hookset.json", () => {
    const dir = scratch('hookset-claude-');
      mkdirSync(join(dir, '.claude'));
      writeFileSync(join(dir, '.claude/hookset.json'), JSON.stringify({ ask: ['vercel deploy --prod'], frozen: ['content/**/*.md', 'sdlc/baseline/*.json'] }));
      const env = { CLAUDE_PROJECT_DIR: dir };
      const listed = hook('guard-bash.mjs', { tool_input: { command: 'npx vercel deploy --prod' } }, env);
      expect(decision(listed)).toBe('ask');
      // A repo-listed phrase says why it was listed, not that it publishes: `-- --force` on a sync is not a release.
      expect(listed).toContain('.claude/hookset.json');
      expect(listed).not.toContain('publishes or deploys');
      expect(decision(hook('guard-bash.mjs', { tool_input: { file_path: join(dir, 'content/a/b.md') } }, env))).toBe('deny');
      expect(decision(hook('guard-bash.mjs', { tool_input: { file_path: 'sdlc/baseline/unscored.json' } }, env))).toBe('deny');
      expect(decision(hook('guard-bash.mjs', { tool_input: { file_path: join(dir, 'content/a/b.ts') } }, env))).toBeUndefined();
      // Dot segments cannot step around a frozen glob, given absolute or relative.
      expect(decision(hook('guard-bash.mjs', { tool_input: { file_path: `${dir}/content/../content/a/b.md` } }, env))).toBe('deny');
      expect(decision(hook('guard-bash.mjs', { tool_input: { file_path: './docs/../sdlc/baseline/unscored.json' } }, env))).toBe('deny');
  });

  it('denies an edit under a frozen glob when the paths come with Windows backslashes', () => {
    // A backslash in a directory name stands in for a Windows path on POSIX; Windows reads it as two folders.
    const dir = join(scratch('hookset-claude-'), 'win\\proj');
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude/hookset.json'), JSON.stringify({ frozen: ['content/**/*.md'] }));
    const file = `${dir}\\content\\a\\b.md`;
    expect(decision(hook('guard-bash.mjs', { tool_input: { file_path: file } }, { CLAUDE_PROJECT_DIR: dir }))).toBe('deny');
  });

  it("denies an edit to a generated file and names the command that writes it, from the repo's hookset.json", () => {
    const dir = scratch('hookset-claude-');
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude/hookset.json'), JSON.stringify({ generated: { 'public/r/**': 'npm run registry:build' } }));
    const env = { CLAUDE_PROJECT_DIR: dir };
    const out = hook('guard-bash.mjs', { tool_input: { file_path: join(dir, 'public/r/button.json') } }, env);
    expect(decision(out)).toBe('deny');
    expect(out).toContain('npm run registry:build');
    expect(decision(hook('guard-bash.mjs', { tool_input: { file_path: join(dir, 'src/button.tsx') } }, env))).toBeUndefined();
  });

  it('has no opinion on a payload it cannot read', () => {
    expect(hook('guard-bash.mjs', 'not json')).toBe('');
  });
});

describe('stop-after-3', () => {
  it('passes its own cases', () => {
    const r = spawnSync(process.execPath, [join(CLAUDE, 'stop-after-3.mjs'), '--self-test'], { encoding: 'utf8' });
    expect(r.stdout).toMatch(/^ok: \d+ counted, \d+ ignored, stop on 3\n$/);
  });

  it('ends the turn on the third failed test run in a session, and not before', () => {
    const session = `vitest-${String(process.pid)}-${String(Date.now())}`;
    const fail = { session_id: session, hook_event_name: 'PostToolUseFailure', tool_input: { command: 'npx vitest run' } };
    expect(hook('stop-after-3.mjs', fail)).toBe('');
    expect(hook('stop-after-3.mjs', { ...fail, hook_event_name: 'PostToolUse', tool_response: { exitCode: 1 } })).toBe('');
    const third = JSON.parse(hook('stop-after-3.mjs', fail)) as { continue: boolean; stopReason: string };
    expect(third.continue).toBe(false);
    expect(third.stopReason).toMatch(/failed 3 times in a row/);
    expect(hook('stop-after-3.mjs', fail)).toBe('');
  });

  it('keeps the count through an interrupted run: only a completed pass resets it', () => {
    const session = `vitest-int-${String(process.pid)}-${String(Date.now())}`;
    const fail = { session_id: session, hook_event_name: 'PostToolUseFailure', tool_input: { command: 'npx vitest run' } };
    hook('stop-after-3.mjs', fail);
    hook('stop-after-3.mjs', fail);
    expect(hook('stop-after-3.mjs', { ...fail, hook_event_name: 'PostToolUse', tool_response: { interrupted: true } })).toBe('');
    const third = JSON.parse(hook('stop-after-3.mjs', fail)) as { continue: boolean };
    expect(third.continue).toBe(false);
  });

  it('ignores commands that are not test runs, and payloads with no command', () => {
    expect(hook('stop-after-3.mjs', { session_id: 'x', hook_event_name: 'PostToolUseFailure', tool_input: { command: 'npm run build' } })).toBe('');
    expect(hook('stop-after-3.mjs', { session_id: 'x', tool_input: {} })).toBe('');
  });
});

describe('verify-before-stop', () => {
  it('passes its own cases', () => {
    const r = spawnSync(process.execPath, [join(CLAUDE, 'verify-before-stop.mjs'), '--self-test'], { encoding: 'utf8' });
    expect(r.stdout).toBe('ok: 17 cases\n');
  });

  it('sends a turn back once when code changed after the last passing test run, and lets it end after a pass', () => {
    const dir = scratch('hookset-vbs-');
    const git = (...args: string[]): void => void spawnSync('git', args, { cwd: dir, env: withoutGit() });
    git('init', '-q');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'root');
    const session = `vitest-vbs-${String(process.pid)}-${String(Date.now())}`;
    const stop = { session_id: session, hook_event_name: 'Stop', cwd: dir, stop_hook_active: false };
    expect(hook('verify-before-stop.mjs', stop)).toBe('');
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
    const back = JSON.parse(hook('verify-before-stop.mjs', stop)) as { decision: string; reason: string };
    expect(back.decision).toBe('block');
    expect(back.reason).toContain('a.ts');
    // The second stop of the same turn always ends it.
    expect(hook('verify-before-stop.mjs', { ...stop, stop_hook_active: true })).toBe('');
    const ran = { session_id: session, hook_event_name: 'PostToolUse', cwd: dir, tool_input: { command: 'npx vitest run' } };
    expect(hook('verify-before-stop.mjs', { ...ran, tool_response: { exitCode: 1 } })).toBe('');
    expect(hook('verify-before-stop.mjs', stop)).not.toBe('');
    // A background launch returns before its tests finish, so it proves nothing.
    expect(hook('verify-before-stop.mjs', { ...ran, tool_input: { command: 'npx vitest run', run_in_background: true }, tool_response: { exitCode: 0 } })).toBe('');
    expect(hook('verify-before-stop.mjs', stop)).not.toBe('');
    expect(hook('verify-before-stop.mjs', { ...ran, tool_response: { exitCode: 0 } })).toBe('');
    expect(hook('verify-before-stop.mjs', stop)).toBe('');
  });

  it('does not judge docs, or the globs the repo lists under verifyIgnore', () => {
    const dir = scratch('hookset-vbs-');
    spawnSync('git', ['init', '-q'], { cwd: dir, env: withoutGit() });
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude/hookset.json'), JSON.stringify({ verifyIgnore: ['.claude/**', 'fixtures/**'] }));
    mkdirSync(join(dir, 'fixtures'));
    writeFileSync(join(dir, 'fixtures/x.json'), '{}');
    writeFileSync(join(dir, 'README.md'), '# x\n');
    const stop = { session_id: `vitest-vbs-ign-${String(process.pid)}`, hook_event_name: 'Stop', cwd: dir };
    expect(hook('verify-before-stop.mjs', stop, { CLAUDE_PROJECT_DIR: dir })).toBe('');
  });
});
