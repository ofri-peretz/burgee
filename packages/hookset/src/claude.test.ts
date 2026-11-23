import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { packageRoot } from './core.js';

const scratch = scratchDirs();

const CLAUDE = join(packageRoot(), 'claude');

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
    expect(r.stdout).toMatch(/^ok: \d+ denied, \d+ allowed, \d+ asked\n$/);
    expect(r.status).toBe(0);
  });

  it.each([
    ['git push --no-verify', 'deny'],
    ['LEFTHOOK=0 git push', 'deny'],
    ['git config core.hooksPath .nohooks', 'deny'],
    ['npm publish', 'ask'],
    ['git push origin main', undefined],
  ])('answers %s with %s', (command, want) => {
    expect(decision(hook('guard-bash.mjs', { tool_name: 'Bash', tool_input: { command } }))).toBe(want);
  });

  it("asks before a command the repo lists and denies an edit under a frozen glob, from the repo's hookset.json", () => {
    const dir = scratch('hookset-claude-');
      mkdirSync(join(dir, '.claude'));
      writeFileSync(join(dir, '.claude/hookset.json'), JSON.stringify({ ask: ['vercel deploy --prod'], frozen: ['content/**/*.md', 'sdlc/baseline/*.json'] }));
      const env = { CLAUDE_PROJECT_DIR: dir };
      expect(decision(hook('guard-bash.mjs', { tool_input: { command: 'npx vercel deploy --prod' } }, env))).toBe('ask');
      expect(decision(hook('guard-bash.mjs', { tool_input: { file_path: join(dir, 'content/a/b.md') } }, env))).toBe('deny');
      expect(decision(hook('guard-bash.mjs', { tool_input: { file_path: 'sdlc/baseline/unscored.json' } }, env))).toBe('deny');
      expect(decision(hook('guard-bash.mjs', { tool_input: { file_path: join(dir, 'content/a/b.ts') } }, env))).toBeUndefined();
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

  it('ignores commands that are not test runs, and payloads with no command', () => {
    expect(hook('stop-after-3.mjs', { session_id: 'x', hook_event_name: 'PostToolUseFailure', tool_input: { command: 'npm run build' } })).toBe('');
    expect(hook('stop-after-3.mjs', { session_id: 'x', tool_input: {} })).toBe('');
  });
});
