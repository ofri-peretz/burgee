/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The durable record of an eval run (roadmap `marketing-and-docs` 2.2).
 *
 * `evals/results/` is gitignored, so until this file every weekly run of `evals.yml` was
 * a step summary that expired with the run's logs, and the question "has the plugin
 * claim ever passed, and since when" had no answer in the repository. A recorded run is
 * one compact JSON line, written to its own file under `evals/history/`:
 *
 *   evals/history/<YYYY-MM-DD>-<sha7>.json
 *
 * One file per run rather than one appended `history.jsonl`, for the same reason
 * `benchmarks/results/` holds one dated observation per run: the recorder lands its line
 * through a pull request, and under the GITHUB_TOKEN fallback those pull requests raise no
 * checks and wait for a human. Two of them that each append to the end of one file
 * conflict with each other the moment the first merges; two that each add a new file
 * never do. `cat evals/history/*.json` is the JSONL, in date order.
 *
 * The shape is versioned (`v`), and `scripts/eval-history-lock.test.ts` holds every
 * committed file to it, so a reader plotting the series can rely on the field names.
 */

import fs from 'node:fs';
import path from 'node:path';

export const HISTORY_DIR = 'evals/history';
export const HISTORY_VERSION = 1;

/** `2026-09-24-0a1b2c3.json`: the UTC date of the run, then the commit it evaluated. */
export const HISTORY_FILE = /^(\d{4}-\d{2}-\d{2})-([0-9a-f]{7})\.json$/;

export type CaseStatus = 'pass' | 'fail' | 'error';

export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What `claude -p --output-format json` reported for one case, when it reported it. */
export interface CaseUsage {
  turns: number | null;
  tokens: Tokens | null;
  model: string | null;
}

export interface CaseRecord {
  status: CaseStatus;
  turns: number | null;
  tokens: Tokens | null;
}

export interface HistoryLine {
  v: typeof HISTORY_VERSION;
  /** UTC date of the run, `YYYY-MM-DD`. */
  date: string;
  /** The full commit the run evaluated. */
  commit: string;
  /** The model the cases ran on, as `claude` reported it; `null` when no case ran. */
  model: string | null;
  billing: 'none' | 'subscription' | 'console';
  /** Layer 1, the deterministic configuration checks. */
  config: { passed: number; total: number };
  /**
   * Layer 2. A run with no credential is still recorded, as `skipped`, so the series
   * shows the weeks nothing was measured rather than reading as an unbroken record.
   */
  tasks: { status: 'ran' | 'skipped'; passed: number; total: number; cases: Record<string, CaseRecord> };
}

type Json = Record<string, unknown>;

const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const count = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/**
 * The final text, turn count, token usage and model out of `claude -p --output-format json`.
 * Anything that is not that document — an older CLI, a crash that printed a stack — comes
 * back as the raw text with no usage, so grading still sees what the agent printed.
 */
export function parseClaudeJson(stdout: string): { text: string; usage: CaseUsage } {
  const none: CaseUsage = { turns: null, tokens: null, model: null };
  let doc: unknown;
  try {
    doc = JSON.parse(stdout);
  } catch {
    return { text: stdout, usage: none };
  }
  if (!isObject(doc) || doc.type !== 'result') return { text: stdout, usage: none };
  const u = isObject(doc.usage) ? doc.usage : null;
  const tokens: Tokens | null = u
    ? {
        input: count(u.input_tokens),
        output: count(u.output_tokens),
        cacheRead: count(u.cache_read_input_tokens),
        cacheWrite: count(u.cache_creation_input_tokens),
      }
    : null;
  const models = isObject(doc.modelUsage) ? Object.keys(doc.modelUsage) : [];
  return {
    text: typeof doc.result === 'string' ? doc.result : '',
    usage: { turns: typeof doc.num_turns === 'number' ? doc.num_turns : null, tokens, model: models[0] ?? null },
  };
}

export interface RunSummary {
  date: string;
  commit: string;
  billing: HistoryLine['billing'];
  /** `EVAL_MODEL`, when the run pinned one; otherwise the model `claude` reports is used. */
  pinnedModel?: string;
  config: { passed: number; total: number };
  /** `null` when layer 2 did not run. */
  cases: ({ id: string; status: CaseStatus } & CaseUsage)[] | null;
}

export function historyLine(run: RunSummary): HistoryLine {
  const ran = run.cases ?? [];
  const cases: Record<string, CaseRecord> = {};
  for (const c of ran) cases[c.id] = { status: c.status, turns: c.turns, tokens: c.tokens };
  return {
    v: HISTORY_VERSION,
    date: run.date,
    commit: run.commit,
    model: run.pinnedModel || (ran.find((c) => c.model !== null)?.model ?? null),
    billing: run.billing,
    config: run.config,
    tasks: {
      status: run.cases === null ? 'skipped' : 'ran',
      passed: ran.filter((c) => c.status === 'pass').length,
      total: ran.length,
      cases,
    },
  };
}

/** `git`'s default abbreviation, as in the file name. */
const SHORT_SHA = 7;

export function historyFileName(line: HistoryLine): string {
  return `${line.date}-${line.commit.slice(0, SHORT_SHA)}.json`;
}

/** One line, one trailing newline: `cat evals/history/*.json` must be valid JSONL. */
export function serialize(line: HistoryLine): string {
  return `${JSON.stringify(line)}\n`;
}

/** Writes the run's line and returns the path relative to `root`, with `/` on every OS. */
export function writeHistory(line: HistoryLine, root: string): string {
  const rel = path.posix.join(HISTORY_DIR, historyFileName(line));
  fs.mkdirSync(path.join(root, HISTORY_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, rel), serialize(line));
  return rel;
}

const isCount = (x: unknown): boolean => Number.isInteger(x) && (x as number) >= 0;

function tokensProblems(t: unknown, where: string): string[] {
  if (t === null) return [];
  if (!isObject(t)) return [`${where}.tokens is not an object or null`];
  return (['input', 'output', 'cacheRead', 'cacheWrite'] as const).filter((k) => !isCount(t[k])).map((k) => `${where}.tokens.${k} is not a count`);
}

function caseProblems(id: string, c: unknown): string[] {
  const where = `tasks.cases.${id}`;
  if (!isObject(c)) return [`${where} is not an object`];
  const out: string[] = [];
  if (!['pass', 'fail', 'error'].includes(c.status as string)) out.push(`${where}.status is not pass | fail | error`);
  if (c.turns !== null && !isCount(c.turns)) out.push(`${where}.turns is not a count or null`);
  return [...out, ...tokensProblems(c.tokens, where)];
}

function tasksProblems(t: unknown): string[] {
  if (!isObject(t)) return ['tasks is not an object'];
  const out: string[] = [];
  if (t.status !== 'ran' && t.status !== 'skipped') out.push('tasks.status is not ran | skipped');
  if (!isCount(t.passed) || !isCount(t.total)) out.push('tasks.passed / tasks.total are not counts');
  if (!isObject(t.cases)) return [...out, 'tasks.cases is not an object'];
  const cases = Object.entries(t.cases);
  if (cases.length !== t.total) out.push(`tasks.total is ${String(t.total)} but ${cases.length} case(s) are recorded`);
  if (cases.filter(([, c]) => isObject(c) && c.status === 'pass').length !== t.passed) out.push('tasks.passed does not match the cases that passed');
  if (t.status === 'skipped' && cases.length > 0) out.push('a skipped run records no cases');
  return [...out, ...cases.flatMap(([id, c]) => caseProblems(id, c))];
}

/** Every way `doc` is not a v1 history line. Empty means it is one. */
export function historyProblems(doc: unknown): string[] {
  if (!isObject(doc)) return ['not a JSON object'];
  const out: string[] = [];
  if (doc.v !== HISTORY_VERSION) out.push(`v is not ${HISTORY_VERSION}`);
  if (typeof doc.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.date)) out.push('date is not YYYY-MM-DD');
  if (typeof doc.commit !== 'string' || !/^[0-9a-f]{40}$/.test(doc.commit)) out.push('commit is not a full 40-character sha');
  if (doc.model !== null && typeof doc.model !== 'string') out.push('model is not a string or null');
  if (!['none', 'subscription', 'console'].includes(doc.billing as string)) out.push('billing is not none | subscription | console');
  if (!isObject(doc.config) || !isCount(doc.config.passed) || !isCount(doc.config.total)) out.push('config is not { passed, total } counts');
  return [...out, ...tasksProblems(doc.tasks)];
}
