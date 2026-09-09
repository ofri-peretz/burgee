#!/usr/bin/env tsx
/**
 * `npm run bench` — the benchmark runner (`cli-benchmarks` B6).
 *
 * One axis today: `agent-reliability`, the half of B1 that needs no model. B2 (cold start),
 * B3 (compat, read from the oracle) and B4 (bundled weight) are designed and unbuilt; each
 * lands here as another entry in `AXES` and needs no change to this file or to the band
 * collector, which is R5.
 *
 * Usage:
 *   npx tsx benchmarks/bench.ts                 # every axis, print the table
 *   npx tsx benchmarks/bench.ts --axis <name>   # one axis
 *   npx tsx benchmarks/bench.ts --record        # also write results/<axis>/<date>.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { run as agentReliability, type VariantResult } from './axes/agent-reliability.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RESULTS = join(ROOT, 'benchmarks/results');

const AXES: Record<string, () => { axis: string; measured: string; variants: VariantResult[]; median: Record<string, number> }> = {
  'agent-reliability': agentReliability,
};

const args = process.argv.slice(2);
const record = args.includes('--record');
const only = args[args.indexOf('--axis') + 1];
const wanted = args.includes('--axis') && only !== undefined ? [only] : Object.keys(AXES);

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

let failed = false;
for (const name of wanted) {
  const axis = AXES[name];
  if (!axis) {
    process.stderr.write(`unknown axis: ${name}\n`);
    failed = true;
    continue;
  }
  const result = axis();
  process.stdout.write(`\n${result.axis} — ${result.measured}\n\n`);
  process.stdout.write(`  ${'variant'.padEnd(16)}${'hangs/100'.padStart(10)}${'exit code'.padStart(11)}${'--json'.padStart(9)}${'bytes'.padStart(8)}\n`);
  for (const v of result.variants) {
    process.stdout.write(`  ${v.variant.padEnd(16)}${String(v.hangsPer100).padStart(10)}${pct(v.exitCodeAccuracy).padStart(11)}${pct(v.structuredOutputRate).padStart(9)}${String(v.medianBytes).padStart(8)}\n`);
  }

  if (record) {
    const dir = join(RESULTS, result.axis);
    mkdirSync(dir, { recursive: true });
    const at = join(dir, `${result.measured}.json`);
    writeFileSync(at, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`\n  recorded ${at.slice(ROOT.length + 1)}\n`);
  }
}

process.exit(failed ? 1 : 0);
