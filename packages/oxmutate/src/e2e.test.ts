/**
 * The whole tool on a fixture whose test leaves state behind when it fails. A polluting mutant
 * must restart the context, and the mutants after it must be judged from a clean state: if not,
 * leftover entries kill the `reset()` mutants, which no test checks.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(here, '..');
const fixture = path.join(pkg, 'test/fixtures/registry');
const bin = path.join(pkg, 'dist/bin.js');
// Needs the native core (`npm run build:native`). Skipped locally without it; CI sets
// OXMUTATE_REQUIRE_NATIVE (quality-full.yml), where a missing core fails instead of skipping.
const native = existsSync(path.join(pkg, 'binding')) && readdirSync(path.join(pkg, 'binding')).some((f) => f.endsWith('.node'));
if (!native && process.env['OXMUTATE_REQUIRE_NATIVE'] === '1') throw new Error('OXMUTATE_REQUIRE_NATIVE is set and no native core is built. fix: npm run build:native -w oxmutate');
// A case that runs whole mutation runs — 6–15 s each on a contended runner — runs in the local
// weekly run, `npm run mutation:weekly`, which sets BURGEE_NIGHTLY (D-20261101-tests-under-5s,
// D-20261101-no-mutation-in-gha). Each one is named in NIGHTLY_ONLY in
// scripts/vitest-case-budget-reporter.ts, the only exemption from the five-second budget.
const nightly = process.env['BURGEE_NIGHTLY'] === '1';

interface ReportMutant {
  mutatorName: string;
  status: string;
  location: { start: { line: number; column?: number } };
  replacement?: string;
  static?: boolean;
  testsCompleted?: number;
}

it.skipIf(!native || !existsSync(bin) || !nightly)('restarts a polluted context and judges later mutants from a clean state', () => {
  const reportDir = path.join(fixture, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: fixture, stdio: 'pipe' });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as {
    files: Record<string, { mutants: ReportMutant[] }>;
    'x-oxmutate': { stats: { pollutionRestarts: number } };
  };
  const mutants = report.files['src/registry.ts']?.mutants ?? [];
  const resetLine = 14; // `export function reset` in the fixture
  const inReset = mutants.filter((m) => m.location.start.line >= resetLine);
  expect(report['x-oxmutate'].stats.pollutionRestarts).toBeGreaterThan(0);
  expect(inReset.length).toBeGreaterThan(0);
  expect(inReset.map((m) => `${m.mutatorName}:${m.status}`)).toEqual(inReset.map((m) => `${m.mutatorName}:Survived`));
  const rest = mutants.filter((m) => m.location.start.line < resetLine);
  expect(rest.map((m) => `${String(m.location.start.line)}:${m.mutatorName}:${m.status}`)).toEqual(rest.map((m) => `${String(m.location.start.line)}:${m.mutatorName}:Killed`));
  // Every verdict says how many tests decided it, the static mutant's isolated run included:
  // burgee's recorder rejects a covered survivor with none as a runner that matched nothing.
  expect(mutants.some((m) => m.static)).toBe(true);
  expect(mutants.filter((m) => (m.testsCompleted ?? 0) < 1).map((m) => `${String(m.location.start.line)}:${m.mutatorName}`)).toEqual([]);
  rmSync(reportDir, { recursive: true, force: true });
}, 60_000);

// A file-level `beforeEach` must re-run between mutants like any suite's. Vitest 5 does not link a
// top-level describe to its file, so it was skipped: every canary failed on the entries the previous
// mutant left, each read as pollution and cost a fresh context (shop-service, 2026-10-29).
it.skipIf(!native || !existsSync(bin) || !nightly)('re-runs file-level beforeEach hooks between mutants, so they read as no pollution', () => {
  const hooks = path.join(pkg, 'test/fixtures/file-hooks');
  const reportDir = path.join(hooks, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: hooks, stdio: 'pipe' });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as {
    files: Record<string, { mutants: ReportMutant[] }>;
    'x-oxmutate': { stats: { pollutionRestarts: number } };
  };
  expect(report['x-oxmutate'].stats.pollutionRestarts).toBe(0);
  expect(report.files['src/registry.ts']?.mutants.length).toBeGreaterThan(0);
  rmSync(reportDir, { recursive: true, force: true });
}, 60_000);

// A kill must not be decided on an earlier mutant's leftovers. reset() mutated to do nothing leaves the
// total behind; the next mutant's run fails on it and its `finally` resets, so the batch canary passed
// and vouched for that kill (.sdlc/intents/oxmutate/canary.qnt, verdictsClean). spare() is unchecked:
// on clean state every one of its mutants survives.
it.skipIf(!native || !existsSync(bin) || !nightly)('decides no kill on a previous mutant\'s leftovers that a test cleaned up in finally', () => {
  const dir = path.join(pkg, 'test/fixtures/batch-leftover');
  const reportDir = path.join(dir, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe' });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }> };
  rmSync(reportDir, { recursive: true, force: true });
  const mutants = report.files['src/registry.ts']?.mutants ?? [];
  const spareLines = [19, 20]; // `export function spare` in the fixture
  const spare = mutants.filter((m) => spareLines.includes(m.location.start.line));
  expect(spare.length).toBeGreaterThan(0);
  expect(spare.map((m) => `${String(m.location.start.line)}:${m.mutatorName}:${m.status}`)).toEqual(spare.map((m) => `${String(m.location.start.line)}:${m.mutatorName}:Survived`));
}, 60_000);

// ESLint's RuleTester fails a case it has seen, so a test run again from the same collection fails
// whatever the mutant: every canary read as pollution and each mutant cost a restart. The fixture's
// survivors show the runs after the first were decided on the mutant, not on that failure (rerun.qnt).
it.skipIf(!native || !existsSync(bin) || !nightly)('runs a run-once test file (ESLint\'s RuleTester) from fresh collections, with no restart', () => {
  const dir = path.join(pkg, 'test/fixtures/run-once');
  const reportDir = path.join(dir, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe' });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as {
    files: Record<string, { mutants: ReportMutant[] }>;
    'x-oxmutate': { stats: { pollutionRestarts: number } };
  };
  rmSync(reportDir, { recursive: true, force: true });
  const mutants = report.files['src/parity.ts']?.mutants ?? [];
  expect(report['x-oxmutate'].stats.pollutionRestarts).toBe(0);
  const zeroLine = 9; // `if (n < 0)`: zero is never checked
  expect(mutants.filter((m) => m.status === 'Survived').map((m) => m.location.start.line)).toContain(zeroLine);
  expect(mutants.filter((m) => m.location.start.line < zeroLine - 1).map((m) => m.status)).toEqual(mutants.filter((m) => m.location.start.line < zeroLine - 1).map(() => 'Killed'));
}, 60_000);

// The mutant is armed through `beforeEach`, as Stryker arms it. A fixture builder only a hook calls was
// planned for the test (the dry run credits hook code to it) but run with the hooks unarmed, so each of
// its mutants survived the warm run and cost an isolated process to be killed.
it.skipIf(!native || !existsSync(bin) || !nightly)('kills a mutant a beforeEach hook reaches in the warm run, with no isolated run', () => {
  const dir = path.join(pkg, 'test/fixtures/hook-setup');
  const reportDir = path.join(dir, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe' });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as {
    files: Record<string, { mutants: ReportMutant[] }>;
    'x-oxmutate': { stats: { survivorsOverturned: number; isolatedRuns: number } };
  };
  rmSync(reportDir, { recursive: true, force: true });
  const mutants = report.files['src/seed.ts']?.mutants ?? [];
  expect(mutants.length).toBeGreaterThan(0);
  expect(mutants.map((m) => m.status)).toEqual(mutants.map(() => 'Killed'));
  expect(report['x-oxmutate'].stats.survivorsOverturned).toBe(0);
  expect(report['x-oxmutate'].stats.isolatedRuns).toBe(0);
}, 60_000);

// Reference verdicts for static mutants, decided today in a fresh worker per (mutant, file). A faster
// path that decides them in a live worker (.sdlc/intents/oxmutate/staticwarm.qnt) must give the same:
// `static-const` is reached only through import-time values; `static-leak` sets a global at import
// with `??=`, so a worker that evaluated it once would make the MODE mutant survive.
type PhaseStats = Record<'instrumentMs' | 'dryRunMs' | 'mutationMs' | 'staticMs' | 'isolatedMs' | 'wallMs' | 'staticRecollections', number>;

/** A fixture's static mutants as `line:mutator:status`, and the run's stats, from a real run. */
const staticRun = (name: string, file: string): { verdicts: string[]; stats: PhaseStats } => {
  const dir = path.join(pkg, 'test/fixtures', name);
  const reportDir = path.join(dir, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe' });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }>; 'x-oxmutate': { stats: PhaseStats } };
  rmSync(reportDir, { recursive: true, force: true });
  const verdicts = (report.files[file]?.mutants ?? []).filter((m) => m.static).map((m) => `${String(m.location.start.line)}:${m.mutatorName}:${m.status}`);
  return { verdicts, stats: report['x-oxmutate'].stats };
};

describe.skipIf(!native || !existsSync(bin) || !nightly)('static mutants keep their fresh-worker verdicts', () => {
  it('an import-time constant decides its mutants; an unread one survives', () => {
    const { verdicts, stats } = staticRun('static-const', 'src/limits.ts');
    expect(verdicts).toEqual(['2:NumericLiteral:Killed', '3:StringLiteral:Killed', '5:StringLiteral:Survived']);
    // The live static phase (5b) is a phase of its own, and the phases account for the run. Without
    // `staticMs` they did not: compat-oracle's 10-31 weekly run reported phases summing to 4,480 of
    // its 11,193 s, the rest spent deciding static mutants (.sdlc/intents/oxmutate/sc8-profile.md).
    expect(stats.staticMs).toBeGreaterThan(0);
    const phases = stats.instrumentMs + stats.dryRunMs + stats.mutationMs + stats.staticMs + stats.isolatedMs;
    expect(phases / stats.wallMs).toBeGreaterThan(0.95);
    // The three mutants are one batch: re-collected unarmed after the first, then after the next two
    // together, not after each (runner.ts, staticwarm.qnt `grouped`). The verdicts above are unchanged.
    expect(stats.staticRecollections).toBe(2);
  }, 60_000);

  it('a global set at import does not carry one mutant value into the next', () => {
    expect(staticRun('static-leak', 'src/mode.ts').verdicts).toEqual(['4:StringLiteral:Killed', '5:AssignmentOperator:Killed']);
  }, 60_000);
});

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// A coordinator that dies while its servers are still loading Vitest: a server listened for the
// disconnect only once Vitest had loaded, so it outlived its coordinator until then. At load 25–35,
// T6 below found two such servers alive 5 s after the kill in 3 of 5 pre-push runs (2026-11-02).
// The fixture's config takes 4 s to load, so each server is inside `createVitest` at the kill.
it.skipIf(!native || !existsSync(bin))('leaves no server running when the coordinator dies while its servers load Vitest (T6)', async () => {
  const dir = path.join(pkg, 'test/fixtures/slow-start');
  const run = spawn(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', path.join(dir, 'reports'), '--reporter', 'json'], { cwd: dir, stdio: 'ignore' });
  let servers: number[] = [];
  for (let i = 0; i < 400 && !servers.length; i++) {
    await new Promise((r) => setTimeout(r, 10));
    servers = spawnSync('pgrep', ['-P', String(run.pid)], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(Number);
  }
  expect(servers.length).toBeGreaterThan(0);
  await new Promise((r) => setTimeout(r, 500)); // into the config's load
  run.kill('SIGKILL');
  for (let waited = 0; waited < 2500 && servers.some(alive); waited += 100) await new Promise((r) => setTimeout(r, 100));
  const left = servers.filter(alive);
  for (const pid of left) process.kill(pid, 'SIGKILL');
  rmSync(path.join(dir, 'reports'), { recursive: true, force: true });
  expect(left).toEqual([]);
}, 60_000);

// The orphans found on 2026-10-27 were servers whose worker thread was looping in a test.
it.skipIf(!native || !existsSync(bin))('leaves no server running when the coordinator is killed mid-runaway (T6)', async () => {
  const spin = path.join(pkg, 'test/fixtures/spin');
  const run = spawn(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', path.join(spin, 'reports'), '--reporter', 'json'], { cwd: spin, stdio: 'ignore' });
  let servers: number[] = [];
  for (let i = 0; i < 200 && !servers.length; i++) {
    await new Promise((r) => setTimeout(r, 50));
    servers = spawnSync('pgrep', ['-P', String(run.pid)], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(Number);
  }
  expect(servers.length).toBeGreaterThan(0);
  await new Promise((r) => setTimeout(r, 1500)); // into the spinning test
  run.kill('SIGKILL');
  // Up to 5 s for the servers to notice, as before, but no longer than they take: a fixed 5 s wait
  // made this case 7.1 s on CI whatever happened (D-20261101-tests-under-5s).
  for (let waited = 0; waited < 5000 && servers.some(alive); waited += 100) await new Promise((r) => setTimeout(r, 100));
  const left = servers.filter(alive);
  for (const pid of left) process.kill(pid, 'SIGKILL');
  rmSync(path.join(spin, 'reports'), { recursive: true, force: true });
  expect(left).toEqual([]);
}, 60_000);

it.skipIf(!native || !existsSync(bin) || !nightly)('confirms a watchdog stop with 3x the budget before reporting a timeout', () => {
  const slow = path.join(pkg, 'test/fixtures/slow');
  const reportDir = path.join(slow, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  mkdirSync(reportDir, { recursive: true });
  // The mutant is static: the fresh-worker path is the one whose watchdog this checks.
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: slow, stdio: 'pipe', env: { ...process.env, OXMUTATE_ISOLATE_STATIC: '1' } });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as {
    files: Record<string, { mutants: ReportMutant[] }>;
    'x-oxmutate': { stats: { timeoutsOverturned: number; idleStalls: number } };
  };
  rmSync(reportDir, { recursive: true, force: true });
  // The slow ArrowFunction mutant, and the NumericLiteral 1 -> 0 beside it.
  expect(report.files['src/one.ts']?.mutants.map((m) => m.status)).toEqual(['Killed', 'Killed']);
  expect(report['x-oxmutate'].stats.timeoutsOverturned).toBe(1);
  // A loop burns its core: both stops read busy, so the slow test keeps its 3x re-run (heartbeat.ts).
  expect(report['x-oxmutate'].stats.idleStalls).toBe(0);
}, 90_000);

/** The CLI on a fixture with extra config keys, through a config file written for the run. */
const runWith = (dir: string, extra: Record<string, unknown>): { status: number | null; out: string; reports: string } => {
  const base = JSON.parse(readFileSync(path.join(dir, 'oxmutate.config.json'), 'utf8')) as Record<string, unknown>;
  // One directory per call, so no case reads a report an earlier case wrote.
  mkdirSync(path.join(dir, 'reports'), { recursive: true });
  const reports = mkdtempSync(path.join(dir, 'reports', 'case-'));
  const config = path.join(reports, 'case.config.json');
  writeFileSync(config, JSON.stringify({ ...base, ...extra }));
  const r = spawnSync(process.execPath, [bin, 'run', '--config', config, '--report-dir', reports, '--reporter', 'json'], { cwd: dir, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, reports };
};

describe.skipIf(!native || !existsSync(bin))('Stryker options the run honours', () => {
  const registry = path.join(pkg, 'test/fixtures/registry');
  const spin = path.join(pkg, 'test/fixtures/spin');
  afterAll(() => {
    discard(path.join(registry, 'reports'));
    discard(path.join(spin, 'reports'));
  });

  it('buildCommand: a failing build stops the run before the dry run, with exit 3', () => {
    const r = runWith(registry, { buildCommand: 'node -e process.exit(4)' });
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/buildCommand `node -e process.exit\(4\)` exited 4/);
  });

  // One run per case: as one case the two runs read 6.5 s on CI (D-20261101-tests-under-5s).
  it('thresholds.break: a score below it exits 1, through the exit code burgee reads', () => {
    expect(runWith(registry, { thresholds: { break: 99 } }).status).toBe(1);
  });

  it('thresholds.break: a score at or above it exits 0', () => {
    expect(runWith(registry, { thresholds: { break: 50 } }).status).toBe(0);
  });

  it('ignore: mutants under a matched call are reported Ignored with the rule\'s reason, the rest unaffected', () => {
    const r = runWith(registry, { ignore: [{ call: 'items.push', reason: 'the registry write is checked elsewhere' }] });
    expect(r.status).toBe(0);
    const mutants = (JSON.parse(readFileSync(path.join(r.reports, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: (ReportMutant & { statusReason?: string })[] }> }).files['src/registry.ts']?.mutants ?? [];
    const ignored = mutants.filter((m) => m.status === 'Ignored');
    expect(ignored.length).toBeGreaterThan(0);
    expect(ignored.every((m) => m.statusReason === 'the registry write is checked elsewhere' && m.location.start.line === 6)).toBe(true);
    expect(mutants.some((m) => m.status === 'Killed')).toBe(true);
  });

  it('a static mutant that stops the test file loading is Killed, not Survived', () => {
    const loadError = path.join(pkg, 'test/fixtures/load-error');
    try {
      const r = runWith(loadError, {});
      const mutants = (JSON.parse(readFileSync(path.join(r.reports, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }> }).files['src/version.ts']?.mutants ?? [];
      // '../package.json' → '' reads this module's own source, so JSON.parse throws at import
      expect(mutants.find((m) => m.replacement === '""' && m.location.start.column === 57)?.status).toBe('Killed');
    } finally {
      discard(path.join(loadError, 'reports'));
    }
  });

  it('a Vitest config with projects is scored: the runner reaches every project', () => {
    // burgee's config has `projects`, which resolve `runner` from their own inline config: its
    // weekly run ran with Vitest's runner, recorded no test, and stopped (run 40783405734).
    const projects = path.join(pkg, 'test/fixtures/projects');
    try {
      const r = runWith(projects, {});
      expect(r.status, r.out).toBe(0);
      const mutants = (JSON.parse(readFileSync(path.join(r.reports, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }> }).files['src/sign.ts']?.mutants ?? [];
      expect(mutants.length).toBeGreaterThan(0);
      expect(mutants.filter((m) => m.status === 'Killed').length).toBeGreaterThan(0);
    } finally {
      discard(path.join(projects, 'reports'));
    }
  });

  it('dryRunOnly: the dry run passes and nothing is scored or written', () => {
    const r = runWith(registry, { dryRunOnly: true });
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/dry run only/);
    expect(existsSync(path.join(r.reports, 'mutation.json'))).toBe(false);
  });

  it('dryRunTimeoutMinutes: a dry run that hangs stops at its budget, with exit 3', () => {
    const r = runWith(spin, { dryRunTimeoutMinutes: 0.02 });
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/longer than dryRunTimeoutMinutes/);
  });
});

describe.skipIf(!native || !existsSync(bin) || !nightly)('the frozen oracle (R14, SC10)', () => {
  const registry = path.join(pkg, 'test/fixtures/registry');
  // A git repository of its own, inside the fixture's ignored reports/, so Vitest still resolves.
  const repo = path.join(registry, 'reports', 'frozen-repo');
  const spec = path.join(repo, 'src/registry.spec.ts');
  const git = (...args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, stdio: 'pipe' });
  };
  const frozen = (): { status: number | null; out: string; report: { 'x-oxmutate': { frozenOracle?: { weakened: unknown[]; changedTests: string[]; delta: number } } } } => {
    const r = spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', 'out', '--reporter', 'json', '--frozen-oracle', 'HEAD'], { cwd: repo, encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}`, report: JSON.parse(readFileSync(path.join(repo, 'out', 'mutation.json'), 'utf8')) as never };
  };
  const original = readFileSync(path.join(registry, 'src/registry.spec.ts'), 'utf8');

  beforeAll(() => {
    discard(repo);
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    for (const f of ['package.json', 'vitest.config.mjs', 'oxmutate.config.json', 'src/registry.ts', 'src/registry.spec.ts']) writeFileSync(path.join(repo, f), readFileSync(path.join(registry, f)));
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
  });
  afterAll(() => discard(repo));

  it('reports the mutants a change stopped detecting when it weakens a test, and exits 1', () => {
    writeFileSync(spec, original.replace("expect(list()).toEqual(['a']);", 'list();'));
    const r = frozen();
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/the change weakened its tests/);
    const f = r.report['x-oxmutate'].frozenOracle;
    expect(f?.changedTests).toEqual(['src/registry.spec.ts']);
    expect(f?.weakened.length).toBeGreaterThan(0);
    expect(f?.delta).toBeLessThan(0);
  });

  it('reports no drop when a change only adds a test', () => {
    writeFileSync(spec, `${original}\nit('lists nothing after a reset', () => {\n  reset();\n  expect(list()).toEqual([]);\n});\n`);
    const r = frozen();
    expect(r.status).toBe(0);
    expect(r.report['x-oxmutate'].frozenOracle?.weakened).toEqual([]);
  });
});

const verdictOf = (m: ReportMutant): string => `${String(m.location.start.line)}:${m.mutatorName}:${m.status}`;

describe.skipIf(!native || !existsSync(bin) || !nightly)('the command runner (testRunner: command)', () => {
  const registry = path.join(pkg, 'test/fixtures/registry');
  afterAll(() => discard(path.join(registry, 'reports')));

  it('runs the command once per mutant in a sandbox and scores what the warm runner scores', () => {
    const sandboxes = (): string[] => (existsSync(path.join(registry, '.oxmutate-tmp')) ? readdirSync(path.join(registry, '.oxmutate-tmp')) : []);
    const before = sandboxes();
    const r = runWith(registry, { testRunner: 'command', commandRunner: { command: 'npx vitest run --config vitest.config.mjs' } });
    expect(r.status).toBe(0);
    const report = JSON.parse(readFileSync(path.join(r.reports, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }> };
    const mutants = report.files['src/registry.ts']?.mutants ?? [];
    // A fresh process per mutant: no pollution to correct, the same partition as the warm run.
    expect(mutants.map(verdictOf)).toEqual(mutants.map((m) => `${String(m.location.start.line)}:${m.mutatorName}:${m.location.start.line >= 14 ? 'Survived' : 'Killed'}`));
    // The sandbox is gone afterwards, and the sources on disk were never touched.
    // This run's sandbox is gone (one an earlier, killed run left behind is not this run's to clean).
    expect(sandboxes().filter((d) => !before.includes(d))).toEqual([]);
    expect(readFileSync(path.join(registry, 'src/registry.ts'), 'utf8')).not.toContain('oxmAct');
  }, 120_000);
});

describe.skipIf(!native || !existsSync(bin))('a spec oracle (M3.5): model traces as a second verdict', () => {
  const fixture = path.join(pkg, 'test/fixtures/spec');
  afterAll(() => discard(path.join(fixture, 'reports')));

  it('reports the mutants only the model catches as test-spec gaps, with the trace, and leaves the score alone', () => {
    const r = runWith(fixture, {});
    expect(r.status).toBe(0);
    const report = JSON.parse(readFileSync(path.join(r.reports, 'mutation.json'), 'utf8')) as {
      files: Record<string, { mutants: (ReportMutant & { id: string })[] }>;
      'x-oxmutate': { specOracles: { specKillShare: number; mappingCoverage: number; testSpecGap: { id: string; trace: string }[]; specEscapes: unknown[] }[] };
    };
    const mutants = report.files['src/counter.ts']?.mutants ?? [];
    const [counter] = report['x-oxmutate'].specOracles;
    // dec() on lines 7–8 is untested: its mutants are the tests' NoCoverage and the spec's kills.
    const untested = mutants.filter((m) => m.location.start.line >= 7 && m.location.start.line <= 8);
    expect(untested.length).toBeGreaterThan(0);
    expect(untested.every((m) => m.status === 'NoCoverage')).toBe(true);
    expect(counter?.testSpecGap.map((g) => g.id).sort()).toEqual(untested.map((m) => m.id).sort());
    expect(counter?.testSpecGap.every((g) => /replays t\d+\.itf\.json/.test(g.trace))).toBe(true);
    expect(counter?.specEscapes).toEqual([]);
    expect(counter?.mappingCoverage).toBe(100);
  });
});

// A mutant that leaves its test awaiting a promise that never settles is idle, not slow: its worker's
// event loop turns and its server burns no CPU. It is a Timeout at its budget, as Stryker scores it,
// with no re-run at 3x. caique is a prompts library: its 10-31 weekly run re-ran 375 such stops at
// 3x, where they "finished" only because Vitest's 30 s test timeout failed the test, and were
// reported Killed (D-20261101-idle-stall-is-timeout, stall.qnt). Before this, the fixture's hung
// mutant took two stops and a 3x re-run to come out Killed the same way.
// In process, through the built package's API: the CLI's exit adds seconds this test does not need.
// The mutant is static and sent straight to the fresh-worker path, whose watchdog this checks.
it.skipIf(!native || !existsSync(bin) || !nightly)('scores a mutant whose test waits on an idle worker Timeout at its budget, with no 3x re-run', async () => {
  const dir = path.join(pkg, 'test/fixtures/stall');
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built package under test, present only after a build; the test is skipped without it
  const api = (await import(path.join(pkg, 'dist/index.js'))) as typeof import('./index.js');
  process.env['OXMUTATE_ISOLATE_STATIC'] = '1';
  try {
    const result = await api.run(await api.loadOptions(dir, { reporters: [] }, path.join(dir, 'oxmutate.config.json')));
    // The executor's emptied body, the hang; the string is excluded, so the run is the one mutant.
    expect(result.mutants.map((m) => `${m.mutatorName}:${m.status}`)).toEqual(['BlockStatement:Timeout', 'StringLiteral:Ignored']);
    expect(result.stats).toMatchObject({ watchdogKills: 1, idleStalls: 1, timeoutsOverturned: 0 });
    // A Timeout is detected: the score is the one the Killed verdict gave.
    expect(result.score).toMatchObject({ detected: 1, total: 1, mutationScore: 100 });
  } finally {
    delete process.env['OXMUTATE_ISOLATE_STATIC'];
  }
}, 60_000);

// A range directive, `disable all` with a reason down to `restore all`, turns mutants off between
// the two lines, as Stryker does. Before, oxmutate read only `disable next-line` and graded every mutant in a range:
// 116 in compat-oracle's hosts.ts, rows graded in another process (sc8-profile.md).
it.skipIf(!native || !existsSync(bin))('reports the mutants inside a disable/restore range Ignored, with its reason, and only those', async () => {
  const dir = path.join(pkg, 'test/fixtures/ranges');
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built package under test, present only after a build; the test is skipped without it
  const api = (await import(path.join(pkg, 'dist/index.js'))) as typeof import('./index.js');
  const result = await api.run(await api.loadOptions(dir, { reporters: [] }, path.join(dir, 'oxmutate.config.json')));
  const byLine = (line: number): string[] => [...new Set(result.mutants.filter((m) => m.start.line === line).map((m) => m.status))];
  expect(byLine(3)).toEqual(['Ignored']);
  expect(result.mutants.find((m) => m.start.line === 3)?.statusReason).toBe('read only by the debug log, which no test asserts on');
  expect(byLine(1)).not.toContain('Ignored');
  expect(byLine(5)).not.toContain('Ignored');
}, 60_000);

// A test that freezes the clock with `vi.useFakeTimers()` and never gives it back: the runner wrote
// each mutant's start from that clock, so every mutant after it read as running since the freeze,
// and the watchdog stopped it however briefly it had run. On a full caique run on 2026-11-02 such
// stops read 100 to 1,055 s "elapsed", and each cost a killed server and an isolated run.
it.skipIf(!native || !existsSync(bin))('times a mutant by the real clock, so a test that froze it causes no stop', async () => {
  const dir = path.join(pkg, 'test/fixtures/fake-clock');
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built package under test, present only after a build; the test is skipped without it
  const api = (await import(path.join(pkg, 'dist/index.js'))) as typeof import('./index.js');
  const result = await api.run(await api.loadOptions(dir, { reporters: [] }, path.join(dir, 'oxmutate.config.json')));
  // No mutant of `grade` runs away, and the fixture's 20 s budget is far past any real run, so the
  // only stop there could be is one timed from the frozen epoch clock. The build before the fix
  // stopped every mutant after the freeze; on a loaded CI runner a 400 ms budget made this flaky
  // (main, run 41430279215), which the epoch clock and the long budget remove.
  expect(result.stats.watchdogKills).toBe(0);
  expect(result.mutants.filter((m) => m.status === 'Timeout')).toEqual([]);
}, 60_000);

it.skipIf(!native || !existsSync(bin) || !nightly)('keeps a survivor whose confirmation run was only slow, not killed', () => {
  const dir = path.join(pkg, 'test/fixtures/slow-survivor');
  const reportDir = path.join(dir, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  mkdirSync(reportDir, { recursive: true });
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe' });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as {
    files: Record<string, { mutants: ReportMutant[] }>;
    'x-oxmutate': { stats: { survivorsOverturned: number; watchdogKills: number } };
  };
  rmSync(reportDir, { recursive: true, force: true });
  // The slow survivor, and the NumericLiteral beside it, which no test checks either.
  expect(report.files['src/one.ts']?.mutants.map((m) => m.status)).toEqual(['Survived', 'Survived']);
  // The confirmation ran and was stopped once, and its 3x re-run finished: the path under test.
  // With one covering test it never ran, and this case passed having checked nothing (2026-11-02).
  expect(report['x-oxmutate'].stats).toMatchObject({ survivorsOverturned: 0, watchdogKills: 1 });
}, 90_000);

describe.skipIf(!native || !existsSync(bin))("Stryker's mutate ranges", () => {
  const registry = path.join(pkg, 'test/fixtures/registry');
  afterAll(() => discard(path.join(registry, 'reports')));

  it('mutates only what lies wholly inside src/registry.ts:5-7, the register function', () => {
    const r = runWith(registry, { mutate: ['src/registry.ts:5-7'] });
    expect(r.status).toBe(0);
    const mutants = (JSON.parse(readFileSync(path.join(r.reports, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }> }).files['src/registry.ts']?.mutants ?? [];
    expect(mutants.length).toBeGreaterThan(0);
    expect(mutants.every((m) => m.location.start.line >= 5 && m.location.start.line <= 7)).toBe(true);
  });
});
