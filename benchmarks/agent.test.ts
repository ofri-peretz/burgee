/**
 * The B1 harness, driven end to end against a stub `claude` binary.
 *
 * The axis cannot run here — no credential — and "we will find out whether the harness
 * works on the day we get one" is how a benchmark suite arrives already broken. So
 * everything except the model is exercised: a shell script standing in for `claude`
 * emits a canned `--output-format json` response, and `runOne` has to install the tool,
 * spawn the binary, parse the usage, run the task's check and reach the right verdict.
 * What is untested here is the model's behaviour, which is exactly what the credential
 * buys and nothing else can substitute for.
 */
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { blockers, installTool, parseClaudeJson, runOne, type Task } from './axes/agent.js';

const EXECUTABLE = 0o755;

/** A `claude` that answers with `result`, reporting the usage the real CLI would report. */
function stubClaude(result: string, extra: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'stub-claude-'));
  const bin = join(dir, 'claude');
  const body = JSON.stringify({ type: 'result', is_error: false, num_turns: 3, usage: { input_tokens: 900, cache_read_input_tokens: 300, output_tokens: 120 }, result, ...extra });
  writeFileSync(bin, `#!/bin/sh\ncat <<'JSON'\n${body}\nJSON\n`);
  chmodSync(bin, EXECUTABLE);
  return bin;
}

const task: Task = { id: 'stub', requirement: 'F1', prompt: 'find user.name with mytool', setup: [], check: 'grep -qi ada "$BENCH_RESULT"', maxTurns: 5 };

function attempt(bin: string, t: Task = task): ReturnType<typeof runOne> {
  const workdir = mkdtempSync(join(tmpdir(), 'bench-work-'));
  return runOne({ claudeBin: bin, task: t, toolDir: installTool('/bin/echo'), workdir, model: 'test-model', timeoutMs: 30_000 });
}

describe('parseClaudeJson', () => {
  it('counts cache reads as input tokens — a cached run is not a free run', () => {
    expect(parseClaudeJson(JSON.stringify({ usage: { input_tokens: 100, cache_read_input_tokens: 400, cache_creation_input_tokens: 50, output_tokens: 20 }, num_turns: 2 }))).toMatchObject({
      tokensIn: 550,
      tokensOut: 20,
      turns: 2,
    });
  });

  it('reads a missing usage field as zero rather than NaN, which would poison a median', () => {
    const usage = parseClaudeJson(JSON.stringify({ num_turns: 1 }));
    expect(usage.tokensIn).toBe(0);
    expect(Number.isNaN(usage.tokensOut)).toBe(false);
  });
});

describe('runOne against a stub binary', () => {
  it('succeeds when the answer passes the task check, and reports the usage', () => {
    const r = attempt(stubClaude('the value is ada'));
    expect(r).toMatchObject({ success: true, tokensIn: 1200, tokensOut: 120, turns: 3 });
  });

  it('fails when the answer does not pass the check — a confident wrong answer is a failed task', () => {
    expect(attempt(stubClaude('the value is grace')).success).toBe(false);
  });

  it('fails when the CLI itself reports an error, however plausible the text', () => {
    expect(attempt(stubClaude('the value is ada', { is_error: true })).success).toBe(false);
  });

  it('records a dead run as a failure with no numbers, never as a zero-token success', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stub-claude-'));
    const bin = join(dir, 'claude');
    writeFileSync(bin, '#!/bin/sh\nexit 1\n');
    chmodSync(bin, EXECUTABLE);
    const r = attempt(bin);
    expect(r).toMatchObject({ success: false, tokensIn: 0, turns: 0 });
  });

  it('keeps the transcript, so a number in the table can be traced to what was said', () => {
    expect(attempt(stubClaude('the value is ada')).transcript).toContain('num_turns');
  });
});

describe('blockers', () => {
  it('names the missing credential rather than letting the axis run and produce nothing', () => {
    const reasons = blockers({ PATH: process.env['PATH'] as string });
    expect(reasons.join('; ')).toContain('no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY');
  });

  it('is satisfied on the credential when one is present', () => {
    const reasons = blockers({ ...process.env, CLAUDE_CODE_OAUTH_TOKEN: 'not-a-real-token' });
    expect(reasons.join('; ')).not.toContain('ANTHROPIC_API_KEY');
  });
});
