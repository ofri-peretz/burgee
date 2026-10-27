/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every number on "What an agent sees" is in a landed B1 result, and no run is left out.
 *
 * `.sdlc/intents/positioning/` R3. The page quotes recorded B1 sessions and tabulates the runs
 * they came from. B1 lands a result on every reading (each push to `main` until 2026-10-18, weekly since), so a sentence about "the newest
 * run" is false by the next reading. The page names each run by commit, and this lock reads that
 * run's committed `benchmarks/results/agent-cli-bench/<date>-<sha>-ci.json`:
 *
 *   - **every run row** equals that run's result: the time it was measured, the tokens and turns
 *     ratios as totals (each build's `<task>.tokens` and `<task>.turns` summed here, the measure
 *     the claims read since D-20261009-b1-totals-and-explain), each build's total turns, and the
 *     old median tokens ratio. A run that also carries a `*-total-ratio` record must agree with
 *     the sum;
 *   - **no run is left out.** Every landed run that measured B1 between the table's first row and
 *     its last is a row, in order. A table that dropped the runs where the claim missed would read
 *     better and be false, so it fails here;
 *   - **the counts in the prose** ("The tokens claim held on N of these M runs", and the same for
 *     turns) are recomputed from the rows against each claim's own bar in `benchmarks/claims.ts`;
 *   - **every per-task row** equals that run's `<task>.turns` and `<task>.passed`;
 *   - **every quoted session** (`{/* session <sha> <build> <task> turns=<n> *\/}`) took a number
 *     of turns that run actually recorded for that build and task;
 *   - the model named on the page is the model the cited runs recorded, and the page is in the
 *     navigation.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLAIMS } from 'benchmarks/claims.js';
import { median } from 'benchmarks/stats.js';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PAGE = 'apps/docs/content/docs/what-an-agent-sees.mdx';
const RESULTS = join(ROOT, 'benchmarks/results/agent-cli-bench');
const RATIO = 'burgee ÷ commander';

interface Record_ {
  axis: string;
  variant: string;
  metric: string;
  median: number;
  detail?: Record<string, unknown>;
}

export interface Doc {
  measured: string;
  records: Record_[];
}

/** Every landed CI result, by its short commit. */
export function landed(dir = RESULTS): Map<string, Doc> {
  const out = new Map<string, Doc>();
  for (const file of readdirSync(dir)) {
    const sha = /^\d{4}-\d{2}-\d{2}-([0-9a-f]{7})-ci\.json$/u.exec(file)?.[1];
    if (sha !== undefined) out.set(sha, JSON.parse(readFileSync(join(dir, file), 'utf8')) as Doc);
  }
  return out;
}

const agent = (doc: Doc, variant: string, metric: string): Record_ | undefined => doc.records.find((r) => r.axis === 'agent' && r.variant === variant && r.metric === metric);

/** A claim's bar, read from `benchmarks/claims.ts` rather than restated. */
function bar(id: 'agent-tokens-40pct' | 'agent-turns-30pct'): number {
  const max = CLAIMS.find((c) => c.id === id)?.test.max;
  if (max === undefined) throw new Error(`benchmarks/claims.ts no longer declares ${id} with a max — update this lock with it`);
  return max;
}

/** The five tasks' sessions, summed for one build: `<task>.tokens` or `<task>.turns` from its detail. */
function total(doc: Doc, build: string, what: 'tokens' | 'turns'): number {
  const detail = agent(doc, build, 'success-rate')?.detail ?? {};
  return Object.entries(detail)
    .filter(([key]) => key.endsWith(`.${what}`))
    .flatMap(([, value]) => String(value).split(','))
    .reduce((sum, n) => sum + Number(n), 0);
}

const THOUSANDTHS = 1000;
const ratio = (a: number, b: number): number => Math.round((a / b) * THOUSANDTHS) / THOUSANDTHS;

const RUN_ROW = /^\| `([0-9a-f]{7})` \| (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) \| ([\d.]+) \| ([\d.]+) \| (\d+) \| (\d+) \| ([\d.]+) \|$/gmu;
const TASK_ROW = /^\| `([0-9a-f]{7})` \| ([a-z-]+) \| ([\d, ]+) \| (\d+\/\d+) \| ([\d, ]+) \| (\d+\/\d+) \|$/gmu;
const SESSION = /\{\/\* session ([0-9a-f]{7}) (burgee|commander) ([a-z-]+) turns=(\d+) \*\/\}/gu;
const COUNT = /The (tokens|turns) claim held on (\d+) of these (\d+) runs/gu;

const minute = (measured: string): string => measured.slice(0, 16).replace('T', ' ');
const list = (cell: string): string => cell.replaceAll(/\s+/gu, '');

type Row = RegExpMatchArray;

/** One run row against its result: the time, both totals ratios, both builds' total turns, the old median ratio. */
function runRow([, sha, at, tokens, turns, burgee, commander, medians]: Row, docs: Map<string, Doc>): string[] {
  const doc = docs.get(sha!);
  if (doc === undefined) return [`${sha!}: no landed result for this run`];
  const want = {
    measured: minute(doc.measured),
    tokens: ratio(total(doc, 'burgee', 'tokens'), total(doc, 'commander', 'tokens')),
    turns: ratio(total(doc, 'burgee', 'turns'), total(doc, 'commander', 'turns')),
    burgee: total(doc, 'burgee', 'turns'),
    commander: total(doc, 'commander', 'turns'),
    medians: agent(doc, RATIO, 'tokens-per-task-ratio')?.median,
  };
  const got = { measured: at, tokens: Number(tokens), turns: Number(turns), burgee: Number(burgee), commander: Number(commander), medians: Number(medians) };
  const recorded = { tokens: agent(doc, RATIO, 'tokens-total-ratio')?.median, turns: agent(doc, RATIO, 'turns-total-ratio')?.median };
  return [
    ...(Object.keys(want) as (keyof typeof want)[]).filter((key) => want[key] !== got[key]).map((key) => `${sha!}: the page says ${key} ${String(got[key])}, the result says ${String(want[key])}`),
    ...(['tokens', 'turns'] as const).filter((key) => recorded[key] !== undefined && recorded[key] !== want[key]).map((key) => `${sha!}: the summed ${key} ratio ${String(want[key])} disagrees with the run's own ${key}-total-ratio ${String(recorded[key])}`),
  ];
}

/** No run between the first row and the last may be missing: a table without its bad runs reads better and is false. */
function complete(rows: readonly Row[], docs: Map<string, Doc>): string[] {
  const shown = rows.map((r) => r[1]!);
  const times = shown.flatMap((sha) => (docs.has(sha) ? [docs.get(sha)!.measured] : [])).sort();
  if (times.length === 0) return [];
  const [from, to] = [times[0]!, times.at(-1)!];
  const expected = [...docs.entries()]
    .filter(([, d]) => agent(d, RATIO, 'tokens-per-task-ratio') !== undefined && d.measured >= from && d.measured <= to)
    .sort(([, a], [, b]) => a.measured.localeCompare(b.measured))
    .map(([sha]) => sha);
  return expected.join(' ') === shown.join(' ') ? [] : [`the run table is not every landed B1 run from ${shown[0]!} to ${shown.at(-1)!}, in order: expected ${expected.join(', ')}`];
}

/** "The tokens claim held on N of these M runs", and the same for turns, recomputed from the rows against each claim's bar. */
function counted(page: string, rows: readonly Row[]): string[] {
  const counts = new Map([...page.matchAll(COUNT)].map((m) => [m[1]!, [Number(m[2]), Number(m[3])]] as const));
  const claims = [
    { what: 'tokens', column: 3, max: bar('agent-tokens-40pct') },
    { what: 'turns', column: 4, max: bar('agent-turns-30pct') },
  ];
  return claims.flatMap(({ what, column, max }) => {
    const said = counts.get(what);
    if (said === undefined) return [`the page no longer says "The ${what} claim held on N of these M runs" — say how many runs met it`];
    const met = rows.filter((r) => Number(r[column]) <= max).length;
    return said[0] === met && said[1] === rows.length ? [] : [`the page says the ${what} claim held on ${String(said[0])} of ${String(said[1])} runs; the table says ${String(met)} of ${String(rows.length)}`];
  });
}

/** One per-task row against that run's `<task>.turns` and `<task>.passed`. */
function taskRow([, sha, task, bTurns, bPassed, cTurns, cPassed]: Row, docs: Map<string, Doc>): string[] {
  const doc = docs.get(sha!);
  const detail = (build: string): Record<string, unknown> | undefined => (doc === undefined ? undefined : agent(doc, build, 'success-rate')?.detail);
  const cells: [string, string, unknown][] = [
    ['burgee turns', list(bTurns!), detail('burgee')?.[`${task!}.turns`]],
    ['burgee passed', bPassed!, detail('burgee')?.[`${task!}.passed`]],
    ['commander turns', list(cTurns!), detail('commander')?.[`${task!}.turns`]],
    ['commander passed', cPassed!, detail('commander')?.[`${task!}.passed`]],
  ];
  return cells.filter(([, shown, result]) => shown !== result).map(([what, shown, result]) => `${sha!} ${task!}: the page says ${what} ${shown}, the result says ${String(result)}`);
}

/** A quoted session took a number of turns its run recorded for that build and task. */
function session([, sha, build, task, turns]: Row, docs: Map<string, Doc>): string[] {
  const doc = docs.get(sha!);
  const recorded = doc === undefined ? undefined : agent(doc, build!, 'success-rate')?.detail?.[`${task!}.turns`];
  return typeof recorded === 'string' && recorded.split(',').includes(turns!) ? [] : [`${sha!} ${build!} ${task!}: a quoted session took ${turns!} turns, and the run recorded ${String(recorded)}`];
}

/** Every model the cited runs used is named on the page. */
function models(page: string, rows: readonly Row[], docs: Map<string, Doc>): string[] {
  const used = new Set(rows.flatMap((r) => (docs.has(r[1]!) ? [agent(docs.get(r[1]!)!, 'burgee', 'tokens-per-task')?.detail?.['model']] : [])));
  return [...used].filter((model) => typeof model !== 'string' || !page.includes(model)).map((model) => `the cited runs used ${String(model)}, and the page does not name it`);
}

/** Everything on the page that disagrees with the landed results. */
export function problems(page: string, docs: Map<string, Doc>): string[] {
  const rows = [...page.matchAll(RUN_ROW)];
  if (rows.length === 0) return ['the page has no run table this lock can read — the reader is broken, or the table changed shape'];
  return [
    ...rows.flatMap((row) => runRow(row, docs)),
    ...complete(rows, docs),
    ...counted(page, rows),
    ...[...page.matchAll(TASK_ROW)].flatMap((row) => taskRow(row, docs)),
    ...[...page.matchAll(SESSION)].flatMap((row) => session(row, docs)),
    ...models(page, rows, docs),
  ];
}

/**
 * `.sdlc/intents/b1-mcp-arm/` R5 — "CLI and MCP, one declaration".
 *
 * The section cites every landed reading of the MCP arm: a scheduled run's
 * `<date>-<sha>-weekly-ci.json` or an owner-dispatched run's `<date>-<sha>-dispatch-<run id>-ci.json`
 * (D-20261027-b1-mcp-arm-owner-dispatch) that carries the `burgee-mcp ÷ burgee` tokens ratio. Under
 * D-20261026-b1-mcp-arm-server-guard that record exists only when every MCP run connected and at
 * least 0.8 passed, so a file without it is no reading. This reads those files itself rather than
 * through the harness, so the harness cannot vouch for its own count.
 *
 *   - **every reading row** equals its file: the time it was measured, both ratios, and how many of
 *     the arm's mapped runs passed. A dispatched reading's run id is in its file name, and the row's
 *     run id must be that one;
 *   - **no reading is left out**, and the rows run in the order the readings were measured;
 *   - **the median and range** in the prose are recomputed from the rows (the midpoint of the middle
 *     two for an even count, as `armRecords` takes it), and the newest reading's own
 *     `mcp-tokens-total-ratio-readings-median`, once it has one, must say the same;
 *   - **every per-task row** is recomputed from every run of every cited reading, per arm;
 *   - **every task the arm does not run is named** in the section, which says why.
 */
const MCP_RATIO = 'burgee-mcp ÷ burgee';
const MCP_HEADING = '## CLI and MCP, one declaration';
const READING_FILE = /^\d{4}-\d{2}-\d{2}-[0-9a-f]{7}-(?:weekly|dispatch-(\d+))-ci\.json$/u;
const MCP_ROW = /^\| (\d+) \| `(\d{4}-\d{2}-\d{2}-[0-9a-f]{7}-(?:weekly|dispatch-\d+)-ci\.json)` \| (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) \| ([\d.]+) \| ([\d.]+) \| (\d+\/\d+) \|$/gmu;
const MCP_TASK_ROW = /^\| ([a-z-]+) \| (\d+) \((\d+) to (\d+)\) \| (\d+) \((\d+) to (\d+)\) \| (\d+) \((\d+) to (\d+)\) \| (\d+) \((\d+) to (\d+)\) \|$/gmu;
const MCP_SPREAD = /The\s+(tokens|turns)\s+ratio\s+over\s+these\s+(\d+)\s+readings\s+has\s+a\s+median\s+of\s+([\d.]+),\s+from\s+([\d.]+)\s+to\s+([\d.]+)\./gu;

/** Every landed reading of the MCP arm, by file name. */
export function mcpReadings(dir = RESULTS): Map<string, Doc> {
  const out = new Map<string, Doc>();
  for (const file of readdirSync(dir)) {
    if (!READING_FILE.test(file)) continue;
    const doc = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Doc;
    if (agent(doc, MCP_RATIO, 'mcp-tokens-total-ratio') !== undefined) out.set(file, doc);
  }
  return out;
}

/** The midpoint median `armRecords` takes, so an even count does not lean either way. */
function midpoint(xs: readonly number[]): number {
  const sorted = xs.toSorted((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  const mid = sorted.length % 2 === 1 ? sorted[half]! : (sorted[half - 1]! + sorted[half]!) / 2;
  return Math.round(mid * THOUSANDTHS) / THOUSANDTHS;
}

/** One build's runs of one task across the cited readings: `<task>.tokens` or `.turns`, measured runs only. */
function pooled(docs: readonly Doc[], build: string, task: string, what: 'tokens' | 'turns'): number[] {
  return docs.flatMap((doc) =>
    String(agent(doc, build, 'success-rate')?.detail?.[`${task}.${what}`] ?? '')
      .split(',')
      .filter((v) => /^\d+$/u.test(v))
      .map(Number),
  );
}

/** One reading row against its file: the run id a dispatched file names, the time, both ratios, the passes. */
function readingRow([, run, file, at, tokens, turns, passed]: Row, readings: Map<string, Doc>): string[] {
  const doc = readings.get(file!);
  if (doc === undefined) return [`${file!}: no landed reading of the MCP arm by that name`];
  const out: string[] = [];
  const dispatched = READING_FILE.exec(file!)?.[1];
  if (dispatched !== undefined && dispatched !== run) out.push(`${file!}: the page cites run ${run!}, and the file was landed by run ${dispatched}`);
  const mapped = agent(doc, 'burgee-mcp', 'mcp-mapped-tokens-per-task')?.detail;
  const want = { measured: minute(doc.measured), tokens: agent(doc, MCP_RATIO, 'mcp-tokens-total-ratio')?.median, turns: agent(doc, MCP_RATIO, 'mcp-turns-total-ratio')?.median, passed: `${String(mapped?.['passed'])}/${String(mapped?.['runs'])}` };
  const got = { measured: at!, tokens: Number(tokens), turns: Number(turns), passed: passed! };
  for (const key of Object.keys(want) as (keyof typeof want)[]) if (want[key] !== got[key]) out.push(`${file!}: the page says ${key} ${String(got[key])}, the reading says ${String(want[key])}`);
  return out;
}

/** "The tokens ratio over these N readings has a median of M, from A to B.", and turns, from the rows. */
function spreadProblems(section: string, rows: readonly Row[], readings: Map<string, Doc>): string[] {
  const spreads = new Map([...section.matchAll(MCP_SPREAD)].map((m) => [m[1]!, m] as const));
  const out = (
    [
      ['tokens', 4],
      ['turns', 5],
    ] as const
  ).flatMap(([what, column]) => {
    const said = spreads.get(what);
    if (said === undefined) return [`the MCP section no longer says "The ${what} ratio over these N readings has a median of M, from A to B."`];
    const values = rows.map((r) => Number(r[column]));
    const want = [values.length, midpoint(values), Math.min(...values), Math.max(...values)];
    const got = [Number(said[2]), Number(said[3]), Number(said[4]), Number(said[5])];
    return want.join() === got.join() ? [] : [`the page says the ${what} ratio over ${said[2]!} readings has median ${said[3]!}, from ${said[4]!} to ${said[5]!}; the rows say ${String(want[0])} readings, median ${String(want[1])}, from ${String(want[2])} to ${String(want[3])}`];
  });
  const newest = readings.get(rows.at(-1)?.[2] ?? '');
  const settled = newest === undefined ? undefined : agent(newest, MCP_RATIO, 'mcp-tokens-total-ratio-readings-median')?.median;
  const saidTokens = spreads.get('tokens')?.[3];
  if (settled !== undefined && saidTokens !== undefined && settled !== Number(saidTokens)) out.push(`the newest reading settles cli-vs-mcp-tokens at ${String(settled)}, and the page says ${saidTokens}`);
  return out;
}

/** Every per-task row, recomputed from every session of every cited reading; and a row for each mapped task. */
function taskProblems(section: string, cited: readonly Doc[]): string[] {
  const taskRows = [...section.matchAll(MCP_TASK_ROW)];
  const mappedTasks = new Set(cited.flatMap((doc) => String(agent(doc, 'burgee-mcp', 'mcp-mapped-tokens-per-task')?.detail?.['tasks'] ?? '').split(',').filter(Boolean)));
  const missing = [...mappedTasks].filter((task) => !taskRows.some((r) => r[1] === task)).map((task) => `the MCP section has no per-task row for ${task}`);
  const wrong = taskRows.flatMap(([, task, ...cells]) => {
    const columns = [pooled(cited, 'burgee', task!, 'tokens'), pooled(cited, 'burgee-mcp', task!, 'tokens'), pooled(cited, 'burgee', task!, 'turns'), pooled(cited, 'burgee-mcp', task!, 'turns')];
    const want = columns.flatMap((xs) => (xs.length === 0 ? [Number.NaN, Number.NaN, Number.NaN] : [median(xs), Math.min(...xs), Math.max(...xs)]));
    return want.join() === cells.map(Number).join() ? [] : [`${task!}: the page says ${cells.join(', ')}, the cited readings say ${want.join(', ')}`];
  });
  return [...missing, ...wrong];
}

/** Everything in the MCP section that disagrees with the landed readings. */
export function mcpProblems(page: string, readings: Map<string, Doc>, excluded: readonly string[]): string[] {
  const start = page.indexOf(MCP_HEADING);
  if (start === -1) return [`the page has no "${MCP_HEADING.slice(3)}" section (b1-mcp-arm R5)`];
  const next = page.indexOf('\n## ', start + MCP_HEADING.length);
  const section = page.slice(start, next === -1 ? undefined : next);
  const rows = [...section.matchAll(MCP_ROW)];
  if (rows.length === 0) return ['the MCP section has no reading table this lock can read'];
  const expected = [...readings.entries()].sort(([, a], [, b]) => a.measured.localeCompare(b.measured)).map(([file]) => file);
  const shown = rows.map((r) => r[2]!);
  const order = expected.join(' ') === shown.join(' ') ? [] : [`the MCP reading table is not every landed reading, in the order measured: expected ${expected.join(', ')}`];
  const cited = shown.flatMap((file) => (readings.has(file) ? [readings.get(file)!] : []));
  return [
    ...rows.flatMap((row) => readingRow(row, readings)),
    ...order,
    ...spreadProblems(section, rows, readings),
    ...taskProblems(section, cited),
    ...excluded.filter((task) => !section.includes(`\`${task}\``)).map((task) => `the MCP section does not name ${task}, which the arm does not run`),
  ];
}

/** The tasks whose file does not list `mcp` among its modalities: the ones the arm excludes by name. */
function cliOnlyTasks(): string[] {
  const dir = join(ROOT, 'benchmarks/tasks');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { id: string; modalities?: string[] })
    .filter((t) => !(t.modalities ?? []).includes('mcp'))
    .map((t) => t.id);
}

describe('What an agent sees', () => {
  const page = readFileSync(join(ROOT, PAGE), 'utf8');
  const docs = landed();

  it('says only what the landed B1 results say', () => {
    expect(problems(page, docs)).toEqual([]);
  });

  it('says only what the landed MCP readings say, and cites every one (b1-mcp-arm R5)', () => {
    expect(cliOnlyTasks().length).toBeGreaterThan(0);
    expect(mcpProblems(page, mcpReadings(), cliOnlyTasks())).toEqual([]);
  });

  it('is in the navigation', () => {
    const meta = JSON.parse(readFileSync(join(ROOT, 'apps/docs/content/docs/meta.json'), 'utf8')) as { pages: string[] };
    expect(meta.pages).toContain('what-an-agent-sees');
  });
});

describe('the lock can fail', () => {
  const page = readFileSync(join(ROOT, PAGE), 'utf8');
  const docs = landed();
  const firstRow = [...page.matchAll(RUN_ROW)][0]![0];

  it('catches a ratio that is not the run’s', () => {
    const [, sha] = /`([0-9a-f]{7})`/u.exec(firstRow)!;
    const tampered = page.replace(firstRow, firstRow.replace(/\| ([\d.]+) \| ([\d.]+) \|/u, '| 0.123 | $2 |'));
    expect(tampered).not.toBe(page);
    expect(problems(tampered, docs)).toContainEqual(expect.stringContaining(`${sha!}: the page says tokens 0.123`));
  });

  it('catches a run dropped from the middle of the table', () => {
    const rows = [...page.matchAll(RUN_ROW)];
    const missed = rows.find((r) => Number(r[3]) > bar('agent-tokens-40pct') && r !== rows[0] && r !== rows.at(-1));
    expect(missed, 'no missed run in the middle of the table to drop').toBeDefined();
    const tampered = page.replace(`${missed![0]}\n`, '');
    expect(problems(tampered, docs).join('\n')).toMatch(/not every landed B1 run/u);
  });

  it("catches a summed total that disagrees with the run's own total record", () => {
    const [, sha] = /`([0-9a-f]{7})`/u.exec(firstRow)!;
    const doc = docs.get(sha!)!;
    const forged: Doc = { ...doc, records: [...doc.records, { axis: 'agent', variant: RATIO, metric: 'tokens-total-ratio', median: 0.5 }] };
    expect(problems(page, new Map([...docs, [sha!, forged]])).join('\n')).toMatch(/disagrees with the run's own tokens-total-ratio 0\.5/u);
  });

  it('catches a count that does not match the rows', () => {
    const tampered = page.replace('The tokens claim held on 5', 'The tokens claim held on 12');
    expect(problems(tampered, docs).join('\n')).toMatch(/the table says/u);
  });

  it('catches a quoted session with a turn count the run never recorded', () => {
    const tampered = page.replace(/turns=(\d+) \*\/\}/u, 'turns=99 */}');
    expect(problems(tampered, docs).join('\n')).toMatch(/took 99 turns/u);
  });

  it('catches a per-task row that is not the run’s', () => {
    const tampered = page.replace(/\| 0\/5 \|$/mu, '| 5/5 |');
    expect(tampered).not.toBe(page);
    expect(problems(tampered, docs).join('\n')).toMatch(/commander passed 5\/5/u);
  });
});

/** A results file carrying the MCP ratio, or not. */
const readingDoc = (ratio?: number): string => JSON.stringify({ measured: '2026-10-27T00:00:00.000Z', records: ratio === undefined ? [] : [{ axis: 'agent', variant: MCP_RATIO, metric: 'mcp-tokens-total-ratio', median: ratio }] });

describe('the MCP lock can fail', () => {
  const page = readFileSync(join(ROOT, PAGE), 'utf8');
  const readings = mcpReadings();
  const excluded = cliOnlyTasks();
  const rows = [...page.matchAll(MCP_ROW)];

  it('catches a ratio that is not the reading’s', () => {
    const first = rows[0]![0];
    const tampered = page.replace(first, first.replace(/\| ([\d.]+) \| ([\d.]+) \| (\d+\/\d+) \|$/u, '| 0.123 | $2 | $3 |'));
    expect(tampered).not.toBe(page);
    expect(mcpProblems(tampered, readings, excluded).join('\n')).toMatch(/the page says tokens 0\.123/u);
  });

  it('catches a reading dropped from the table', () => {
    const tampered = page.replace(`${rows.at(-1)![0]}\n`, '');
    expect(mcpProblems(tampered, readings, excluded).join('\n')).toMatch(/not every landed reading/u);
  });

  it('catches a dispatched reading cited under another run id', () => {
    const dispatched = rows.find((r) => r[2]!.includes('-dispatch-'));
    expect(dispatched, 'no dispatched reading to mis-cite').toBeDefined();
    const tampered = page.replace(dispatched![0], dispatched![0].replace(/^\| \d+ \|/u, '| 1 |'));
    expect(mcpProblems(tampered, readings, excluded).join('\n')).toMatch(/the page cites run 1, and the file was landed by run/u);
  });

  it('catches a median or a range the rows do not give', () => {
    const tampered = page.replace(/The tokens ratio over these (\d+) readings has a median of [\d.]+/u, 'The tokens ratio over these $1 readings has a median of 0.5');
    expect(tampered).not.toBe(page);
    expect(mcpProblems(tampered, readings, excluded).join('\n')).toMatch(/the rows say/u);
  });

  it('catches a per-task row that is not the pooled runs', () => {
    const row = [...page.matchAll(MCP_TASK_ROW)][0]![0];
    const tampered = page.replace(row, row.replace(/^\| ([a-z-]+) \| \d+ /u, '| $1 | 1 '));
    expect(mcpProblems(tampered, readings, excluded).join('\n')).toMatch(/the cited readings say/u);
  });

  it('catches an excluded task the section does not name', () => {
    expect(mcpProblems(page, readings, [...excluded, 'not-a-task']).join('\n')).toMatch(/does not name not-a-task/u);
  });

  it('counts a weekly or dispatched file without the ratio as no reading, and a push file never', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-readings-'));
    try {
      writeFileSync(join(dir, '2026-10-20-a7d8fb7-weekly-ci.json'), readingDoc());
      writeFileSync(join(dir, '2026-10-27-1111111-dispatch-42-ci.json'), readingDoc(1));
      writeFileSync(join(dir, '2026-10-27-2222222-ci.json'), readingDoc(1));
      expect([...mcpReadings(dir).keys()]).toEqual(['2026-10-27-1111111-dispatch-42-ci.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
