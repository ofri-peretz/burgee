#!/usr/bin/env tsx
/**
 * `npm run bench` — every number this project claims in public, in one document.
 *
 *   npm run bench                      all four axes, write results, print the tables
 *   npm run bench -- --axis perf       one axis (repeatable)
 *   npm run bench -- --check           exit 1 when a measured number is outside its gate
 *   npm run bench -- --no-write        do not touch results/
 *   npm run bench -- --no-oracle       B3 reads results.json or skips; never runs the oracle
 *
 * Two documents come out, because the axes run on two cadences: `cli-benchmarks` (perf,
 * compat, weight — free, deterministic, gate every PR) and `agent-cli-bench` (B1 — costs
 * money, weekly). Both are written even when an axis inside them was skipped: a results
 * file recording that B1 could not run is the point, not a gap.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { method as agentMethod, run as runAgent } from './axes/agent.js';
import { method as compatMethod, run as runCompat } from './axes/compat.js';
import { method as perfMethod, run as runPerf } from './axes/perf.js';
import { method as reliabilityMethod, run as runReliability } from './axes/reliability.js';
import { method as weightMethod, run as runWeight } from './axes/weight.js';
import { SUITE, type SuiteName, suiteOf } from './bands.js';
import { type AxisState, type BandEntry, buildDocument, type ClaimEntry, type ResultsDoc } from './emit.js';
import { commit, machine } from './machine.js';
import { type AxisName, type BenchRecord, describeFailure, gateFailures } from './record.js';

const BENCH_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(BENCH_ROOT, '..');
const RESULTS_DIR = join(BENCH_ROOT, 'results');
const ALL_AXES: AxisName[] = ['perf', 'compat', 'weight', 'reliability', 'agent'];
const ISO_DATE = 10;

interface Args {
  axes: AxisName[];
  check: boolean;
  write: boolean;
  oracle: boolean;
  rounds?: number;
}

export function parseArgs(argv: readonly string[]): Args {
  const picked = argv.filter((a, i) => argv[i - 1] === '--axis') as AxisName[];
  for (const a of picked) if (!ALL_AXES.includes(a)) throw new Error(`unknown axis: ${a} (have ${ALL_AXES.join(', ')})`);
  const roundsAt = argv.indexOf('--rounds');
  return {
    axes: picked.length > 0 ? picked : ALL_AXES,
    check: argv.includes('--check'),
    write: !argv.includes('--no-write'),
    oracle: !argv.includes('--no-oracle'),
    ...(roundsAt === -1 ? {} : { rounds: Number(argv[roundsAt + 1]) }),
  };
}

type AxisOutcome = { records: BenchRecord[] } | { reason: string };

/** Each axis, behind one call shape: records, or the reason there are none. */
function runAxis(axis: AxisName, args: Args): AxisOutcome {
  switch (axis) {
    case 'perf':
      return { records: args.rounds === undefined ? runPerf() : runPerf(args.rounds) };
    case 'compat':
      return runCompat(args.oracle);
    case 'weight':
      return { records: runWeight() };
    case 'reliability':
      return runReliability();
    default:
      return runAgent();
  }
}

const METHOD = new Map<AxisName, string>([
  ['perf', perfMethod],
  ['compat', compatMethod],
  ['weight', weightMethod],
  ['reliability', reliabilityMethod],
  ['agent', agentMethod],
]);

function collect(args: Args): { axes: Map<AxisName, AxisState>; records: BenchRecord[] } {
  const axes = new Map<AxisName, AxisState>();
  const records: BenchRecord[] = [];
  for (const axis of ALL_AXES) {
    if (!args.axes.includes(axis)) {
      axes.set(axis, { status: 'not-run', reason: 'not selected by --axis' });
      continue;
    }
    console.warn(`\n▶ ${axis}`);
    const outcome = runAxis(axis, args);
    if ('reason' in outcome) {
      axes.set(axis, { status: 'skipped', reason: outcome.reason, method: METHOD.get(axis) ?? '' });
      console.warn(`⏭️ skipped: ${outcome.reason}`);
      continue;
    }
    axes.set(axis, { status: 'measured', method: METHOD.get(axis) ?? '' });
    records.push(...outcome.records);
    console.warn(`✓ ${String(outcome.records.length)} record(s)`);
  }
  return { axes, records };
}

const COL = { variant: 34, metric: 22, value: 12 } as const;

function renderGate(record: BenchRecord): string {
  if (record.gate === undefined) return '';
  return record.gate.max === undefined ? `  gate >= ${String(record.gate.min)}` : `  gate <= ${String(record.gate.max)}`;
}

function renderBand(id: string, band: BandEntry): string {
  if (band.value !== undefined) return `● band ${id}: ${String(band.value)}`;
  return `· band ${id}: ${band.status ?? '?'} — ${band.reason ?? ''}`;
}

function claimVerdict(claim: ClaimEntry): string {
  if (claim.met === undefined) return `? unmeasured — ${claim.reason ?? ''}`;
  const mark = claim.met ? '✓ met' : '✗ NOT met';
  return `${mark} ${String(claim.measured)} ${claim.unit ?? ''} against ${claim.target}`;
}

function renderClaim(id: string, claim: ClaimEntry): string {
  return `${id.padEnd(COL.variant)} ${claimVerdict(claim)}`;
}

function printTable(doc: ResultsDoc): void {
  console.warn(`\n📊 ${doc.suite}\n`);
  for (const r of doc.records) {
    console.warn(`${r.variant.padEnd(COL.variant)} ${r.metric.padEnd(COL.metric)} ${String(r.median).padStart(COL.value)} ${r.unit}${renderGate(r)}`);
  }
  for (const [id, band] of Object.entries(doc.bands)) console.warn(renderBand(id, band));
  if (Object.keys(doc.claims).length === 0) return;
  console.warn('');
  console.warn('published claims');
  console.warn('');
  for (const [id, claim] of Object.entries(doc.claims)) console.warn(renderClaim(id, claim));
}

function write(doc: ResultsDoc): string {
  const dir = join(RESULTS_DIR, doc.suite);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${doc.measured.slice(0, ISO_DATE)}.json`);
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  return relative(REPO_ROOT, file);
}

function documents(args: Args): ResultsDoc[] {
  const { axes, records } = collect(args);
  return [SUITE.cheap, SUITE.agent].map((suite: SuiteName) => {
    const mine = ALL_AXES.filter((a) => suiteOf(a) === suite);
    const subset = Object.fromEntries(mine.map((a) => [a, axes.get(a) as AxisState]));
    return buildDocument({ suite, commit: commit(REPO_ROOT), machine: machine(), axes: subset, records: records.filter((r) => mine.includes(r.axis)) });
  });
}

/**
 * The exit code `--check` produces. Separated from `main` so `ratchet.test.ts` can drive
 * it with a synthetic record one step outside its gate and prove the non-zero exit,
 * without spawning a thousand processes to get there.
 */
export function verdict(records: readonly BenchRecord[]): number {
  const failures = gateFailures(records);
  for (const f of failures) console.error(`\n✖ ${describeFailure(f)}`);
  console.warn(`\n${String(failures.length)} gate failure(s).\n`);
  return failures.length > 0 ? 1 : 0;
}

export function main(argv: readonly string[]): number {
  const args = parseArgs(argv);
  const docs = documents(args);
  for (const doc of docs) {
    printTable(doc);
    if (args.write) console.warn(`\n→ ${write(doc)}`);
  }
  return args.check ? verdict(docs.flatMap((d) => d.records)) : 0;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exitCode = main(process.argv.slice(2));
}
