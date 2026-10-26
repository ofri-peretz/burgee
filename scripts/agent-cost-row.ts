/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * agent-cost-row.ts — the public agent-cost claim, stated as a series (`cli-benchmarks` S4).
 *
 *   npx tsx scripts/agent-cost-row.ts                                # rewrite the rows over the window they already name
 *   npx tsx scripts/agent-cost-row.ts --from 2026-10-10 --to 2026-10-18   # rewrite them over a new window
 *   npx tsx scripts/agent-cost-row.ts --check                        # exit 1 when a row is not what its window computes
 *
 * One B1 run is not a verdict: two runs of the same commit have read 0.49 and 0.995. So the
 * README's agent rows, and the one in `comparison.mdx`, state the token and turn ratios as the
 * **median and range over a named window of CI readings**, and how many readings in it met the
 * bar. A CI reading is a `<date>-<sha>-ci.json` in `benchmarks/results/agent-cli-bench/` that
 * was measured on a CI runner and carries the ratio. The window is the dates in the file names,
 * inclusive. The rows are written here and never typed; `scripts/claim-table-lock.test.ts`
 * recomputes each from the window it names.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CLAIMS } from 'benchmarks/claims.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RESULTS = join(ROOT, 'benchmarks/results/agent-cli-bench');
export const README = join(ROOT, 'README.md');
export const COMPARISON = join(ROOT, 'apps/docs/content/docs/comparison.mdx');

/** The claims stated as a series: B1's two, which one run cannot settle. */
export const SERIES_CLAIMS = ['agent-tokens-40pct', 'agent-turns-30pct'] as const;
export type SeriesClaim = (typeof SERIES_CLAIMS)[number];

const CI_READING = /^(\d{4}-\d{2}-\d{2})-[0-9a-f]{7,40}-ci\.json$/;

interface Doc {
  machine?: { ci?: boolean };
  records: { axis: string; variant: string; metric: string; median: number }[];
}

export interface Window {
  from: string;
  to: string;
}

export interface Series {
  window: Window;
  claim: SeriesClaim;
  values: number[];
  median: number;
  min: number;
  max: number;
  /** Readings at or under the bar. */
  met: number;
  bar: number;
}

const claimOf = (id: SeriesClaim): (typeof CLAIMS)[number] => {
  const claim = CLAIMS.find((c) => c.id === id);
  if (claim?.test.max === undefined) throw new Error(`${id} is not a claim with a max in benchmarks/claims.ts`);
  return claim;
};

/** Three decimals, as every ratio on the page is printed. */
const THOUSANDTHS = 1000;
const round = (x: number): number => Math.round(x * THOUSANDTHS) / THOUSANDTHS;

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The claim's ratio in every CI reading dated inside the window, oldest first. */
export function series(id: SeriesClaim, window: Window, dir = RESULTS): Series {
  const claim = claimOf(id);
  const values: number[] = [];
  for (const file of readdirSync(dir).sort()) {
    const date = CI_READING.exec(file)?.[1];
    if (date === undefined || date < window.from || date > window.to) continue;
    const doc = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Doc;
    if (doc.machine?.ci !== true) continue;
    const record = doc.records.find((r) => r.axis === claim.from.axis && r.variant === claim.from.variant && r.metric === claim.from.metric);
    if (record !== undefined) values.push(record.median);
  }
  if (values.length === 0) throw new Error(`no CI reading of ${id} is dated ${window.from} to ${window.to}`);
  const bar = claim.test.max!;
  return { window, claim: id, values, median: round(median(values)), min: Math.min(...values), max: Math.max(...values), met: values.filter((v) => v <= bar).length, bar };
}

/** The Measured cell: median, window, range, and how many readings met the bar. */
export function measured(s: Series): string {
  return `median ${String(s.median)}× over the ${String(s.values.length)} CI readings dated ${s.window.from} to ${s.window.to} (range ${String(s.min)}–${String(s.max)}), at or under ${String(s.bar)} in ${String(s.met)} of them`;
}

/** Met when the median is inside the bar: the series' verdict, never one run's. */
export const verdict = (s: Series): string => (s.median <= s.bar ? '✅ met' : '❌ **not met**');

/** The window a cell names, or undefined when it names none — a row quoting one run. */
export function windowIn(cell: string): Window | undefined {
  const m = /CI readings dated (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(cell);
  return m === null ? undefined : { from: m[1]!, to: m[2]! };
}

/** Each series claim's table row: its head through the Gate cell, the Measured cell, and the verdict. */
const ROW_OF: Record<SeriesClaim, RegExp> = {
  'agent-tokens-40pct': /^(\| [^|]+ \| `agent-tokens-40pct` \| )([^|]+)( \| )[^|]*( \|)$/m,
  'agent-turns-30pct': /^(\| [^|]+ \| `agent-turns-30pct` \| )([^|]+)( \| )[^|]*( \|)$/m,
};

/** `text` with each series row's Measured and verdict cells rewritten over `window`, or over the window the row names. */
export function rewrite(text: string, window: Window | undefined): string {
  let out = text;
  for (const id of SERIES_CLAIMS) {
    out = out.replace(ROW_OF[id], (...match: string[]) => {
      const [, head, cell, sep, tail] = match as [string, string, string, string, string];
      const w = window ?? windowIn(cell);
      if (w === undefined) throw new Error(`the ${id} row names no window of CI readings — pass --from and --to`);
      const s = series(id, w);
      return `${head}${measured(s)}${sep}${verdict(s)}${tail}`;
    });
  }
  return out;
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

function main(): void {
  const from = arg('--from');
  const to = arg('--to');
  const window = from !== undefined && to !== undefined ? { from, to } : undefined;
  const stale: string[] = [];
  for (const file of [README, COMPARISON]) {
    const text = readFileSync(file, 'utf8');
    const want = rewrite(text, window);
    if (want === text) continue;
    if (process.argv.includes('--check')) stale.push(file);
    else writeFileSync(file, want);
  }
  for (const file of stale) process.stderr.write(`✖ ${file}: an agent-cost row is not what its window of CI readings computes — run \`npm run agent-cost:row\`\n`);
  if (stale.length > 0) process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
