/**
 * B1 — what an agent spends to get a task done, on a CLI that meets the floor versus one
 * that does not.
 *
 * **This axis does not run without a credential, and it says so rather than estimating.**
 * It needs `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` (or a stored `claude` login
 * opted into with `BURGEE_USE_CLAUDE_LOGIN=1`) and the `claude` binary. It first ran on
 * 2026-09-24 (D-147); without a credential it returns a reason and `run.ts` marks the axis `skipped`, which
 * `emit.ts` turns into a band entry carrying that reason instead of a number. Nothing in
 * this file can produce a plausible-looking figure from a run that did not happen — that
 * is deliberate, and `emit.test.ts` proves it: the roadmap's headline claim ("≥40% fewer
 * tokens and ≥30% fewer turns") has never been measured, and a suite that quietly
 * extrapolated it would be worse than the suite not existing.
 *
 * Everything that does not need the credential is exercised: `parseClaudeJson` is pinned
 * against a canned response, `runOne` **and `run()` itself** are driven end to end against
 * a stub `claude` binary (`agent.test.ts`), and every task's `check` is proved to fail on
 * the un-run state (`tasks.test.ts`). `run()` is on that list deliberately: the honesty
 * rule in `emit.ts` can prove a band value came from a record produced by a measured
 * axis, but not that the axis produced that record by measuring anything — a `run()`
 * returning a table of plausible numbers would pass every other check in the repository.
 * What remains untested is the model's behaviour, which is the thing the credential buys.
 *
 * The first run (`results/agent-cli-bench/2026-09-24-2a51440-local.json`): tokens ratio
 * 0.601 against the ≤ 0.6 claim — not met, by 0.001 — and turns 0.600 against ≤ 0.7, met.
 * It ran `claude` 2.1.145; CI runs the pinned 2.1.283, and its first reading (burgee 6 turns
 * to the local 3) is a different agent's, not a regression (D-20260930-b1-ci-environment).
 * Every record now names the `claude` version and the environment it ran in.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type BenchRecord } from '../record.js';
import { median, p95, round } from '../stats.js';

const BENCH_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = resolve(BENCH_ROOT, '..');
const TASKS_DIR = join(BENCH_ROOT, 'tasks');

export interface Task {
  id: string;
  requirement: string;
  prompt: string;
  setup: string[];
  check: string;
  maxTurns: number;
}

/**
 * The two builds under test. The repo stopped being "a layer over commander" on
 * 2026-09-06 and became the engine, so `LAYER=off` is no longer a build flag: the honest
 * off-state is the same demo program on commander, which has none of the floor — no
 * `--schema`, no `{ ok, data }` envelope, no provenance, help text on a runtime failure.
 * One variable, two bins the repo already builds and the conformance suite already
 * proves behave identically where the floor does not apply.
 */
export interface Variant {
  id: string;
  /** Repo-relative, or absolute when a test supplies its own. */
  bin: string;
  /** Whether this build meets the agent-native floor: the one variable under test. */
  floor: boolean;
}

export const VARIANTS: readonly Variant[] = [
  { id: 'burgee', bin: 'examples/demo-cli-burgee/dist/bin.js', floor: true },
  { id: 'commander', bin: 'examples/demo-cli-commander/dist/bin.js', floor: false },
];

export type VariantId = string;

export interface ClaudeUsage {
  tokensIn: number;
  tokensOut: number;
  turns: number;
  isError: boolean;
  result: string;
  /** `permission_denials` as the CLI counts them: tool calls it refused, each one a turn spent. */
  denials: number;
}

const NUMBER_FIELDS = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'] as const;

/** A missing usage field reads as zero, never NaN: one NaN poisons a median. */
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/**
 * The run's result object out of what `claude -p` printed. `--output-format json` prints it
 * alone; `--output-format stream-json --verbose`, which the harness uses so that every turn
 * is on the record, prints one JSON event per line and the result last. Either is read.
 */
export function resultObject(stdout: string): Record<string, unknown> | undefined {
  const whole = tryParse(stdout);
  if (whole !== undefined) return whole;
  const lines = stdout.split('\n').filter((l) => l.trim() !== '');
  for (let i = lines.length - 1; i >= 0; i--) {
    const event = tryParse(lines[i] ?? '');
    if (event?.['type'] === 'result') return event;
  }
  return undefined;
}

/**
 * `claude -p` reports usage in its own shape. Cache reads are input
 * tokens the run actually consumed, so they are counted: leaving them out would make a
 * cached run look free, and a benchmark that rewards caching is measuring the cache.
 *
 * "Turns" is `num_turns` as the CLI reports it — the definition is the CLI's, recorded in
 * `results.schema.json`, so nobody has to guess later what the number counted.
 */
export function parseClaudeJson(stdout: string): ClaudeUsage {
  const raw = resultObject(stdout) ?? (JSON.parse(stdout) as Record<string, unknown>);
  const usage = (raw['usage'] ?? {}) as Record<string, unknown>;
  const tokensIn = NUMBER_FIELDS.reduce((sum, f) => sum + num(usage[f]), 0);
  return {
    tokensIn,
    tokensOut: num(usage['output_tokens']),
    turns: num(raw['num_turns']),
    isError: raw['is_error'] === true,
    result: typeof raw['result'] === 'string' ? raw['result'] : '',
    denials: Array.isArray(raw['permission_denials']) ? raw['permission_denials'].length : 0,
  };
}

export const readTasks = (): Task[] =>
  readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith('.json'))
    .toSorted()
    .map((f) => JSON.parse(readFileSync(join(TASKS_DIR, f), 'utf8')) as Task);

/** A scratch PATH holding one executable called `demo` — the name both demo CLIs declare and print, so the command an agent reads in their help and errors is the one it can run (D-20261008-b1-tool-name). */
export function installTool(binPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bench-tool-'));
  const shim = join(dir, 'demo');
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${binPath}" "$@"\n`);
  const EXECUTABLE = 0o755;
  chmodSync(shim, EXECUTABLE);
  return dir;
}

export interface RunOne {
  claudeBin: string;
  /** The caller's environment, before `agentEnv` controls it. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  task: Task;
  toolDir: string;
  workdir: string;
  model: string;
  timeoutMs: number;
}

export interface Attempt extends ClaudeUsage {
  /** The task's id, so a per-task breakdown can be read off the attempts. */
  task: string;
  success: boolean;
  /** Whether `claude` reported usage at all. A run that did not is excluded from the medians. */
  usage: boolean;
  transcript: string;
  /** Why a failed run failed, in a shape a skip reason can carry. Absent on success. */
  failure?: Failure;
}

/**
 * What went wrong, sorted by where it went wrong. The first CI run with a credential
 * (run 36352045743) failed all 25 burgee runs in about 2.4 s each and said only that
 * nothing passed a check — which could have been a rejected token, a model the account
 * cannot use, a permission denial or a wrong answer, and each of those is fixed somewhere
 * different. `claude -p --output-format json` says which in its own fields; this keeps them.
 */
export type FailureKind =
  | 'timeout'
  | 'no-output'
  | 'unparseable-output'
  | 'auth'
  | 'rate-limit'
  | 'max-turns'
  | 'api-error'
  | 'permission-denied'
  | 'cli-error'
  | 'exit-nonzero'
  | 'check-failed';

export interface Failure {
  task: string;
  kind: FailureKind;
  /** The process exit status, or the signal that ended it. */
  exit: string;
  /** `claude`'s own fields, when it produced a JSON result at all. */
  subtype?: string;
  isError?: boolean;
  apiErrorStatus?: number;
  terminalReason?: string;
  permissionDenials?: number;
  /** The first ~200 characters of `result`, or of stderr when there is no result — redacted. */
  excerpt: string;
}

const EXCERPT_CHARS = 200;

/**
 * Anything shaped like an Anthropic credential, and the literal values of the two
 * credential variables. A skip reason lands in a results file, a job summary and a public
 * issue body, and `claude`'s output is text this repository does not control: an error
 * that ever echoed a token would publish it three times. Over-redacting a diagnostic costs
 * nothing; under-redacting one costs a credential.
 */
const TOKEN_SHAPES = [/sk-ant-[\w-]+/g, /\boat\d*[-_][\w-]{6,}/g];
const CREDENTIAL_VARS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'] as const;
const MIN_SECRET_CHARS = 8;
const REDACTED = '[REDACTED]';

export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const name of CREDENTIAL_VARS) {
    const value = (env[name] ?? '').trim();
    if (value.length >= MIN_SECRET_CHARS) out = out.split(value).join(REDACTED);
  }
  for (const shape of TOKEN_SHAPES) out = out.replace(shape, REDACTED);
  return out;
}

const excerptOf = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS)}…` : flat;
};

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY = 429;
const AUTH_TEXT = /authenticat|not logged in|\/login|oauth|api key|invalid.*token|token.*(invalid|expired|revoked)/i;
const RATE_TEXT = /rate.?limit|usage limit|quota|overloaded/i;

function tryParse(stdout: string): Record<string, unknown> | undefined {
  try {
    const raw = JSON.parse(stdout) as unknown;
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

interface Outcome {
  task: string;
  status: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

/** Sorts one failed run. Only called for a run that did not succeed. */
type ClaudeFields = Omit<Failure, 'task' | 'kind' | 'exit' | 'excerpt'>;

/** `claude`'s own fields off its JSON result, each kept only when it is there. */
function claudeFields(raw: Record<string, unknown>): ClaudeFields {
  const denials = Array.isArray(raw['permission_denials']) ? raw['permission_denials'].length : 0;
  return {
    ...(typeof raw['subtype'] === 'string' ? { subtype: raw['subtype'] } : {}),
    isError: raw['is_error'] === true,
    ...(typeof raw['api_error_status'] === 'number' ? { apiErrorStatus: raw['api_error_status'] } : {}),
    ...(typeof raw['terminal_reason'] === 'string' ? { terminalReason: raw['terminal_reason'] } : {}),
    ...(denials > 0 ? { permissionDenials: denials } : {}),
  };
}

const isAuth = (f: ClaudeFields, result: string): boolean =>
  f.apiErrorStatus === HTTP_UNAUTHORIZED || f.apiErrorStatus === HTTP_FORBIDDEN || (f.isError === true && AUTH_TEXT.test(result));
const isRateLimit = (f: ClaudeFields, result: string): boolean => f.apiErrorStatus === HTTP_TOO_MANY || (f.isError === true && RATE_TEXT.test(result));
const isApiError = (f: ClaudeFields): boolean => f.apiErrorStatus !== undefined || f.terminalReason === 'api_error';

/** Most specific first: a 401 is an auth failure before it is an API error or an `is_error`. */
function kindOf(f: ClaudeFields, result: string, status: number | null): FailureKind {
  if (isAuth(f, result)) return 'auth';
  if (isRateLimit(f, result)) return 'rate-limit';
  if (f.subtype === 'error_max_turns') return 'max-turns';
  if (isApiError(f)) return 'api-error';
  if (f.permissionDenials !== undefined) return 'permission-denied';
  if (f.isError === true) return 'cli-error';
  return status === 0 ? 'check-failed' : 'exit-nonzero';
}

/** The text worth quoting: `result`, else stderr, else stdout when it was not JSON. */
function quotable(o: Outcome, raw: Record<string, unknown> | undefined, result: string): string {
  if (result !== '') return result;
  if (o.stderr !== '') return o.stderr;
  return raw === undefined ? o.stdout : '';
}

/** Sorts one failed run. Only called for a run that did not succeed. */
export function classifyFailure(o: Outcome, env: NodeJS.ProcessEnv = process.env): Failure {
  const exit = o.status === null ? `signal ${o.signal ?? '?'}` : String(o.status);
  const raw = resultObject(o.stdout);
  const result = typeof raw?.['result'] === 'string' ? raw['result'] : '';
  const base = { task: o.task, exit, excerpt: redact(excerptOf(quotable(o, raw, result)), env) };
  if (o.timedOut) return { ...base, kind: 'timeout' };
  if (raw === undefined) return { ...base, kind: o.stdout.trim() === '' ? 'no-output' : 'unparseable-output' };
  const fields = claudeFields(raw);
  return { ...base, ...fields, kind: kindOf(fields, result, o.status) };
}

const describeFailure = (f: Failure): string => {
  const parts = [`exit ${f.exit}`];
  if (f.isError !== undefined) parts.push(`is_error ${String(f.isError)}`);
  if (f.subtype !== undefined) parts.push(`subtype ${f.subtype}`);
  if (f.apiErrorStatus !== undefined) parts.push(`api ${String(f.apiErrorStatus)}`);
  if (f.terminalReason !== undefined) parts.push(`terminal_reason ${f.terminalReason}`);
  if (f.permissionDenials !== undefined) parts.push(`${String(f.permissionDenials)} permission denial(s)`);
  return `[${f.task}] ${f.kind} (${parts.join(', ')})${f.excerpt === '' ? '' : `: "${f.excerpt}"`}`;
};

const DISTINCT_EXAMPLES = 3;

/**
 * One line — it is written to `$GITHUB_OUTPUT` as `reason=…`, where a newline would end
 * the value — saying how many runs failed in each way and the first run of each distinct
 * way, so the next CI log names the cause instead of the symptom.
 */
export function summariseFailures(attempts: readonly Attempt[]): string {
  const failures = attempts.flatMap((a) => (a.failure === undefined ? [] : [a.failure]));
  if (failures.length === 0) return '';
  const counts = new Map<FailureKind, number>();
  for (const f of failures) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  const byKind = [...counts].map(([kind, n]) => `${kind}×${String(n)}`).join(', ');
  const seen = new Set<string>();
  const examples: string[] = [];
  for (const f of failures) {
    const key = `${f.kind}|${f.excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    examples.push(describeFailure(f));
    if (examples.length === DISTINCT_EXAMPLES) break;
  }
  return `failures by kind: ${byKind}; first: ${examples.join(' | ')}`;
}

const SHELL = '/bin/sh';

/**
 * A task's `check` and its `setup` are POSIX shell one-liners, and the tool is installed
 * as a `#!/bin/sh` shim on `PATH` — so the B1 harness runs on POSIX and says so, rather
 * than half-running on Windows and reporting failures that are the harness's own.
 */
export const POSIX_ONLY = 'the B1 harness runs task checks through /bin/sh; this platform is win32';
export const isPosix = (platform: string = process.platform): boolean => platform !== 'win32';

/**
 * The environment `claude` — and through its Bash tool, the CLI under test — runs in. It is
 * the caller's, minus every variable a CI runner sets and a laptop does not: `CI` and the
 * `GITHUB_*`, `RUNNER_*` and `ACTIONS_*` families. A CLI is entitled to behave differently
 * on CI (burgee's output policy reads `CI`), and a benchmark whose measured tool saw
 * `CI=true` on the runner and not on the laptop would be comparing two environments, not
 * two CLIs. Credentials, `HOME` and `PATH` pass through, the tool's directory goes first
 * on `PATH`. The rule is recorded in every record's `detail.env`.
 */
const RUNNER_ONLY = /^(CI|GITHUB_\w*|RUNNER_\w*|ACTIONS_\w*)$/;
export const AGENT_ENV_RULE = 'caller env minus CI, GITHUB_*, RUNNER_*, ACTIONS_*; demo first on PATH';

export function agentEnv(env: NodeJS.ProcessEnv, toolDir: string): NodeJS.ProcessEnv {
  const kept = Object.entries(env).filter(([k]) => !RUNNER_ONLY.test(k));
  return { ...Object.fromEntries(kept), PATH: `${toolDir}:${env['PATH'] ?? ''}` };
}

/**
 * One task, once. The agent sees Bash on `demo` and nothing else (intent constraint 2):
 * no file reads, so the CLI's own output is the only channel through which it can learn
 * anything — which is the whole hypothesis under test.
 */
export function runOne(opts: RunOne): Attempt {
  const { claudeBin, task, toolDir, workdir, model, timeoutMs } = opts;
  for (const cmd of task.setup) execFileSync(SHELL, ['-c', cmd], { cwd: workdir, stdio: 'ignore' });
  const argv = ['-p', task.prompt, '--allowedTools', 'Bash(demo:*)', '--max-turns', String(task.maxTurns), ...OUTPUT_FORMAT, '--model', model, ...ISOLATION];
  const r = spawnSync(claudeBin, argv, {
    cwd: workdir,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: agentEnv(opts.env ?? process.env, toolDir),
  });
  const transcript = r.stdout ?? '';
  const outcome: Outcome = {
    task: task.id,
    status: r.status,
    signal: r.signal,
    timedOut: (r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT',
    stdout: transcript,
    stderr: r.stderr ?? '',
  };
  // A run that timed out or died without a result has no usage to report and is a failed
  // task, not a zero-token success: `usage: false` keeps it out of the medians, and
  // `success: false` counts it against the success rate.
  //
  // A run that printed its result and exited non-zero is different: `claude` exits 1 on
  // `error_max_turns`, after spending every turn it was allowed. Its usage used to be
  // discarded and counted as 0 tokens and 0 turns, so a variant's medians went *down* for
  // each run it failed by exhausting its turns — the opposite of what those runs cost.
  const raw = outcome.timedOut ? undefined : resultObject(transcript);
  if (raw === undefined) {
    return { task: task.id, tokensIn: 0, tokensOut: 0, turns: 0, denials: 0, isError: true, result: '', success: false, usage: false, transcript, failure: classifyFailure(outcome) };
  }
  const usage = parseClaudeJson(transcript);
  const resultFile = join(workdir, '.bench-result');
  writeFileSync(resultFile, usage.result);
  const check = spawnSync(SHELL, ['-c', task.check], {
    cwd: workdir,
    env: { ...process.env, BENCH_RESULT: resultFile, BENCH_EXIT: String(r.status) },
    stdio: 'ignore',
  });
  const success = r.status === 0 && !usage.isError && check.status === 0;
  return { task: task.id, ...usage, success, usage: true, transcript, ...(success ? {} : { failure: classifyFailure(outcome) }) };
}

/**
 * Every reason this axis cannot run, checked before anything is spawned or spent.
 *
 * The three inputs are parameters rather than globals so that `agent.test.ts` can drive
 * the real `run()` end to end against a stub `claude` and two stub bins — see the note on
 * `run()`. Defaults are the real environment, so nothing about production behaviour
 * changes.
 */
/** Present and non-blank. An unset GitHub secret arrives as `''`, not as absent. */
const hasCredential = (value: string | undefined): boolean => (value ?? '').trim() !== '';

/**
 * The opt-in for the login `claude` already holds — a `claude.ai` login in the keychain on a
 * developer's machine, which bills the same subscription `CLAUDE_CODE_OAUTH_TOKEN` does but
 * lives in no variable. Opt-in rather than automatic, because a logged-in `claude` on PATH
 * is the normal state of the machine this repository is written on, and a suite that
 * started spending on it unasked would spend on every `npm run bench`.
 */
export const STORED_LOGIN_OPT_IN = 'BURGEE_USE_CLAUDE_LOGIN';

/**
 * Asked, never assumed: `claude auth status` is the CLI's own answer to whether its stored
 * login works, and a login that has expired says `"loggedIn": false` — the axis then
 * reports the missing credential instead of spending 50 runs failing to authenticate
 * (the #276 shape, reached from the other side).
 */
export function storedLogin(env: NodeJS.ProcessEnv, claudeBin: string): boolean {
  if (env[STORED_LOGIN_OPT_IN] !== '1') return false;
  const r = spawnSync(claudeBin, ['auth', 'status'], { encoding: 'utf8', env });
  try {
    return r.status === 0 && (JSON.parse(r.stdout) as { loggedIn?: unknown }).loggedIn === true;
  } catch {
    return false;
  }
}

/**
 * Only the configuration this repository controls. On a developer's machine `claude` would
 * otherwise load the owner's `~/.claude` — its CLAUDE.md, hooks, plugins and MCP servers —
 * into every turn: measured on 2026-09-24 at 10,228 tokens a turn (35,597 → 25,369 for the
 * same one-word reply), a constant added to both builds that drags the ratio toward 1 and
 * that a CI runner, having no `~/.claude`, never pays. On CI both flags change nothing.
 */
export const ISOLATION = ['--setting-sources', 'project,local', '--strict-mcp-config'] as const;

/**
 * Every event of the run, one JSON object a line, the result last: the per-turn record of
 * what the agent ran and what the CLI answered, which `--output-format json` does not keep.
 * The usage fields are the same object either way (`resultObject`).
 */
export const OUTPUT_FORMAT = ['--output-format', 'stream-json', '--verbose'] as const;

/**
 * The `claude` CI runs is the one `.github/tools/claude-code` pins, and a local run uses the
 * same one when it is installed there (`npm ci --prefix .github/tools/claude-code`). The
 * first local run (D-147) used whatever `claude` was on PATH — 2.1.145 — and the first CI run
 * used the pinned 2.1.283: the same tasks, the same CLIs and a different agent, which is
 * why their turn counts could not be compared (D-20260930-b1-ci-environment).
 */
export const PINNED_CLAUDE = join(REPO_ROOT, '.github/tools/claude-code/node_modules/.bin/claude');
const PINNED_MANIFEST = join(REPO_ROOT, '.github/tools/claude-code/package.json');
export const defaultClaudeBin = (): string => (existsSync(PINNED_CLAUDE) ? PINNED_CLAUDE : 'claude');

/** The version `.github/tools/claude-code/package.json` pins, or '' when it cannot be read. */
export function pinnedClaudeVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(PINNED_MANIFEST, 'utf8')) as { devDependencies?: Record<string, string> };
    return pkg.devDependencies?.['@anthropic-ai/claude-code'] ?? '';
  } catch {
    return '';
  }
}

export function blockers(env: NodeJS.ProcessEnv = process.env, claudeBin = defaultClaudeBin(), variants: readonly Variant[] = VARIANTS): string[] {
  const reasons: string[] = [];
  if (!isPosix()) reasons.push(POSIX_ONLY);
  // Empty counts as absent, which is the only reading that matches how this runs.
  // A workflow that maps an unset repository secret into the environment does not leave
  // the variable missing — GitHub interpolates it to the empty string, so the variable is
  // present and a test against undefined was false. The guard never fired, the axis ran,
  // `claude` failed to authenticate on all 25 runs, and the skip blamed the prompts
  // (#276). A credential that is the empty string is not a credential.
  if (!hasCredential(env['ANTHROPIC_API_KEY']) && !hasCredential(env['CLAUDE_CODE_OAUTH_TOKEN']) && !storedLogin(env, claudeBin)) {
    reasons.push(`no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in the environment, and no stored \`claude\` login opted into with ${STORED_LOGIN_OPT_IN}=1`);
  }
  if (spawnSync(claudeBin, ['--version'], { stdio: 'ignore' }).status !== 0) reasons.push(`the \`${claudeBin}\` binary is not on PATH`);
  for (const v of variants) {
    if (!existsSync(resolve(REPO_ROOT, v.bin))) reasons.push(`${v.bin} is not built`);
  }
  return reasons;
}

const RUNS_PER_TASK = 5;
const DEFAULT_TIMEOUT_MS = 300_000;
/**
 * Pinned by id in every results file, and a change starts a new band history: the same
 * task costs a different number of tokens on a different model, so a series that mixed
 * two models would be a series of nothing.
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-5';

const RATIO_PLACES = 3;
/** See the gate below: a floor on the harness, not on the model. */
const SUCCESS_FLOOR = 0.8;
const tokensOf = (a: Attempt): number => a.tokensIn + a.tokensOut;
const turnsOf = (a: Attempt): number => a.turns;
/** The runs that reported usage: a run that died without a result has no numbers, not zero. */
const measured = (attempts: readonly Attempt[]): Attempt[] => attempts.filter((a) => a.usage);

/** What every record of one invocation shares: the model, the agent and its environment. */
type Detail = Record<string, string | number | boolean>;

/**
 * The layered build's median against the plain build's, for tokens and for turns. The
 * roadmap's ≥40% / ≥30% claim was settled against these until D-20261009-b1-totals-and-explain;
 * they stay on the record so the series keeps its history. Both variants are run in one
 * invocation because a ratio between two numbers measured on different days by different model
 * versions would not be a comparison of the CLIs.
 */
function ratioRecords(byVariant: Map<VariantId, Attempt[]>, detail: Detail): BenchRecord[] {
  const ours = measured(byVariant.get('burgee') ?? []);
  const theirs = measured(byVariant.get('commander') ?? []);
  if (ours.length === 0 || theirs.length === 0) return [];
  const ratio = (pick: (a: Attempt) => number): number => round(median(ours.map(pick)) / median(theirs.map(pick)), RATIO_PLACES);
  const common = { axis: 'agent', variant: 'burgee ÷ commander', unit: 'ratio', samples: Math.min(ours.length, theirs.length), detail } as const;
  return [
    { ...common, metric: 'tokens-per-task-ratio', median: ratio(tokensOf), p95: ratio(tokensOf), note: 'median tokens on the floor-meeting build over median tokens on the plain one; kept for history, the claim reads tokens-total-ratio' },
    { ...common, metric: 'turns-per-task-ratio', median: ratio(turnsOf), p95: ratio(turnsOf), note: 'median turns on the floor-meeting build over median turns on the plain one; kept for history, the claim reads turns-total-ratio' },
  ];
}

/** A variant's tokens or turns summed over its task-runs. */
const sum = (runs: readonly Attempt[], pick: (a: Attempt) => number): number => runs.reduce((total, a) => total + pick(a), 0);

/**
 * What the roadmap's ≥40% / ≥30% claim is settled against (D-20261009-b1-totals-and-explain):
 * each variant's tokens and turns summed over its task-runs, and burgee's sum over commander's.
 *
 * The pooled median of 25 task-runs is set by the task mix. burgee holds at 3 turns, and
 * commander's median lands at 4 or 6 depending on how many of its agents guess one command
 * straight away, so the median ratio read 0.5 or 0.75 on the same build. It cannot see where
 * burgee's lead is: recover-failure in 3 turns against 8 to 16, diagnose-provenance in about 9
 * against 11. A total counts every turn spent.
 *
 * The ratio is taken per measured run, `(Σ ours / n ours) ÷ (Σ theirs / n theirs)`, which is the
 * ratio of the totals whenever both sides measured the same number of runs, as they do on every
 * landed reading (25 and 25). A run that reported no usage has no numbers; dividing raw sums
 * would let it shrink one side's total and flatter it.
 */
export function totalRecords(byVariant: ReadonlyMap<VariantId, readonly Attempt[]>, detail: Detail): BenchRecord[] {
  const ours = measured(byVariant.get('burgee') ?? []);
  const theirs = measured(byVariant.get('commander') ?? []);
  if (ours.length === 0 || theirs.length === 0) return [];
  const totals = (variant: VariantId, runs: readonly Attempt[]): BenchRecord[] => {
    const common = { axis: 'agent', variant, samples: runs.length, detail } as const;
    const note = `sum over ${String(runs.length)} task-runs that reported usage`;
    return [
      { ...common, metric: 'tokens-total', unit: 'tokens', median: sum(runs, tokensOf), p95: sum(runs, tokensOf), note },
      { ...common, metric: 'turns-total', unit: 'turns', median: sum(runs, turnsOf), p95: sum(runs, turnsOf), note },
    ];
  };
  const ratio = (pick: (a: Attempt) => number): number => round(sum(ours, pick) / ours.length / (sum(theirs, pick) / theirs.length), RATIO_PLACES);
  const common = { axis: 'agent', variant: 'burgee ÷ commander', unit: 'ratio', samples: Math.min(ours.length, theirs.length), detail } as const;
  return [
    ...totals('burgee', ours),
    ...totals('commander', theirs),
    { ...common, metric: 'tokens-total-ratio', median: ratio(tokensOf), p95: ratio(tokensOf), note: 'tokens summed over every task-run on the floor-meeting build over the same on the plain one, per run; 0.6 or below confirms the ≥40% claim' },
    { ...common, metric: 'turns-total-ratio', median: ratio(turnsOf), p95: ratio(turnsOf), note: 'turns summed over every task-run on the floor-meeting build over the same on the plain one, per run; 0.7 or below confirms the ≥30% claim' },
  ];
}

/**
 * Per task, the raw numbers behind a variant's medians, flattened into `detail` (which holds
 * scalars only): `<task>.turns` and `<task>.tokens` list every run in order, `-` for one
 * that reported no usage; `<task>.passed` is `k/n`; `<task>.denials` sums the tool calls
 * `claude` refused; `<task>.failures` counts the failed runs by kind. The first CI run
 * (36740119305) reported burgee at 6 turns against a local 3 and said nothing a reader
 * could use to find out which task moved — this is what that reader needed.
 */
export function perTaskDetail(attempts: readonly Attempt[]): Detail {
  const out: Detail = {};
  const ids = [...new Set(attempts.map((a) => a.task))];
  for (const id of ids) {
    const runs = attempts.filter((a) => a.task === id);
    const list = (pick: (a: Attempt) => number): string => runs.map((a) => (a.usage ? String(pick(a)) : '-')).join(',');
    out[`${id}.turns`] = list(turnsOf);
    out[`${id}.tokens`] = list(tokensOf);
    out[`${id}.passed`] = `${String(runs.filter((a) => a.success).length)}/${String(runs.length)}`;
    out[`${id}.denials`] = runs.reduce((sum, a) => sum + a.denials, 0);
    const kinds = new Map<string, number>();
    for (const a of runs) if (a.failure !== undefined) kinds.set(a.failure.kind, (kinds.get(a.failure.kind) ?? 0) + 1);
    if (kinds.size > 0) out[`${id}.failures`] = [...kinds].map(([k, n]) => `${k}×${String(n)}`).join(', ');
  }
  return out;
}

function variantRecords(variant: VariantId, attempts: Attempt[], detail: Detail): BenchRecord[] {
  const withUsage = measured(attempts);
  const tokens = withUsage.map(tokensOf);
  const turns = withUsage.map(turnsOf);
  const successes = attempts.filter((a) => a.success).length;
  const rate = round(successes / attempts.length, RATIO_PLACES);
  const common = { axis: 'agent', variant, detail } as const;
  const model = String(detail['model']);
  const noUsage = attempts.length - withUsage.length;
  return [
    // p95 is the 95th percentile, not a second copy of the median. It was the latter, so
    // the field labelled p95 in a banded results document carried the median — and the
    // one thing a tail statistic is for, showing that a median is hiding a long tail,
    // was structurally impossible to see.
    { ...common, samples: withUsage.length, metric: 'tokens-per-task', unit: 'tokens', median: median(tokens), p95: p95(tokens), note: `median over ${String(withUsage.length)} task-runs on model ${model}${noUsage > 0 ? `; ${String(noUsage)} run(s) reported no usage and are not in it` : ''}` },
    { ...common, samples: withUsage.length, metric: 'turns-per-task', unit: 'turns', median: median(turns), p95: p95(turns), note: "`num_turns` as `claude -p` reports it, including runs that ended at --max-turns" },
    {
      ...common,
      samples: attempts.length,
      metric: 'success-rate',
      unit: 'ratio',
      median: rate,
      p95: rate,
      // The only gated record on this axis, and it gates the harness rather than the
      // model: a run where a third of the tasks failed still produces tokens and turns
      // medians, and those medians are then medians over whichever runs happened to
      // survive. Without this the document builds cleanly and the band moves for a
      // reason nothing records. The floor is provisional — B1 has never run, so it is
      // set from what the harness must clear to be worth reading, and the first measured
      // run is where it gets set from data.
      gate: { min: SUCCESS_FLOOR, why: 'below this the tokens and turns medians are taken over whichever task-runs happened to survive, which is a different measurement from the one the band is watching' },
      note: `${String(successes)} of ${String(attempts.length)} task-runs passed their own check`,
      detail: { ...detail, failed: attempts.length - successes, ...perTaskDetail(attempts) },
    },
  ];
}

export interface AgentOptions {
  runs?: number;
  model?: string;
  timeoutMs?: number;
  claudeBin?: string;
  /** Injected by `agent.test.ts`; the real run uses the real ones. */
  variants?: readonly Variant[];
  env?: NodeJS.ProcessEnv;
  tasks?: readonly Task[];
  /**
   * Where each run's full event stream is written, one `<variant>-<task>-<n>.jsonl` a run,
   * redacted. Defaults to `$BENCH_AGENT_TRANSCRIPTS`; unset, nothing is written. CI sets it
   * and uploads the directory, so the last run's every turn can be read after the fact.
   */
  transcriptDir?: string;
}

/**
 * The whole axis, and — because every parameter above has a real default — the same
 * function `agent.test.ts` drives end to end against a stub `claude` and two stub bins.
 *
 * That matters more here than anywhere else in the suite. `emit.ts` can prove a band
 * value came from a record produced by a measured axis; it cannot prove the axis produced
 * that record by measuring anything, and replacing this function's body with a table of
 * plausible numbers would satisfy every other check in the repository. `runOne` was
 * already pinned that way. This is the wiring above it: tasks in, attempts out, medians
 * over the attempts that actually came back.
 */
interface Sweep {
  variant: Variant;
  tasks: readonly Task[];
  runs: number;
  claudeBin: string;
  model: string;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  transcriptDir: string | undefined;
}

/** Every task, `runs` times, on one build. */
function sweep({ variant, tasks, runs, claudeBin, model, timeoutMs, env, transcriptDir }: Sweep): Attempt[] {
  const toolDir = installTool(resolve(REPO_ROOT, variant.bin));
  const attempts: Attempt[] = [];
  if (transcriptDir !== undefined) mkdirSync(transcriptDir, { recursive: true });
  for (const task of tasks) {
    for (let i = 0; i < runs; i++) {
      const workdir = mkdtempSync(join(tmpdir(), `bench-${task.id}-`));
      mkdirSync(workdir, { recursive: true });
      const attempt = runOne({ claudeBin, task, toolDir, workdir, model, timeoutMs, env });
      if (transcriptDir !== undefined) writeFileSync(join(transcriptDir, `${variant.id}-${task.id}-${String(i)}.jsonl`), redact(attempt.transcript, env));
      attempts.push(attempt);
    }
  }
  return attempts;
}

/**
 * A `claude` that authenticates and then fails every single run is the one shape this axis
 * could not tell apart from a measurement. `runOne` returns zeros on a dead run, so the
 * axis reported `measured` with a tokens median of 0, a turns median of 0 and a ratio of
 * 0/0 — and only the accidental NaN stopped the document, as a crash rather than a skip.
 * `record.ts` requires a reader to be able to tell "we measured nothing" from "we measured
 * and it was zero"; nothing came back, so nothing was measured, and the axis says so the
 * same way a missing credential does.
 */
export function nothingCameBack(variant: Variant, attempts: readonly Attempt[], claudeVersion = ''): string {
  const onlyChecks = attempts.every((a) => a.failure?.kind === 'check-failed');
  // "`claude` answered but nothing passed a check" was the sentence for every failure,
  // including 25 runs `claude` rejected before the model saw a prompt — which sent the
  // reader after the prompts. It is now said only when it is what happened.
  const what = onlyChecks
    ? "`claude` answered but nothing it produced passed a task's own check"
    : '`claude` did not complete them';
  const version = claudeVersion === '' ? '' : ` — ${claudeVersion}`;
  const summary = summariseFailures(attempts);
  return `every one of the ${String(attempts.length)} ${variant.id} task-runs failed; ${what}, so this axis measured nothing${version}${summary === '' ? '' : `; ${summary}`}`;
}

/** Which `claude` ran: an unpinned global install moves under the harness between runs. */
function claudeVersionOf(claudeBin: string): string {
  const r = spawnSync(claudeBin, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? `claude ${redact(excerptOf(r.stdout ?? ''))}` : '';
}

/**
 * What every record carries so two results files can be compared, or told apart: the model,
 * the agent's exact version, whether that is the version CI pins, and the environment rule.
 */
function invocationDetail(model: string, claudeBin: string): Detail {
  const version = claudeVersionOf(claudeBin);
  const pinned = pinnedClaudeVersion();
  return { model, claude: version, claudePinned: pinned !== '' && version.includes(pinned), env: AGENT_ENV_RULE };
}

export function run(options: AgentOptions = {}): { records: BenchRecord[] } | { reason: string } {
  const variants = options.variants ?? VARIANTS;
  const claudeBin = options.claudeBin ?? defaultClaudeBin();
  const env = options.env ?? process.env;
  const stopped = blockers(env, claudeBin, variants);
  if (stopped.length > 0) return { reason: stopped.join('; ') };
  const model = options.model ?? DEFAULT_MODEL;
  const transcriptDir = options.transcriptDir ?? (env['BENCH_AGENT_TRANSCRIPTS'] || undefined);
  const common = { tasks: options.tasks ?? readTasks(), runs: options.runs ?? RUNS_PER_TASK, claudeBin, model, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, env, transcriptDir };
  const detail = invocationDetail(model, claudeBin);
  const records: BenchRecord[] = [];
  const byVariant = new Map<VariantId, Attempt[]>();
  for (const variant of variants) {
    const attempts = sweep({ variant, ...common });
    if (!attempts.some((a) => a.success)) return { reason: nothingCameBack(variant, attempts, String(detail['claude'])) };
    byVariant.set(variant.id, attempts);
    records.push(...variantRecords(variant.id, attempts, detail));
  }
  records.push(...ratioRecords(byVariant, detail), ...totalRecords(byVariant, detail));
  return { records };
}

export const method = `For each of the ${String(readTasks().length)} tasks and each of the two builds, \`claude -p <prompt> --allowedTools 'Bash(demo:*)' --max-turns <n> --output-format stream-json --verbose --setting-sources project,local --strict-mcp-config\` — the \`claude\` pinned in \`.github/tools/claude-code\` when it is installed there — is spawned in a scratch directory with the build installed as \`demo\`, ${String(RUNS_PER_TASK)} times, in the caller's environment minus \`CI\`, \`GITHUB_*\`, \`RUNNER_*\` and \`ACTIONS_*\`; the task's own \`check\` decides success. Tokens are input + cache + output as the CLI reports them; turns is its \`num_turns\`, including runs that ended at the turn limit; a run that reported no usage is left out of the medians and totals and counted as a failure. The claims are settled on each build's tokens and turns summed over its task-runs, burgee's over commander's (per run, which is the ratio of the totals when both measured the same number); the pooled medians are reported beside them. The model and the \`claude\` version are recorded per results file, and a change of either starts a new band history.`;
