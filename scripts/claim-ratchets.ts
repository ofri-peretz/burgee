/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `npm run ratchets:propose` — how far each claim ratchet can come down today.
 *
 * D-157 made three published claims downward-only ratchets, and the owner's instruction had two
 * halves: a ceiling just above the measurement, *and* "consistently keep them as low as we can".
 * `claim-ratchets-lock.test.ts` enforces the first half; nothing can enforce the second, because
 * a ceiling left above a shrunken measurement fails no check. So this prints it: for each ratchet,
 * the ceiling its own `derive` rule gives from the latest measurement, and whether that is lower.
 *
 *   - **bundle** rows are deterministic: bundle the current build (the same `bundledRecords` as
 *     `npm run readme:gates`), add `headroomBytes` to our side for CI reading ~32 B heavier than a
 *     local build, and round the ratio up to `step`.
 *   - **ci** rows are noisy: the last `observations` CI runs in
 *     `benchmarks/results/cli-benchmarks/*-ci.json`, the larger of mean + `sigmas` sd and the
 *     window's max, rounded up to `step`.
 *
 * It writes nothing. Lowering is one appended step in `.sdlc/bands/claim-ratchets.json` (its
 * ceiling, date, D-row and measurement) plus `npm run readme:gates`; the lock checks the rest.
 *
 * B5's runtime ratchets (`.sdlc/bands/runtime-ratchets.json`) are printed after them: the largest
 * `runtime-ratio` median of the last `observations` CI runs, times `headroom`, rounded up to `step`.
 *
 *   npm run ratchets:propose            # bundle rows need a build: `npx turbo run build`
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAIRS as RUNTIME_PAIRS } from 'benchmarks/axes/runtime.js';
import { bundledRecords } from 'benchmarks/axes/weight.js';
import { ceilToStep, type Ratchet, readRatchets } from 'benchmarks/claim-ratchets.js';
import { CLAIMS } from 'benchmarks/claims.js';
import { PAIRS } from 'benchmarks/fixtures/entry-points.js';
import { readRuntimeRatchets, type RuntimeRatchet } from 'benchmarks/runtime-ratchets.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CI_RESULTS = join(ROOT, 'benchmarks/results/cli-benchmarks');
/** How every ratio in this report is written: the results documents' own precision. */
const RATIO_PLACES = 3;
const f = (x: number): string => x.toFixed(RATIO_PLACES);

export interface Proposal {
  id: string;
  ceiling: number;
  measured: number;
  proposed: number;
  basis: string;
}

interface Doc {
  measured: string;
  commit?: string;
  records: { variant: string; metric: string; median: number }[];
}

/** The last `n` CI observations of one record, oldest first, by each document's own timestamp. */
export function ciSeries(variant: string, metric: string, n: number, dir: string = CI_RESULTS): { file: string; value: number }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('-ci.json'))
    .map((file) => ({ file, doc: JSON.parse(readFileSync(join(dir, file), 'utf8')) as Doc }))
    .toSorted((a, b) => Date.parse(a.doc.measured) - Date.parse(b.doc.measured))
    .flatMap(({ file, doc }) => {
      const r = doc.records.find((x) => x.variant === variant && x.metric === metric);
      return r === undefined ? [] : [{ file, value: r.median }];
    })
    .slice(-n);
}

/** mean + k·sd (sample sd) or the max, whichever is larger, rounded up to `step`. */
export function ciCeiling(values: readonly number[], sigmas: number, step: number): { proposed: number; mean: number; sd: number; max: number } {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const max = Math.max(...values);
  return { proposed: ceilToStep(Math.max(mean + sigmas * sd, max), step), mean, sd, max };
}

/** (ours + headroom) / theirs, rounded up to `step`. */
export const bundleCeiling = (ours: number, theirs: number, headroomBytes: number, step: number): number => ceilToStep((ours + headroomBytes) / theirs, step);

function propose(id: string, ratchet: Ratchet): Proposal {
  const spec = CLAIMS.find((c) => c.id === id);
  if (spec === undefined) throw new Error(`${id} is ratcheted but benchmarks/claims.ts declares no such claim`);
  const { derive } = ratchet;
  if (derive.source === 'ci') {
    const series = ciSeries(spec.from.variant, spec.from.metric, derive.observations);
    if (series.length === 0) throw new Error(`no CI observation measures ${spec.from.variant} ${spec.from.metric}`);
    const { proposed, mean, sd, max } = ciCeiling(
      series.map((s) => s.value),
      derive.sigmas,
      derive.step,
    );
    return {
      id,
      ceiling: ratchet.ceiling,
      measured: series.at(-1)?.value ?? Number.NaN,
      proposed,
      basis: `last ${String(series.length)} CI runs (${series[0]?.file ?? ''} .. ${series.at(-1)?.file ?? ''}): mean ${f(mean)}, sd ${f(sd)}, max ${f(max)}; max(mean + ${String(derive.sigmas)} sd, max) up to ${String(derive.step)}`,
    };
  }
  const pair = PAIRS.find((p) => (p.claim ?? `lighter-than-${p.incumbent.specifier}`) === id);
  if (pair === undefined) throw new Error(`${id} names no B4 pair in benchmarks/fixtures/entry-points.ts`);
  const records = bundledRecords([pair.id]);
  const bytes = (variant: string): number => {
    const r = records.find((x) => x.variant === variant && x.metric === 'bundled-bytes');
    if (r === undefined) throw new Error(`the bundle produced no ${variant} bundled-bytes record`);
    return r.median;
  };
  const ours = bytes(pair.id);
  const theirs = bytes(pair.incumbent.specifier);
  return {
    id,
    ceiling: ratchet.ceiling,
    measured: Number(f(ours / theirs)),
    proposed: bundleCeiling(ours, theirs, derive.headroomBytes, derive.step),
    basis: `this build: ${ours.toLocaleString('en-US')} / ${theirs.toLocaleString('en-US')} B; (+${String(derive.headroomBytes)} B for CI) up to ${String(derive.step)}`,
  };
}

/** A B5 pair's ceiling from the CI series on main, or `undefined` before any CI run measured it. */
export function proposeRuntime(id: string, ratchet: RuntimeRatchet, dir: string = CI_RESULTS): Proposal | undefined {
  const pair = RUNTIME_PAIRS.find((p) => p.id === id);
  if (pair === undefined) throw new Error(`${id} is ratcheted but benchmarks/axes/runtime.ts measures no such pair`);
  const { observations, headroom, step } = ratchet.derive;
  const series = ciSeries(`${pair.id} ÷ ${pair.host}`, 'runtime-ratio', observations, dir);
  if (series.length === 0) return undefined;
  const worst = Math.max(...series.map((s) => s.value));
  return {
    id,
    ceiling: ratchet.ceiling,
    measured: series.at(-1)?.value ?? Number.NaN,
    proposed: ceilToStep(worst * headroom, step),
    basis: `last ${String(series.length)} CI runs (${series[0]?.file ?? ''} .. ${series.at(-1)?.file ?? ''}): max ${f(worst)} × ${String(headroom)} up to ${String(step)}; target ${String(ratchet.target)}`,
  };
}

function verdict(p: Proposal): string {
  if (p.measured > p.ceiling) return `OVER — measured ${String(p.measured)} is above the ceiling ${String(p.ceiling)}; the gate is red`;
  if (p.proposed < p.ceiling) return `LOWER to ${String(p.proposed)} — append a step to .sdlc/bands/claim-ratchets.json, then \`npm run readme:gates\``;
  if (p.proposed > p.ceiling) return `holds at ${String(p.ceiling)}, with less room than the rule wants (it derives ${String(p.proposed)}) — not a reason to raise it`;
  return `at its floor: the rule derives ${String(p.ceiling)}, the ceiling it has`;
}

if (process.argv[1]?.endsWith('claim-ratchets.ts') === true) {
  const { ratchets } = readRatchets(ROOT);
  for (const [id, ratchet] of Object.entries(ratchets)) {
    const p = propose(id, ratchet);
    process.stdout.write(`${id}\n  ceiling ${String(p.ceiling)}  measured ${String(p.measured)}  proposed ${String(p.proposed)}\n  ${p.basis}\n  ${verdict(p)}\n\n`);
  }
  process.stdout.write('B5 runtime ratchets (.sdlc/bands/runtime-ratchets.json)\n\n');
  for (const [id, ratchet] of Object.entries(readRuntimeRatchets(ROOT).ratchets)) {
    const p = proposeRuntime(id, ratchet);
    if (p === undefined) {
      process.stdout.write(`${id}\n  ceiling ${String(ratchet.ceiling)}  no CI observation on main measures it yet\n\n`);
      continue;
    }
    process.stdout.write(`${id}\n  ceiling ${String(p.ceiling)}  measured ${String(p.measured)}  proposed ${String(p.proposed)}\n  ${p.basis}\n  ${verdict(p).replace('claim-ratchets.json, then `npm run readme:gates`', 'runtime-ratchets.json')}\n\n`);
  }
}
