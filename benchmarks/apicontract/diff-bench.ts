/**
 * contractdiff-bench R4: the reading. Builds the pairs (R2), runs every tool (R3) on them one at a
 * time, and writes one JSONL row per pair and tool, then `summary.json` and `summary.md`:
 *
 * - D2: planted breaks a differ called non-breaking (missed), over the breaking pairs it read;
 * - D3: planted non-breaks a differ called breaking (false alarms), over the non-breaking pairs it read;
 * - D1: pairs where a differ's verdict equals oasdiff's, over the pairs both read;
 * - D4: median wall time on the timing pairs (a linter: on the timing documents);
 * - crashes, and every pair where a differ and the label disagree.
 *
 *   npx tsx benchmarks/apicontract/diff-bench.ts --sample 50 --seed 1 [--tools contractdiff,oasdiff] [--out dir]
 *
 * The labels are the catalogue's, not any tool's (spec: oasdiff is a competitor, so D1 measures
 * agreement with it rather than taking it as truth).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { spawnSync } from '../spawn.js';

import { median, parseFlags } from './corpus-lib.js';
import { type Label } from './diff-edits.js';
import { buildPairs, type Pair } from './diff-pairs.js';
import { type Tool, TOOLS, type Verdict } from './diff-tools.js';

export interface DiffRow {
  /** The pair id, or the document id for a linter. */
  readonly pair: string;
  readonly tool: string;
  readonly label: Label | null;
  readonly timing: boolean;
  readonly verdict: Verdict;
  readonly ms: number;
  readonly error: string | null;
}

export interface Rate {
  readonly count: number;
  readonly of: number;
}

export interface DiffSummary {
  readonly tool: string;
  readonly kind: 'diff' | 'lint';
  readonly rows: number;
  readonly crashes: number;
  /** Differs only. */
  readonly missed?: Rate;
  readonly falseAlarms?: Rate;
  readonly agreesWithOasdiff?: Rate;
  readonly timingMedianMs: number | null;
  readonly disagreements: readonly string[];
}

const REFERENCE = 'oasdiff';
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const ISO_DATE = 10;

const rate = (rows: readonly DiffRow[], hit: (row: DiffRow) => boolean): Rate => ({ count: rows.filter(hit).length, of: rows.length });
const PERCENT = 100;
const percent = ({ count, of }: Rate): string => (of === 0 ? '—' : `${((PERCENT * count) / of).toFixed(1)}% (${count}/${of})`);
const ms = (value: number | null): string => (value === null ? '—' : `${value} ms`);

/** One tool's rows folded into D1–D4, crashes and the disagreements. `reference` is oasdiff's rows. */
export function foldDiff(tool: string, kind: 'diff' | 'lint', rows: readonly DiffRow[], reference: readonly DiffRow[] = []): DiffSummary {
  const read = rows.filter((r) => r.verdict !== 'crash');
  const timingMedianMs = median(read.filter((r) => r.timing).map((r) => r.ms));
  const base = { tool, kind, rows: rows.length, crashes: rows.length - read.length, timingMedianMs };
  if (kind === 'lint') return { ...base, disagreements: [] };
  const theirs = new Map(reference.filter((r) => r.verdict !== 'crash').map((r) => [r.pair, r.verdict]));
  const both = read.filter((r) => theirs.has(r.pair));
  return {
    ...base,
    missed: rate(
      read.filter((r) => r.label === 'breaking'),
      (r) => r.verdict === 'non-breaking',
    ),
    falseAlarms: rate(
      read.filter((r) => r.label === 'non-breaking'),
      (r) => r.verdict === 'breaking',
    ),
    agreesWithOasdiff: rate(both, (r) => theirs.get(r.pair) === r.verdict),
    disagreements: read.filter((r) => r.verdict !== r.label).map((r) => `${r.pair}: labelled ${String(r.label)}, said ${r.verdict}`),
  };
}

/** Every tool's rows folded, the differs first, contractdiff at the head. */
export function summarize(byTool: Readonly<Record<string, readonly DiffRow[]>>, kinds: Readonly<Record<string, 'diff' | 'lint'>>): DiffSummary[] {
  const reference = byTool[REFERENCE] ?? [];
  const order = (name: string): number => {
    if (name === 'contractdiff') return 0;
    return kinds[name] === 'diff' ? 1 : 2;
  };
  return Object.keys(byTool)
    .toSorted((a, b) => order(a) - order(b) || (a < b ? -1 : 1))
    .map((name) => foldDiff(name, kinds[name] ?? 'diff', byTool[name] ?? [], reference));
}

/** `summary.md`: one table for the differs, one for the linters, then each differ's disagreements. */
export function renderDiffSummary(run: string, summaries: readonly DiffSummary[], listed = 20): string {
  const differs = summaries.filter((s) => s.kind === 'diff');
  const linters = summaries.filter((s) => s.kind === 'lint');
  const lines = [
    `# contractdiff against its competitors: ${run}`,
    '',
    'Labels are the edit catalogue\'s (`diff-edits.ts`). D2 and D3 are over the pairs a tool read; a crash is counted apart.',
    '',
    '| tool | D2 missed breaks | D3 false alarms | D1 agrees with oasdiff | D4 median (timing pairs) | crashes |',
    '| --- | --- | --- | --- | --- | --- |',
    ...differs.map((s) => `| ${s.tool} | ${percent(s.missed as Rate)} | ${percent(s.falseAlarms as Rate)} | ${percent(s.agreesWithOasdiff as Rate)} | ${ms(s.timingMedianMs)} | ${s.crashes}/${s.rows} |`),
  ];
  if (linters.length > 0) {
    lines.push('', '| linter | median (timing documents) | crashes |', '| --- | --- | --- |', ...linters.map((s) => `| ${s.tool} | ${ms(s.timingMedianMs)} | ${s.crashes}/${s.rows} |`));
  }
  for (const s of differs) {
    lines.push('', `## ${s.tool}: ${s.disagreements.length} disagreement(s) with the label`, '');
    lines.push(...(s.disagreements.length === 0 ? ['- none'] : s.disagreements.slice(0, listed).map((d) => `- ${d}`)));
    if (s.disagreements.length > listed) lines.push(`- … and ${s.disagreements.length - listed} more in \`${s.tool}.jsonl\``);
  }
  return `${lines.join('\n')}\n`;
}

function runOne(tool: Tool, dir: string, pair: { id: string; old: string; new: string; label: Label | null; timing: boolean }, timeout: number): DiffRow {
  const { file, args } = tool.command(dir, pair.old, pair.new);
  const start = performance.now();
  // SIGKILL: a CLI that handles SIGTERM to shut down cleanly never runs its handler while a
  // synchronous comparison holds the thread, so a SIGTERM timeout does not end it.
  const result = spawnSync(file, args, { encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: MAX_BUFFER, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' } });
  const ms = Math.round(performance.now() - start);
  const base = { pair: pair.id, tool: tool.name, label: pair.label, timing: pair.timing, ms };
  if (result.error !== undefined || result.signal !== null) {
    return { ...base, verdict: 'crash', error: result.signal === 'SIGKILL' ? `timed out after ${timeout} ms` : String(result.error ?? result.signal) };
  }
  return { ...base, ...tool.judge({ status: result.status, stdout: result.stdout, stderr: result.stderr }) };
}

/** A linter's jobs: each document once, on the old side (the pinned bytes, re-serialised). */
const lintJobs = (pairs: readonly Pair[]): { id: string; old: string; new: string; label: null; timing: boolean }[] => {
  const seen = new Map<string, { id: string; old: string; new: string; label: null; timing: boolean }>();
  for (const pair of pairs) if (!seen.has(pair.document)) seen.set(pair.document, { id: pair.document, old: pair.old, new: pair.old, label: null, timing: pair.timing });
  return [...seen.values()];
};

function gitSha(): string {
  const ran = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: import.meta.dirname, encoding: 'utf8' });
  return ran.stdout.trim() || 'unknown';
}

export const diffResultsDir = (date = new Date()): string => path.join(import.meta.dirname, 'results', `${date.toISOString().slice(0, ISO_DATE)}-${gitSha()}-diff`);

if (process.argv[1] === import.meta.filename) {
  const { flags } = parseFlags(process.argv.slice(2));
  const str = (name: string): string | undefined => (typeof flags.get(name) === 'string' ? (flags.get(name) as string) : undefined);
  const num = (name: string): number | undefined => (str(name) === undefined ? undefined : Number(str(name)));
  const names = str('tools')?.split(',');
  const tools = TOOLS.filter((t) => names === undefined || names.includes(t.name));
  const out = str('out') ?? diffResultsDir();
  const timeout = num('timeout') ?? DEFAULT_TIMEOUT_MS;
  const pairs = await buildPairs({ sample: num('sample'), seed: num('seed') });
  mkdirSync(out, { recursive: true });
  const byTool = new Map<string, DiffRow[]>();
  for (const tool of tools) {
    const dir = tool.prepare();
    const jobs = tool.kind === 'diff' ? pairs : lintJobs(pairs);
    const rows = jobs.map((job, index) => {
      const row = runOne(tool, dir, job, timeout);
      process.stderr.write(`${tool.name} ${index + 1}/${jobs.length} ${row.verdict} ${row.ms}ms ${row.pair}\n`);
      return row;
    });
    byTool.set(tool.name, rows);
    writeFileSync(path.join(out, `${tool.name}.jsonl`), `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  }
  const summaries = summarize(Object.fromEntries(byTool), Object.fromEntries(tools.map((t) => [t.name, t.kind])));
  const run = path.basename(out);
  const meta = { run, sample: num('sample') ?? null, seed: num('seed') ?? 1, pairs: pairs.length, tools: tools.map((t) => ({ name: t.name, kind: t.kind, pin: t.pin })), node: process.version, date: new Date().toISOString() };
  writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify({ ...meta, summaries }, undefined, 2)}\n`);
  const markdown = renderDiffSummary(run, summaries);
  writeFileSync(path.join(out, 'summary.md'), markdown);
  process.stdout.write(markdown);
}
