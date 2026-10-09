/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every number on "What an agent sees" is in a landed B1 result, and no run is left out.
 *
 * `.sdlc/intents/positioning/` R3. The page quotes recorded B1 sessions and tabulates the runs
 * they came from. B1 lands a result on every push to `main`, so a sentence about "the newest
 * run" is false within the hour. The page names each run by commit, and this lock reads that
 * run's committed `benchmarks/results/agent-cli-bench/<date>-<sha>-ci.json`:
 *
 *   - **every run row** — tokens ratio, turns ratio, each build's median turns, the time it was
 *     measured — equals that run's records;
 *   - **no run is left out.** Every landed run that measured B1 between the table's first row and
 *     its last is a row, in order. A table that dropped the runs where the claim missed would read
 *     better and be false, so it fails here;
 *   - **the count in the prose** ("held on N of these M runs") is recomputed from the rows against
 *     the claim's own bar in `benchmarks/claims.ts`;
 *   - **every per-task row** equals that run's `<task>.turns` and `<task>.passed`;
 *   - **every quoted session** (`{/* session <sha> <build> <task> turns=<n> *\/}`) took a number
 *     of turns that run actually recorded for that build and task;
 *   - the model named on the page is the model the cited runs recorded, and the page is in the
 *     navigation.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLAIMS } from 'benchmarks/claims.js';
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

/** The tokens claim's bar: `agent-tokens-40pct`'s `max`, read from the claim rather than restated. */
function tokensBar(): number {
  const max = CLAIMS.find((c) => c.id === 'agent-tokens-40pct')?.test.max;
  if (max === undefined) throw new Error('benchmarks/claims.ts no longer declares agent-tokens-40pct with a max — update this lock with it');
  return max;
}

const RUN_ROW = /^\| `([0-9a-f]{7})` \| (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) \| ([\d.]+) \| ([\d.]+) \| (\d+) \| (\d+) \|$/gmu;
const TASK_ROW = /^\| `([0-9a-f]{7})` \| ([a-z-]+) \| ([\d, ]+) \| (\d+\/\d+) \| ([\d, ]+) \| (\d+\/\d+) \|$/gmu;
const SESSION = /\{\/\* session ([0-9a-f]{7}) (burgee|commander) ([a-z-]+) turns=(\d+) \*\/\}/gu;
const COUNT = /held on (\d+) of these (\d+) runs/u;

const minute = (measured: string): string => measured.slice(0, 16).replace('T', ' ');
const list = (cell: string): string => cell.replaceAll(/\s+/gu, '');

type Row = RegExpMatchArray;

/** One run row against its result: the time, both ratios, both builds' median turns. */
function runRow([, sha, at, tokens, turns, burgee, commander]: Row, docs: Map<string, Doc>): string[] {
  const doc = docs.get(sha!);
  if (doc === undefined) return [`${sha!}: no landed result for this run`];
  const want = {
    measured: minute(doc.measured),
    tokens: agent(doc, RATIO, 'tokens-per-task-ratio')?.median,
    turns: agent(doc, RATIO, 'turns-per-task-ratio')?.median,
    burgee: agent(doc, 'burgee', 'turns-per-task')?.median,
    commander: agent(doc, 'commander', 'turns-per-task')?.median,
  };
  const got = { measured: at, tokens: Number(tokens), turns: Number(turns), burgee: Number(burgee), commander: Number(commander) };
  return (Object.keys(want) as (keyof typeof want)[]).filter((key) => want[key] !== got[key]).map((key) => `${sha!}: the page says ${key} ${String(got[key])}, the result says ${String(want[key])}`);
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

/** "held on N of these M runs", recomputed from the rows against the claim's bar. */
function counted(page: string, rows: readonly Row[], bar: number): string[] {
  const count = COUNT.exec(page);
  if (count === null) return ['the page no longer says "held on N of these M runs" — say how many runs met the claim'];
  const met = rows.filter((r) => Number(r[3]) <= bar).length;
  return Number(count[1]) === met && Number(count[2]) === rows.length ? [] : [`the page says the claim held on ${count[1]!} of ${count[2]!} runs; the table says ${String(met)} of ${String(rows.length)}`];
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
export function problems(page: string, docs: Map<string, Doc>, bar = tokensBar()): string[] {
  const rows = [...page.matchAll(RUN_ROW)];
  if (rows.length === 0) return ['the page has no run table this lock can read — the reader is broken, or the table changed shape'];
  return [
    ...rows.flatMap((row) => runRow(row, docs)),
    ...complete(rows, docs),
    ...counted(page, rows, bar),
    ...[...page.matchAll(TASK_ROW)].flatMap((row) => taskRow(row, docs)),
    ...[...page.matchAll(SESSION)].flatMap((row) => session(row, docs)),
    ...models(page, rows, docs),
  ];
}

describe('What an agent sees', () => {
  const page = readFileSync(join(ROOT, PAGE), 'utf8');
  const docs = landed();

  it('says only what the landed B1 results say', () => {
    expect(problems(page, docs)).toEqual([]);
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
    const missed = rows.find((r) => Number(r[3]) > tokensBar() && r !== rows[0] && r !== rows.at(-1));
    expect(missed, 'no missed run in the middle of the table to drop').toBeDefined();
    const tampered = page.replace(`${missed![0]}\n`, '');
    expect(problems(tampered, docs).join('\n')).toMatch(/not every landed B1 run/u);
  });

  it('catches a count that does not match the rows', () => {
    const tampered = page.replace(COUNT, 'held on 12 of these 12 runs');
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
