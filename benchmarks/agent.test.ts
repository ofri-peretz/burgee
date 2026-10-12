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
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AGENT_ENV_RULE, agentEnv, armRecords, type Attempt, blockers, classifyFailure, installTool, ISOLATION, isPosix, MCP_ARM_OPT_IN, type McpConfig, mcpConfig, MODALITIES, nothingCameBack, OUTPUT_FORMAT, parseClaudeJson, perTaskDetail, POSIX_ONLY, priorReadings, type Reading, READINGS_METRIC, readTasks, redact, resultObject, run, runOne, STORED_LOGIN_OPT_IN, storedLogin, summariseFailures, type Task, tasksFor, totalRecords, type Variant, VARIANTS, variantsFor, writeMcpConfig } from './axes/agent.js';
import { SUITE } from './bands.js';
import { CLAIMS } from './claims.js';
import { buildDocument, type ResultsDoc } from './emit.js';
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

const task: Task = { id: 'stub', requirement: 'F1', prompt: 'find user.name with demo', setup: [], check: 'grep -qi ada "$BENCH_RESULT"', maxTurns: 5, modalities: ['cli'] };

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

  /**
   * The shape CI actually produces, and the reason B1 has never been measured (#276).
   *
   * `CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` with the secret
   * unset does not leave the variable absent — GitHub interpolates the empty string, so
   * the variable IS set and `=== undefined` is false. The guard did not fire, the axis
   * ran, `claude` failed to authenticate on all 25 runs, and the skip said "`claude`
   * answered but nothing it produced passed a task's own check" — sending a reader after
   * a prompt-quality problem that does not exist.
   */
  it('treats an empty credential as no credential — the shape an unset GitHub secret has', () => {
    const reasons = blockers({
      PATH: process.env['PATH'] as string,
      CLAUDE_CODE_OAUTH_TOKEN: '',
      ANTHROPIC_API_KEY: '',
    });
    expect(reasons.join('; ')).toContain('no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY');
  });

  it('treats a whitespace-only credential the same way', () => {
    const reasons = blockers({
      PATH: process.env['PATH'] as string,
      ANTHROPIC_API_KEY: '   ',
    });
    expect(reasons.join('; ')).toContain('no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY');
  });

  it('is satisfied on the credential when one is present', () => {
    const reasons = blockers({ ...process.env, CLAUDE_CODE_OAUTH_TOKEN: 'not-a-real-token' });
    expect(reasons.join('; ')).not.toContain('ANTHROPIC_API_KEY');
  });
});

/** A `claude` whose `auth status` reports `loggedIn`, the way the real CLI does. */
function stubAuth(loggedIn: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'stub-claude-auth-'));
  const bin = join(dir, 'claude');
  const body = JSON.stringify({ loggedIn, authMethod: loggedIn ? 'claude.ai' : 'none' });
  writeFileSync(bin, `#!/bin/sh\nif [ "$1" = auth ]; then cat <<'JSON'\n${body}\nJSON\n[ ${loggedIn ? '0' : '1'} = 0 ]; exit $?; fi\nexit 0\n`);
  chmodSync(bin, EXECUTABLE);
  return bin;
}

const noCredential = (reasons: string[]): boolean => reasons.join('; ').includes('no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY');

describe.skipIf(!isPosix())('a stored claude login', () => {
  const bare = { PATH: process.env['PATH'] as string };

  it('satisfies the credential when opted into and `claude auth status` says it is logged in', () => {
    expect(storedLogin({ ...bare, [STORED_LOGIN_OPT_IN]: '1' }, stubAuth(true))).toBe(true);
    expect(noCredential(blockers({ ...bare, [STORED_LOGIN_OPT_IN]: '1' }, stubAuth(true)))).toBe(false);
  });

  // A logged-in `claude` on PATH is the normal state of a developer's machine; spending on
  // it without being asked would make every `npm run bench` a paid run.
  it('is never used unless opted into, however logged in `claude` is', () => {
    expect(storedLogin(bare, stubAuth(true))).toBe(false);
    expect(noCredential(blockers(bare, stubAuth(true)))).toBe(true);
  });

  // The #276 shape from the other side: an expired login must stop the axis before it
  // spends 50 runs failing to authenticate.
  it('is refused when `claude auth status` says the login is gone', () => {
    expect(storedLogin({ ...bare, [STORED_LOGIN_OPT_IN]: '1' }, stubAuth(false))).toBe(false);
    expect(noCredential(blockers({ ...bare, [STORED_LOGIN_OPT_IN]: '1' }, stubAuth(false)))).toBe(true);
  });

  it('is refused when `auth status` does not answer in JSON', () => {
    expect(storedLogin({ ...bare, [STORED_LOGIN_OPT_IN]: '1' }, stubClaude('not an auth document'))).toBe(false);
  });
});

describe.skipIf(!isPosix())('isolation from the machine it runs on', () => {
  // The owner's ~/.claude measured at 10,228 tokens a turn; without these flags a local run
  // measures that configuration as much as it measures the CLI.
  it('spawns claude with only the configuration this repository controls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stub-claude-argv-'));
    const bin = join(dir, 'claude');
    // Answers with its own argv, so the assertion reads what was actually spawned.
    writeFileSync(bin, `#!/bin/sh\nprintf '{"type":"result","is_error":false,"num_turns":1,"usage":{},"result":"%s"}' "$*"\n`);
    chmodSync(bin, EXECUTABLE);
    const argv = attempt(bin).result;
    expect(argv).toContain(ISOLATION.join(' '));
    expect(argv).toContain('--setting-sources project,local');
    expect(argv).toContain(OUTPUT_FORMAT.join(' '));
  });
});

/**
 * D-20260930-b1-ci-environment. The first CI run read burgee at 6 turns against a local 3,
 * and the first suspect was the runner's environment leaking into the tool: `claude` was
 * spawned with `{ ...process.env }`, so on CI the CLI under test saw `CI=true` and
 * `GITHUB_ACTIONS=true`, and burgee's output policy reads `CI`. It turned out not to be the
 * cause — burgee's demo prints byte-identical output either way — but a benchmark that
 * measures a different environment on each machine is one it cannot be sure of, so the
 * environment is now the same on both, and says so.
 */
describe.skipIf(!isPosix())('the environment the measured tool runs in', () => {
  const runner = { PATH: '/usr/bin', HOME: '/home/runner', CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_SHA: 'abc', RUNNER_OS: 'Linux', ACTIONS_RUNTIME_TOKEN: 'x', CLAUDE_CODE_OAUTH_TOKEN: 'kept', CIRCLE: 'kept' };

  it('drops what a CI runner sets and a laptop does not, and keeps the credential', () => {
    const env = agentEnv(runner, '/tool');
    expect(Object.keys(env).toSorted()).toEqual(['CIRCLE', 'CLAUDE_CODE_OAUTH_TOKEN', 'HOME', 'PATH']);
    expect(env['PATH']).toBe('/tool:/usr/bin');
    expect(AGENT_ENV_RULE).toContain('CI, GITHUB_*, RUNNER_*, ACTIONS_*');
  });

  it('is what claude is actually spawned with', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stub-claude-env-'));
    const bin = join(dir, 'claude');
    // Answers with the variables it was given, so the assertion reads the real spawn.
    writeFileSync(bin, `#!/bin/sh\nprintf '{"type":"result","is_error":false,"num_turns":1,"usage":{},"result":"CI=%s GHA=%s tool=%s"}' "$CI" "$GITHUB_ACTIONS" "$(command -v demo)"\n`);
    chmodSync(bin, EXECUTABLE);
    const workdir = mkdtempSync(join(tmpdir(), 'bench-work-'));
    const r = runOne({ claudeBin: bin, task, toolDir: installTool('/bin/echo'), workdir, model: 'm', timeoutMs: 30_000, env: { ...process.env, CI: 'true', GITHUB_ACTIONS: 'true' } });
    expect(r.result).toMatch(/^CI= GHA= tool=\/.+\/demo$/);
  });
});

describe('reading claude\'s output', () => {
  // `--output-format stream-json --verbose`: one event a line, the result last.
  const stream = [
    JSON.stringify({ type: 'system', subtype: 'init', claude_code_version: '2.1.283' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'demo --help' } }] } }),
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 4, usage: { input_tokens: 10, output_tokens: 5 }, result: 'ada', permission_denials: [{}, {}] }),
    '',
  ].join('\n');

  it('takes the result event out of a stream, and still reads a single JSON result', () => {
    expect(resultObject(stream)).toMatchObject({ type: 'result', num_turns: 4 });
    expect(parseClaudeJson(stream)).toMatchObject({ turns: 4, tokensIn: 10, tokensOut: 5, denials: 2, result: 'ada' });
    expect(resultObject(JSON.stringify({ num_turns: 1 }))).toEqual({ num_turns: 1 });
    expect(resultObject('not json\n{"type":"assistant"}')).toBeUndefined();
  });
});

describe.skipIf(!isPosix())('a run that ended at --max-turns', () => {
  // `claude` exits 1 on error_max_turns after spending every turn it had. Those runs were
  // recorded as 0 tokens and 0 turns, which pulled a variant's medians down for each run it
  // failed that way — the opposite of what the run cost.
  it('keeps the turns and tokens it spent, and is a failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stub-claude-mt-'));
    const bin = join(dir, 'claude');
    const body = JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, num_turns: 16, usage: { input_tokens: 350_000, output_tokens: 2000 }, permission_denials: [{}, {}, {}] });
    writeFileSync(bin, `#!/bin/sh\ncat <<'JSON'\n${body}\nJSON\nexit 1\n`);
    chmodSync(bin, EXECUTABLE);
    const r = attempt(bin);
    expect(r).toMatchObject({ success: false, usage: true, turns: 16, tokensIn: 350_000, denials: 3 });
    expect(r.failure?.kind).toBe('max-turns');
  });
});

/** One attempt of `task` that took `turns` turns, a thousand tokens each and one refusal. */
const a = (task: string, turns: number, success: boolean, extra: Partial<Attempt> = {}): Attempt => ({ task, tokensIn: turns * 1000, tokensOut: 0, turns, denials: 1, isError: !success, result: '', success, usage: true, transcript: '', ...extra });

describe('perTaskDetail', () => {

  it('lists every run of every task, so a median can be traced to the task that moved it', () => {
    const detail = perTaskDetail([
      a('recover', 16, false, { failure: { task: 'recover', kind: 'max-turns', exit: '1', excerpt: '' } }),
      a('recover', 3, false, { failure: { task: 'recover', kind: 'check-failed', exit: '0', excerpt: '' } }),
      a('discover', 6, true),
      a('discover', 0, false, { usage: false, failure: { task: 'discover', kind: 'timeout', exit: 'signal SIGTERM', excerpt: '' } }),
    ]);
    expect(detail).toEqual({
      'recover.turns': '16,3',
      'recover.tokens': '16000,3000',
      'recover.passed': '0/2',
      'recover.denials': 2,
      'recover.failures': 'max-turns×1, check-failed×1',
      'discover.turns': '6,-',
      'discover.tokens': '6000,-',
      'discover.passed': '1/2',
      'discover.denials': 2,
      'discover.failures': 'timeout×1',
    });
  });
});

const read = (records: BenchRecord[], variant: string, metric: string): number | undefined => records.find((r) => r.variant === variant && r.metric === metric)?.median;

/**
 * D-20261009-b1-totals-and-explain: the two claims are settled on totals over every task-run,
 * not on the pooled median. The fixture has the shape that made the median a coin flip.
 * burgee holds at 3 turns and commander's median is 4, so the median ratio is 0.75, while
 * burgee's lead sits in one long task the median cannot see.
 */
describe('totalRecords', () => {
  const ours = [a('easy', 3, true), a('easy', 3, true), a('easy', 3, true), a('long', 3, true), a('long', 8, true)];
  const theirs = [a('easy', 4, true), a('easy', 4, true), a('easy', 4, true), a('long', 6, true), a('long', 14, true)];

  it('sums each variant\'s turns and tokens over its task-runs, and divides the sums', () => {
    const records = totalRecords(new Map([['burgee', ours], ['commander', theirs]]), {});
    expect(read(records, 'burgee', 'turns-total')).toBe(20);
    expect(read(records, 'burgee', 'tokens-total')).toBe(20_000);
    expect(read(records, 'commander', 'turns-total')).toBe(32);
    expect(read(records, 'commander', 'tokens-total')).toBe(32_000);
    // 20 / 32, where the pooled medians read 3 / 4 = 0.75.
    expect(read(records, 'burgee ÷ commander', 'turns-total-ratio')).toBe(0.625);
    expect(read(records, 'burgee ÷ commander', 'tokens-total-ratio')).toBe(0.625);
  });

  it('leaves a run that reported no usage out of the sum, and divides per run so a lost run flatters neither side', () => {
    const lost = a('long', 0, false, { usage: false });
    const records = totalRecords(new Map([['burgee', [...ours.slice(0, 4), lost]], ['commander', theirs]]), {});
    expect(read(records, 'burgee', 'turns-total')).toBe(12);
    expect(records.find((r) => r.variant === 'burgee' && r.metric === 'turns-total')?.samples).toBe(4);
    // (12 / 4) / (32 / 5) = 3 / 6.4, not 12 / 32.
    expect(read(records, 'burgee ÷ commander', 'turns-total-ratio')).toBe(0.469);
  });

  it('emits nothing when either side measured nothing', () => {
    expect(totalRecords(new Map([['burgee', ours], ['commander', []]]), {})).toEqual([]);
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
/** A "built CLI": `run()` only needs the file to exist, since claude is the stub. */
function stubBin(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stub-bin-'));
  const bin = join(dir, 'bin.js');
  writeFileSync(bin, 'process.stdout.write("ada\\n");\n');
  return bin;
}

describe.skipIf(!isPosix())('run(), end to end, against a stub claude', () => {
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
    // The totals the claims are settled on (D-20261009-b1-totals-and-explain): one run of one
    // task, so each total is that run's usage, and the ratio of the totals is again exactly 1.
    expect(find('burgee', 'tokens-total')).toBe(1320);
    expect(find('burgee', 'turns-total')).toBe(3);
    expect(find('burgee ÷ commander', 'tokens-total-ratio')).toBe(1);
    expect(find('burgee ÷ commander', 'turns-total-ratio')).toBe(1);
  });

  it('records the agent, its environment and every task\'s runs, and keeps each run\'s transcript', () => {
    const transcriptDir = join(mkdtempSync(join(tmpdir(), 'b1-transcripts-')), 'out');
    const out = run({ ...options, env: { ...env, CLAUDE_CODE_OAUTH_TOKEN: 'secret-oauth-value' }, claudeBin: stubClaude('the value is ada secret-oauth-value'), transcriptDir });
    if (!('records' in out)) throw new Error(`expected records, got: ${out.reason}`);
    const success = out.records.find((r) => r.variant === 'burgee' && r.metric === 'success-rate');
    expect(success?.detail).toMatchObject({ model: 'test-model', env: AGENT_ENV_RULE, 'stub.turns': '3', 'stub.passed': '1/1', 'stub.denials': 0 });
    expect(String(success?.detail?.['claude'])).toMatch(/^claude /);
    expect(typeof success?.detail?.['claudePinned']).toBe('boolean');
    expect(readdirSync(transcriptDir).toSorted()).toEqual(['burgee-stub-0.jsonl', 'commander-stub-0.jsonl']);
    const transcript = readFileSync(join(transcriptDir, 'burgee-stub-0.jsonl'), 'utf8');
    expect(transcript).toContain('num_turns');
    expect(transcript).not.toContain('secret-oauth-value');
  });

  it('skips rather than reporting zeros when the CLI answers but every run fails its check', () => {
    // The shape a broken-but-authenticated `claude` takes: usage comes back, no answer
    // passes. Reporting `measured` with a median of 0 would put a zero into a band.
    const out = run({ ...options, claudeBin: stubClaude('the value is bob') });
    expect(out).toMatchObject({ reason: expect.stringContaining('measured nothing') as unknown as string });
  });
});

/**
 * A `claude` that fails the way the CLI fails on an API error: it still prints its JSON
 * result, with `is_error` set and the reason in `result`, and exits 1. The payload is the
 * shape 2.1.283 printed for a rejected OAuth token, captured with a fake one.
 */
function failingClaude(fields: Record<string, unknown>, exitCode = 1): string {
  const dir = mkdtempSync(join(tmpdir(), 'stub-claude-fail-'));
  const bin = join(dir, 'claude');
  const body = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, num_turns: 1, total_cost_usd: 0, modelUsage: {}, usage: {}, permission_denials: [], ...fields });
  writeFileSync(bin, `#!/bin/sh\nif [ "$1" = --version ]; then echo '9.9.9 (Claude Code)'; exit 0; fi\ncat <<'JSON'\n${body}\nJSON\nexit ${String(exitCode)}\n`);
  chmodSync(bin, EXECUTABLE);
  return bin;
}

// Assembled at runtime so no token-shaped literal sits in the repository for a scanner.
const FAKE_OAUTH = ['sk', 'ant', 'oat01', 'AAAAbbbbCCCCdddd1234'].join('-');

describe.skipIf(!isPosix())('a failed run says why it failed (run 36352045743)', () => {
  const variants: Variant[] = [
    { id: 'burgee', bin: stubBin(), floor: true },
    { id: 'commander', bin: stubBin(), floor: false },
  ];
  const env = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: 'stub' };
  const options = { variants, env, runs: 2, model: 'test-model', timeoutMs: 30_000, tasks: [task] };

  it('names a rejected credential, with the task, exit code and the CLI\'s own fields', () => {
    const out = run({ ...options, claudeBin: failingClaude({ api_error_status: 401, terminal_reason: 'api_error', result: 'Failed to authenticate. API Error: 401 OAuth access token is invalid.' }) });
    if (!('reason' in out)) throw new Error('expected a skip');
    expect(out.reason).toContain('measured nothing');
    expect(out.reason).toContain('failures by kind: auth×2');
    expect(out.reason).toContain('[stub] auth (exit 1, is_error true, subtype success, api 401, terminal_reason api_error)');
    expect(out.reason).toContain('OAuth access token is invalid');
    expect(out.reason).toContain('claude 9.9.9 (Claude Code)');
    // Only said when it is what happened: here the model never saw the prompt.
    expect(out.reason).not.toContain('answered but');
    // One line, because it is written to $GITHUB_OUTPUT as `reason=…`.
    expect(out.reason).not.toMatch(/\n/);
    // Two identical failures are one example, not two.
    expect(out.reason.match(/\[stub\]/g)).toHaveLength(1);
  });

  it('never prints a credential, even when claude echoes one', () => {
    const secretEnv = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: 'plain-secret-value-42' };
    const out = run({ ...options, env: secretEnv, claudeBin: failingClaude({ api_error_status: 401, result: `bad token ${FAKE_OAUTH} and oat01-zzzzzzzzzz` }) });
    if (!('reason' in out)) throw new Error('expected a skip');
    expect(out.reason).not.toContain(FAKE_OAUTH);
    expect(out.reason).not.toContain('oat01-zzzz');
    expect(out.reason).toContain('[REDACTED]');
    expect(redact('x plain-secret-value-42 y', secretEnv)).toBe('x [REDACTED] y');
  });

  it('truncates the excerpt at about 200 characters', () => {
    const out = run({ ...options, claudeBin: failingClaude({ result: 'x'.repeat(1000) }) });
    if (!('reason' in out)) throw new Error('expected a skip');
    expect(out.reason).toContain(`"${'x'.repeat(200)}…"`);
    expect(out.reason).not.toContain('x'.repeat(201));
  });

  it('keeps the old sentence for runs that completed and gave a wrong answer', () => {
    const out = run({ ...options, claudeBin: stubClaude('the value is bob') });
    if (!('reason' in out)) throw new Error('expected a skip');
    expect(out.reason).toContain("answered but nothing it produced passed a task's own check");
    expect(out.reason).toContain('check-failed×2');
    expect(out.reason).toContain('"the value is bob"');
  });

  it('reads stderr when claude printed no JSON at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stub-claude-'));
    const bin = join(dir, 'claude');
    writeFileSync(bin, `#!/bin/sh\necho "error: unknown option '--strict-mcp-config'" >&2\nexit 2\n`);
    chmodSync(bin, EXECUTABLE);
    const r = attempt(bin);
    expect(r.failure).toMatchObject({ task: 'stub', kind: 'no-output', exit: '2', excerpt: "error: unknown option '--strict-mcp-config'" });
  });
});

const json = (fields: Record<string, unknown>): string => JSON.stringify({ type: 'result', usage: {}, ...fields });

describe('classifyFailure', () => {
  const base = { task: 't', status: 1, signal: null, timedOut: false, stderr: '' };

  it.each([
    ['auth', { is_error: true, result: 'Invalid API key · Please run /login' }],
    ['auth', { is_error: true, api_error_status: 403, result: 'forbidden' }],
    ['rate-limit', { is_error: true, api_error_status: 429, result: 'slow down' }],
    ['rate-limit', { is_error: true, result: 'Claude AI usage limit reached|1790000000' }],
    ['max-turns', { is_error: true, subtype: 'error_max_turns', result: '' }],
    ['api-error', { is_error: true, api_error_status: 404, terminal_reason: 'api_error', result: 'model not found' }],
    ['permission-denied', { is_error: false, permission_denials: [{ tool_name: 'Bash' }], result: 'I was not allowed' }],
    ['cli-error', { is_error: true, result: 'something else' }],
  ] as const)('sorts %s', (kind, fields) => {
    expect(classifyFailure({ ...base, stdout: json(fields) }).kind).toBe(kind);
  });

  it('sorts a clean exit whose answer failed the check as check-failed', () => {
    expect(classifyFailure({ ...base, status: 0, stdout: json({ is_error: false, result: 'bob' }) })).toMatchObject({ kind: 'check-failed', excerpt: 'bob' });
  });

  it('sorts a timeout before anything it printed', () => {
    expect(classifyFailure({ ...base, status: null, signal: 'SIGTERM', timedOut: true, stdout: '' })).toMatchObject({ kind: 'timeout', exit: 'signal SIGTERM' });
  });

  it('sorts output that is not JSON as unparseable, and quotes it', () => {
    expect(classifyFailure({ ...base, stdout: 'Error: boom' })).toMatchObject({ kind: 'unparseable-output', excerpt: 'Error: boom' });
  });
});

describe('summariseFailures', () => {
  it('is empty when nothing failed', () => {
    const ok: Attempt = { task: 't', tokensIn: 1, tokensOut: 1, turns: 1, denials: 0, isError: false, result: 'ada', success: true, usage: true, transcript: '{}' };
    expect(summariseFailures([ok])).toBe('');
    expect(nothingCameBack({ id: 'v', bin: 'x', floor: true }, [])).toContain('measured nothing');
  });
});

describe('the tool is installed under the name the demos print (D-20261008-b1-tool-name)', () => {
  it('matches the name each demo CLI declares', () => {
    const repo = join(import.meta.dirname, '..');
    const burgeeName = /name: '([^']+)'/u.exec(readFileSync(join(repo, 'examples/demo-cli-burgee/src/index.ts'), 'utf8'))?.[1];
    const commanderName = /new lib\.Command\('([^']+)'\)/u.exec(readFileSync(join(repo, 'examples/demo-cli-commander/src/program.ts'), 'utf8'))?.[1];
    const installed = readdirSync(installTool('/bin/echo'));
    expect(installed).toEqual([burgeeName]);
    expect(installed).toEqual([commanderName]);
  });
});

/**
 * `.sdlc/intents/b1-mcp-arm/` — the same demo, the same tasks, served over `--mcp`.
 *
 * Everything below runs without a credential and without a model. The arm adds paid runs to a
 * reading (spec R4 bounds where), so its harness is proven here against a stub `claude` and a
 * stub MCP server, and the one thing left untested is again the model's behaviour.
 */
const TASKS_DIR = join(import.meta.dirname, 'tasks');
const taskFiles = readdirSync(TASKS_DIR).filter((f) => f.endsWith('.json')).toSorted();
const rawTask = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(TASKS_DIR, file), 'utf8')) as Record<string, unknown>;

describe('R1 — each task declares the modalities it can be stated in', () => {
  it.each(taskFiles)('%s declares `modalities`, a set of known surfaces that includes the CLI', (file) => {
    const modalities = rawTask(file)['modalities'];
    expect(Array.isArray(modalities), `${file} has no \`modalities\` field`).toBe(true);
    const list = modalities as unknown[];
    expect(list).toContain('cli');
    for (const m of list) expect(MODALITIES).toContain(m);
    expect(new Set(list).size).toBe(list.length);
  });

  it.each(taskFiles)('%s, when it is an `mcp` task, has a check that never shells out to `demo`', (file) => {
    const raw = rawTask(file);
    if (!(raw['modalities'] as string[] | undefined)?.includes('mcp')) return;
    // An agent on the MCP arm has no shell: a check that ran `demo` would grade the CLI.
    expect(String(raw['check'])).not.toMatch(/\bdemo\b/u);
    // The exemplar is a plausible answer from either arm, so it names no shell command.
    expect(String(raw['exemplar'])).not.toMatch(/`demo [^`]*`/u);
  });

  it('excludes `non-tty-required` by name: a terminal behaviour MCP does not have', () => {
    expect(rawTask('non-tty-required.json')['modalities']).toEqual(['cli']);
  });

  it('records the reason beside every CLI-only task in tasks/README.md', () => {
    const readme = readFileSync(join(TASKS_DIR, 'README.md'), 'utf8');
    const cliOnly = taskFiles.map((f) => rawTask(f)).filter((t) => (t['modalities'] as string[] | undefined)?.join() === 'cli');
    expect(cliOnly.length).toBeGreaterThan(0);
    for (const t of cliOnly) {
      const row = readme.split('\n').find((l) => l.startsWith(`| \`${String(t['id'])}\` |`));
      expect(row, `tasks/README.md gives no reason for ${String(t['id'])} being CLI-only`).toBeDefined();
      expect(row).toMatch(/\| `cli` \| .{20,} \|$/u);
    }
  });

  it('hands each arm only the tasks it can be stated in', () => {
    const tasks = readTasks();
    expect(tasksFor('cli', tasks)).toHaveLength(tasks.length);
    const mapped = tasksFor('mcp', tasks);
    expect(mapped.length).toBeGreaterThan(0);
    expect(mapped.map((t) => t.id)).not.toContain('non-tty-required');
  });
});

/**
 * A built "demo" that is a minimal MCP server when it is passed `--mcp`: it answers
 * `initialize` with its own argv, so a test can read what the config actually started.
 */
function stubMcpBin(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stub-mcp-bin-'));
  const bin = join(dir, 'bin.js');
  writeFileSync(
    bin,
    [
      "if (!process.argv.includes('--mcp')) { process.stdout.write('ada\\n'); process.exit(0); }",
      "if (process.argv.includes('--print-config')) process.exit(0);",
      "let buf = '';",
      "process.stdin.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const m = JSON.parse(line); if (m.id === undefined) continue;",
      "  const result = m.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'demo', version: '0.0.0' }, argv: process.argv.slice(2) } : { tools: [{ name: 'config_get', inputSchema: { type: 'object' } }] };",
      "  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n'); } });",
      "process.stdin.on('end', () => process.exit(0));",
    ].join('\n'),
  );
  return bin;
}

/** `initialize` then `tools/list` against the server a config names, the way a client starts it. */
function handshake(server: { command: string; args?: string[] }): unknown[] {
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'b1-test', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ]
    .map((m) => JSON.stringify(m))
    .join('\n');
  const r = spawnSync(server.command, server.args ?? [], { input: `${input}\n`, encoding: 'utf8', timeout: 30_000 });
  return r.stdout
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as unknown);
}

/** A `claude` that answers with its argv, and copies the `--mcp-config` file it was handed beside it. */
function argvClaude(): { bin: string; seen: string } {
  const dir = mkdtempSync(join(tmpdir(), 'stub-claude-mcp-'));
  const bin = join(dir, 'claude');
  const seen = join(dir, 'mcp-config-seen.json');
  writeFileSync(
    bin,
    `#!/bin/sh\nif [ "$1" = --version ]; then echo '9.9.9 (Claude Code)'; exit 0; fi\nprev=''\nfor a in "$@"; do if [ "$prev" = --mcp-config ]; then cp "$a" "${seen}"; fi; prev="$a"; done\nprintf '{"type":"result","is_error":false,"num_turns":2,"usage":{"input_tokens":500,"output_tokens":100},"result":"ada %s"}' "$*"\n`,
  );
  chmodSync(bin, EXECUTABLE);
  return { bin, seen };
}

const MCP_TASK: Task = { ...task, id: 'mapped', modalities: ['cli', 'mcp'] };

describe.skipIf(!isPosix())('R2 — a `burgee-mcp` variant', () => {
  it('is declared beside the two existing builds: the burgee demo, on the floor, over MCP', () => {
    const burgee = VARIANTS.find((v) => v.id === 'burgee');
    expect(VARIANTS.find((v) => v.id === 'burgee-mcp')).toEqual({ id: 'burgee-mcp', bin: burgee?.bin, floor: true, modality: 'mcp' });
  });

  it('runs only when the caller opts into it, so a push to main spends nothing on it', () => {
    expect(variantsFor({}).map((v) => v.id)).toEqual(['burgee', 'commander']);
    expect(variantsFor({ [MCP_ARM_OPT_IN]: '0' }).map((v) => v.id)).toEqual(['burgee', 'commander']);
    expect(variantsFor({ [MCP_ARM_OPT_IN]: '1' }).map((v) => v.id)).toEqual(['burgee', 'commander', 'burgee-mcp']);
  });

  it('writes a config whose one server is the demo, started with `--mcp`, and the server answers', () => {
    const toolDir = installTool(stubMcpBin());
    const { config, server } = mcpConfig(toolDir);
    expect(Object.keys(config.mcpServers)).toEqual([server]);
    const entry = config.mcpServers[server];
    expect(entry?.args).toContain('--mcp');
    const replies = handshake(entry ?? { command: 'false' });
    expect(replies[0]).toMatchObject({ id: 1, result: { serverInfo: { name: 'demo' }, argv: ['--mcp'] } });
    expect(replies[1]).toMatchObject({ id: 2, result: { tools: [{ name: 'config_get' }] } });
  });

  it('takes the config the demo prints itself (`--mcp --print-config`, mcp-current R6) when it prints one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stub-printer-'));
    const bin = join(dir, 'bin.js');
    writeFileSync(bin, `process.stdout.write(JSON.stringify({ mcpServers: { demo: { command: 'printed-by-the-demo', args: ['--mcp'] } } }));\n`);
    expect(mcpConfig(installTool(bin))).toEqual({ server: 'demo', config: { mcpServers: { demo: { command: 'printed-by-the-demo', args: ['--mcp'] } } }, source: 'print-config' });
  });

  it('spawns claude with --mcp-config and --strict-mcp-config, the demo\'s tools allowed and no Bash', () => {
    const { bin, seen } = argvClaude();
    const toolDir = installTool(stubMcpBin());
    const workdir = mkdtempSync(join(tmpdir(), 'bench-work-'));
    const r = runOne({ claudeBin: bin, task: MCP_TASK, toolDir, workdir, model: 'm', timeoutMs: 30_000, modality: 'mcp', mcp: writeMcpConfig(toolDir) });
    expect(r.success).toBe(true);
    expect(r.result).toContain('--mcp-config ');
    expect(r.result).toContain(ISOLATION.join(' '));
    expect(r.result).toContain(OUTPUT_FORMAT.join(' '));
    expect(r.result).toContain('--allowedTools mcp__demo ');
    expect(r.result).not.toContain('Bash');
    expect(r.result).toContain(`--max-turns ${String(MCP_TASK.maxTurns)}`);
    expect(r.result).toContain('--model m');
    // The file claude was handed starts the demo's server.
    const handed = JSON.parse(readFileSync(seen, 'utf8')) as McpConfig;
    expect(handshake(handed.mcpServers['demo'] ?? { command: 'false' })[0]).toMatchObject({ result: { serverInfo: { name: 'demo' } } });
  });

  it('leaves the CLI arms\' spawn exactly as it was', () => {
    const { bin } = argvClaude();
    const r = attempt(bin);
    expect(r.result).toContain("--allowedTools Bash(demo:*)");
    expect(r.result).not.toContain('--mcp-config');
  });

  it('runs the arm on the mapped tasks only, through run(), when it is opted into', () => {
    const { bin } = argvClaude();
    const transcriptDir = join(mkdtempSync(join(tmpdir(), 'b1-mcp-transcripts-')), 'out');
    const cliOnly: Task = { ...task, id: 'cli-only', modalities: ['cli'] };
    const out = run({
      variants: [
        { id: 'burgee', bin: stubMcpBin(), floor: true },
        { id: 'commander', bin: stubMcpBin(), floor: false },
        { id: 'burgee-mcp', bin: stubMcpBin(), floor: true, modality: 'mcp' },
      ],
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: 'stub' },
      runs: 1,
      model: 'm',
      timeoutMs: 30_000,
      tasks: [MCP_TASK, cliOnly],
      claudeBin: bin,
      transcriptDir,
      readings: [],
    });
    if (!('records' in out)) throw new Error(`expected records, got: ${out.reason}`);
    expect(readdirSync(transcriptDir).toSorted()).toEqual(['burgee-cli-only-0.jsonl', 'burgee-mapped-0.jsonl', 'burgee-mcp-mapped-0.jsonl', 'commander-cli-only-0.jsonl', 'commander-mapped-0.jsonl']);
    expect(readFileSync(join(transcriptDir, 'burgee-mcp-mapped-0.jsonl'), 'utf8')).toContain('--mcp-config');
  });
});

/** One reading's `burgee-mcp ÷ burgee` ratio, the shape a landed results file carries. */
const reading = (ratio: number, i: number): Reading => ({ file: `2026-10-${String(13 + 7 * i).padStart(2, '0')}-abc${String(i)}def-weekly-ci.json`, ratio });

describe('R3 — medians and ranges, never one run', () => {
  // `burgee` ran three tasks; only `p` and `q` map to MCP, so `r` must never enter the ratio.
  const cli = [a('p', 2, true), a('p', 4, true), a('p', 3, true), a('q', 6, true), a('q', 8, true), a('r', 40, true), a('r', 50, true)];
  const mcp = [a('p', 3, true), a('p', 5, true), a('p', 1, true), a('q', 6, true), a('q', 0, false, { usage: false })];
  const byVariant = new Map([['burgee', cli], ['burgee-mcp', mcp]]);
  const records = armRecords(byVariant, ['p', 'q'], {}, []);
  const rec = (variant: string, metric: string): BenchRecord | undefined => records.find((r) => r.variant === variant && r.metric === metric);

  it('reports, per arm over the mapped tasks, the median, the range and the run count of tokens and turns', () => {
    // burgee on p and q only: turns 2,4,3,6,8 → median 4, range 2–8; r's 40 and 50 are not in it.
    expect(rec('burgee', 'mcp-mapped-turns-per-task')).toMatchObject({ median: 4, samples: 5, detail: { min: 2, max: 8, tasks: 'p,q' } });
    expect(rec('burgee', 'mcp-mapped-tokens-per-task')).toMatchObject({ median: 4000, detail: { min: 2000, max: 8000 } });
    // burgee-mcp: one run reported no usage, so 4 measured; turns 3,5,1,6 → nearest-rank median 3.
    expect(rec('burgee-mcp', 'mcp-mapped-turns-per-task')).toMatchObject({ median: 3, samples: 4, detail: { min: 1, max: 6, runs: 5, passed: 4 } });
  });

  it('reports each mapped task\'s median and range, per arm', () => {
    expect(rec('burgee', 'mcp-mapped-turns-per-task')?.detail).toMatchObject({ 'p.median': 3, 'p.min': 2, 'p.max': 4, 'q.median': 6, 'q.min': 6, 'q.max': 8 });
    expect(rec('burgee-mcp', 'mcp-mapped-turns-per-task')?.detail).toMatchObject({ 'p.median': 3, 'q.median': 6, 'q.runs': 2 });
  });

  it('reports the success rate over the mapped tasks', () => {
    expect(rec('burgee-mcp', 'mcp-mapped-success-rate')).toMatchObject({ median: 0.8, samples: 5 });
    expect(rec('burgee', 'mcp-mapped-success-rate')).toMatchObject({ median: 1, samples: 5 });
  });

  it('divides burgee-mcp by burgee over the same task set only, per measured run', () => {
    // tokens per measured run: mcp (3+5+1+6)/4 = 3.75k; cli on p,q (2+4+3+6+8)/5 = 4.6k → 0.815.
    expect(rec('burgee-mcp ÷ burgee', 'mcp-tokens-total-ratio')?.median).toBe(0.815);
    expect(rec('burgee-mcp ÷ burgee', 'mcp-turns-total-ratio')?.median).toBe(0.815);
  });

  it('emits no ratio when either arm measured nothing, and nothing at all without the arm', () => {
    expect(armRecords(new Map([['burgee', cli]]), ['p', 'q'], {}, [])).toEqual([]);
    expect(armRecords(new Map([['burgee', cli], ['burgee-mcp', [a('p', 0, false, { usage: false })]]]), ['p'], {}, []).filter((r) => r.variant === 'burgee-mcp ÷ burgee')).toEqual([]);
  });

  it('a fixture with one reading produces no verdict record', () => {
    expect(rec('burgee-mcp ÷ burgee', READINGS_METRIC)).toBeUndefined();
  });

  it('produces no verdict record with three readings, and computes one with four', () => {
    const three = armRecords(byVariant, ['p', 'q'], {}, [reading(0.7, 0), reading(1.3, 1)]);
    expect(three.find((r) => r.metric === READINGS_METRIC)).toBeUndefined();
    const four = armRecords(byVariant, ['p', 'q'], {}, [reading(0.6, 0), reading(1.3, 1), reading(0.905, 2)]);
    // Readings 0.6, 1.3, 0.905 and this one's 0.815. With an even count the median is the
    // midpoint of the middle two, (0.815 + 0.905) / 2 = 0.86: the nearest-rank rule the rest of
    // the suite uses would take the lower one, and the lower ratio is always the MCP side's.
    expect(four.find((r) => r.metric === READINGS_METRIC)).toMatchObject({ variant: 'burgee-mcp ÷ burgee', unit: 'ratio', samples: 4, median: 0.86, detail: { min: 0.6, max: 1.3 } });
    expect(String(four.find((r) => r.metric === READINGS_METRIC)?.detail?.['readings'])).toContain('abc0def');
  });

  it('declares the claim `cli-vs-mcp-tokens` against that record, whichever way it falls', () => {
    const claim = CLAIMS.find((c) => c.id === 'cli-vs-mcp-tokens');
    expect(claim?.from).toEqual({ axis: 'agent', variant: 'burgee-mcp ÷ burgee', metric: READINGS_METRIC });
    expect(claim?.test).toEqual({ min: 1 });
  });

  it('keeps the claim unmeasured with three readings and computes its verdict with four, never typed', () => {
    // The two records the agent bands read, so the document is one `buildDocument` accepts.
    const bandRecords: BenchRecord[] = (['tokens-per-task', 'turns-per-task'] as const).map((metric) => ({ axis: 'agent', variant: 'burgee', metric, unit: metric.split('-')[0] ?? '', samples: 1, median: 1, p95: 1 }));
    const doc = (prior: Reading[]): ResultsDoc =>
      buildDocument({ suite: SUITE.agent, commit: 'deadbeef', machine: {}, measured: '2026-10-13T05:40:00.000Z', axes: { agent: { status: 'measured', method: 'm' } }, records: [...bandRecords, ...armRecords(byVariant, ['p', 'q'], {}, prior)] });
    expect(doc([reading(0.7, 0), reading(1.3, 1)]).claims['cli-vs-mcp-tokens']).toMatchObject({ status: 'unmeasured' });
    expect(doc([reading(0.6, 0), reading(1.3, 1), reading(0.905, 2)]).claims['cli-vs-mcp-tokens']).toMatchObject({ measured: 0.86, met: false });
    expect(doc([reading(1.7, 0), reading(1.3, 1), reading(1.1, 2)]).claims['cli-vs-mcp-tokens']).toMatchObject({ measured: 1.2, met: true });
  });

  it('reads earlier readings from landed CI results files, and only those', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-results-'));
    const file = (ratio: number): string => JSON.stringify({ records: [{ axis: 'agent', variant: 'burgee-mcp ÷ burgee', metric: 'mcp-tokens-total-ratio', median: ratio }] });
    writeFileSync(join(dir, '2026-10-13-aaaaaaa-weekly-ci.json'), file(0.9));
    writeFileSync(join(dir, '2026-10-14-bbbbbbb-local.json'), file(0.1));
    writeFileSync(join(dir, '2026-10-15-ccccccc-ci.json'), JSON.stringify({ records: [] }));
    expect(priorReadings(dir)).toEqual([{ file: '2026-10-13-aaaaaaa-weekly-ci.json', ratio: 0.9 }]);
  });
});
