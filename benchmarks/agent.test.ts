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
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AGENT_ENV_RULE, agentEnv, type Attempt, blockers, classifyFailure, installTool, ISOLATION, isPosix, nothingCameBack, OUTPUT_FORMAT, parseClaudeJson, perTaskDetail, POSIX_ONLY, redact, resultObject, run, runOne, STORED_LOGIN_OPT_IN, storedLogin, summariseFailures, type Task, totalRecords, type Variant } from './axes/agent.js';
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

const task: Task = { id: 'stub', requirement: 'F1', prompt: 'find user.name with demo', setup: [], check: 'grep -qi ada "$BENCH_RESULT"', maxTurns: 5 };

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
