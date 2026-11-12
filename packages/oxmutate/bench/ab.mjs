// Two builds of oxmutate on the same projects: do they give every mutant the same verdict, and
// what did each cost? The gate a speed change passes before it merges (oxmutate-fastest).
//
// Run it as `node packages/oxmutate/bench/ab.mjs --baseline <dist/bin.js> --candidate <dist/bin.js>`,
// with any of `--target <dir>` (repeatable), `--rounds 2`, `--concurrency 2`, `--out <dir>`.
//
// Each target is a project directory. One with an `oxmutate.config.json` runs with it (the
// fixtures); any other gets a config that mutates `src/` minus tests. With no --target, the set
// below runs. The builds alternate (baseline, candidate, baseline, …) so the machine's load falls
// on both, and the 1-minute load average is recorded beside every run.
//
// Exit 1 when a mutant is detected by one build and not by the other. A Killed that became a
// Timeout is not a difference: both are detections, and a loaded machine moves one to the other.
// A mutant a build disagrees with itself on, between rounds, is reported as unstable and does not
// fail the run: that is a flake to chase, not this change's verdict.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = path.resolve(HERE, '..');
const REPO = path.resolve(PACKAGE, '../..');
const fixture = (name) => path.join(PACKAGE, 'test/fixtures', name);
// Small enough to run before every engine change, and each one is here for a path a speed change
// can break: known survivors, static mutants, a file's own hooks, a leftover between mutants, a
// frozen clock, an unhandled error, and one real package whose tests spawn processes and whose
// code keeps a cache a mutant can poison (paratext).
const DEFAULT_TARGETS = [
  ...['sensitivity-weak', 'sensitivity-closed', 'static-const', 'static-leak', 'file-hooks', 'batch-leftover', 'fake-clock', 'unhandled', 'hook-setup', 'run-once'].map(fixture),
  path.join(REPO, 'packages/paratext'),
];
const MAX_LOAD_RATIO = 1.5;
const MS_PER_S = 1000;
const MUTANT_TIMEOUT_MS = 10_000;
/** A run's output is kept only for its last line when it leaves no report. */
const OUTPUT_BYTES = 256 * 1024 * 1024;
const DIFFERENCES_SHOWN = 10;
const USAGE_EXIT = 2;
/** Keeps a load of zero from dividing. */
const LEAST_LOAD = 0.01;

const args = process.argv.slice(2);
const all = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const one = (name, fallback) => all(name)[0] ?? fallback;
const builds = { baseline: one('baseline'), candidate: one('candidate') };
const targets = all('target').length ? all('target').map((t) => path.resolve(t)) : DEFAULT_TARGETS;
const rounds = Number(one('rounds', '2'));
const concurrency = Number(one('concurrency', '2'));
const out = path.resolve(one('out', path.join(PACKAGE, 'bench/results/ab')));

/** The config a target runs with: its own, or one that mutates `src/` minus tests. */
function configFor(dir, work) {
  const own = path.join(dir, 'oxmutate.config.json');
  if (existsSync(own)) return own;
  const vitest = ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.mjs'].map((f) => path.join(dir, f)).find((f) => existsSync(f));
  const file = path.join(work, 'config.json');
  writeFileSync(file, JSON.stringify({ mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/__fixtures__/**'], ...(vitest ? { vitest: { configFile: vitest } } : {}), concurrency, timeoutMS: MUTANT_TIMEOUT_MS }));
  return file;
}

const detected = (status) => status === 'Killed' || status === 'Timeout';

function runOnce(bin, dir, work) {
  const reports = path.join(work, 'reports');
  const load = loadavg()[0];
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.resolve(bin), 'run', '--config', configFor(dir, work), '--report-dir', reports, '--reporter', 'json'], { cwd: dir, encoding: 'utf8', maxBuffer: OUTPUT_BYTES });
  const wallMs = Date.now() - started;
  const file = path.join(reports, 'mutation.json');
  if (!existsSync(file)) return { failed: `exit ${String(r.status)}, no report: ${(r.stderr || r.stdout || '').trim().split('\n').at(-1) ?? ''}`, wallMs, load };
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const verdicts = new Map();
  for (const [f, x] of Object.entries(report.files)) {
    for (const m of x.mutants) verdicts.set(`${f}:${String(m.location.start.line)}:${String(m.location.start.column)}:${String(m.location.end.line)}:${String(m.location.end.column)}:${m.mutatorName}:${m.replacement ?? ''}`, m.status);
  }
  return { verdicts, stats: report['x-oxmutate']?.stats ?? {}, wallMs, load: (load + loadavg()[0]) / 2, exit: r.status };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] ?? 0;
const seconds = (ms) => (ms / MS_PER_S).toFixed(1);
const phase = (list, field) => median(list.map((r) => r.stats[field] ?? 0));
const SAID = new Map([[true, 'detected'], [false, 'undetected']]);
const say = (v) => SAID.get(v) ?? v;
/** One verdict per mutant for a build, or `unstable` when its own rounds disagree. */
function settle(list) {
  const settled = new Map();
  for (const key of list[0].verdicts.keys()) {
    const seen = new Set(list.map((r) => (r.verdicts.has(key) ? detected(r.verdicts.get(key)) : 'missing')));
    settled.set(key, seen.size === 1 ? [...seen][0] : 'unstable');
  }
  return settled;
}

function main() {
  const summary = [];
  let failures = 0;
  for (const dir of targets) {
    const name = path.relative(REPO, dir);
    const runs = { baseline: [], candidate: [] };
    for (let round = 0; round < rounds; round++) {
      for (const build of ['baseline', 'candidate']) {
        const work = path.join(out, name.replaceAll(path.sep, '_'), `${build}-${String(round)}`);
        mkdirSync(work, { recursive: true });
        runs[build].push(runOnce(builds[build], dir, work));
      }
    }
    const broken = [...runs.baseline, ...runs.candidate].find((r) => r.failed);
    if (broken) {
      console.log(`✖ ${name}: ${broken.failed}`);
      failures++;
      summary.push({ target: name, error: broken.failed });
      continue;
    }
    const base = settle(runs.baseline);
    const cand = settle(runs.candidate);
    const differ = [];
    const unstable = [];
    for (const key of new Set([...base.keys(), ...cand.keys()])) {
      const b = base.get(key) ?? 'missing';
      const c = cand.get(key) ?? 'missing';
      if (b === 'unstable' || c === 'unstable') unstable.push(key);
      else if (b !== c) differ.push(`${key}  baseline ${say(b)} · candidate ${say(c)}`);
    }
    const loads = { baseline: median(runs.baseline.map((r) => r.load)), candidate: median(runs.candidate.map((r) => r.load)) };
    const ratio = Math.max(loads.baseline, loads.candidate) / Math.max(LEAST_LOAD, Math.min(loads.baseline, loads.candidate));
    const row = {
      target: name,
      mutants: base.size,
      differ: differ.length,
      unstable: unstable.length,
      comparable: ratio <= MAX_LOAD_RATIO,
      loads,
      ms: Object.fromEntries(['wallMs', 'dryRunMs', 'mutationMs', 'staticMs', 'isolatedMs'].map((f) => [f, { baseline: phase(runs.baseline, f), candidate: phase(runs.candidate, f) }])),
      servers: { baseline: phase(runs.baseline, 'serversSpawned'), candidate: phase(runs.candidate, 'serversSpawned') },
      units: { baseline: phase(runs.baseline, 'units'), candidate: phase(runs.candidate, 'units') },
    };
    summary.push({ ...row, differing: differ, unstableKeys: unstable });
    if (differ.length) failures++;
    const w = row.ms.wallMs;
    console.log(`${differ.length ? '✖' : '✓'} ${name}: ${String(base.size)} mutants, ${String(differ.length)} differ, ${String(unstable.length)} unstable · wall ${seconds(w.baseline)} s → ${seconds(w.candidate)} s (${(w.baseline / Math.max(1, w.candidate)).toFixed(2)}x)${row.comparable ? '' : ` · loads ${loads.baseline.toFixed(0)} and ${loads.candidate.toFixed(0)}: times not comparable`}`);
    for (const d of differ.slice(0, DIFFERENCES_SHOWN)) console.log(`    ${d}`);
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'ab.json'), `${JSON.stringify({ builds, rounds, concurrency, targets: summary }, null, 2)}\n`);
  console.log(failures ? `\n✖ ${String(failures)} target(s) differ or failed. Report: ${path.join(out, 'ab.json')}` : `\n✓ every mutant has the same verdict on both builds. Report: ${path.join(out, 'ab.json')}`);
  process.exitCode = failures ? 1 : 0;
}

if (builds.baseline && builds.candidate) main();
else {
  console.error('ab: --baseline <bin.js> and --candidate <bin.js> are both required');
  process.exitCode = USAGE_EXIT;
}
