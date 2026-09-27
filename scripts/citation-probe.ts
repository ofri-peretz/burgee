#!/usr/bin/env tsx
/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The AI citation probe (roadmap `marketing-and-docs` 2.4): five fixed questions, put to
 * Claude through the Claude Code CLI with web search on, once a week. Each answer is scored
 * for whether it names burgee (or presents a family package as the answer) and which URLs it
 * cites, and the run is written to one file:
 *
 *   .sdlc/research/citation-probe/<YYYY-MM-DD>.json
 *
 * One assistant, by the owner's decision on 2026-09-27: the probe runs on
 * `CLAUDE_CODE_OAUTH_TOKEN` and no provider API keys are added for others
 * (`citation-probe-claude.ts` has the invocation). Without the token — or, locally, a
 * stored `claude` login opted into with `BURGEE_USE_CLAUDE_LOGIN=1` — the run is recorded as
 * `skipped`, loudly (a `::notice::`), nothing is spawned, and it still exits 0 and writes a
 * file saying so, so the series shows the weeks nothing was measured. A question whose
 * `claude` run fails — no binary, a timeout, a non-zero exit, output that is not JSON, or
 * `is_error` — is recorded as `error` with the reason. The exit code is 0 in every case the
 * probe could record; it is non-zero only when the run fails its own validator or the file
 * cannot be written.
 *
 * `.github/workflows/citation-probe.yml` runs this weekly and lands the file by pull request.
 *
 * Usage: npx tsx scripts/citation-probe.ts
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { askClaude, type AskResult, hasClaudeCredential, MODEL, SECRET } from './citation-probe-claude';
import { ourUrls, scoreAnswer, urlsInText } from './citation-probe-score';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PROBE_DIR = '.sdlc/research/citation-probe';
/**
 * v2 (2026-09-27): one assistant, Claude via Claude Code, so five observations a run; an
 * observation records the CLI's `exitCode`, `turns` and `costUsd` where v1 had `httpStatus`.
 */
export const PROBE_VERSION = 2;

/**
 * The five questions, verbatim from `.sdlc/roadmap/marketing-and-docs.md`. Fixed so the
 * series stays comparable; `citation-probe.test.ts` fails if this list and the roadmap's
 * ever disagree.
 */
export const QUESTIONS = [
  'What is a good alternative to commander.js?',
  'How do I make my Node CLI output JSON for AI agents?',
  'How do I expose a command-line tool over MCP?',
  'What is a zero-dependency replacement for yargs?',
  'How do I stop an interactive CLI prompt from hanging in CI?',
] as const;

export type AssistantId = 'claude';
export type ObservationStatus = 'ok' | 'error' | 'skipped';

/** One question put to the assistant. A run always holds one per (assistant, question). */
export interface Observation {
  date: string;
  commit: string;
  assistant: AssistantId;
  /** The model id Claude Code reported answering with; `null` when it reported none. */
  model: string | null;
  /** 1-based, into `QUESTIONS`. */
  question: number;
  status: ObservationStatus;
  /** `claude`'s exit code; `null` when it was not run, could not start, or was killed. */
  exitCode: number | null;
  /** `num_turns` as the CLI reports it; `null` when it reported none. */
  turns: number | null;
  /** `total_cost_usd` as the CLI reports it; `null` when it reported none. */
  costUsd: number | null;
  error: string | null;
  named: boolean;
  /** Which of burgee and the family packages the answer names. */
  mentions: string[];
  /** Every URL the answer text cites. */
  citedUrls: string[];
  /** The subset of `citedUrls` on our hosts. */
  ours: string[];
  /** Text around the first mention, `null` when there is none. */
  excerpt: string | null;
}

export interface AssistantSummary {
  status: 'ran' | 'skipped';
  /** The secret that gates this assistant. */
  secret: typeof SECRET;
  /** The model the probe asked for; each observation records what answered. */
  requested: string;
}

export interface ProbeRun {
  v: typeof PROBE_VERSION;
  /** UTC date of the run, `YYYY-MM-DD`. */
  date: string;
  /** The full commit the probe ran from. */
  commit: string;
  questions: string[];
  assistants: Record<AssistantId, AssistantSummary>;
  observations: Observation[];
}

type Env = Record<string, string | undefined>;

function blank(date: string, commit: string, question: number): Observation {
  return {
    date,
    commit,
    assistant: 'claude',
    model: null,
    question,
    status: 'skipped',
    exitCode: null,
    turns: null,
    costUsd: null,
    error: null,
    named: false,
    mentions: [],
    citedUrls: [],
    ours: [],
    excerpt: null,
  };
}

/** One answer, scored. `citedUrls` is every URL written in the answer text. */
export function observe(base: Observation, res: AskResult): Observation {
  if (!res.ok) return { ...base, status: 'error', model: res.model, exitCode: res.exitCode, turns: res.turns, costUsd: res.costUsd, error: res.error };
  const cited = urlsInText(res.text);
  return { ...base, status: 'ok', model: res.model, exitCode: 0, turns: res.turns, costUsd: res.costUsd, ...scoreAnswer(res.text), citedUrls: cited, ours: ourUrls(cited) };
}

const printLine = (line: string): void => console.log(line);

export interface ProbeOptions {
  env: Env;
  date: string;
  commit: string;
  /** The `claude` binary. Defaults to `claude` on PATH; tests pass a stub. */
  claudeBin?: string;
  timeoutMs?: number;
  /** Where a skip is announced. Defaults to stdout. */
  notice?: (line: string) => void;
}

export function runProbe(opts: ProbeOptions): ProbeRun {
  const { env, date, commit } = opts;
  const claudeBin = opts.claudeBin ?? 'claude';
  const notice = opts.notice ?? printLine;
  const common = { v: PROBE_VERSION, date, commit, questions: [...QUESTIONS] } as const;
  if (!hasClaudeCredential(env, claudeBin)) {
    notice(`::notice title=Citation probe::${SECRET} is not set; claude is recorded as skipped.`);
    return {
      ...common,
      assistants: { claude: { status: 'skipped', secret: SECRET, requested: MODEL } },
      observations: QUESTIONS.map((_, i) => blank(date, commit, i + 1)),
    };
  }
  // One question at a time: a weekly probe has no reason to race a rate limit.
  const observations = QUESTIONS.map((question, i) => observe(blank(date, commit, i + 1), askClaude(question, { claudeBin, env, timeoutMs: opts.timeoutMs })));
  return { ...common, assistants: { claude: { status: 'ran', secret: SECRET, requested: MODEL } }, observations };
}

// ── The file ────────────────────────────────────────────────────────────────────────

export function probeFileName(run: Pick<ProbeRun, 'date'>): string {
  return `${run.date}.json`;
}

export function serialize(run: ProbeRun): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}

/** Writes the run and returns its path relative to `root`, with `/` on every OS. */
export function writeProbe(run: ProbeRun, root: string): string {
  const rel = path.posix.join(PROBE_DIR, probeFileName(run));
  fs.mkdirSync(path.join(root, PROBE_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, rel), serialize(run));
  return rel;
}

// ── The validator ───────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');
const isNullableString = (x: unknown): boolean => x === null || typeof x === 'string';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** `YYYY-MM-DD`, the head of an ISO timestamp. */
const DATE_CHARS = 10;
/** `git`'s default abbreviation. */
const SHORT_SHA = 7;
const SHA = /^[0-9a-f]{40}$/;
const ASSISTANT_IDS: readonly AssistantId[] = ['claude'];
const STATUSES: readonly ObservationStatus[] = ['ok', 'error', 'skipped'];

/** The fields `claude`'s own output fills: exit code, turns, cost. */
function runCostProblems(o: Json, where: string): string[] {
  const out: string[] = [];
  if (o.exitCode !== null && !Number.isInteger(o.exitCode)) out.push(`${where}.exitCode is not an integer or null`);
  if (o.turns !== null && !Number.isInteger(o.turns)) out.push(`${where}.turns is not an integer or null`);
  if (o.costUsd !== null && typeof o.costUsd !== 'number') out.push(`${where}.costUsd is not a number or null`);
  return out;
}

/** Field types of one observation. */
function observationShapeProblems(o: Json, where: string, run: Json): string[] {
  const out: string[] = [];
  if (o.date !== run.date) out.push(`${where}.date is not the run's date`);
  if (o.commit !== run.commit) out.push(`${where}.commit is not the run's commit`);
  if (!ASSISTANT_IDS.includes(o.assistant as AssistantId)) out.push(`${where}.assistant is not claude`);
  if (!isNullableString(o.model)) out.push(`${where}.model is not a string or null`);
  const q = o.question;
  if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > QUESTIONS.length) out.push(`${where}.question is not 1..${QUESTIONS.length}`);
  if (!STATUSES.includes(o.status as ObservationStatus)) out.push(`${where}.status is not ok | error | skipped`);
  out.push(...runCostProblems(o, where));
  if (!isNullableString(o.error)) out.push(`${where}.error is not a string or null`);
  if (typeof o.named !== 'boolean') out.push(`${where}.named is not a boolean`);
  for (const k of ['mentions', 'citedUrls', 'ours'] as const) if (!isStringArray(o[k])) out.push(`${where}.${k} is not a string array`);
  if (!isNullableString(o.excerpt)) out.push(`${where}.excerpt is not a string or null`);
  return out;
}

/** Fields that must agree with each other, once each has the right type. */
function observationConsistencyProblems(o: Json, where: string): string[] {
  const out: string[] = [];
  const cited = o.citedUrls as string[];
  if (!(o.ours as string[]).every((u) => cited.includes(u))) out.push(`${where}.ours is not a subset of citedUrls`);
  if (o.named !== (o.mentions as string[]).length > 0) out.push(`${where}.named disagrees with mentions`);
  if (o.status !== 'ok' && (o.named === true || cited.length > 0)) out.push(`${where} is ${String(o.status)} but records an answer`);
  if (o.status === 'error' && o.error === null) out.push(`${where} is an error with no error message`);
  return out;
}

function observationProblems(o: unknown, i: number, run: Json): string[] {
  const where = `observations[${i}]`;
  if (!isObject(o)) return [`${where} is not an object`];
  const shape = observationShapeProblems(o, where, run);
  return shape.length > 0 ? shape : observationConsistencyProblems(o, where);
}

function assistantsProblems(a: unknown, observations: unknown[]): string[] {
  if (!isObject(a)) return ['assistants is not an object'];
  const out: string[] = [];
  for (const id of ASSISTANT_IDS) {
    const s = a[id];
    if (!isObject(s) || (s.status !== 'ran' && s.status !== 'skipped') || typeof s.secret !== 'string' || typeof s.requested !== 'string') {
      out.push(`assistants.${id} is not { status: ran | skipped, secret, requested }`);
      continue;
    }
    const mine = observations.filter((o) => isObject(o) && o.assistant === id);
    if (s.status === 'skipped' && !mine.every((o) => isObject(o) && o.status === 'skipped')) out.push(`assistants.${id} is skipped but has observations that ran`);
    if (s.status === 'ran' && mine.some((o) => isObject(o) && o.status === 'skipped')) out.push(`assistants.${id} ran but has skipped observations`);
  }
  return out;
}

/** Every way `doc` is not a v2 probe run. Empty means it is one. */
export function probeProblems(doc: unknown): string[] {
  if (!isObject(doc)) return ['not a JSON object'];
  const out: string[] = [];
  if (doc.v !== PROBE_VERSION) out.push(`v is not ${PROBE_VERSION}`);
  if (typeof doc.date !== 'string' || !DATE.test(doc.date)) out.push('date is not YYYY-MM-DD');
  if (typeof doc.commit !== 'string' || !SHA.test(doc.commit)) out.push('commit is not a full 40-character sha');
  if (!isStringArray(doc.questions) || doc.questions.join('\n') !== QUESTIONS.join('\n')) out.push('questions are not the five fixed questions');
  if (!Array.isArray(doc.observations)) return [...out, 'observations is not an array'];
  const observations: unknown[] = doc.observations;
  const pairs = new Set(observations.map((o) => (isObject(o) ? `${String(o.assistant)}#${String(o.question)}` : '')));
  const expected = ASSISTANT_IDS.length * QUESTIONS.length;
  if (observations.length !== expected || pairs.size !== expected) out.push(`observations are not one per (assistant, question): ${observations.length} for ${expected}`);
  return [...out, ...assistantsProblems(doc.assistants, observations), ...observations.flatMap((o, i) => observationProblems(o, i, doc))];
}

// ── The command ─────────────────────────────────────────────────────────────────────

function headCommit(): string {
  const sha = process.env.GITHUB_SHA;
  if (sha && SHA.test(sha)) return sha;
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function summarize(run: ProbeRun): string {
  const lines = [`Citation probe ${run.date} @ ${run.commit.slice(0, SHORT_SHA)}`];
  for (const id of ASSISTANT_IDS) {
    const mine = run.observations.filter((o) => o.assistant === id);
    if (run.assistants[id].status === 'skipped') {
      lines.push(`  ${id}: skipped (${run.assistants[id].secret} not set)`);
      continue;
    }
    const ok = mine.filter((o) => o.status === 'ok');
    const errors = mine.length - ok.length;
    const named = ok.filter((o) => o.named).length;
    const cited = ok.filter((o) => o.ours.length > 0).length;
    const models = [...new Set(mine.flatMap((o) => (o.model ? [o.model] : [])))].join(', ') || 'no model reported';
    const cost = mine.reduce((sum, o) => sum + (o.costUsd ?? 0), 0);
    lines.push(`  ${id} (${models}): named in ${named}/${ok.length}, cited ours in ${cited}/${ok.length}${errors > 0 ? `, ${errors} error(s)` : ''}; $${cost.toFixed(2)} reported`);
    for (const o of mine) if (o.status === 'error') lines.push(`    Q${o.question}: ${o.error ?? ''}`);
  }
  return lines.join('\n');
}

function main(): void {
  const run = runProbe({ env: process.env, date: new Date().toISOString().slice(0, DATE_CHARS), commit: headCommit() });
  const problems = probeProblems(run);
  if (problems.length > 0) {
    console.error(`citation-probe: the run is not a valid v${PROBE_VERSION} record:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const rel = writeProbe(run, REPO_ROOT);
  console.log(summarize(run));
  console.log(`Wrote ${rel}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error);
    process.exit(1);
  }
}
