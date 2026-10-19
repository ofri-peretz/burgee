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
 *   evals/history/<YYYY-MM-DD>-<sha7>[-<run>].json
 *
 * One file per run rather than one appended `history.jsonl`, for the same reason
 * `benchmarks/results/` holds one dated observation per run: the recorder lands its line
 * through a pull request, and under the GITHUB_TOKEN fallback those pull requests raise no
 * checks and wait for a human. Two of them that each append to the end of one file
 * conflict with each other the moment the first merges; two that each add a new file
 * never do — unless both ran the same commit on the same day, which is how #913 and #914
collided. `<run>` is the Actions run id, so two runs of one commit name two files.
`cat evals/history/*.json` is the JSONL, in date order.
 *
 * The shape is versioned (`v`), and `scripts/eval-history-lock.test.ts` holds every
 * committed file to it, so a reader plotting the series can rely on the field names.
 *
 * v2 (evals-record-not-run, D-20261018-eval-history-v2-not-run) adds `not-run`: a case whose
 * agent never started — the subscription's weekly limit, a refused credential — is recorded
 * with its reason and no score. `tasks.total` counts only the cases that ran and `tasks.notRun`
 * the rest, so a reader dividing `passed / total` never computes 0/11 for a week in which no
 * model ran (2026-10-15). Every v1 line stays valid as written. Read the series through
 * `readHistory`, `measured`, `streak` and `caseSeries`, which skip what was not measured.
 */

import fs from 'node:fs';
import path from 'node:path';

export const HISTORY_DIR = 'evals/history';
export const HISTORY_VERSION = 2;

/** `2026-09-24-0a1b2c3[-37959323649].json`: the UTC date, the commit, then the Actions run id when there is one. */
export const HISTORY_FILE = /^(\d{4}-\d{2}-\d{2})-([0-9a-f]{7})(?:-(\d+))?\.json$/;

export type CaseStatus = 'pass' | 'fail' | 'error' | 'not-run';

/** Why an agent never ran: the vocabulary a `not-run` case's `reason` is drawn from. */
export const NOT_RUN_REASONS = ['usage-limit', 'auth', 'did-not-start'] as const;
export type NotRunReason = (typeof NOT_RUN_REASONS)[number];

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
  /** A `not-run` case only: why the agent never ran. */
  reason?: NotRunReason;
  /** A `not-run` case only: the start of what `claude` said, redacted. */
  excerpt?: string;
}

export interface HistoryLine {
  /** 1 for lines recorded before `not-run` existed; every line written now is 2. */
  v: 1 | typeof HISTORY_VERSION;
  /** UTC date of the run, `YYYY-MM-DD`. */
  date: string;
  /** The full commit the run evaluated. */
  commit: string;
  /** `GITHUB_RUN_ID`; absent on a local run and on lines recorded before it existed. */
  run?: number;
  /** The model the cases ran on, as `claude` reported it; `null` when no case ran. */
  model: string | null;
  billing: 'none' | 'subscription' | 'console';
  /** Layer 1, the deterministic configuration checks. */
  config: { passed: number; total: number };
  /**
   * Layer 2. A run with no credential is still recorded, as `skipped`, so the series
   * shows the weeks nothing was measured rather than reading as an unbroken record.
   */
  tasks: {
    /** `not-run` when cases were attempted and no agent ran in any of them (v2). */
    status: 'ran' | 'skipped' | 'not-run';
    /** A `not-run` run only: the cases' common reason, or `mixed`. */
    reason?: NotRunReason | 'mixed';
    passed: number;
    /** The cases that ran. v1 counted every case; no v1 line holds a not-run one. */
    total: number;
    /** The cases whose agent never ran (v2; absent on v1 lines). */
    notRun?: number;
    cases: Record<string, CaseRecord>;
  };
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
  run?: number;
  billing: HistoryLine['billing'];
  /** `EVAL_MODEL`, when the run pinned one; otherwise the model `claude` reports is used. */
  pinnedModel?: string;
  config: { passed: number; total: number };
  /** `null` when layer 2 did not run. */
  cases: ({ id: string; status: CaseStatus; reason?: NotRunReason; excerpt?: string } & CaseUsage)[] | null;
}

/** `tasks.status` and `tasks.reason` for the cases a run attempted. */
function runStatus(attempted: RunSummary['cases']): Pick<HistoryLine['tasks'], 'status' | 'reason'> {
  if (attempted === null) return { status: 'skipped' };
  if (attempted.length === 0 || attempted.some((c) => c.status !== 'not-run')) return { status: 'ran' };
  const reasons = new Set(attempted.map((c) => c.reason ?? 'did-not-start'));
  return { status: 'not-run', reason: reasons.size === 1 ? [...reasons][0] : 'mixed' };
}

export function historyLine(run: RunSummary): HistoryLine {
  const attempted = run.cases ?? [];
  const ran = attempted.filter((c) => c.status !== 'not-run');
  const cases: Record<string, CaseRecord> = {};
  for (const c of attempted) {
    cases[c.id] =
      c.status === 'not-run'
        ? { status: 'not-run', reason: c.reason ?? 'did-not-start', excerpt: c.excerpt ?? '', turns: null, tokens: null }
        : { status: c.status, turns: c.turns, tokens: c.tokens };
  }
  return {
    v: HISTORY_VERSION,
    date: run.date,
    commit: run.commit,
    ...(run.run ? { run: run.run } : {}),
    model: run.pinnedModel || (ran.find((c) => c.model !== null)?.model ?? null),
    billing: run.billing,
    config: run.config,
    tasks: {
      ...runStatus(run.cases),
      passed: ran.filter((c) => c.status === 'pass').length,
      total: ran.length,
      notRun: attempted.length - ran.length,
      cases,
    },
  };
}

/** `git`'s default abbreviation, as in the file name. */
const SHORT_SHA = 7;

export function historyFileName(line: HistoryLine): string {
  return `${line.date}-${line.commit.slice(0, SHORT_SHA)}${line.run ? `-${line.run}` : ''}.json`;
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

const isReason = (x: unknown): boolean => (NOT_RUN_REASONS as readonly unknown[]).includes(x);

function caseProblems(id: string, c: unknown, v: 1 | 2): string[] {
  const where = `tasks.cases.${id}`;
  if (!isObject(c)) return [`${where} is not an object`];
  const out: string[] = [];
  const statuses = v === 1 ? ['pass', 'fail', 'error'] : ['pass', 'fail', 'error', 'not-run'];
  if (!statuses.includes(c.status as string)) out.push(`${where}.status is not ${statuses.join(' | ')}`);
  if (c.turns !== null && !isCount(c.turns)) out.push(`${where}.turns is not a count or null`);
  if (c.status === 'not-run') {
    if (!isReason(c.reason)) out.push(`${where}.reason is not ${NOT_RUN_REASONS.join(' | ')}`);
    if (typeof c.excerpt !== 'string') out.push(`${where}.excerpt is not a string`);
    if (c.turns !== null || c.tokens !== null) out.push(`${where} did not run, so it has no turns or tokens`);
  }
  return [...out, ...tokensProblems(c.tokens, where)];
}

function tasksProblems(t: unknown, v: 1 | 2): string[] {
  if (!isObject(t)) return ['tasks is not an object'];
  const out: string[] = [];
  const statuses = v === 1 ? ['ran', 'skipped'] : ['ran', 'skipped', 'not-run'];
  if (!statuses.includes(t.status as string)) out.push(`tasks.status is not ${statuses.join(' | ')}`);
  if (!isCount(t.passed) || !isCount(t.total)) out.push('tasks.passed / tasks.total are not counts');
  if (v === 2 && !isCount(t.notRun)) out.push('tasks.notRun is not a count');
  if (!isObject(t.cases)) return [...out, 'tasks.cases is not an object'];
  const cases = Object.entries(t.cases);
  const recorded = Number(t.total) + (v === 2 ? Number(t.notRun) : 0);
  if (cases.length !== recorded) {
    out.push(v === 1 ? `tasks.total is ${String(t.total)} but ${cases.length} case(s) are recorded` : `tasks.total + tasks.notRun is ${String(recorded)} but ${cases.length} case(s) are recorded`);
  }
  if (cases.filter(([, c]) => isObject(c) && c.status === 'pass').length !== t.passed) out.push('tasks.passed does not match the cases that passed');
  if (v === 2 && cases.filter(([, c]) => isObject(c) && c.status === 'not-run').length !== t.notRun) out.push('tasks.notRun does not match the cases that did not run');
  if (t.status === 'skipped' && cases.length > 0) out.push('a skipped run records no cases');
  if (v === 2 && t.status === 'not-run') {
    if (t.total !== 0) out.push('a not-run run has total 0: no case ran');
    if (!isReason(t.reason) && t.reason !== 'mixed') out.push(`tasks.reason is not ${NOT_RUN_REASONS.join(' | ')} | mixed`);
  }
  return [...out, ...cases.flatMap(([id, c]) => caseProblems(id, c, v))];
}

/** Every way `doc` is not a v1 or v2 history line. Empty means it is one. */
export function historyProblems(doc: unknown): string[] {
  if (!isObject(doc)) return ['not a JSON object'];
  const out: string[] = [];
  const v = doc.v === 1 ? 1 : 2;
  if (doc.v !== 1 && doc.v !== HISTORY_VERSION) out.push(`v is not 1 or ${HISTORY_VERSION}`);
  if (typeof doc.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.date)) out.push('date is not YYYY-MM-DD');
  if (typeof doc.commit !== 'string' || !/^[0-9a-f]{40}$/.test(doc.commit)) out.push('commit is not a full 40-character sha');
  if (doc.run !== undefined && !(Number.isInteger(doc.run) && (doc.run as number) > 0)) out.push('run is not a positive integer');
  if (doc.model !== null && typeof doc.model !== 'string') out.push('model is not a string or null');
  if (!['none', 'subscription', 'console'].includes(doc.billing as string)) out.push('billing is not none | subscription | console');
  if (!isObject(doc.config) || !isCount(doc.config.passed) || !isCount(doc.config.total)) out.push('config is not { passed, total } counts');
  return [...out, ...tasksProblems(doc.tasks, v)];
}

const zeroTokens = (t: unknown): boolean => isObject(t) && (['input', 'output', 'cacheRead', 'cacheWrite'] as const).every((k) => t[k] === 0);

/**
 * A committed case that is `fail` or `error` with every token count `0`: a run that never
 * happened, scored as if it had (all 11 cases of 2026-10-15). `scripts/eval-history-lock.test.ts`
 * holds every committed file to this.
 */
export function zeroTokenProblems(doc: unknown): string[] {
  const cases = isObject(doc) && isObject(doc.tasks) && isObject(doc.tasks.cases) ? Object.entries(doc.tasks.cases) : [];
  return cases
    .filter(([, c]) => isObject(c) && (c.status === 'fail' || c.status === 'error') && zeroTokens(c.tokens))
    .map(([id]) => `tasks.cases.${id}: a zero-token case is a run that never happened; record it not-run`);
}

// ---------------------------------------------------------------------------
// Readers (R4). Every reader of the series goes through these, so a week that measured
// nothing neither counts toward a streak or a median nor breaks one.
// ---------------------------------------------------------------------------

/** Every committed line under `root`'s `evals/history/`, in file-name order (date, then commit, then run). */
export function readHistory(root: string): HistoryLine[] {
  const dir = path.join(root, HISTORY_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => HISTORY_FILE.test(file))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as HistoryLine);
}

/** The lines whose layer 2 ran: a `skipped` week (no credential) and a `not-run` week (no agent) are dropped. */
export function measured(lines: readonly HistoryLine[]): HistoryLine[] {
  return lines.filter((line) => line.tasks.status === 'ran');
}

/**
 * How many of the latest measured runs, back from the newest, had every case that ran pass —
 * "N consecutive runs at n of n". A not-run or skipped week neither extends it nor breaks it.
 * A measured run in which no case ran is not a pass.
 */
export function streak(lines: readonly HistoryLine[]): number {
  let n = 0;
  for (const line of measured(lines).reverse()) {
    if (line.tasks.total === 0 || line.tasks.passed !== line.tasks.total) break;
    n += 1;
  }
  return n;
}

/** One case over the measured runs in which it ran: never a not-run, skipped or absent week. */
export function caseSeries(lines: readonly HistoryLine[], id: string): { date: string; status: CaseStatus; turns: number | null; tokens: Tokens | null }[] {
  return measured(lines).flatMap((line) => {
    const c = line.tasks.cases[id];
    return c === undefined || c.status === 'not-run' ? [] : [{ date: line.date, status: c.status, turns: c.turns, tokens: c.tokens }];
  });
}

/** The median of the numbers given, ignoring `null`; `null` when there is none. */
export function median(values: readonly (number | null)[]): number | null {
  const sorted = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? 0) + upper) / 2;
}
