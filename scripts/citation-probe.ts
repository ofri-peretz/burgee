#!/usr/bin/env tsx
/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The AI citation probe (roadmap `marketing-and-docs` 2.4): five fixed questions, put to
 * three assistants with web search on, once a week. Each answer is scored for whether it
 * names burgee (or presents a family package as the answer) and which URLs it cites, and
 * the run is written to one file:
 *
 *   .sdlc/research/citation-probe/<YYYY-MM-DD>.json
 *
 * An assistant whose secret is missing is skipped, loudly (a `::notice::`), and recorded
 * as `skipped`; with no secret at all the run still exits 0 and writes a file saying so, so
 * the series shows the weeks nothing was measured. A secret that is present but whose call
 * fails is recorded as `error` with the HTTP status. The exit code is 0 in every case the
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

import { ASSISTANTS, type Assistant, type AssistantId } from './citation-probe-assistants';
import { ourUrls, scoreAnswer, unique, urlsInText } from './citation-probe-score';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PROBE_DIR = '.sdlc/research/citation-probe';
export const PROBE_VERSION = 1;

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

export type ObservationStatus = 'ok' | 'error' | 'skipped';

/** One question put to one assistant. A run always holds one per (assistant, question). */
export interface Observation {
  date: string;
  commit: string;
  assistant: AssistantId;
  /** The model id the provider reported answering with; `null` when it reported none. */
  model: string | null;
  /** 1-based, into `QUESTIONS`. */
  question: number;
  status: ObservationStatus;
  /** The HTTP status of a failed call; `null` for a network error, a timeout, or no call. */
  httpStatus: number | null;
  error: string | null;
  named: boolean;
  /** Which of burgee and the family packages the answer names. */
  mentions: string[];
  /** Every URL the answer text or the provider's citation metadata cites. */
  citedUrls: string[];
  /** The subset of `citedUrls` on our hosts. */
  ours: string[];
  /** Text around the first mention, `null` when there is none. */
  excerpt: string | null;
}

export interface AssistantSummary {
  status: 'ran' | 'skipped';
  /** The secret that gates this assistant. */
  secret: Assistant['secret'];
  /** The model or preset the probe asked for; each observation records what answered. */
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

function blank(date: string, commit: string, assistant: AssistantId, question: number): Observation {
  return {
    date,
    commit,
    assistant,
    model: null,
    question,
    status: 'skipped',
    httpStatus: null,
    error: null,
    named: false,
    mentions: [],
    citedUrls: [],
    ours: [],
    excerpt: null,
  };
}

interface AssistantRun {
  assistant: Assistant;
  key: string;
  date: string;
  commit: string;
  fetchImpl: typeof fetch;
}

async function probeAssistant({ assistant: a, key, date, commit, fetchImpl }: AssistantRun): Promise<Observation[]> {
  const out: Observation[] = [];
  for (const [i, question] of QUESTIONS.entries()) {
    const base = blank(date, commit, a.id, i + 1);
    // One question at a time per assistant: a weekly probe has no reason to race a rate limit.
    // eslint-disable-next-line reliability/no-await-in-loop
    const res = await a.ask(question, key, fetchImpl);
    if (!res.ok) {
      out.push({ ...base, status: 'error', model: res.model, httpStatus: res.httpStatus, error: res.error });
      continue;
    }
    const cited = unique([...res.citedUrls, ...urlsInText(res.text)]);
    out.push({ ...base, status: 'ok', model: res.model, ...scoreAnswer(res.text), citedUrls: cited, ours: ourUrls(cited) });
  }
  return out;
}

const printLine = (line: string): void => console.log(line);

export interface ProbeOptions {
  env: Env;
  date: string;
  commit: string;
  fetchImpl?: typeof fetch;
  /** Where a skipped assistant is announced. Defaults to stdout. */
  notice?: (line: string) => void;
  assistants?: readonly Assistant[];
}

export async function runProbe(opts: ProbeOptions): Promise<ProbeRun> {
  const { env, date, commit } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const notice = opts.notice ?? printLine;
  const assistants = opts.assistants ?? ASSISTANTS;
  const summaries = {} as Record<AssistantId, AssistantSummary>;
  const runs = assistants.map(async (a) => {
    const key = env[a.secret]?.trim() ?? '';
    if (key === '') {
      notice(`::notice title=Citation probe::${a.secret} is not set; ${a.id} is recorded as skipped.`);
      summaries[a.id] = { status: 'skipped', secret: a.secret, requested: a.requested };
      return QUESTIONS.map((_, i) => blank(date, commit, a.id, i + 1));
    }
    summaries[a.id] = { status: 'ran', secret: a.secret, requested: a.requested };
    return probeAssistant({ assistant: a, key, date, commit, fetchImpl });
  });
  const observations = (await Promise.all(runs)).flat();
  return { v: PROBE_VERSION, date, commit, questions: [...QUESTIONS], assistants: summaries, observations };
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
const ASSISTANT_IDS: readonly AssistantId[] = ['claude', 'openai', 'perplexity'];
const STATUSES: readonly ObservationStatus[] = ['ok', 'error', 'skipped'];

/** Field types of one observation. */
function observationShapeProblems(o: Json, where: string, run: Json): string[] {
  const out: string[] = [];
  if (o.date !== run.date) out.push(`${where}.date is not the run's date`);
  if (o.commit !== run.commit) out.push(`${where}.commit is not the run's commit`);
  if (!ASSISTANT_IDS.includes(o.assistant as AssistantId)) out.push(`${where}.assistant is not claude | openai | perplexity`);
  if (!isNullableString(o.model)) out.push(`${where}.model is not a string or null`);
  const q = o.question;
  if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > QUESTIONS.length) out.push(`${where}.question is not 1..${QUESTIONS.length}`);
  if (!STATUSES.includes(o.status as ObservationStatus)) out.push(`${where}.status is not ok | error | skipped`);
  if (o.httpStatus !== null && !Number.isInteger(o.httpStatus)) out.push(`${where}.httpStatus is not an integer or null`);
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

/** Every way `doc` is not a v1 probe run. Empty means it is one. */
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
    lines.push(`  ${id}: named in ${named}/${ok.length}, cited ours in ${cited}/${ok.length}${errors > 0 ? `, ${errors} error(s)` : ''}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const run = await runProbe({ env: process.env, date: new Date().toISOString().slice(0, DATE_CHARS), commit: headCommit() });
  const problems = probeProblems(run);
  if (problems.length > 0) {
    console.error(`citation-probe: the run is not a valid v1 record:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const rel = writeProbe(run, REPO_ROOT);
  console.log(summarize(run));
  console.log(`Wrote ${rel}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
