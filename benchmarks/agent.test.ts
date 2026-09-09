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

import { blockers, installTool, isPosix, parseClaudeJson, POSIX_ONLY, run, runOne, type Task, type Variant } from './axes/agent.js';
import { type BenchRecord } from './record.js';

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

// The stub is a `#!/bin/sh` script and the tool is installed as one: POSIX only, the same
// constraint the axis itself declares.
describe.skipIf(!isPosix())('runOne against a stub binary', () => {
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

  it('names the platform when it is one the harness cannot run on', () => {
    expect(isPosix('win32')).toBe(false);
    expect(POSIX_ONLY).toContain('win32');
  });

  it('is satisfied on the credential when one is present', () => {
    const reasons = blockers({ ...process.env, CLAUDE_CODE_OAUTH_TOKEN: 'not-a-real-token' });
    expect(reasons.join('; ')).not.toContain('ANTHROPIC_API_KEY');
  });
});

/**
 * The wiring above `runOne`, pinned the same way.
 *
 * `emit.ts` proves that a band value names a record in the same document produced by an
 * axis whose status is `measured`. It cannot prove that the axis reached that record by
 * measuring something: replacing `run()`'s body with a table of plausible numbers passes
 * every other check in this repository, and both roadmap claims would read `met` with all
 * the locks green. So `run()` is driven here with a stub `claude` and two stub bins, and
 * the assertion is that the numbers it emits are the stub's numbers — a hard-coded table
 * fails, whatever it contains.
 */
describe.skipIf(!isPosix())('run(), end to end, against a stub claude', () => {
  /** A "built CLI": `run()` only needs the file to exist, since claude is the stub. */
  function stubBin(): string {
    const dir = mkdtempSync(join(tmpdir(), 'stub-bin-'));
    const bin = join(dir, 'bin.js');
    writeFileSync(bin, 'process.stdout.write("ada\\n");\n');
    return bin;
  }

  const variants: Variant[] = [
    { id: 'burgee', bin: stubBin(), floor: true },
    { id: 'commander', bin: stubBin(), floor: false },
  ];
  const env = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: 'stub' };
  const options = { variants, env, runs: 1, model: 'test-model', timeoutMs: 30_000, tasks: [task] };

  it('emits medians that are the stub\'s reported usage, not a table someone wrote down', () => {
    const out = run({ ...options, claudeBin: stubClaude('the value is ada') });
    if (!('records' in out)) throw new Error(`expected records, got: ${out.reason}`);
    const records: BenchRecord[] = out.records;
    const find = (variant: string, metric: string): number | undefined => records.find((r) => r.variant === variant && r.metric === metric)?.median;
    // 900 input + 300 cache read + 120 output, and num_turns 3, from stubClaude.
    expect(find('burgee', 'tokens-per-task')).toBe(1320);
    expect(find('burgee', 'turns-per-task')).toBe(3);
    expect(find('burgee', 'success-rate')).toBe(1);
    // Both variants ran the same stub, so the ratio the roadmap claim is settled against
    // is exactly 1 — and it is 1 because it was divided, not because it was written.
    expect(find('burgee ÷ commander', 'tokens-per-task-ratio')).toBe(1);
    expect(find('burgee ÷ commander', 'turns-per-task-ratio')).toBe(1);
  });

  it('skips rather than reporting zeros when the CLI answers but every run fails its check', () => {
    // The shape a broken-but-authenticated `claude` takes: usage comes back, no answer
    // passes. Reporting `measured` with a median of 0 would put a zero into a band.
    const out = run({ ...options, claudeBin: stubClaude('the value is bob') });
    expect(out).toMatchObject({ reason: expect.stringContaining('measured nothing') as unknown as string });
  });
});
