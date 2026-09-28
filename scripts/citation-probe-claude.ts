/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The one assistant the citation probe asks (roadmap `marketing-and-docs` 2.4): Claude,
 * through the Claude Code CLI, on `CLAUDE_CODE_OAUTH_TOKEN`. The owner decided on
 * 2026-09-27 not to add `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `PERPLEXITY_API_KEY`, so the
 * Messages API, OpenAI and Perplexity adapters this file replaces could never have run.
 *
 * The patterns are `benchmarks/axes/agent.ts`'s, which already runs `claude -p` in CI:
 *
 *   - **Credential.** A non-blank `CLAUDE_CODE_OAUTH_TOKEN`, or, on a developer's machine,
 *     the stored `claude` login when opted into with `BURGEE_USE_CLAUDE_LOGIN=1` and
 *     `claude auth status` says it is logged in. An unset GitHub secret arrives as `''`,
 *     so blank is missing. `ANTHROPIC_API_KEY` is removed from the child's environment:
 *     the probe runs on the token or the login, never on a key that happens to be set.
 *   - **Isolation.** `--setting-sources project,local --strict-mcp-config`, in a scratch
 *     directory, so neither the owner's `~/.claude` nor this repository — which names burgee
 *     on every page — is in the context the answer comes from.
 *   - **Output.** `--output-format json`: `result` is the answer, `is_error` / `subtype`
 *     say whether it is one, `num_turns` and `total_cost_usd` are what it cost, and
 *     `modelUsage` is keyed by the model ids that ran.
 *
 * Tools: `--tools WebSearch,WebFetch` makes those the only built-in tools the session has
 * (no Bash, no file reads), and `--allowedTools` with the same two pre-approves them so a
 * non-interactive run does not stall on a permission prompt.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SECRET = 'CLAUDE_CODE_OAUTH_TOKEN';
export const STORED_LOGIN_OPT_IN = 'BURGEE_USE_CLAUDE_LOGIN';

/**
 * The model the probe asks for. The id Claude Code reports in `modelUsage` is what each
 * observation records; a change here starts a new series, as a model change does in B1.
 */
export const MODEL = 'claude-opus-5-5';
/** One question's wall-clock budget. Web search and fetches can take minutes. */
export const QUESTION_TIMEOUT_MS = 240_000;
/** A cost bound per question: a few searches, a few fetches, the answer. */
export const MAX_TURNS = 10;
/** The only tools the session has, and the ones pre-approved. */
export const WEB_TOOLS = 'WebSearch,WebFetch';
/** As in `benchmarks/axes/agent.ts`: only configuration this probe controls. */
export const ISOLATION = ['--setting-sources', 'project,local', '--strict-mcp-config'] as const;
/** Enough of an error to say what went wrong, not enough to bloat the run file. */
const ERROR_CHARS = 300;

type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Present and non-blank. */
const hasCredential = (value: string | undefined): boolean => (value ?? '').trim() !== '';

/** Asked, never assumed: an expired login says `"loggedIn": false`. */
export function storedLogin(env: Env, claudeBin: string): boolean {
  if (env[STORED_LOGIN_OPT_IN] !== '1') return false;
  const r = spawnSync(claudeBin, ['auth', 'status'], { encoding: 'utf8', env });
  try {
    return r.status === 0 && (JSON.parse(r.stdout) as { loggedIn?: unknown }).loggedIn === true;
  } catch {
    return false;
  }
}

/** Whether the probe has a credential. The token is checked first, so a token spawns nothing. */
export function hasClaudeCredential(env: Env, claudeBin: string): boolean {
  return hasCredential(env[SECRET]) || storedLogin(env, claudeBin);
}

/** The exact argv after `claude`. The question comes first: the tool flags are variadic. */
export function claudeArgs(question: string): string[] {
  return ['-p', question, '--output-format', 'json', '--model', MODEL, '--tools', WEB_TOOLS, '--allowedTools', WEB_TOOLS, '--max-turns', String(MAX_TURNS), '--no-session-persistence', ...ISOLATION];
}

/** What one question came back with, before scoring. Never a throw. */
export type AskResult =
  | { ok: true; model: string | null; text: string; turns: number | null; costUsd: number | null }
  | { ok: false; exitCode: number | null; model: string | null; turns: number | null; costUsd: number | null; error: string };

/**
 * The model that answered: the `modelUsage` entry with the most output tokens. Claude Code
 * can list more than one (a smaller model summarises fetched pages); the answer is the
 * one that wrote the most.
 */
export function answeringModel(modelUsage: unknown): string | null {
  if (!isObject(modelUsage)) return null;
  let best: { id: string; out: number } | null = null;
  for (const [id, usage] of Object.entries(modelUsage)) {
    const out = isObject(usage) ? (num(usage.outputTokens) ?? 0) : 0;
    if (best === null || out > best.out) best = { id, out };
  }
  return best?.id ?? null;
}

/** `claude -p --output-format json` stdout, read into a result. Invalid JSON is an error. */
export function parseClaudeOutput(stdout: string, exitCode: number | null): AskResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return { ok: false, exitCode, model: null, turns: null, costUsd: null, error: `output is not JSON: ${stdout.slice(0, ERROR_CHARS) || '(empty)'}` };
  }
  if (!isObject(raw)) return { ok: false, exitCode, model: null, turns: null, costUsd: null, error: `output is not a JSON object: ${stdout.slice(0, ERROR_CHARS)}` };
  const model = answeringModel(raw.modelUsage);
  const turns = num(raw.num_turns);
  const costUsd = num(raw.total_cost_usd);
  const text = typeof raw.result === 'string' ? raw.result : null;
  if (raw.is_error === true || text === null) {
    const subtype = typeof raw.subtype === 'string' ? raw.subtype : 'unknown';
    return { ok: false, exitCode, model, turns, costUsd, error: `claude reported is_error (subtype ${subtype})${text ? `: ${text.slice(0, ERROR_CHARS)}` : ''}` };
  }
  return { ok: true, model, text, turns, costUsd };
}

export interface AskOptions {
  claudeBin: string;
  env: Env;
  timeoutMs?: number;
}

/** Puts one question to Claude Code. A spawn failure, timeout, non-zero exit or bad JSON comes back as a value. */
export function askClaude(question: string, { claudeBin, env, timeoutMs = QUESTION_TIMEOUT_MS }: AskOptions): AskResult {
  const cwd = mkdtempSync(join(tmpdir(), 'citation-probe-claude-'));
  const childEnv: Env = Object.fromEntries(Object.entries(env).filter(([k]) => k !== 'ANTHROPIC_API_KEY'));
  const r = spawnSync(claudeBin, claudeArgs(question), { cwd, encoding: 'utf8', timeout: timeoutMs, env: childEnv });
  if (r.error) return { ok: false, exitCode: r.status, model: null, turns: null, costUsd: null, error: `${r.error.name}: ${r.error.message}` };
  const stdout = r.stdout ?? '';
  if (r.status !== 0) {
    // A run that failed can still print its JSON; keep what it says about why.
    const parsed = parseClaudeOutput(stdout, r.status);
    const why = parsed.ok ? stdout.slice(0, ERROR_CHARS) : parsed.error;
    const stderr = (r.stderr ?? '').trim().slice(0, ERROR_CHARS);
    const signal = r.signal ? ` (${r.signal})` : '';
    return { ok: false, exitCode: r.status, model: parsed.model, turns: parsed.turns, costUsd: parsed.costUsd, error: `claude exited ${String(r.status)}${signal}: ${stderr || why}` };
  }
  return parseClaudeOutput(stdout, r.status);
}
