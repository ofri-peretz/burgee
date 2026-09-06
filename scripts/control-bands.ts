/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Stage 6 (Maintain) — the deterministic control-band watcher.
 *
 * Ported from ofri-peretz/eslint/scripts/control-bands.ts (intent
 * `sdlc-locks-evals-bands`). Reads a metric's recent history, computes a mean and
 * standard deviation over a rolling window, applies Western Electric rules, and
 * reports breaches by tier. **No model runs in the detection path.**
 *
 *   Rule 1  one point beyond 3σ                    → tier 3σ, act
 *   Rule 2  2 of 3 consecutive beyond 2σ, one side → tier 2σ, diagnose
 *   Rule 3  4 of 5 consecutive beyond 1σ, one side → tier 1σ, log
 *   Rule 4  8 consecutive on one side of the mean  → tier 1σ, log (drift)
 *
 * Collectors this repo has:
 *   benchmark-json       dated result files under benchmarks/results/<suite>/
 *   command-duration     wall-clock of a command, in ms (e.g. `npm test`)
 *   eslint-config-stats  rules on at error, and documented false positives, from
 *                        eslint.config.mjs
 *
 * Usage:
 *   tsx scripts/control-bands.ts                 # report
 *   tsx scripts/control-bands.ts --check         # exit 1 on a 2σ+ breach
 *   tsx scripts/control-bands.ts --write-intent  # draft docs/intents/<slug>/intent.md per breach
 *   tsx scripts/control-bands.ts --record        # append today's observations to the series
 *   tsx scripts/control-bands.ts --backfill-git  # also recover pruned benchmark runs from git
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(REPO_ROOT, '.agent/control-bands.json');
const SERIES = path.join(REPO_ROOT, '.agent/control-bands.history.json');
const INTENT_DIR = path.join(REPO_ROOT, 'docs/intents');

export type Tier = '1σ' | '2σ' | '3σ';

export interface Observation {
  date: string;
  value: number;
}

export interface BandConfig {
  /** Stable identifier, also the intent slug prefix. */
  id: string;
  /** What the number means, in a sentence a stranger can act on. */
  description: string;
  /** How the observation is produced. */
  collector: 'benchmark-json' | 'command-duration' | 'eslint-config-stats' | 'manual';
  /** Rolling window length. Western Electric assumes a stable baseline. */
  window: number;
  /** Which direction is bad. `lower` = a drop is a breach; `both` = either. */
  worse: 'lower' | 'higher' | 'both';
  /** Minimum points before any band is computed. Below this we report, never gate. */
  minPoints?: number;
  /** benchmark-json: suite directory and the dotted path to the number. */
  suite?: string;
  jsonPath?: string;
  /** command-duration: the command to time. */
  command?: string[];
  /** eslint-config-stats: which statistic. */
  stat?: 'rulesOn' | 'documentedFalsePositives';
}

export interface Breach {
  id: string;
  tier: Tier;
  rule: string;
  latest: number;
  mean: number;
  sigma: number;
  window: number;
  direction: 'above' | 'below';
}

// ---------------------------------------------------------------------------
// Statistics. Pure, so `scripts/__tests__/control-bands.test.ts` can pin them.
// ---------------------------------------------------------------------------

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Population standard deviation. The window IS the reference period, not a sample
 * drawn from a larger one; the n-1 correction would widen the bands enough to
 * swallow exactly the small drift this exists to see.
 */
export function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

const SIGMA_ACT = 3;
const SIGMA_DIAGNOSE = 2;
const SIGMA_LOG = 1;
const RULE2_WINDOW = 3;
const RULE2_HITS = 2;
const RULE3_WINDOW = 5;
const RULE3_HITS = 4;
const RULE4_RUN = 8;
const MIN_POINTS_TO_DETECT = 3;
const DEFAULT_MIN_POINTS = 8;

type Direction = 'above' | 'below';
type Hit = { tier: Tier; rule: string; direction: Direction };
type IsBad = (d: Direction) => boolean;

const SIDES: readonly { sign: 1 | -1; direction: Direction }[] = [
  { sign: 1, direction: 'above' },
  { sign: -1, direction: 'below' },
];

/** Rule 1 — one point beyond 3σ. */
function rule1(z: number[], bad: IsBad): Hit | null {
  const last = z.at(-1)!;
  const direction: Direction = last > 0 ? 'above' : 'below';
  return Math.abs(last) > SIGMA_ACT && bad(direction) ? { tier: '3σ', rule: 'one point beyond 3σ', direction } : null;
}

interface RunRule {
  window: number;
  hits: number;
  sigma: number;
  tier: Tier;
  rule: string;
}

/** Rule 2 — 2 of the last 3 beyond 2σ, one side. */
const RULE2: RunRule = { window: RULE2_WINDOW, hits: RULE2_HITS, sigma: SIGMA_DIAGNOSE, tier: '2σ', rule: '2 of 3 beyond 2σ' };
/** Rule 3 — 4 of the last 5 beyond 1σ, one side. */
const RULE3: RunRule = { window: RULE3_WINDOW, hits: RULE3_HITS, sigma: SIGMA_LOG, tier: '1σ', rule: '4 of 5 beyond 1σ' };

/** Rules 2 and 3 share a shape: `hits` of the last `window` beyond `sigma`, one side. */
function runRule(z: number[], bad: IsBad, { window, hits, sigma, tier, rule }: RunRule): Hit | null {
  const tail = z.slice(-window);
  if (tail.length < window) return null;
  for (const { sign, direction } of SIDES) {
    if (tail.filter((v) => v * sign > sigma).length >= hits && bad(direction)) return { tier, rule, direction };
  }
  return null;
}

/** Rule 4 — a run on one side of the mean: drift with no unusual point. */
function rule4(z: number[], bad: IsBad): Hit | null {
  const tail = z.slice(-RULE4_RUN);
  if (tail.length < RULE4_RUN) return null;
  for (const { sign, direction } of SIDES) {
    if (tail.every((v) => v * sign > 0) && bad(direction)) {
      return { tier: '1σ', rule: '8 consecutive on one side of the mean', direction };
    }
  }
  return null;
}

/**
 * Western Electric rules over a window, evaluated at its most recent point.
 * Returns the highest-severity rule that fires, or null.
 */
export function detect(values: number[], worse: BandConfig['worse']): Hit | null {
  if (values.length < MIN_POINTS_TO_DETECT) return null;
  const m = mean(values);
  const s = stdev(values);
  // A flat series has σ=0. Nothing has moved, so nothing has drifted.
  if (s === 0) return null;
  const z = values.map((v) => (v - m) / s);
  const bad: IsBad = (d) => worse === 'both' || (worse === 'lower' ? d === 'below' : d === 'above');
  return (
    rule1(z, bad) ??
    runRule(z, bad, RULE2) ??
    runRule(z, bad, RULE3) ??
    rule4(z, bad)
  );
}

export function evaluate(cfg: BandConfig, series: Observation[]): Breach | null {
  const minPoints = cfg.minPoints ?? DEFAULT_MIN_POINTS;
  const window = series.slice(-cfg.window);
  if (window.length < minPoints) return null;
  const values = window.map((o) => o.value);
  const hit = detect(values, cfg.worse);
  if (!hit) return null;
  return {
    id: cfg.id,
    tier: hit.tier,
    rule: hit.rule,
    latest: values.at(-1)!,
    mean: mean(values),
    sigma: stdev(values),
    window: window.length,
    direction: hit.direction,
  };
}

// ---------------------------------------------------------------------------
// Collectors — turn repo state into observations.
// ---------------------------------------------------------------------------

function pick(obj: unknown, dotted: string): number | null {
  let cur: unknown = obj;
  for (const key of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object') return null;
    cur = Reflect.get(cur, key);
  }
  return typeof cur === 'number' ? cur : null;
}

const DATED_JSON = /^\d{4}-\d{2}-\d{2}\.json$/;

/** Every dated result file in a benchmark suite, and the metric read out of each. */
function collectBenchmark(cfg: BandConfig): Observation[] {
  if (!cfg.jsonPath) return [];
  const dir = path.join(REPO_ROOT, 'benchmarks/results', cfg.suite ?? '');
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => DATED_JSON.test(f)).sort();
  } catch {
    return [];
  }
  const out: Observation[] = [];
  for (const file of files) {
    let value: number | null;
    try {
      value = pick(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')), cfg.jsonPath);
    } catch {
      continue; // a malformed historical run is not a reason to lose the rest
    }
    if (value !== null) out.push({ date: file.replace('.json', ''), value });
  }
  return out;
}

/** 32 MiB — a long `git log --all` in a busy repo. */
const GIT_BUFFER = 33554432;

/** Every dated result file that has EVER existed for a suite, read out of git. */
function collectFromGit(cfg: BandConfig): Observation[] {
  if (!cfg.suite || !cfg.jsonPath) return [];
  const glob = `benchmarks/results/${cfg.suite}/????-??-??.json`;
  let paths: string[];
  try {
    paths = execFileSync('git', ['log', '--all', '--diff-filter=A', '--name-only', '--format=', '--', glob], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: GIT_BUFFER,
    })
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('.json'));
  } catch {
    return [];
  }
  const out: Observation[] = [];
  for (const rel of new Set(paths)) {
    try {
      const revs = execFileSync('git', ['rev-list', '--all', '--', rel], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: GIT_BUFFER })
        .trim()
        .split('\n')
        .filter(Boolean);
      if (revs.length === 0) continue;
      const blob = execFileSync('git', ['show', `${revs.at(-1)}:${rel}`], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: GIT_BUFFER });
      const value = pick(JSON.parse(blob), cfg.jsonPath);
      if (value !== null) out.push({ date: path.basename(rel).replace('.json', ''), value });
    } catch {
      continue; // a historical run in a different shape is not a reason to lose the rest
    }
  }
  return out;
}

/** 15 minutes — `npm test` on a cold cache is well under this. */
const COMMAND_TIMEOUT_MS = 900000;

function today(): string {
  return new Date().toISOString().slice(0, 'YYYY-MM-DD'.length);
}

/** Wall-clock of one command, in ms. One observation per day. */
function collectCommandDuration(cfg: BandConfig): Observation[] {
  if (!cfg.command || cfg.command.length === 0) return [];
  const [bin, ...args] = cfg.command;
  const t0 = performance.now();
  const r = spawnSync(bin!, args, { cwd: REPO_ROOT, stdio: 'ignore', timeout: COMMAND_TIMEOUT_MS });
  if (r.status !== 0) return [];
  return [{ date: today(), value: Math.round(performance.now() - t0) }];
}

/**
 * Two numbers read from eslint.config.mjs: rules on (imported, exact) and documented
 * false positives (the `'off'` entries under the "Documented false positives" header,
 * counted from source because that intent lives in comments by design).
 */
export async function eslintConfigStats(root = REPO_ROOT): Promise<{ rulesOn: number; documentedFalsePositives: number }> {
  const file = path.join(root, 'eslint.config.mjs');
  const mod = (await import(pathToFileURL(file).href)) as { default: { rules?: Record<string, unknown> }[] };
  let rulesOn = 0;
  for (const block of mod.default) {
    for (const value of Object.values(block.rules ?? {})) {
      const sev = Array.isArray(value) ? value[0] : value;
      if (sev !== 'off' && sev !== 0) rulesOn++;
    }
  }
  const src = fs.readFileSync(file, 'utf-8');
  const marker = src.indexOf('Documented false positives');
  const documentedFalsePositives = marker === -1 ? 0 : (src.slice(marker).match(/: 'off'/g) ?? []).length;
  return { rulesOn, documentedFalsePositives };
}

async function collectEslintStats(cfg: BandConfig): Promise<Observation[]> {
  if (!cfg.stat) return [];
  const stats = await eslintConfigStats();
  return [{ date: today(), value: stats[cfg.stat] }];
}

// ---------------------------------------------------------------------------
// Series store — committed so bands survive a fresh clone.
// ---------------------------------------------------------------------------

type SeriesFile = Record<string, Observation[]>;

function loadSeries(): SeriesFile {
  try {
    return JSON.parse(fs.readFileSync(SERIES, 'utf-8')) as SeriesFile;
  } catch {
    return {};
  }
}

function loadConfig(): BandConfig[] {
  return (JSON.parse(fs.readFileSync(CONFIG, 'utf-8')) as { bands: BandConfig[] }).bands;
}

async function collect(cfg: BandConfig, fromGit: boolean): Promise<Observation[]> {
  switch (cfg.collector) {
    case 'benchmark-json':
      return [...collectBenchmark(cfg), ...(fromGit ? collectFromGit(cfg) : [])];
    case 'command-duration':
      return collectCommandDuration(cfg);
    case 'eslint-config-stats':
      return await collectEslintStats(cfg);
    default:
      return [];
  }
}

/** Append observations per band, de-duplicated by date. Idempotent. */
async function record(fromGit: boolean): Promise<void> {
  const series = loadSeries();
  for (const cfg of loadConfig()) {
    // Sequential on purpose: command-duration times `npm test`, which must run alone.
    // eslint-disable-next-line reliability/no-await-in-loop
    const collected = await collect(cfg, fromGit);
    if (collected.length === 0) {
      console.warn(`  ⚠️ ${cfg.id}: collector produced nothing`);
      continue;
    }
    const existing = series[cfg.id] ?? [];
    series[cfg.id] = existing;
    const known = new Set(existing.map((o) => o.date));
    let added = 0;
    for (const obs of collected) {
      if (known.has(obs.date)) continue;
      existing.push(obs);
      added++;
    }
    existing.sort((a, b) => a.date.localeCompare(b.date));
    console.warn(`  + ${cfg.id}: ${added} new, ${existing.length} total`);
  }
  fs.mkdirSync(path.dirname(SERIES), { recursive: true });
  fs.writeFileSync(SERIES, `${JSON.stringify(series, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Write-back — a breach becomes a Stage 1 artifact, not a ticket.
// ---------------------------------------------------------------------------

const DECIMALS = 4;

export function renderIntent(breach: Breach, cfg: BandConfig, series: Observation[]): string {
  // The observation date, not wall-clock: re-running the watcher cannot change what it says.
  const opened = series.at(-1)?.date ?? 'unknown';
  const recent = series
    .slice(-cfg.window)
    .map((o) => `| ${o.date} | ${o.value} |`)
    .join('\n');

  return `# Intent — ${cfg.description} breached its control band

> Stage 1 artifact, written automatically by \`scripts/control-bands.ts\`. Stage 6
> detected this; a human decides what it means.

**Status:** draft · **Opened:** ${opened} · **Owner:** control-bands watcher

---

## Why now

\`${breach.id}\` tripped the **${breach.rule}** rule and is sitting **${breach.direction}**
its control band.

| | |
| :--- | :--- |
| Latest | ${breach.latest} |
| Window mean | ${breach.mean.toFixed(DECIMALS)} |
| σ | ${breach.sigma.toFixed(DECIMALS)} |
| Window | ${breach.window} points |
| Tier | ${breach.tier} |

${cfg.description}

Observations in the window:

| Date | Value |
| :--- | ---: |
${recent}

## What is wanted

The metric is back inside its band, and the cause is understood well enough that a
check would have caught it — or the band is wrong and this file says why, in which
case \`.agent/control-bands.json\` changes and this intent records the reasoning.

## Affected users and systems

Whatever \`${breach.id}\` measures. Start from its entry in \`.agent/control-bands.json\`
and the \`sdlc-locks-evals-bands\` design.

## Constraints

Do not widen the band to make this go away. A band widened to fit an excursion
measures nothing afterwards. If the band is genuinely wrong, say so here and change
it deliberately.

## Success criteria

- \`npm run control-bands -- --check\` exits 0 for \`${breach.id}\` on the next run.
- The cause is named here, and a check exists that would have gone red on it — or
  this file records why the band itself was wrong.

## Open questions

- Is this a real regression, a change in what we measure, or a change in the corpus?
- Which commit is the first one outside the band?
`;
}

function writeIntent(breach: Breach, cfg: BandConfig, series: Observation[]): string {
  const dir = path.join(INTENT_DIR, `control-band-${breach.id}`);
  const file = path.join(dir, 'intent.md');
  fs.mkdirSync(dir, { recursive: true });
  // `wx` refuses to overwrite: one open intent per band, not one per run.
  try {
    fs.writeFileSync(file, renderIntent(breach, cfg, series), { flag: 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  return file;
}

// ---------------------------------------------------------------------------

/** Print one band's state; return its breach (as a one-element list) when it has one. */
function reportBand(cfg: BandConfig, obs: Observation[]): { breach: Breach; cfg: BandConfig }[] {
  const minPoints = cfg.minPoints ?? DEFAULT_MIN_POINTS;
  if (obs.length < minPoints) {
    console.warn(`  · ${cfg.id}: ${obs.length}/${minPoints} points — band not computed yet`);
    return [];
  }
  const breach = evaluate(cfg, obs);
  if (!breach) {
    console.warn(`  ✓ ${cfg.id}: inside band (${obs.length} points)`);
    return [];
  }
  console.warn(
    `  ✗ ${cfg.id}: ${breach.tier} — ${breach.rule}, ${breach.direction} the mean ` +
      `(latest ${breach.latest}, mean ${breach.mean.toFixed(DECIMALS)}, σ ${breach.sigma.toFixed(DECIMALS)})`,
  );
  return [{ breach, cfg }];
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has('--record') || args.has('--backfill-git')) {
    const fromGit = args.has('--backfill-git');
    console.warn(fromGit ? '📈 Recording + backfilling from git history' : '📈 Recording observations');
    await record(fromGit);
  }

  const series = loadSeries();
  console.warn('\n🎛️ Control bands\n');
  const breaches = loadConfig().flatMap((cfg) => reportBand(cfg, series[cfg.id] ?? []));

  if (args.has('--write-intent')) {
    for (const { breach, cfg } of breaches) {
      const file = writeIntent(breach, cfg, series[breach.id] ?? []);
      console.warn(`  📝 ${path.relative(REPO_ROOT, file)}`);
    }
  }

  // 1σ is a log tier by contract — it must never gate.
  const actionable = breaches.filter((b) => b.breach.tier !== '1σ');
  console.warn(`\n${breaches.length} breach(es), ${actionable.length} at 2σ or above.\n`);
  if (args.has('--check') && actionable.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
