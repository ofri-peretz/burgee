/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Stage 4 (Test) — continuous evals over the agent configuration.
 * Ported from ofri-peretz/eslint/scripts/run-evals.ts (intent `sdlc-locks-evals-bands`).
 *
 *   1. Config checks — deterministic, free, always run: every relative link in an
 *      agent-facing document resolves, every script a document names exists, every
 *      floor id a child intent cites exists in the umbrella design.
 *   2. Task evals — real prompts with accepted outcomes; needs a credential, and
 *      reports `skipped`, never `failed`, without one.
 *
 * Credentials: prefer CLAUDE_CODE_OAUTH_TOKEN (subscription, no per-token charge).
 * ANTHROPIC_API_KEY outranks it in Claude Code's precedence, so set one, not both.
 * On a machine where `claude` is already logged in, BURGEE_USE_CLAUDE_LOGIN=1 uses that
 * login instead — checked with `claude auth status`, never assumed.
 *
 * Usage:
 *   tsx scripts/run-evals.ts             # both layers
 *   tsx scripts/run-evals.ts --config    # layer 1 only
 *   tsx scripts/run-evals.ts --record    # both layers, plus one line in evals/history/
 *
 * `--record` is for the scheduled run in `evals.yml`, which lands the line through a pull
 * request; see `scripts/eval-history.ts` for the format.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { type CaseUsage, historyLine, type NotRunReason, parseClaudeJson, writeHistory } from './eval-history';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES_DIR = path.join(REPO_ROOT, 'evals/cases');
const RESULTS_DIR = path.join(REPO_ROOT, 'evals/results');
const UMBRELLA_DESIGN = '.sdlc/intents/burgee/spec.md';

/** Documents an agent is expected to read and obey. */
const CONFIG_FILES = ['README.md', 'CLAUDE.md', 'AGENTS.md'];
/** Every docs app's content, deployed or pending, from `.github/vercel-apps.json` — the one place an app is named. */
const APP_TABLE = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.github/vercel-apps.json'), 'utf8')) as { apps: Record<string, { dir: string }>; pending?: Record<string, { dir: string }> };
const APP_CONTENT = [...Object.values(APP_TABLE.apps), ...Object.values(APP_TABLE.pending ?? {})].map((app) => `${app.dir}/content`);
const CONFIG_DIRS = ['docs', '.github', '.sdlc/bands', ...APP_CONTENT];
const SKIP_DIRS = new Set(['node_modules', 'issues', 'results', '.next', 'dist']);
/** Intents describe work that does not exist yet; a script they name is a plan, not a link. */
const PLANNED_DOCS = /^docs\/intents\//;

export interface Expectation {
  check: 'output-contains' | 'output-omits' | 'shell';
  value: string;
}

export interface EvalCase {
  id: string;
  why: string;
  prompt: string;
  allowedTools?: string;
  expect: Expectation[];
}

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Layer 1 — config checks
// ---------------------------------------------------------------------------

function readDirOrEmpty(root: string, rel: string): fs.Dirent[] {
  const abs = path.join(root, rel);
  return fs.existsSync(abs) ? fs.readdirSync(abs, { withFileTypes: true }) : [];
}

function walkDocs(root: string, rel: string, out: string[]): void {
  for (const e of readDirOrEmpty(root, rel)) {
    if (SKIP_DIRS.has(e.name)) continue;
    const child = path.join(rel, e.name);
    if (e.isDirectory()) walkDocs(root, child, out);
    else if (/\.mdx?$/.test(e.name)) out.push(child);
  }
}

export function agentDocs(root = REPO_ROOT): string[] {
  const out = CONFIG_FILES.filter((f) => fs.existsSync(path.join(root, f)));
  for (const dir of CONFIG_DIRS) walkDocs(root, dir, out);
  return out.sort();
}

/** Strip fenced code blocks and inline code: example markdown is not a reference. */
function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Targets that are not repository paths: URLs, anchors, placeholders, absolute paths. */
function isNotAPath(raw: string): boolean {
  if (/^(https?:|mailto:|file:|#|<|\$|\/)/.test(raw)) return true;
  return !raw.includes('/') && !raw.includes('.');
}

/** Why one link is broken, or null when it resolves inside the repository. */
function linkProblem(root: string, doc: string, raw: string): string | null {
  const target = raw.split('#')[0];
  if (!target) return null;
  const abs = path.resolve(path.dirname(path.join(root, doc)), target);
  if (path.relative(root, abs).startsWith('..')) return `${doc} → ${raw} (outside the repository — dangles in a clone)`;
  return fs.existsSync(abs) ? null : `${doc} → ${raw}`;
}

/**
 * Relative markdown links that point at nothing from a standalone checkout. A target
 * that escapes the repository root is reported even when it exists on disk: this repo
 * sits beside its siblings and below the documents that govern them.
 */
export function brokenLinks(docs: string[], root = REPO_ROOT): string[] {
  const broken: string[] = [];
  for (const doc of docs) {
    const text = stripCode(fs.readFileSync(path.join(root, doc), 'utf-8'));
    for (const m of text.matchAll(LINK)) {
      const raw = m[1]!;
      if (isNotAPath(raw)) continue;
      const problem = linkProblem(root, doc, raw);
      if (problem) broken.push(problem);
    }
  }
  return broken;
}

/** `scripts/<name>` and `npm run <script>` mentions, outside intents, that name nothing that exists. */
export function missingScripts(docs: string[], root = REPO_ROOT): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };
  const out = new Set<string>();
  for (const doc of docs.filter((d) => !PLANNED_DOCS.test(d))) {
    const text = fs.readFileSync(path.join(root, doc), 'utf-8');
    for (const m of text.matchAll(/\bscripts\/([\w.-]+\.(?:ts|sh|mjs))\b/g)) {
      if (!fs.existsSync(path.join(root, 'scripts', m[1]!))) out.add(`${doc} → scripts/${m[1]}`);
    }
    for (const m of text.matchAll(/\bnpm run ([\w:-]+)/g)) {
      if (!(m[1]! in pkg.scripts)) out.add(`${doc} → npm run ${m[1]}`);
    }
  }
  return [...out];
}

const FLOOR_ID = /\b([FOEVSPDTHMK]\d{1,2})\b/g;
const FLOOR_ROW = /\|\s*([FOEVSPDTHMK]\d{1,2})\s*\|/g;

/** Floor ids cited in one file, if it exists. */
function citedIds(file: string): Set<string> {
  if (!fs.existsSync(file)) return new Set();
  return new Set([...stripCode(fs.readFileSync(file, 'utf-8')).matchAll(FLOOR_ID)].map((m) => m[1]!));
}

const NOT_A_CHILD = new Set(['burgee', '_template']);

/** Floor ids cited by child intents that the umbrella design does not define. */
export function unknownFloorIds(root = REPO_ROOT): string[] {
  const umbrella = fs.readFileSync(path.join(root, UMBRELLA_DESIGN), 'utf-8');
  const defined = new Set([...umbrella.matchAll(FLOOR_ROW)].map((m) => m[1]!));
  const out: string[] = [];
  const children = readDirOrEmpty(root, '.sdlc/intents').filter((e) => e.isDirectory() && !NOT_A_CHILD.has(e.name));
  for (const e of children) {
    for (const f of ['intent.md', 'spec.md']) {
      for (const id of citedIds(path.join(root, '.sdlc/intents', e.name, f))) {
        if (!defined.has(id)) out.push(`.sdlc/intents/${e.name}/${f} → ${id}`);
      }
    }
  }
  return out;
}

const MIN_AGENT_DOCS = 5;

function list(xs: string[]): string {
  return xs.length === 0 ? 'ok' : xs.join('\n    ');
}

function runConfigLayer(): CheckResult[] {
  const docs = agentDocs();
  const broken = brokenLinks(docs);
  const scripts = missingScripts(docs);
  const ids = unknownFloorIds();
  return [
    { name: 'agent documents found', passed: docs.length > MIN_AGENT_DOCS, detail: `${docs.length} agent-facing documents` },
    { name: 'every relative link in an agent document resolves', passed: broken.length === 0, detail: list(broken) },
    { name: 'every script a document names exists (intents excepted)', passed: scripts.length === 0, detail: list(scripts) },
    { name: 'every floor id a child intent cites is defined in the umbrella', passed: ids.length === 0, detail: list(ids) },
  ];
}

// ---------------------------------------------------------------------------
// Layer 2 — task evals
// ---------------------------------------------------------------------------

function loadCases(): EvalCase[] {
  return readDirOrEmpty(REPO_ROOT, 'evals/cases')
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name)
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), 'utf-8')) as EvalCase);
}

/** Case files are committed to this repository; their shell checks are ours, not input. */
function shellCheckPasses(command: string): boolean {
  return spawnSync('bash', ['-c', command], { cwd: REPO_ROOT, encoding: 'utf8' }).status === 0;
}

function failureOf(hay: string, e: Expectation): string | null {
  if (e.check === 'output-contains') return hay.includes(e.value.toLowerCase()) ? null : `expected output to contain "${e.value}"`;
  if (e.check === 'output-omits') return hay.includes(e.value.toLowerCase()) ? `expected output NOT to contain "${e.value}"` : null;
  return shellCheckPasses(e.value) ? null : `shell check failed: ${e.value}`;
}

export function grade(output: string, expect: Expectation[]): { ok: boolean; failed: string[] } {
  const hay = output.toLowerCase();
  const failed = expect.map((e) => failureOf(hay, e)).filter((f): f is string => f !== null);
  return { ok: failed.length === 0, failed };
}

export type Billing = 'none' | 'subscription' | 'console';

const BILLING_LABEL: Record<Billing, string> = {
  none: 'nothing',
  subscription: 'the Claude subscription',
  console: 'the Console API key',
};

/**
 * The opt-in for the login `claude` already holds (a `claude.ai` login in the keychain),
 * the same variable `benchmarks/axes/agent.ts` reads. Opt-in, because a logged-in `claude`
 * is the normal state of a developer's machine and `npm run evals` must not start spending
 * on it unasked.
 */
export const STORED_LOGIN_OPT_IN = 'BURGEE_USE_CLAUDE_LOGIN';

/** What `claude auth status` says about the stored login, when it was opted into. */
export function storedLogin(env: NodeJS.ProcessEnv, claudeBin = 'claude'): Billing {
  if (env[STORED_LOGIN_OPT_IN] !== '1') return 'none';
  const r = spawnSync(claudeBin, ['auth', 'status'], { encoding: 'utf8', env });
  try {
    const status = JSON.parse(r.stdout) as { loggedIn?: unknown; authMethod?: unknown };
    if (r.status !== 0 || status.loggedIn !== true) return 'none';
    return status.authMethod === 'claude.ai' ? 'subscription' : 'console';
  } catch {
    return 'none';
  }
}

/**
 * GitHub Actions writes an absent secret as an empty variable, so test for non-empty.
 * `stored` is `storedLogin`'s answer, passed in so this stays a pure function of its inputs;
 * a variable outranks it, as it does inside `claude`.
 */
export function billingFor(env: NodeJS.ProcessEnv, stored: Billing = 'none'): { billing: Billing; bothSet: boolean; hasCredential: boolean } {
  const key = Boolean(env.ANTHROPIC_API_KEY);
  const token = Boolean(env.CLAUDE_CODE_OAUTH_TOKEN);
  let billing: Billing = stored;
  if (key) billing = 'console';
  else if (token) billing = 'subscription';
  return { billing, bothSet: key && token, hasCredential: billing !== 'none' };
}

/**
 * Only the configuration this repository controls: the repository's own CLAUDE.md is part
 * of what these evals measure; the owner's `~/.claude` — its CLAUDE.md, hooks, plugins and
 * MCP servers — is not, and a CI runner never has one. See `ISOLATION` in
 * `benchmarks/axes/agent.ts` for what it cost when it leaked in.
 */
export const ISOLATION = ['--setting-sources', 'project,local', '--strict-mcp-config'] as const;

export function evalEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const k of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']) {
    if (!out[k]) delete out[k];
  }
  return out;
}

const CASE_TIMEOUT_MS = 180_000;
/** 16 MiB of transcript. */
const OUTPUT_BUFFER = 16777216;

export interface CaseResult extends CaseUsage {
  id: string;
  status: 'pass' | 'fail' | 'error' | 'not-run';
  /** A `not-run` case only: why the agent never ran, and the start of what `claude` said. */
  reason?: NotRunReason;
  excerpt?: string;
  failed: string[];
  /** Every tool call the agent made, in `evals/results/<date>.json`; see `transcriptOf`. */
  calls: ToolCall[];
}

const NO_USAGE: CaseUsage = { turns: null, tokens: null, model: null };

/**
 * `--output-format stream-json --verbose` so the run reports its turns and tokens for the
 * history line — the stream's last event is the document `--output-format json` prints — and
 * every tool call before it, for `transcriptOf`. The grade reads the document's `result`,
 * which is exactly what text mode prints.
 */
/**
 * D-143: "one turn" is one user prompt, not one model step. The authoring prompt asks for four
 * tool steps (read the schema, read the README, write, run `check`) plus a fix-and-rerun, so a
 * cap of 3 failed 8 of 9 on `error_max_turns` before a plugin was written. 8 fits the prompt
 * with one repair; `EVAL_MAX_TURNS` still overrides it. D-20261006-eval-turn-budget raised it to
 * 12: on 2026-10-06 every one of four failures stopped at 8 with `error_max_turns`, one of them
 * mid-repair with the file already written — the cap was being measured again, not the schema.
 */
export const DEFAULT_MAX_TURNS = 12;

export function claudeArgs(c: EvalCase, env: NodeJS.ProcessEnv = process.env): string[] {
  const args = ['-p', c.prompt, '--allowedTools', c.allowedTools ?? 'Read,Grep,Glob', '--max-turns', env.EVAL_MAX_TURNS ?? String(DEFAULT_MAX_TURNS), '--output-format', 'stream-json', '--verbose', ...ISOLATION];
  if (env.EVAL_MODEL) args.push('--model', env.EVAL_MODEL);
  return args;
}

/** How much of the agent's last words a failed case carries into the log. */
const LAST_WORDS = 240;

/**
 * Why a case failed, in the agent's own terms: how its run ended (`subtype`: `success`,
 * `error_max_turns`, …), after how many turns, and the end of what it said — or, when there is
 * no JSON document, the end of stderr. Until 2026-10-06 a failed case logged only the shell
 * checks that failed, and three cases of #787 failed with `test -f` and nothing else.
 */
export function whyFailed(stdout: string, stderr = ''): string {
  try {
    const doc = JSON.parse(stdout) as { subtype?: unknown; num_turns?: unknown; result?: unknown };
    const said = typeof doc.result === 'string' ? doc.result.replaceAll(/\s+/gu, ' ').trim().slice(-LAST_WORDS) : '';
    return `agent stopped: ${String(doc.subtype ?? 'unknown')} after ${String(doc.num_turns ?? '?')} turn(s) — "${said}"`;
  } catch {
    return `agent produced no result document; stderr: ${stderr.replaceAll(/\s+/gu, ' ').trim().slice(-LAST_WORDS) || '(empty)'}`;
  }
}

/** One tool call an agent made: in which turn, what it called, on what, and how that came back. */
export interface ToolCall {
  turn: number;
  tool: string;
  input: string;
  /** The start of what the tool returned. */
  output: string;
  error: boolean;
}

/** How much of a tool call's input and output a transcript keeps. */
const CALL_CHARS = 400;

const clip = (text: string): string => {
  const flat = text.replaceAll(/\s+/gu, ' ').trim();
  return flat.length > CALL_CHARS ? `${flat.slice(0, CALL_CHARS)}…` : flat;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A tool's input as one line: the command a Bash call ran, the file a Read or a Write touched. */
function inputOf(input: unknown): string {
  if (!isRecord(input)) return clip(JSON.stringify(input) ?? '');
  if (typeof input.command === 'string') return clip(input.command);
  if (typeof input.file_path === 'string') return typeof input.content === 'string' ? `${input.file_path} (${input.content.length} chars)` : input.file_path;
  return clip(JSON.stringify(input));
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : '')).join('\n');
  return '';
}

/** What `transcriptOf` builds as it reads: the calls so far, by id, and the turns seen. */
interface Transcript {
  calls: ToolCall[];
  byId: Map<string, ToolCall>;
  turns: Set<unknown>;
}

/** The content blocks of a stream event's message, or none. */
function blocksOf(event: Record<string, unknown>, type: string): Record<string, unknown>[] {
  const message = isRecord(event.message) ? event.message : {};
  return Array.isArray(message.content) ? (message.content as unknown[]).filter(isRecord).filter((block) => block.type === type) : [];
}

/** An assistant message is a model turn; each `tool_use` in it is a call. */
function readAssistant(event: Record<string, unknown>, t: Transcript): void {
  const message = isRecord(event.message) ? event.message : {};
  t.turns.add(message.id ?? t.turns.size);
  // eslint-disable-next-line secure-coding/no-unchecked-loop-condition -- one message's content blocks, from a transcript OUTPUT_BUFFER bounds
  for (const block of blocksOf(event, 'tool_use')) {
    const call: ToolCall = { turn: t.turns.size, tool: String(block.name), input: inputOf(block.input), output: '', error: false };
    t.calls.push(call);
    t.byId.set(String(block.id), call);
  }
}

/** A user message carries the tools' answers, each to the call it names. */
function readResults(event: Record<string, unknown>, t: Transcript): void {
  // eslint-disable-next-line secure-coding/no-unchecked-loop-condition -- one message's content blocks, from a transcript OUTPUT_BUFFER bounds
  for (const block of blocksOf(event, 'tool_result')) {
    const call = t.byId.get(String(block.tool_use_id));
    if (call) Object.assign(call, { output: clip(textOf(block.content)), error: block.is_error === true });
  }
}

/** One line of the stream as an event, or `undefined` for a line that is not one. */
function eventOf(line: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A `stream-json` run split into its result document and its tool calls, numbered by the model
 * turn that made them. Until 2026-10-12 a case kept only its last 240 characters, so a run that
 * stopped at the turn cap (#1039, #1078) left nothing to say where its turns went. Output that is
 * not a stream comes back as the result, untouched, so the grade reads what it always read.
 */
export function transcriptOf(stdout: string): { result: string; calls: ToolCall[] } {
  const t: Transcript = { calls: [], byId: new Map(), turns: new Set() };
  let result = stdout;
  for (const line of stdout.split('\n')) {
    const event = eventOf(line);
    if (event?.type === 'result') result = line;
    if (event?.type === 'assistant') readAssistant(event, t);
    if (event?.type === 'user') readResults(event, t);
  }
  return { result, calls: t.calls };
}

/** What one `claude` process left behind: its output, and the error `spawnSync` reported, if any. */
export interface Spawned {
  stdout: string | undefined;
  stderr: string;
  error?: unknown;
}

/**
 * Anything shaped like an Anthropic credential, and the values of the two credential variables —
 * the same rule as `redact` in `benchmarks/axes/agent.ts`. A not-run excerpt lands in a committed
 * history line and a public issue, and `claude`'s output is text this repository does not control.
 */
const TOKEN_SHAPES = [/sk-ant-[\w-]+/g, /\boat\d*[-_][\w-]{6,}/g];
const MIN_SECRET_CHARS = 8;

export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const name of ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']) {
    const value = (env[name] ?? '').trim();
    if (value.length >= MIN_SECRET_CHARS) out = out.split(value).join('[REDACTED]');
  }
  for (const shape of TOKEN_SHAPES) out = out.replace(shape, '[REDACTED]');
  return out;
}

const EXCERPT_CHARS = 200;
const excerptOf = (text: string): string => {
  const flat = text.replaceAll(/\s+/gu, ' ').trim();
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS)}…` : flat;
};

/**
 * The wording `claude` uses for a stop before the model works. It only names the reason; it never
 * decides that a case did not run. `benchmarks/axes/agent.ts` holds the same words (`RATE_TEXT`,
 * `AUTH_TEXT`), plus `hit your … limit`, which is what the weekly limit says and `RATE_TEXT` missed.
 */
const LIMIT_WORDS = /rate.?limit|usage limit|quota|overloaded|hit your .*limit/i;
const AUTH_WORDS = /authenticat|not logged in|\/login|oauth|api key|invalid.*token|token.*(invalid|expired|revoked)/i;
const HTTP_TOO_MANY = 429;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

/**
 * A `usage` object whose four counts all read 0, an absent count reading 0 as `parseClaudeJson`
 * reads it: the tokens the history line would record. So the runner's "never ran" and the history
 * lock's "a zero-token case is a run that never happened" are one definition, not two.
 */
const zeroUsage = (u: unknown): boolean =>
  isRecord(u) && (['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const).every((k) => (typeof u[k] === 'number' ? u[k] : 0) === 0);

/**
 * Whether the agent never ran, decided by evidence in its own output (evals-record-not-run R1):
 *   (a) the result document's usage counts all read 0 and it bills no model; or
 *   (b) the process ended on its own, printed no result document, and made no assistant turn.
 * Either way the case is not scored. Anything with a token spent is graded as before.
 */
function neverRan(doc: Record<string, unknown> | undefined, stdout: string): boolean {
  if (doc !== undefined) return zeroUsage(doc.usage) && !(isRecord(doc.modelUsage) && Object.keys(doc.modelUsage).length > 0);
  return !stdout.split('\n').some((line) => eventOf(line)?.type === 'assistant');
}

/** Why it never ran: the HTTP status first, then the wording of `result` or stderr, else `did-not-start`. */
function notRunReason(doc: Record<string, unknown> | undefined, text: string): NotRunReason {
  const status = doc?.api_error_status;
  if (status === HTTP_TOO_MANY) return 'usage-limit';
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return 'auth';
  if (LIMIT_WORDS.test(text)) return 'usage-limit';
  if (AUTH_WORDS.test(text)) return 'auth';
  return 'did-not-start';
}

/** One case's verdict from what its `claude` process printed. */
export function caseOutcome(c: EvalCase, r: Spawned): Omit<CaseResult, 'id'> {
  if (r.error !== undefined || typeof r.stdout !== 'string') return { status: 'error', failed: [String(r.error ?? 'no output')], ...NO_USAGE, calls: [] };
  const { result, calls } = transcriptOf(r.stdout);
  const doc = eventOf(result);
  const resultDoc = doc?.type === 'result' ? doc : undefined;
  if (neverRan(resultDoc, r.stdout)) {
    const said = typeof resultDoc?.result === 'string' && resultDoc.result !== '' ? resultDoc.result : r.stderr;
    return { status: 'not-run', reason: notRunReason(resultDoc, said), excerpt: redact(excerptOf(said)), failed: [], ...NO_USAGE, calls };
  }
  const { text, usage } = parseClaudeJson(result);
  const { ok, failed } = grade(text, c.expect);
  return { status: ok ? 'pass' : 'fail', failed: ok ? failed : [...failed, whyFailed(result, r.stderr)], ...usage, calls };
}

export function runCase(c: EvalCase): CaseResult {
  const args = claudeArgs(c);
  const r = spawnSync('claude', args, { cwd: REPO_ROOT, encoding: 'utf8', env: evalEnv(process.env), timeout: CASE_TIMEOUT_MS, maxBuffer: OUTPUT_BUFFER });
  return { id: c.id, ...caseOutcome(c, { stdout: r.stdout, stderr: r.stderr, ...(r.error ? { error: r.error } : {}) }) };
}

/** A failed case's transcript in the log, one line per call — the CI log is all a pull request keeps. */
export function callLines(calls: readonly ToolCall[]): string[] {
  return calls.map((c) => `turn ${c.turn} ${c.tool}${c.error ? ' ✗' : ''}: ${c.input}${c.output === '' ? '' : ` → ${c.output}`}`);
}

/** The log line of a case whose agent never ran: what stopped it, in `claude`'s words. */
export function notRunLine(r: CaseResult): string {
  return `⏭ ${r.id} — not run: ${r.reason ?? 'did-not-start'} "${r.excerpt ?? ''}"`;
}

export interface Verdict {
  /** What `evals.yml` reads from `$GITHUB_OUTPUT` to pick the issue it opens. */
  outcome: 'passed' | 'failed' | 'not-run';
  /** The not-run cases' common reason, or `mixed`; absent when every case ran. */
  reason?: NotRunReason | 'mixed';
  exitCode: 0 | 1;
  /** `pass rate: <passed>/<ran>`, with the not-run count beside it; empty when layer 2 did not run. */
  rate: string;
  /** The run's last line. A run whose only trouble is not-run cases is never "eval failure(s)". */
  last: string;
}

/**
 * The run's verdict (evals-record-not-run R5). A not-run case still fails the job, as B1 fails an
 * axis that measured nothing, but it is named for what it is: the run did not run, which is not
 * the same news as an eval that stopped passing. A real failure, or a layer-1 one, outranks it.
 */
export function verdict(results: readonly CaseResult[] | null, configFailures: number): Verdict {
  const all = results ?? [];
  const notRun = all.filter((r) => r.status === 'not-run');
  const ran = all.filter((r) => r.status !== 'not-run');
  const failures = configFailures + ran.filter((r) => r.status !== 'pass').length;
  const reasons = new Set(notRun.map((r) => r.reason ?? 'did-not-start'));
  const reason = notRun.length === 0 ? undefined : reasons.size === 1 ? [...reasons][0] : 'mixed';
  const rate = results === null ? '' : `pass rate: ${ran.length - ran.filter((r) => r.status !== 'pass').length}/${ran.length}${notRun.length === 0 ? '' : ` (${notRun.length} not run: ${String(reason)})`}`;
  const skippedNote = notRun.length === 0 ? '' : `; ${notRun.length} case(s) not run`;
  if (failures > 0) return { outcome: 'failed', ...(reason === undefined ? {} : { reason }), exitCode: 1, rate, last: `💥 ${failures} eval failure(s)${skippedNote}` };
  if (notRun.length > 0) return { outcome: 'not-run', ...(reason === undefined ? {} : { reason }), exitCode: 1, rate, last: `⏭ ${notRun.length} case(s) not run — not an eval failure` };
  return { outcome: 'passed', exitCode: 0, rate, last: '✅ evals pass' };
}

function runTaskLayer(cases: EvalCase[], credential: ReturnType<typeof billingFor>): CaseResult[] {
  const { billing, bothSet } = credential;
  console.warn(`\n🧪 Layer 2 — ${cases.length} task eval(s), billing to ${BILLING_LABEL[billing]}\n`);
  if (bothSet) console.warn('  ⚠️ Both credentials are set; ANTHROPIC_API_KEY wins and bills per token. Unset one.\n');
  const results = cases.map(runCase);
  for (const r of results) {
    if (r.status === 'not-run') {
      console.warn(`  ${notRunLine(r)}`);
      continue;
    }
    console.warn(`  ${r.status === 'pass' ? '✓' : '✗'} ${r.id}${r.turns === null ? '' : ` — ${r.turns} turn(s)`}`);
    for (const f of r.failed) console.warn(`      ${f}`);
    if (r.status !== 'pass') for (const line of callLines(r.calls)) console.warn(`        ${line}`);
  }
  const passed = results.filter((r) => r.status === 'pass').length;
  const notRun = results.filter((r) => r.status === 'not-run').length;
  const stamp = new Date().toISOString().slice(0, 'YYYY-MM-DD'.length);
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, `${stamp}.json`), `${JSON.stringify({ date: stamp, total: results.length - notRun, notRun, passed, results }, null, 2)}\n`);
  console.warn(`\n  ${verdict(results, 0).rate}`);
  return results;
}

/** The commit under evaluation: Actions says so, and a local run asks git. */
function currentCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim();
}

// ---------------------------------------------------------------------------

function main(): void {
  const configOnly = process.argv.includes('--config');
  const record = process.argv.includes('--record');
  let failures = 0;

  console.warn('\n🧪 Layer 1 — configuration checks\n');
  const config = runConfigLayer();
  for (const r of config) {
    console.warn(`  ${r.passed ? '✓' : '✗'} ${r.name}\n    ${r.detail}`);
    if (!r.passed) failures++;
  }

  const cases = loadCases();
  // Asked once: `storedLogin` spawns `claude auth status`, and the answer must not change
  // between deciding to run and recording what the run billed to.
  const credential = configOnly ? billingFor(process.env) : billingFor(process.env, storedLogin(process.env));
  let ran: CaseResult[] | null = null;
  if (configOnly) {
    console.warn('\n🧪 Layer 2 — skipped (--config)\n');
  } else if (!credential.hasCredential) {
    console.warn(`\n🧪 Layer 2 — skipped: no credential (${cases.length} case(s) not run).\n`);
  } else {
    ran = runTaskLayer(cases, credential);
  }

  if (record) {
    const line = historyLine({
      date: new Date().toISOString().slice(0, 'YYYY-MM-DD'.length),
      commit: currentCommit(),
      run: Number(process.env.GITHUB_RUN_ID) || undefined,
      billing: credential.billing,
      pinnedModel: process.env.EVAL_MODEL,
      config: { passed: config.filter((r) => r.passed).length, total: config.length },
      cases: ran,
    });
    console.warn(`  recorded → ${writeHistory(line, REPO_ROOT)}`);
  }

  const v = verdict(ran, failures);
  // `evals.yml` reads `outcome` to open "did not run" rather than "failing" for a week no agent ran.
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${v.outcome}\nreason=${v.reason ?? ''}\n`);
  console.warn(`\n${v.last}\n`);
  process.exitCode = v.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
