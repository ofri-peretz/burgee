/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The props corpus lane (`.sdlc/intents/contract-properties/`, success criterion 1): the built
 * `contractdiff props` over the pinned corpus, at 1,000 values per payload and property.
 *
 * - every pinned OpenAPI document (or a seeded sample): agreement, round-trip and normalise;
 * - the planted pairs `diff-pairs.ts` builds for the contractdiff reading: the same three on the
 *   new side, and diff soundness `--against` the old side.
 *
 * One process per contract, `--concurrency` at a time; one jsonl row per contract, then
 * `summary.json` and `summary.md`. Exit 1 when any property breaks on any contract: a
 * counterexample is a bug in contractdiff's validator, normaliser or classifier, with the seed that
 * replays it. A contract the CLI cannot read, or that crashes it, is counted apart and never as a
 * pass.
 *
 *   npx tsx benchmarks/apicontract/props-corpus.ts [--sample N] [--pairs M] [--runs 1000] [--seed 1]
 *     [--source a,b] [--concurrency N] [--timeout ms] [--out dir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';

import { spawn } from '../spawn.js';

import { expandPins, firstLine, median, parseFlags } from './corpus-lib.js';
import { buildPairs } from './diff-pairs.js';
import { fetchAll, select } from './fetch.js';
import { pool, readPins } from './net.js';

export const PROPERTIES = ['agreement', 'round-trip', 'normalise', 'soundness'] as const;
export type Property = (typeof PROPERTIES)[number];

/** The criterion's count: values drawn per payload and property. */
export const DEFAULT_RUNS = 1000;
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const SHORT_SHA = 10;
const ISO_DATE = 10;
/** Progress on stderr every this many contracts. */
const PROGRESS_EVERY = 100;

export interface PropsJob {
  readonly id: string;
  /** A pinned document, or a planted pair (soundness runs only on a pair). */
  readonly kind: 'document' | 'pair';
}

export interface Spawned {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly ms: number;
  readonly timedOut?: boolean | undefined;
}

export interface PropsRow extends PropsJob {
  /** `false`: the CLI said it cannot read the contract; `null`: no envelope (a crash or a timeout). */
  readonly read: boolean | null;
  /** `null` when nothing ran. */
  readonly ok: boolean | null;
  readonly checked: Readonly<Record<Property, number>>;
  readonly counterexamples: Readonly<Partial<Record<Property, number>>>;
  readonly reported: number;
  readonly skipped: number;
  readonly ms: number;
  readonly error: string | null;
}

interface Envelope {
  readonly data?: {
    readonly tallies?: Partial<Record<Property, { readonly checked: number }>>;
    readonly counterexamples?: readonly { readonly property: Property }[];
    readonly reported?: readonly unknown[];
    readonly skipped?: readonly unknown[];
  };
  readonly error?: { readonly message?: string };
}

const zero = (): Record<Property, number> => ({ agreement: 0, 'round-trip': 0, normalise: 0, soundness: 0 });

const envelope = (stdout: string): Envelope | undefined => {
  const line = stdout.split('\n').find((l) => l.trim().startsWith('{'));
  if (line === undefined) return undefined;
  try {
    return JSON.parse(line) as Envelope;
  } catch {
    return undefined;
  }
};

/** One `contractdiff props --json` process, as a row. */
export function propsRow(job: PropsJob, run: Spawned): PropsRow {
  const empty = { ...job, checked: zero(), counterexamples: {}, reported: 0, skipped: 0, ms: run.ms };
  if (run.timedOut === true) return { ...empty, read: null, ok: null, error: `timed out after ${String(run.ms)} ms` };
  const parsed = envelope(run.stdout);
  const data = parsed?.data;
  if (data?.tallies === undefined) {
    if (parsed?.error?.message !== undefined) return { ...empty, read: false, ok: null, error: firstLine(parsed.error.message) };
    return { ...empty, read: null, ok: null, error: firstLine(run.stderr || run.stdout) || `exit ${String(run.status)}` };
  }
  const checked = zero();
  for (const property of PROPERTIES) checked[property] = data.tallies[property]?.checked ?? 0;
  const found = new Map<Property, number>();
  for (const { property } of data.counterexamples ?? []) found.set(property, (found.get(property) ?? 0) + 1);
  const counterexamples = Object.fromEntries(found) as Partial<Record<Property, number>>;
  const broke = (data.counterexamples ?? []).length > 0;
  return { ...empty, read: true, ok: !broke, checked, counterexamples, reported: (data.reported ?? []).length, skipped: (data.skipped ?? []).length, error: null };
}

export interface Count {
  readonly total: number;
  readonly ran: number;
  readonly held: number;
  readonly failed: number;
  readonly unread: number;
  readonly crashed: number;
}

export interface PropsSummary {
  readonly runs: number;
  readonly seed: number;
  /** Something ran and no property broke anywhere. */
  readonly held: boolean;
  readonly documents: Count;
  readonly pairs: Count;
  readonly checked: Readonly<Record<Property, number>>;
  readonly counterexamples: Readonly<Record<Property, number>>;
  /** The contracts with a counterexample. */
  readonly failing: readonly PropsJob[];
  readonly medianMs: number | null;
}

const count = (rows: readonly PropsRow[]): Count => ({
  total: rows.length,
  ran: rows.filter((r) => r.read === true).length,
  held: rows.filter((r) => r.ok === true).length,
  failed: rows.filter((r) => r.ok === false).length,
  unread: rows.filter((r) => r.read === false).length,
  crashed: rows.filter((r) => r.read === null).length,
});

/** The reading: every row folded, per kind and per property. */
export function foldProps(rows: readonly PropsRow[], { runs, seed }: { runs: number; seed: number }): PropsSummary {
  const checked = zero();
  const counterexamples = zero();
  for (const row of rows) {
    for (const property of PROPERTIES) {
      checked[property] += row.checked[property];
      counterexamples[property] += row.counterexamples[property] ?? 0;
    }
  }
  const ran = rows.filter((r) => r.read === true);
  const failing = rows.filter((r) => r.ok === false).map(({ id, kind }) => ({ id, kind }));
  return {
    runs,
    seed,
    held: ran.length > 0 && failing.length === 0,
    documents: count(rows.filter((r) => r.kind === 'document')),
    pairs: count(rows.filter((r) => r.kind === 'pair')),
    checked,
    counterexamples,
    failing,
    medianMs: median(ran.map((r) => r.ms)),
  };
}

const countLine = (name: string, c: Count): string =>
  `| ${name} | ${String(c.total)} | ${String(c.ran)} | ${String(c.held)} | ${String(c.failed)} | ${String(c.unread)} | ${String(c.crashed)} |`;

const notRun = (s: PropsSummary): number => s.documents.unread + s.documents.crashed + s.pairs.unread + s.pairs.crashed;

/** `summary.md`: the counts, the per-property table and each failing contract with its replay. */
export function renderPropsSummary(summary: PropsSummary, run: string): string {
  const replay = ({ kind }: PropsJob): string =>
    kind === 'pair'
      ? `contractdiff props <new> --against <old> --runs ${String(summary.runs)} --seed ${String(summary.seed)}`
      : `contractdiff props <document> --runs ${String(summary.runs)} --seed ${String(summary.seed)}`;
  return [
    `# contractdiff props on the corpus — ${run}`,
    '',
    `${summary.held ? 'Every property held on every contract that ran' : 'Not every property held'}: ${String(summary.runs)} values per payload and property, seed ${String(summary.seed)}, median ${String(summary.medianMs ?? 'n/a')} ms per contract.${notRun(summary) === 0 ? '' : ` ${String(notRun(summary))} contract(s) did not run (unread, crashed or timed out): unmeasured, not passed.`}`,
    '',
    '| contracts | total | ran | held | failed | unread | crashed |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    countLine('documents', summary.documents),
    countLine('pairs', summary.pairs),
    '',
    '| property | values checked | counterexamples |',
    '| --- | --- | --- |',
    ...PROPERTIES.map((p) => `| ${p} | ${String(summary.checked[p])} | ${String(summary.counterexamples[p])} |`),
    '',
    ...(summary.failing.length === 0 ? [] : ['Failing contracts (each counterexample is in `rows.jsonl`):', '', ...summary.failing.map((job) => `- \`${job.id}\` (replay: \`${replay(job)}\`)`), '']),
  ].join('\n');
}

const REPO = path.resolve(import.meta.dirname, '../..');
const BIN = path.join(REPO, 'packages', 'contractdiff', 'dist', 'bin.js');

/** A child's output stream, kept up to `MAX_BUFFER`. */
function collect(): { text: string; add: (chunk: Buffer) => void } {
  const sink = { text: '', add: (chunk: Buffer): void => void (sink.text.length < MAX_BUFFER && (sink.text += chunk.toString('utf8'))) };
  return sink;
}

/** One contract through the built CLI, without blocking the other lanes. */
function runOne(args: readonly string[], timeout: number): Promise<Spawned> {
  return new Promise((resolve) => {
    const start = performance.now();
    const child = spawn(process.execPath, [BIN, 'props', ...args, '--json'], { env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
    const stdout = collect();
    const stderr = collect();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);
    child.stdout?.on('data', stdout.add);
    child.stderr?.on('data', stderr.add);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ stdout: stdout.text, stderr: stderr.text, status, ms: timedOut ? timeout : Math.round(performance.now() - start), timedOut });
    });
  });
}

const isEntry = process.argv[1] === import.meta.filename;
if (isEntry) {
  const { flags } = parseFlags(process.argv.slice(2));
  const str = (name: string): string | undefined => (typeof flags.get(name) === 'string' ? (flags.get(name) as string) : undefined);
  const num = (name: string, fallback?: number): number | undefined => (str(name) === undefined ? fallback : Number(str(name)));
  const runs = num('runs', DEFAULT_RUNS) as number;
  const seed = num('seed', 1) as number;
  const timeout = num('timeout', DEFAULT_TIMEOUT_MS) as number;
  const concurrency = num('concurrency', availableParallelism()) as number;
  const sha = (process.env.GITHUB_SHA ?? 'local').slice(0, SHORT_SHA);
  const run = `${new Date().toISOString().slice(0, ISO_DATE)}-${sha}-props`;
  const out = str('out') ?? path.join(REPO, 'benchmarks', 'apicontract', 'results', run);

  const pins = select(expandPins(readPins()), { family: 'openapi', source: str('source'), sample: num('sample'), seed });
  const documents = await fetchAll(pins);
  const pairs = (num('pairs') ?? 0) > 0 ? await buildPairs({ sample: num('pairs'), seed }) : [];
  const jobs = [
    ...documents.map((d) => ({ job: { id: d.pin.id, kind: 'document' as const }, args: [d.file] })),
    ...pairs.map((p) => ({ job: { id: p.id, kind: 'pair' as const }, args: [p.new, '--against', p.old] })),
  ];
  const common = ['--runs', String(runs), '--seed', String(seed)];
  let done = 0;
  const rows = await pool(jobs, concurrency, async ({ job, args }) => {
    const row = propsRow(job, await runOne([...args, ...common], timeout));
    done += 1;
    if (done % PROGRESS_EVERY === 0 || done === jobs.length) process.stderr.write(`props: ${String(done)}/${String(jobs.length)}\n`);
    return row;
  });

  const summary = foldProps(rows, { runs, seed });
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'rows.jsonl'), `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify(summary, undefined, 2)}\n`);
  writeFileSync(path.join(out, 'summary.md'), renderPropsSummary(summary, run));
  process.stdout.write(`${renderPropsSummary(summary, run)}\n`);
  process.exitCode = summary.failing.length > 0 ? 1 : 0;
}
