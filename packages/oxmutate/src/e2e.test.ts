/**
 * The whole tool on a fixture whose test leaves state behind when it fails. A polluting mutant
 * must restart the context, and the mutants after it must be judged from a clean state: if not,
 * leftover entries kill the `reset()` mutants, which no test checks.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';

/** The environment without git's own variables: lefthook's pre-push exports `GIT_DIR`, and a scratch `git init` must not inherit it (scripts/git-env-lock.test.ts). */
const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

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
  // The restart path, which OXMUTATE_ISOLATE_POLLUTION=1 keeps: the in-worker recovery has its own cases below.
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: fixture, stdio: 'pipe', env: { ...process.env, OXMUTATE_ISOLATE_POLLUTION: '1' } });
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
// mixed.spec.ts opens with a plain test and holds the RuleTester-shaped block in a describe: probing
// only a file's first test missed it, and its mutants restarted again.
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
type PhaseStats = { staticFallbacks?: Record<string, number>; isolatedStages?: { stage: string; mutants: number; ms: number; peak: number }[] } & Record<'instrumentMs' | 'dryRunMs' | 'mutationMs' | 'staticMs' | 'isolatedMs' | 'wallMs' | 'staticRecollections' | 'isolatedRuns' | 'warmUnitMs' | 'warmArmedMs', number> & { isolatedByCause: Record<string, number> };

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

/** The slow-test fixture's verdicts by line, its reasons, and how many kills a second run overturned. */
const slowRun = (env: Record<string, string>): { verdicts: string[]; reasons: (string | undefined)[]; overturned: number } => {
  const dir = path.join(pkg, 'test/fixtures/slow-test');
  const reportDir = mkdtempSync(path.join(tmpdir(), 'oxmutate-slow-test-'));
  // The fresh-worker path, where Vitest runs the file and its own timeout applies.
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe', env: { ...process.env, OXMUTATE_ISOLATE_STATIC: '1', ...env } });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: (ReportMutant & { statusReason?: string })[] }>; 'x-oxmutate': { stats: { timeoutsOverturned: number } } };
  rmSync(reportDir, { recursive: true, force: true });
  const mutants = report.files['src/label.ts']?.mutants ?? [];
  return { verdicts: mutants.map((m) => `${String(m.location.start.line)}:${m.status}`), reasons: mutants.map((m) => m.statusReason), overturned: report['x-oxmutate'].stats.timeoutsOverturned };
};

// A test that fails by its own timeout is not a kill until a second run says so. On compat-oracle's
// `hosts.ts`, at a load average of 45 to 120, 8 of 15 static mutants were Killed this way by tests that
// clone repositories, and survive a quiet run (A-20261112-oxmutate-test-timeout-kill).
describe.skipIf(!native || !existsSync(bin) || !nightly)('a kill that is only a slow test is run again', () => {
  it('slow once: the unread constant survives, and the read one is still killed by its assertion', () => {
    const marker = path.join(mkdtempSync(path.join(tmpdir(), 'oxmutate-slow-once-')), 'ran');
    const { verdicts, overturned } = slowRun({ OXMUTATE_SLOW_ONCE: marker });
    rmSync(path.dirname(marker), { recursive: true, force: true });
    // Lines 6 and 7 are `label`'s own mutants, killed warm by its assertion.
    expect(verdicts).toEqual(['2:Killed', '4:Survived', '6:Killed', '7:Killed']);
    expect(overturned).toBe(1);
  });

  it('slow twice: a Timeout that says why, never a kill', () => {
    const { verdicts, reasons, overturned } = slowRun({ OXMUTATE_SLOW_ALWAYS: '1' });
    expect(verdicts).toEqual(['2:Killed', '4:Timeout', '6:Killed', '7:Killed']);
    expect(reasons[1]).toBe('its tests failed only by their own timeout, in two runs');
    expect(overturned).toBe(0);
  });
});

/** A fixture's verdicts as `line:column:mutator:status`, its stats and its exit code, with `static.group` and an environment. */
const groupRun = (name: string, file: string, args: string[], env: Record<string, string> = {}): { verdicts: string[]; stats: Record<string, number>; status: number | null; stderr: string } => {
  const dir = path.join(pkg, 'test/fixtures', name);
  const reportDir = mkdtempSync(path.join(tmpdir(), `oxmutate-${name}-`));
  const r = spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }>; 'x-oxmutate': { stats: Record<string, number> } };
  rmSync(reportDir, { recursive: true, force: true });
  const verdicts = (report.files[file]?.mutants ?? []).map((m) => `${String(m.location.start.line)}:${String(m.location.start.column)}:${m.mutatorName}:${m.status}`);
  return { verdicts, stats: report['x-oxmutate'].stats, status: r.status, stderr: r.stderr };
};

// `static.group` arms several static mutants in one re-collection of a file that is not their
// first (oxmutate-fastest R3–R6, D-20261113-oxmutate-static-group-disjoint).
describe.skipIf(!native || !existsSync(bin) || !nightly)('static survivors armed in groups', () => {
  // Groups and the budget act on a static mutant's later files. With static.readers (the default) a
  // fixture value is read in one file, so there are none: these cases run every loading file.
  const LOADERS = '--no-static-readers';
  it('gives every mutant the verdict it gets alone, in fewer runs', () => {
    const alone = groupRun('static-group', 'src/table.ts', [LOADERS]);
    const grouped = groupRun('static-group', 'src/table.ts', [LOADERS, '--static-group', '4']);
    expect(grouped.verdicts).toEqual(alone.verdicts);
    expect(alone.verdicts.some((v) => v.endsWith(':Survived'))).toBe(true);
    expect(alone.verdicts.some((v) => v.endsWith(':Killed'))).toBe(true);
    expect(alone.stats['staticGroupRuns']).toBe(0);
    expect(grouped.stats['staticGroupRuns']).toBeGreaterThan(0);
    expect(grouped.status).toBe(0);
  });

  it('static.budgetMs: once it is spent no static unit starts, and what is undecided is Ignored, not scored', () => {
    const alone = groupRun('static-group', 'src/table.ts', [LOADERS]);
    const spent = groupRun('static-group', 'src/table.ts', [LOADERS, '--static-budget', '1']);
    // A millisecond is gone before the second unit starts. What a unit already running found stands,
    // and it is what the mutant gets alone; nothing is called Survived on part of its files.
    expect(spent.verdicts.length).toBe(alone.verdicts.length);
    expect(spent.verdicts.filter((v, i) => v !== alone.verdicts[i]).every((v) => v.endsWith(':Ignored'))).toBe(true);
    expect(spent.verdicts.some((v) => v.endsWith(':Ignored'))).toBe(true);
    expect(spent.verdicts.some((v) => v.endsWith(':Survived'))).toBe(false);
    expect(spent.stats['isolatedRuns']).toBe(0);
    expect(spent.status).toBe(0);
    // A budget the phase fits in changes nothing.
    expect(groupRun('static-group', 'src/table.ts', [LOADERS, '--static-budget', '600000']).verdicts).toEqual(alone.verdicts);
  });

  it('static.readers reports the tests where each static value is read, and changes no verdict', () => {
    const plain = groupRun('static-group', 'src/table.ts', ['--no-static-readers']);
    // The fixture: alpha.spec reads row 0, copy.spec reads row 1 through a copy made while its file
    // loads, loads.spec loads the module and reads nothing. One test each.
    const readers = groupRun('static-readers', 'src/hosts.ts', ['--report-static-readers']);
    const off = groupRun('static-readers', 'src/hosts.ts', ['--no-static-readers']);
    expect(readers.stats['staticReaders'] as unknown).toEqual({ mutants: 8, loaderTests: 24, readerTests: 11, fellBack: 2, dryRunMs: expect.any(Number) as number });
    // A report only: the verdicts are the ones a run without it gives.
    expect(readers.verdicts).toEqual(off.verdicts);
    expect(plain.stats['staticReaders']).toBeUndefined();
    expect(off.stats['staticReaders']).toBeUndefined();
  });

  it('static.readers skips its second dry run when every tracked module has one loading file', () => {
    const on = groupRun('static-one-loader', 'src/rows.ts', []);
    const off = groupRun('static-one-loader', 'src/rows.ts', ['--no-static-readers']);
    expect(on.verdicts.length).toBeGreaterThan(0);
    expect(on.verdicts).toEqual(off.verdicts);
    // No tracking run took place: there was no file to leave out.
    expect(on.stats['staticReaders']).toBeUndefined();
  });

  it('static.readers in use gives every mutant the verdict it gets in every loader, and the audit agrees', () => {
    for (const [name, file] of [['static-readers', 'src/hosts.ts'], ['static-group', 'src/table.ts'], ['static-const', 'src/limits.ts']] as const) {
      const off = groupRun(name, file, ['--no-static-readers']);
      const on = groupRun(name, file, ['--static-readers'], { OXMUTATE_STATIC_AUDIT: 'all' });
      expect(off.verdicts.length).toBeGreaterThan(0);
      expect(on.verdicts).toEqual(off.verdicts);
      expect(on.status).toBe(0);
    }
    const on = groupRun('static-readers', 'src/hosts.ts', ['--static-readers'], { OXMUTATE_STATIC_AUDIT: 'all' });
    const sr = on.stats['staticReaders'] as unknown as { readerTests: number; loaderTests: number; auditSampled: number; auditDisagreed: number };
    // It ran fewer tests than every loader holds, and audited the survivors that ran in fewer files.
    expect(sr.readerTests).toBeLessThan(sr.loaderTests);
    expect(sr.auditSampled).toBeGreaterThan(0);
    expect(sr.auditDisagreed).toBe(0);
  });

  it('cold workers and an idle timeout give every mutant the warm verdict', () => {
    const warm = groupRun('static-group', 'src/table.ts', ['--worker-idle-timeout', '0']);
    const cold = groupRun('static-group', 'src/table.ts', ['--cold-workers']);
    const quick = groupRun('static-group', 'src/table.ts', ['--worker-idle-timeout', '1']);
    expect(warm.verdicts.length).toBeGreaterThan(0);
    expect(cold.verdicts).toEqual(warm.verdicts);
    expect(quick.verdicts).toEqual(warm.verdicts);
    // A 1 ms idle timeout closes the spare and every server between phases.
    expect(warm.stats['serversReleased']).toBe(0);
    expect(quick.stats['serversReleased']).toBeGreaterThan(0);
  });

  it('cold workers start a server for each unit of ordinary mutants, with the warm verdicts', () => {
    // Pollution restarts are what split this fixture into units; recovered in place it is one, so the restart path keeps the premise.
    const restarts = { OXMUTATE_ISOLATE_POLLUTION: '1' };
    const warmUnits = groupRun('batch-leftover', 'src/registry.ts', ['--worker-idle-timeout', '0'], restarts);
    const coldUnits = groupRun('batch-leftover', 'src/registry.ts', ['--cold-workers'], restarts);
    expect(coldUnits.verdicts).toEqual(warmUnits.verdicts);
    expect(coldUnits.stats['serversSpawned']).toBeGreaterThan(warmUnits.stats['serversSpawned'] ?? 0);
  });

  it('a pair that hides each other is found by the audit: both Killed, and the run fails', () => {
    const alone = groupRun('static-mask', 'src/pair.ts', []);
    // Lines 3 and 4 are the pair.
    expect(alone.verdicts.filter((v) => /^[34]:/u.test(v))).toEqual(['3:14:StringLiteral:Killed', '4:15:StringLiteral:Killed']);
    const grouped = groupRun('static-mask', 'src/pair.ts', ['--static-group', '4'], { OXMUTATE_STATIC_AUDIT: 'all' });
    expect(grouped.verdicts).toEqual(alone.verdicts);
    expect(grouped.stats['staticAuditDisagreed']).toBe(2);
    expect(grouped.status).toBe(1);
    expect(grouped.stderr).toMatch(/2 mutant\(s\) reported as survivors by a group were killed when run alone/u);
  });
});

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
    // Every isolated run has a cause, and a warm server's time inside test runs is part of its time.
    expect(Object.values(stats.isolatedByCause).reduce((sum, n) => sum + n, 0)).toBe(stats.isolatedRuns);
    expect(stats.warmArmedMs).toBeLessThanOrEqual(stats.warmUnitMs);
    // The three mutants are one batch: re-collected unarmed after the first, then after the next two
    // together, not after each (runner.ts, staticwarm.qnt `grouped`). The verdicts above are unchanged.
    expect(stats.staticRecollections).toBe(2);
  }, 60_000);

  it('a global set at import does not carry one mutant value into the next', () => {
    const { verdicts, stats } = staticRun('static-leak', 'src/mode.ts');
    expect(verdicts).toEqual(['4:StringLiteral:Killed', '5:AssignmentOperator:Killed']);
    // Each fallback to a fresh worker says why and how many mutants it sent, and the isolated phase
    // says what it spent on them: one stage, both mutants, one unit at a time.
    expect(stats.staticFallbacks).toEqual({ 'the file changed globals while it was collected: g:__fixtureMode': 2 });
    expect(stats.isolatedStages).toEqual([{ stage: 'first', mutants: 2, ms: expect.any(Number) as number, peak: 1 }]);
    expect(stats.isolatedStages?.[0]?.ms).toBeGreaterThan(0);
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

/**
 * T6 waits on events, never on a clock that guesses how busy the machine is. At load 25–35 these
 * cases found servers alive 5 s after the kill in 3 of 5 pre-push runs (2026-11-02); at load 200
 * a server took 25 s to start and up to 21 s to notice its coordinator was gone, and then went
 * (2026-11-12): slow, not orphaned. So each case kills on a marker the fixture writes when a server
 * is where the case needs it, and gives the servers until GONE_MS to go — a ceiling that only
 * bounds a hang, which is what an orphan is. Alone, every wait ends on its event. START_MS bounds
 * reaching the marker: at load ~200 one run took over 45 s to get its server into the spinning test.
 */
const START_MS = 90_000;
const GONE_MS = 60_000;
const T6_CASE_MS = START_MS + GONE_MS + 30_000;
const until = async (done: () => boolean, ceiling: number): Promise<boolean> => {
  for (const start = Date.now(); Date.now() - start < ceiling; await new Promise((r) => setTimeout(r, 50))) if (done()) return true;
  return done();
};
const markers = (dir: string, kind: string): string[] => readdirSync(dir).filter((f) => f.startsWith(`m.${kind}-`));

/** Runs a fixture, kills its coordinator once `ready` holds, and waits for its servers to go. */
const t6Run = async (fixture: string, ready: (marks: string) => boolean): Promise<{ started: boolean; servers: number[]; left: number[]; marks: string }> => {
  const dir = path.join(pkg, 'test/fixtures', fixture);
  const marks = mkdtempSync(path.join(tmpdir(), 'oxmutate-t6-'));
  const run = spawn(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', path.join(dir, 'reports'), '--reporter', 'json'], {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, OXMUTATE_E2E_MARKER: path.join(marks, 'm') },
  });
  const started = await until(() => ready(marks), START_MS);
  const servers = spawnSync('pgrep', ['-P', String(run.pid)], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(Number);
  run.kill('SIGKILL');
  await until(() => !servers.some(alive), GONE_MS);
  const left = servers.filter(alive);
  for (const pid of left) process.kill(pid, 'SIGKILL');
  discard(path.join(dir, 'reports'));
  return { started, servers, left, marks };
};

// A coordinator that dies while its servers are still loading Vitest: a server listened for the
// disconnect only once Vitest had loaded, so it outlived its coordinator until then. The fixture's
// config holds each server inside `createVitest` for 60 s and marks both ends of the load.
it.skipIf(!native || !existsSync(bin))('leaves no server running when the coordinator dies while its servers load Vitest (T6)', async () => {
  const { started, servers, left, marks } = await t6Run('slow-start', (m) => markers(m, 'loading').length > 0);
  const loaded = markers(marks, 'loaded');
  discard(marks);
  expect(started, 'a server reached the config load').toBe(true);
  expect(servers.length).toBeGreaterThan(0);
  expect(left).toEqual([]);
  // The event, not a clock: no server finished a load that its dead coordinator could not use.
  expect(loaded).toEqual([]);
}, T6_CASE_MS);

// The orphans found on 2026-10-27 were servers whose worker thread was looping in a test.
it.skipIf(!native || !existsSync(bin))('leaves no server running when the coordinator is killed mid-runaway (T6)', async () => {
  const { started, servers, left, marks } = await t6Run('spin', (m) => markers(m, 'spinning').length > 0);
  discard(marks);
  expect(started, 'a server reached the spinning test').toBe(true);
  expect(servers.length).toBeGreaterThan(0);
  expect(left).toEqual([]);
}, T6_CASE_MS);

// A warm run blocked in a synchronous child, past its budget at almost no CPU, is given its 3x in
// place: on compat-oracle every such stop killed a server and re-ran the mutant (2026-11-15).
it.skipIf(!native || !existsSync(bin) || !nightly || process.platform === 'win32')('gives a blocked warm run its 3x in place, with no server restart and the same verdicts', () => {
  const run = groupRun('blocked-grace', 'src/size.ts', []);
  expect(run.verdicts.length).toBeGreaterThan(0);
  expect(run.verdicts.every((v) => v.endsWith(':Killed'))).toBe(true);
  expect(run.stats['watchdogGraced']).toBeGreaterThan(0);
  expect(run.stats['watchdogKills']).toBe(0);
}, 120_000);

// A test's temporary files go in the run's work directory and are removed with it: killed tests
// never clean up, and runs had left 27,562 entries in the system's temporary directory (2026-11-15).
it.skipIf(!native || !existsSync(bin))('removes what tests left in the temporary directory when the run ends', () => {
  const dir = path.join(pkg, 'test/fixtures/tmp-leak');
  const marks = mkdtempSync(path.join(tmpdir(), 'oxmutate-leaks-'));
  spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', path.join(dir, 'reports'), '--reporter', 'json'], {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, OXMUTATE_E2E_MARKER: path.join(marks, 'm') },
  });
  const left = markers(marks, 'leak').map((f) => readFileSync(path.join(marks, f), 'utf8'));
  const stayed = left.filter((p) => existsSync(p));
  for (const p of stayed) rmSync(p, { recursive: true, force: true });
  discard(marks);
  discard(path.join(dir, 'reports'));
  expect(left.length, 'a mutant run left scratch').toBeGreaterThan(0);
  expect(stayed).toEqual([]);
}, 120_000);

/** The pids of the children the spawn-child fixture's tests started, from their markers. */
const childPids = (marks: string): number[] => markers(marks, 'child').map((f) => Number(f.slice('m.child-'.length)));

// A SIGKILLed server's children were re-parented and lived on: compat-oracle's uvu runners, 8 in one
// 12-minute warm phase (2026-11-15). A server leads its own process group, and a kill takes the group.
it.skipIf(!native || !existsSync(bin) || !nightly || process.platform === 'win32')('takes the processes a test started with a server the watchdog kills', async () => {
  const dir = path.join(pkg, 'test/fixtures/spawn-child');
  const marks = mkdtempSync(path.join(tmpdir(), 'oxmutate-children-'));
  const r = spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', path.join(dir, 'reports'), '--reporter', 'json'], {
    cwd: dir,
    stdio: 'ignore',
    env: { ...process.env, OXMUTATE_E2E_MARKER: path.join(marks, 'm') },
  });
  const children = childPids(marks);
  await until(() => !children.some(alive), GONE_MS);
  const left = children.filter(alive);
  for (const p of left) process.kill(p, 'SIGKILL');
  discard(marks);
  discard(path.join(dir, 'reports'));
  expect(r.status).not.toBeNull();
  expect(children.length, 'the mutant run started a child').toBeGreaterThan(0);
  expect(left).toEqual([]);
}, T6_CASE_MS);

it.skipIf(!native || !existsSync(bin) || process.platform === 'win32')('takes the processes a test started with a server whose coordinator dies (T6)', async () => {
  const { started, left, marks } = await t6Run('spawn-child', (m) => markers(m, 'child').length > 0);
  const children = childPids(marks);
  await until(() => !children.some(alive), GONE_MS);
  const orphans = children.filter(alive);
  for (const p of orphans) process.kill(p, 'SIGKILL');
  discard(marks);
  expect(started, 'a test started its child').toBe(true);
  expect(left).toEqual([]);
  expect(orphans).toEqual([]);
}, T6_CASE_MS);

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

// A mutant stopped at 1x gets its 3x run as soon as it is stopped, in the pool beside the rest, not
// after the last of the first stage (pathe: two serial tails of 36 and 38 s for 2 to 5 mutants). The
// fixture's other mutant runs 7 s, longer than the first one's stop, so the re-run is queued while the
// first stage is still draining: `at`, when it was queued, is before that stage ended. The verdicts are
// the serial ones: the slow test is Killed on its re-run, the other mutant is Killed.
it.skipIf(!native || !existsSync(bin) || !nightly)('queues a stopped mutant\'s 3x run while the first stage is still running', () => {
  const dir = path.join(pkg, 'test/fixtures/chase');
  const reportDir = path.join(dir, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  mkdirSync(reportDir, { recursive: true });
  try {
    execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe', env: { ...process.env, OXMUTATE_ISOLATE_STATIC: '1' } });
    const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as {
      files: Record<string, { mutants: ReportMutant[] }>;
      'x-oxmutate': { stats: { timeoutsOverturned: number; isolatedStages: { stage: string; mutants: number; ms: number; at?: number }[] } };
    };
    expect(Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.status))).toEqual(['Killed', 'Killed']);
    const { timeoutsOverturned, isolatedStages } = report['x-oxmutate'].stats;
    expect(timeoutsOverturned).toBe(1);
    const first = isolatedStages.find((x) => x.stage === 'first');
    const rerun = isolatedStages.find((x) => x.stage === 'rerun');
    expect(rerun?.mutants).toBe(1);
    expect(rerun?.at).toBeLessThan(first?.ms ?? 0);
  } finally {
    discard(reportDir);
  }
}, 120_000);

// A warm run's limit is the running test's own, not the budget of the slowest test that covers the
// mutant. The fixture's two tests cover one line; the slower takes 1.5 s, which sized every limit on
// that line (5 s, and a 10 s grace for a worker blocked in a call). A mutant that blocks the 1 ms test
// for ever is now stopped at that test's limit (about 0.8 s, and 2.3 s with the grace). Both builds
// reach the same verdicts: the two hangs are Timeout, the survivor survives.
it.skipIf(!native || !existsSync(bin) || !nightly)('stops a mutant at the limit of the test it hangs, not of the slowest test that covers it', () => {
  const dir = path.join(pkg, 'test/fixtures/budget');
  const reportDir = path.join(dir, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  mkdirSync(reportDir, { recursive: true });
  try {
    // A survivor makes the run exit 1: the report is what is read.
    spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe' });
    const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as {
      files: Record<string, { mutants: (ReportMutant & { mutatorName: string })[] }>;
      'x-oxmutate': { stats: { warmStopsMs: number[] } };
    };
    const verdicts = (report.files['src/pause.ts']?.mutants ?? []).map((m) => `${m.mutatorName} ${String(m.replacement)}: ${m.status}`);
    expect(verdicts).toEqual(expect.arrayContaining(['BooleanLiteral fast: Timeout', 'ConditionalExpression true: Timeout', 'ConditionalExpression false: Survived']));
    // The hang in the 1 ms test is stopped at that test's limit; the same mutant in the 1.5 s test, in the other file, at that one's.
    const stops = report['x-oxmutate'].stats.warmStopsMs;
    expect(stops.length).toBeGreaterThan(0);
    expect(Math.min(...stops)).toBeLessThan(5000);
  } finally {
    discard(reportDir);
  }
}, 120_000);

// A mutant whose run kills its worker's process (the kernel's out-of-memory kill, a signal from
// outside) is a RuntimeError, and its reason says how the process ended: a SIGKILL reads as one, so a
// crash the mutant did not cause (a neighbour's memory pressure) can be told from one it did.
it.skipIf(!native || !existsSync(bin) || !nightly)('says how the worker ended when a mutant takes it down', () => {
  const dir = path.join(pkg, 'test/fixtures/crash');
  const reportDir = path.join(dir, 'reports');
  // The warm run decides the crash, and with every mutant run in a fresh worker the isolated path does.
  for (const env of [{}, { OXMUTATE_ISOLATE_ALL: '1' }]) {
    rmSync(reportDir, { recursive: true, force: true });
    mkdirSync(reportDir, { recursive: true });
    try {
      spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe', env: { ...process.env, ...env } });
      const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: (ReportMutant & { statusReason?: string })[] }> };
      const crashed = (report.files['src/boom.ts']?.mutants ?? []).filter((m) => m.status === 'RuntimeError');
      expect(crashed.map((m) => m.statusReason), JSON.stringify(env)).toEqual(['the worker crashed while this mutant ran (signal SIGKILL)']);
    } finally {
      discard(reportDir);
    }
  }
}, 120_000);

// A mutant whose worker went down is run once more, alone in a fresh worker, before it is a
// RuntimeError: the crash may be a neighbour's (memory pressure on a busy machine). The fixture's hog
// takes down every sibling worker of the run the first time it is armed, while the innocent sibling is
// mid-test, and only itself after that. The sibling gets its real verdict; the hog, which crashes
// alone too, stays a RuntimeError. Without the re-run both were RuntimeErrors.
it.skipIf(!native || !existsSync(bin) || !nightly || process.platform === 'win32')('runs a mutant whose worker went down once alone: a neighbour\'s crash is not its verdict', () => {
  const dir = path.join(pkg, 'test/fixtures/hog');
  const reportDir = path.join(dir, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  mkdirSync(reportDir, { recursive: true });
  try {
    spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe' });
    const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as {
      files: Record<string, { mutants: (ReportMutant & { mutatorName: string; statusReason?: string })[] }>;
      'x-oxmutate': { stats: { isolatedByCause: { crashed: number } } };
    };
    const verdicts = (file: string): string[] => (report.files[file]?.mutants ?? []).filter((m) => m.status !== 'Survived' && m.status !== 'NoCoverage').map((m) => `${m.mutatorName} ${String(m.replacement)}: ${m.status}`);
    expect(verdicts('src/sibling.ts')).toEqual(['ArrowFunction () => undefined: Killed', 'NumericLiteral 0: Killed']);
    expect(verdicts('src/hog.ts')).toEqual(['ConditionalExpression true: RuntimeError']);
    const hog = report.files['src/hog.ts']?.mutants.find((m) => m.status === 'RuntimeError');
    expect(hog?.statusReason).toBe('the worker crashed while this mutant ran (signal SIGKILL)');
    // Both went down in the warm run; each ran once alone.
    expect(report['x-oxmutate'].stats.isolatedByCause.crashed).toBeGreaterThanOrEqual(2);
  } finally {
    discard(reportDir);
  }
}, 180_000);

// A mutant that loops with no switch in the loop (no hit count can stop it) is stopped by the watchdog in
// the warm run. That stop was then run isolated at 1x, stopped again, and run at 3x: ufo's punycode.ts
// spent 2.3 s of its 9.2 on the 1x run (2026-11-20). The warm stop is the first look, so the isolated
// run gets the 3x at once: the verdict is the same Timeout, one isolated run is spent, not two.
it.skipIf(!native || !existsSync(bin) || !nightly)('runs a mutant the warm run stopped busy once, at 3x, not at 1x and again at 3x', () => {
  const dir = path.join(pkg, 'test/fixtures/runaway');
  try {
    const r = runWith(dir, {});
    expect(r.status, r.out).toBe(0);
    const report = JSON.parse(readFileSync(path.join(r.reports, 'mutation.json'), 'utf8')) as {
      files: Record<string, { mutants: ReportMutant[] }>;
      'x-oxmutate': { stats: { isolatedRuns: number; isolatedByCause: { stopped: number; rerun: number } } };
    };
    const mutants = report.files['src/drain.ts']?.mutants ?? [];
    // `step = 0` never lets the loop end; `left += step` is stopped by the hit limit, the loop reading `step` each time.
    expect(mutants.filter((m) => m.status === 'Timeout').map((m) => m.replacement)).toEqual(['0', 'left += step']);
    expect(mutants.filter((m) => m.status !== 'Timeout' && m.status !== 'Killed')).toEqual([]);
    expect(report['x-oxmutate'].stats.isolatedByCause).toMatchObject({ stopped: 1, rerun: 0 });
    expect(report['x-oxmutate'].stats.isolatedRuns).toBe(1);
  } finally {
    discard(path.join(dir, 'reports'));
  }
}, 180_000);

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

it.skipIf(!native || !existsSync(bin) || !nightly)('keeps the pool the project’s Vitest config asks for: tests that call process.chdir run in forks', () => {
  const dir = path.join(pkg, 'test/fixtures/forks-pool');
  try {
    // Threads would fail the dry run: "process.chdir() is not supported in workers".
    const r = runWith(dir, {});
    expect(r.out).not.toMatch(/fail with no mutant active/);
    expect(r.status).toBe(0);
  } finally {
    discard(path.join(dir, 'reports'));
  }
}, 60_000);

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

// The dry run is slower than the project's own run (it counts coverage per test), and a test near
// its timeout failed there alone: unjs/pathe's run stopped at "1 test(s) fail with no mutant active"
// (2026-11-19). Its tests get 3x their timeouts in the dry run (child.ts DRY_TIMEOUT_SCALE).
it.skipIf(!native || !existsSync(bin))('a test that overruns its timeout only in the dry run passes it, and its mutants are scored', () => {
  const dir = path.join(pkg, 'test/fixtures/dry-timeout');
  try {
    const r = runWith(dir, {});
    expect(r.status, r.out).toBe(0);
    const mutants = (JSON.parse(readFileSync(path.join(r.reports, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }> }).files['src/label.ts']?.mutants ?? [];
    expect(mutants.length).toBeGreaterThan(0);
    expect(mutants.map((m) => m.status)).toEqual(mutants.map(() => 'Killed'));
  } finally {
    discard(path.join(dir, 'reports'));
  }
});

// A `beforeAll` that times out or throws in the dry run makes Vitest skip its tests, so no test covers
// the code and every mutant is NoCoverage with the run passing (found on 2.9.0, 2026-11-19). The dry
// run fails like a failing test does, naming the hook's file and the fix.
it.skipIf(!native || !existsSync(bin))('fails the dry run, naming the file, when a beforeAll hook times out or throws', () => {
  const dir = path.join(pkg, 'test/fixtures/dry-hook');
  try {
    const r = runWith(dir, {});
    expect(r.status, r.out).not.toBe(0);
    expect(r.out).toContain('2 beforeAll/afterAll hook(s) failed with no mutant active');
    expect(r.out).toContain('src/slow-hook.spec.ts: Hook timed out');
    expect(r.out).toContain('src/throwing-hook.spec.ts: fixture cannot start');
    expect(r.out).toContain('fix: make the hook pass in the dry run');
  } finally {
    discard(path.join(dir, 'reports'));
  }
});

// Flaky re-runs are for verdicts a flaky test could have decided. A mutant a steady test in another
// file killed fails the same way on every re-run, so it is not re-run (flaky.ts).
it.skipIf(!native || !existsSync(bin) || !nightly)('re-runs the mutants only a flaky test killed, not those a steady test killed', () => {
  const dir = path.join(pkg, 'test/fixtures/flaky-scope');
  mkdirSync(path.join(dir, 'reports'), { recursive: true });
  const reports = mkdtempSync(path.join(dir, 'reports', 'case-'));
  try {
    const r = spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reports, '--reporter', 'json'], { cwd: dir, encoding: 'utf8', env: { ...process.env, OXMUTATE_FLAKY_COUNTER: path.join(reports, 'runs') } });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    const report = JSON.parse(readFileSync(path.join(reports, 'mutation.json'), 'utf8')) as {
      files: Record<string, { mutants: ReportMutant[] }>;
      'x-oxmutate': { stats: { flakyTests: number; isolatedByCause: { flaky: number } } };
    };
    const mutants = report.files['src/calc.ts']?.mutants ?? [];
    const inAdd = mutants.filter((m) => m.location.start.line <= 4); // `add`, lines 2-4: killed by steady.spec.ts
    const inSub = mutants.filter((m) => m.location.start.line >= 7 && m.location.start.line <= 9); // `sub`: killed only by the flaky test
    expect(report['x-oxmutate'].stats.flakyTests).toBe(1);
    expect(inAdd.length).toBeGreaterThan(0);
    expect(inSub.length).toBeGreaterThan(0);
    expect([...inAdd, ...inSub].map((m) => m.status)).toEqual([...inAdd, ...inSub].map(() => 'Killed'));
    // flakyReruns is 2: each `sub` mutant twice, and no `add` mutant (the build before re-ran both).
    expect(report['x-oxmutate'].stats.isolatedByCause.flaky).toBe(2 * inSub.length);
  } finally {
    discard(path.join(dir, 'reports'));
  }
}, 60_000);

describe.skipIf(!native || !existsSync(bin) || !nightly)('the frozen oracle (R14, SC10)', () => {
  const registry = path.join(pkg, 'test/fixtures/registry');
  // A git repository of its own, inside the fixture's ignored reports/, so Vitest still resolves.
  const repo = path.join(registry, 'reports', 'frozen-repo');
  const spec = path.join(repo, 'src/registry.spec.ts');
  const git = (...args: string[]): void => {
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, stdio: 'pipe', env: withoutGit() });
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
// Since quiescence.ts the worker calls the wait a deadlock itself, so the case no longer waits out
// a budget and runs on every pull request again (staged spec oxmutate-load-robust, L1).
// In process, through the built package's API: the CLI's exit adds seconds this test does not need.
// The mutant is static and sent straight to the fresh-worker path, whose watchdog this checks.
// The worker's own call needs process.threadCpuUsage (Node 23.9+); below it the watchdog stops the wait.
it.skipIf(!native || !existsSync(bin) || !('threadCpuUsage' in process))('scores a mutant whose test deadlocks Timeout, called by its own worker: no watchdog stop, no re-run', async () => {
  const dir = path.join(pkg, 'test/fixtures/stall');
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built package under test, present only after a build; the test is skipped without it
  const api = (await import(path.join(pkg, 'dist/index.js'))) as typeof import('./index.js');
  process.env['OXMUTATE_ISOLATE_STATIC'] = '1';
  try {
    const result = await api.run(await api.loadOptions(dir, { reporters: [] }, path.join(dir, 'oxmutate.config.json')));
    // The executor's emptied body, the hang; the string is excluded, so the run is the one mutant.
    expect(result.mutants.map((m) => `${m.mutatorName}:${m.status}`)).toEqual(['BlockStatement:Timeout', 'StringLiteral:Ignored']);
    // The worker saw nothing left that could resume the test and failed it itself (quiescence.ts),
    // in about 0.5 s: the watchdog never waited out its 4.5 s budget, and no server was killed.
    expect(result.stats).toMatchObject({ watchdogKills: 0, idleStalls: 0, deadlocks: 1, timeoutsOverturned: 0 });
    expect(result.mutants[0]?.statusReason).toMatch(/deadlocked/);
    // A Timeout is detected: the score is the one the Killed verdict gave.
    expect(result.score).toMatchObject({ detected: 1, total: 1, mutationScore: 100 });
  } finally {
    delete process.env['OXMUTATE_ISOLATE_STATIC'];
  }
}, 60_000);

// A mutant that writes into the project is caught after its unit, its write put back, and the verdicts
// that ran on the changed project run again. compat-oracle's vendor step, its staging path emptied to
// "", wrote a fake host's package.json over the package's own and every later mutant ran on a broken
// package for four hours (#1453). Here the stray directory fails a suite that reads its project, so
// without the guard every mutant after the write is a false kill (diskguard.ts).
it.skipIf(!native || !existsSync(bin))('puts back what a mutant writes into the project, names it, and re-runs the verdicts the write could change', async () => {
  const dir = path.join(pkg, 'test/fixtures/disk-write');
  const stray = path.join(dir, 'copy');
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built package under test, present only after a build; the test is skipped without it
  const api = (await import(path.join(pkg, 'dist/index.js'))) as typeof import('./index.js');
  try {
    const result = await api.run(await api.loadOptions(dir, { reporters: [] }, path.join(dir, 'oxmutate.config.json')));
    expect(existsSync(stray)).toBe(false);
    expect(result.stats.diskWrites).toBeGreaterThanOrEqual(1);
    expect(result.mutants.filter((m) => m.wrote).map((m) => [m.mutatorName, m.wrote])).toEqual([['StringLiteral', ['copy']]]);
    // No test pins `shout` down: on a clean project every one of its mutants survives.
    const shout = result.mutants.filter((m) => m.start.line === 21 && m.status !== 'Ignored');
    expect(shout.length).toBeGreaterThan(0);
    expect([...new Set(shout.map((m) => m.status))]).toEqual(['Survived']);
  } finally {
    discard(stray);
  }
}, 60_000);

// The incremental cache reuses a verdict only when nothing it rested on changed. The mutated file and
// the test file stay the same here; the helper the test asserts through stops checking anything, so
// the mutant that was killed now survives. The old fingerprint (mutated source + covering test files)
// reused the stale Killed; the module graph of the test, from the dry run, is in the fingerprint now.
it.skipIf(!native || !existsSync(bin))('decides a mutant afresh when a module its test imports changed, not from the cache', async () => {
  const fixture = path.join(pkg, 'test/fixtures/incremental-graph');
  // Inside the package, so the copy resolves Vitest as the fixture does.
  const dir = mkdtempSync(path.join(pkg, 'test/fixtures/.incremental-graph-'));
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built package under test, present only after a build; the test is skipped without it
  const api = (await import(path.join(pkg, 'dist/index.js'))) as typeof import('./index.js');
  try {
    for (const f of ['package.json', 'oxmutate.config.json', 'vitest.config.mjs', 'src/sum.ts', 'src/check.ts', 'src/sum.spec.ts']) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), readFileSync(path.join(fixture, f)));
    }
    const run = async (): Promise<Awaited<ReturnType<typeof api.run>>> => api.run(await api.loadOptions(dir, { reporters: [] }, path.join(dir, 'oxmutate.config.json')));
    const plus = (r: Awaited<ReturnType<typeof api.run>>): string | undefined => r.mutants.find((m) => m.mutatorName === 'ArithmeticOperator')?.status;
    expect(plus(await run())).toBe('Killed');
    writeFileSync(path.join(dir, 'src/check.ts'), 'export const TARGET = 5;\nexport const isTarget = (_got: number): boolean => true;\n');
    const second = await run();
    expect(plus(second)).toBe('Survived');
    expect(second.mutants.find((m) => m.mutatorName === 'ArithmeticOperator')?.reused).toBeFalsy();
  } finally {
    discard(dir);
  }
}, 90_000);

// Roadmap 3.3: under `incremental` a test file's dry run is kept while nothing it depends on
// changed. Each change below must send the file it touches back to the dry run, and only that one;
// a change the key cannot see (a file read through fs) must be caught by the audit.
it.skipIf(!native || !existsSync(bin) || !nightly)('keeps a test file\'s dry run until its source, its test, its mutants or the config change', async () => {
  const fixture = path.join(pkg, 'test/fixtures/dry-reuse');
  const dir = mkdtempSync(path.join(pkg, 'test/fixtures/.dry-reuse-'));
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built package under test, present only after a build; the test is skipped without it
  const api = (await import(path.join(pkg, 'dist/index.js'))) as typeof import('./index.js');
  try {
    for (const f of ['package.json', 'oxmutate.config.json', 'vitest.config.mjs', 'src/double.ts', 'src/label.ts', 'src/double.spec.ts', 'src/label.spec.ts', 'src/mode.txt']) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), readFileSync(path.join(fixture, f)));
    }
    const run = async (overrides: Partial<Parameters<typeof api.loadOptions>[1]> = {}): Promise<Awaited<ReturnType<typeof api.run>>> => api.run(await api.loadOptions(dir, { reporters: [], ...overrides }, path.join(dir, 'oxmutate.config.json')));
    const verdicts = (r: Awaited<ReturnType<typeof api.run>>): string[] => r.mutants.map((m) => `${m.file}:${String(m.start.line)}:${String(m.start.column)}:${m.mutatorName}:${m.status}`).sort();
    const edit = (f: string, text: string): void => writeFileSync(path.join(dir, f), text);
    // The 1-in-20 audit would make the counts below random; it has a step of its own at the end.
    process.env['OXMUTATE_DRY_AUDIT'] = 'none';
    const first = await run();
    expect(first.stats.dryReuse).toBeUndefined();
    const second = await run();
    expect(second.stats.dryReuse?.kept).toBe(2);
    expect(verdicts(second)).toEqual(verdicts(first));
    // A source the file loads, with its mutants unchanged.
    edit('src/double.ts', `${readFileSync(path.join(fixture, 'src/double.ts'), 'utf8')}// changed\n`);
    expect((await run()).stats.dryReuse?.kept).toBe(1);
    // The test file itself (in its own module graph).
    edit('src/double.spec.ts', `${readFileSync(path.join(fixture, 'src/double.spec.ts'), 'utf8')}\nit('doubles zero', () => {\n  expect(double(0)).toBe(0);\n});\n`);
    expect((await run()).stats.dryReuse?.kept).toBe(1);
    // The mutants instrumented in a module of its graph.
    expect((await run({ mutate: ['src/double.ts', 'src/label.ts:1:0-1:30'] })).stats.dryReuse?.kept).toBe(1);
    // The Vitest config.
    edit('vitest.config.mjs', `${readFileSync(path.join(fixture, 'vitest.config.mjs'), 'utf8')}// changed\n`);
    expect((await run()).stats.dryReuse?.kept).toBe(0);
    expect((await run()).stats.dryReuse?.kept).toBe(2);
    // Read through fs, outside every key: the audit runs the kept file, sees its test reach nothing
    // now, and runs the whole suite again. Kept, label's mutants would still count its test as covering them.
    edit('src/mode.txt', 'skip\n');
    process.env['OXMUTATE_DRY_AUDIT'] = 'all';
    const audited = await run();
    expect(audited.stats.dryReuse).toMatchObject({ kept: 0, disagreed: 1 });
    expect(audited.mutants.filter((m) => m.file === 'src/label.ts').flatMap((m) => m.coveredBy)).toEqual([]);
  } finally {
    delete process.env['OXMUTATE_DRY_AUDIT'];
    discard(dir);
  }
}, 180_000);

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

it.skipIf(!native || !existsSync(bin))('kills a mutant whose only effect is an unhandled rejection, as a failing vitest run does', async () => {
  const dir = path.join(pkg, 'test/fixtures/unhandled');
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built package under test, present only after a build; the test is skipped without it
  const api = (await import(path.join(pkg, 'dist/index.js'))) as typeof import('./index.js');
  const result = await api.run(await api.loadOptions(dir, { reporters: [] }, path.join(dir, 'oxmutate.config.json')));
  const keepsTheGap = result.mutants.filter((m) => m.start.line === 7 && (m.replacement === 'true' || m.mutatorName === 'EqualityOperator'));
  expect(keepsTheGap.map((m) => m.status)).toEqual(['Killed', 'Killed']);
}, 60_000);

it.skipIf(!native || !existsSync(bin))('refuses a suite that raises an unhandled error with no mutant active', async () => {
  const dir = path.join(pkg, 'test/fixtures/unhandled-baseline');
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built package under test, present only after a build; the test is skipped without it
  const api = (await import(path.join(pkg, 'dist/index.js'))) as typeof import('./index.js');
  await expect(api.run(await api.loadOptions(dir, { reporters: [] }, path.join(dir, 'oxmutate.config.json')))).rejects.toThrow(/\d+ unhandled error\(s\) with no mutant active/u);
}, 60_000);

// The dry run's run-once probe runs a test a second time. Its `toMatchSnapshot()` then read as the
// test's second snapshot, and Vitest wrote it into the project's snapshot file: a dry run of burgee
// added 90 lines to two committed `.snap` files (2026-11-06).
it.skipIf(!native || !existsSync(bin))("writes nothing into the project's snapshot files during the dry run", async () => {
  const dir = path.join(pkg, 'test/fixtures/probe-snapshot');
  const snap = path.join(dir, 'src/__snapshots__/greet.spec.ts.snap');
  const before = readFileSync(snap, 'utf8');
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the built package under test, present only after a build; the test is skipped without it
  const api = (await import(path.join(pkg, 'dist/index.js'))) as typeof import('./index.js');
  try {
    await api.run(await api.loadOptions(dir, { reporters: [], dryRunOnly: true }, path.join(dir, 'oxmutate.config.json')));
    expect(readFileSync(snap, 'utf8')).toBe(before);
  } finally {
    writeFileSync(snap, before);
  }
}, 60_000);

it.skipIf(!native || !existsSync(bin) || !nightly)('keeps a survivor whose confirmation run was only slow, not killed', () => {
  const dir = path.join(pkg, 'test/fixtures/slow-survivor');
  const reportDir = path.join(dir, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  mkdirSync(reportDir, { recursive: true });
  // The fresh-worker path, whose watchdog this checks: the fixture stalls only when armed through the environment.
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe', env: { ...process.env, OXMUTATE_LIVE_CONFIRM: '' } });
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

// Survivor confirmation (6b, confirm.qnt): reset() emptied passes each test alone and fails the
// second after the first, so only a run armed across the file kills it. It runs in a live worker
// (`LIVE`) and must reach the fresh-worker path's verdicts: the cross-test kill, and touch()'s
// survivors, which a confirmation that ran the non-covering test's body would kill.
describe.skipIf(!native || !existsSync(bin) || !nightly)('survivor confirmation in a live worker', () => {
  type Confirmed = { verdicts: string[]; reasons: (string | undefined)[]; stats: { survivorsOverturned: number; confirmLive: number; isolatedByCause: { confirm: number }; isolatedStages?: { stage: string; mutants: number; ms: number; peak: number }[] } };
  const confirmRun = (env: Record<string, string> = {}, args: string[] = [], optIn = true): Confirmed => {
    const dir = path.join(pkg, 'test/fixtures/cross-test');
    const reportDir = mkdtempSync(path.join(tmpdir(), 'oxmutate-cross-test-'));
    execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json', ...args], { cwd: dir, stdio: 'pipe', env: optIn ? { ...process.env, OXMUTATE_LIVE_CONFIRM: '1', ...env } : Object.fromEntries(Object.entries({ ...process.env, ...env }).filter(([k]) => k !== 'OXMUTATE_LIVE_CONFIRM')) });
    const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: (ReportMutant & { statusReason?: string })[] }>; 'x-oxmutate': { stats: Confirmed['stats'] } };
    rmSync(reportDir, { recursive: true, force: true });
    const mutants = (report.files['src/store.ts']?.mutants ?? []).filter((m) => m.status !== 'Ignored');
    return { verdicts: mutants.map((m) => `${String(m.location.start.line)}:${m.mutatorName}:${m.status}`), reasons: mutants.map((m) => m.statusReason), stats: report['x-oxmutate'].stats };
  };
  const RESET_LINE = 20; // reset()'s body
  const TOUCH_LINE = 25; // touch()'s body, to the end of the file

  it('kills the cross-test mutant and keeps the survivors, with no fresh worker', () => {
    const live = confirmRun();
    const reset = live.verdicts.findIndex((v) => v.startsWith(`${String(RESET_LINE)}:`));
    expect(live.verdicts[reset]).toBe(`${String(RESET_LINE)}:BlockStatement:Killed`);
    expect(live.reasons[reset]).toBe('killed only when the mutant stays active across the whole test file (cross-test effect)');
    const touch = live.verdicts.filter((v) => Number(v.split(':')[0]) >= TOUCH_LINE);
    expect(touch.length).toBeGreaterThan(0);
    expect(touch.every((v) => v.endsWith(':Survived'))).toBe(true);
    expect(live.stats.survivorsOverturned).toBe(1);
    // Every confirmation was decided live: reset()'s and each of touch()'s.
    expect(live.stats.confirmLive).toBe(1 + touch.length);
    expect(live.stats.isolatedByCause.confirm).toBe(0);
  });

  it('spreads a file\'s confirmations over the pool, with the same verdicts', () => {
    // One file's confirmations were one unit of up to 25 mutants, so a pool of 8 ran them on one worker
    // (pathe: 103 confirmations, 5 units, 2026-11-20). Eleven survivors on two workers are two units.
    const dir = path.join(pkg, 'test/fixtures/confirm-spread');
    const runIn = (args: string[]): { units: number; statuses: string[] } => {
      const reportDir = mkdtempSync(path.join(tmpdir(), 'oxmutate-confirm-spread-'));
      execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json', ...args], { cwd: dir, stdio: 'pipe', env: { ...process.env, OXMUTATE_LIVE_CONFIRM: '1' } });
      const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }>; 'x-oxmutate': { stats: { liveConfirmByFile: Record<string, { mutants: number; units: number }> } } };
      rmSync(reportDir, { recursive: true, force: true });
      const [only] = Object.values(report['x-oxmutate'].stats.liveConfirmByFile);
      expect(only?.mutants).toBe(11);
      return { units: only?.units ?? 0, statuses: Object.values(report.files).flatMap((x) => x.mutants.map((m) => `${String(m.location.start.line)}:${m.mutatorName}:${m.status}`)) };
    };
    const two = runIn([]);
    const one = runIn(['--concurrency', '1']);
    expect(two.units).toBe(2);
    expect(one.units).toBe(1);
    expect(two.statuses).toEqual(one.statuses);
  }, 60_000);

  it('runs only the covering tests in a live confirmation, and none in the worker\'s own run of the file', () => {
    // A confirmation runs its covering tests' bodies armed; the canary that follows it ran every body
    // of the file, `exploits`' 65,500-character globs on pathe, 150 times (2026-11-20).
    const dir = mkdtempSync(path.join(tmpdir(), 'oxmutate-canary-'));
    const log = path.join(dir, 'ran.log');
    const live = confirmRun({ CANARY_LOG: log });
    expect(live.stats.confirmLive).toBeGreaterThan(0);
    // Never: not in the canary after a mutant (3 times without the scoping), and not in the worker's own
    // run of the file, which decided nothing and ran every body once per unit (1 more).
    expect(existsSync(log) ? readFileSync(log, 'utf8') : '').toBe('');
    rmSync(dir, { recursive: true, force: true });
  });

  it('gives the same verdicts live (OXMUTATE_LIVE_CONFIRM=1) and in fresh workers, the default', () => {
    const live = confirmRun();
    const fresh = confirmRun({}, [], false);
    expect(live.verdicts).toEqual(fresh.verdicts);
    expect(fresh.stats.confirmLive).toBe(0);
    expect(fresh.stats.isolatedByCause.confirm).toBe(live.stats.confirmLive);
    // The isolated phase names its stages: a live confirmation is its own stage, a fresh one is another.
    expect(live.stats.isolatedStages?.map((x) => x.stage)).toEqual(['live-confirm']);
    expect(fresh.stats.isolatedStages).toEqual([{ stage: 'confirm', mutants: live.stats.confirmLive, ms: expect.any(Number) as number, peak: 1 }]);
  });
});

// Pollution handled in the worker (recover.qnt): a failed canary resets the module registry, collects the
// file again and runs on, where a new worker was started and the unit split. The reference is the restart
// (OXMUTATE_ISOLATE_POLLUTION=1): every verdict must be the one a fresh worker gives.
describe.skipIf(!native || !existsSync(bin) || !nightly)('pollution recovered in the worker', () => {
  type Stats = { pollutionRestarts: number; pollutionRecovered: number; units: number };
  const pollutionRun = (name: string, file: string, env: Record<string, string> = {}): { verdicts: string[]; stats: Stats } => {
    const dir = path.join(pkg, 'test/fixtures', name);
    const reportDir = mkdtempSync(path.join(tmpdir(), `oxmutate-${name}-`));
    execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe', env: { ...process.env, ...env } });
    const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }>; 'x-oxmutate': { stats: Stats } };
    rmSync(reportDir, { recursive: true, force: true });
    const mutants = report.files[file]?.mutants ?? [];
    return { verdicts: mutants.map((m) => `${String(m.location.start.line)}:${String(m.location.start.column ?? 0)}:${m.mutatorName}:${m.status}`), stats: report['x-oxmutate'].stats };
  };
  const fresh = { OXMUTATE_ISOLATE_POLLUTION: '1' };

  it('gives the verdicts a restart gives, in one worker, and runs a later test on the new collection', () => {
    const live = pollutionRun('pollution-module', 'src/ledger.ts');
    const restart = pollutionRun('pollution-module', 'src/ledger.ts', fresh);
    expect(live.verdicts).toEqual(restart.verdicts);
    expect(live.stats.pollutionRecovered).toBeGreaterThan(0);
    expect(live.stats.pollutionRestarts).toBe(0);
    expect(restart.stats.pollutionRecovered).toBe(0);
    expect(restart.stats.pollutionRestarts).toBeGreaterThan(0);
    expect(live.stats.units).toBeLessThan(restart.stats.units);
    // reset()'s mutants survive on clean state, and so does the second test's first, whose run stands without
    // a canary on whichever modules the test runs from: on the first collection's polluted ones it is killed.
    expect(live.verdicts.filter((v) => /^(15|16):/.test(v)).every((v) => v.endsWith(':Survived'))).toBe(true);
    expect(live.verdicts).toContain('22:36:ArithmeticOperator:Survived');
  });

  it('recovers in place when a test left process.cwd mocked, finding Vitest from where the project was', () => {
    const live = pollutionRun('pollution-cwd', 'src/ledger.ts');
    const restart = pollutionRun('pollution-cwd', 'src/ledger.ts', fresh);
    expect(live.verdicts).toEqual(restart.verdicts);
    expect(live.stats.pollutionRecovered).toBeGreaterThan(0);
    expect(live.stats.pollutionRestarts).toBe(0);
  });

  it('restarts when the worker\'s globals changed: a warm memo would hide the next test\'s mutant', () => {
    const live = pollutionRun('pollution-guard', 'src/gate.ts');
    const restart = pollutionRun('pollution-guard', 'src/gate.ts', fresh);
    expect(live.verdicts).toEqual(restart.verdicts);
    // The literal memo() decides is killed on the cold memo of a new worker.
    expect(live.verdicts).toContain('29:17:NumericLiteral:Killed');
    expect(live.stats.pollutionRestarts).toBeGreaterThan(0);
    expect(live.stats.pollutionRecovered).toBeGreaterThan(0);
    // recover.qnt `noGuard`: with the comparison dropped it is hidden, and reported Survived.
    // The warm survivors are trusted here: the confirmation from cold modules would otherwise correct that very verdict.
    const unguarded = pollutionRun('pollution-guard', 'src/gate.ts', { OXMUTATE_RECOVER_WITHOUT: 'guard', OXMUTATE_TRUST_WARM_SURVIVORS: '1' });
    expect(unguarded.verdicts).toContain('29:17:NumericLiteral:Survived');
    expect(unguarded.stats.pollutionRestarts).toBe(0);
  });

  it('restarts when the unmutated test still fails on the new collection: leftovers a reset does not clear', () => {
    const live = pollutionRun('pollution-global', 'src/shelf.ts');
    const restart = pollutionRun('pollution-global', 'src/shelf.ts', fresh);
    expect(live.verdicts).toEqual(restart.verdicts);
    expect(live.stats.pollutionRecovered).toBe(0);
    expect(live.stats.pollutionRestarts).toBeGreaterThan(0);
    const reset = live.verdicts.filter((v) => /^(16|17):/.test(v));
    expect(reset.length).toBeGreaterThan(0);
    expect(reset.every((v) => v.endsWith(':Survived'))).toBe(true);
    // recover.qnt `noProve`: one reset() mutant's leftovers then kill the next.
    const unproved = pollutionRun('pollution-global', 'src/shelf.ts', { OXMUTATE_RECOVER_WITHOUT: 'prove' });
    expect(unproved.verdicts.filter((v) => /^(16|17):/.test(v)).some((v) => v.endsWith(':Killed'))).toBe(true);
  });
});

// Warm state that hides a mutant (confirm.qnt, MEMO): a memo an earlier run filled serves the code a later
// mutant changes, so it survives warm and is killed in a fresh worker. Its verdict must not depend on its
// place in its unit: every survivor is confirmed from cold modules, and the verdicts are a fresh worker's
// (OXMUTATE_ISOLATE_ALL=1 runs each covered mutant armed from process start, as Stryker does).
describe.skipIf(!native || !existsSync(bin) || !nightly)('warm state that hides a mutant', () => {
  type Run = { verdicts: string[]; stats: { staleSurvivors: number } };
  const memoRun = (env: Record<string, string> = {}, fixtureName = 'memo-hides'): Run => {
    const dir = path.join(pkg, 'test/fixtures', fixtureName);
    const reportDir = mkdtempSync(path.join(tmpdir(), 'oxmutate-memo-hides-'));
    execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe', env: { ...process.env, ...env } });
    const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }>; 'x-oxmutate': { stats: Run['stats'] } };
    rmSync(reportDir, { recursive: true, force: true });
    return { verdicts: (report.files['src/memo.ts']?.mutants ?? []).map((m) => `${String(m.location.start.line)}:${String(m.location.start.column ?? 0)}:${m.mutatorName}:${m.status}`), stats: report['x-oxmutate'].stats };
  };

  it('gives every mutant of a memoized computation the verdict of a fresh worker, wherever it sits in its unit', () => {
    const warm = memoRun();
    const fresh = memoRun({ OXMUTATE_ISOLATE_ALL: '1', OXMUTATE_ISOLATE_STATIC: '1' });
    expect(warm.verdicts).toEqual(fresh.verdicts);
    // The four mutants of `n * 3 + 1`, the first run cold and the rest not, are all killed.
    expect(warm.verdicts.filter((v) => v.startsWith('10:') && v.endsWith(':Killed')).length).toBe(4);
    expect(warm.stats.staleSurvivors).toBeGreaterThan(0);
  });

  it('reports a hidden mutant that takes the worker down as the RuntimeError a fresh worker gives it', () => {
    const warm = memoRun({}, 'memo-crash');
    const fresh = memoRun({ OXMUTATE_ISOLATE_ALL: '1', OXMUTATE_ISOLATE_STATIC: '1', OXMUTATE_ISOLATE_POLLUTION: '1' }, 'memo-crash');
    expect(warm.verdicts).toEqual(fresh.verdicts);
    // The guard's `true` survives warm (a memo answers first) and kills the worker cold: not Survived.
    expect(warm.verdicts).toContain('14:7:ConditionalExpression:RuntimeError');
  });

  it('reports them Survived when the warm survivors are trusted, as 2.10 did: the check is what kills them', () => {
    const trusted = memoRun({ OXMUTATE_TRUST_WARM_SURVIVORS: '1' });
    expect(trusted.verdicts.filter((v) => v.startsWith('10:')).every((v) => v.endsWith(':Survived'))).toBe(true);
    expect(trusted.stats.staleSurvivors).toBe(0);
  });
});

/** Four oxmutate runs of a small fixture, in one hook: a few seconds each on a busy runner. */
const FRESH_SPLIT_RUNS_MS = 120_000;
const byName = <T,>(rec: Record<string, T> | undefined): Record<string, T> => Object.fromEntries(Object.entries(rec ?? {}).map(([f, x]) => [path.basename(f), x]));

// A mutant goes to a fresh worker first when its covering tests cost enough that warm is the dearer (fresh-first.ts):
// `heavy.ts`'s tests take 120 ms each in the dry run, `light.ts`'s a millisecond. Both sorts keep a fresh worker's verdict.
describe.skipIf(!native || !existsSync(bin))('fresh or warm, by what the covering tests cost', () => {
  type Stats = {
    freshChosen?: number;
    staticFresh?: number;
    freshByFile?: Record<string, { runs: number; ms: number }>;
    warmByFile?: Record<string, { mutants: number; units: number; ms: number; armedMs: number }>;
    freshFirst?: { mutants: number; unitMs: number; runMs: number };
    dryFiles?: Record<string, { loadMs: number; tests: number; testMs: number }>;
  };
  const split = (env: Record<string, string> = {}): { verdicts: string[]; stats: Stats; mutants: Record<string, number> } => {
    const dir = path.join(pkg, 'test/fixtures/fresh-split');
    const reportDir = mkdtempSync(path.join(tmpdir(), 'oxmutate-fresh-split-'));
    execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe', env: { ...process.env, ...env } });
    const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }>; 'x-oxmutate': { stats: Stats } };
    discard(reportDir);
    const rows = Object.entries(report.files).flatMap(([f, x]) => x.mutants.map((m) => `${f}:${String(m.location.start.line)}:${String(m.location.start.column ?? 0)}:${m.mutatorName}:${m.status === 'Timeout' ? 'Killed' : m.status}`));
    return { verdicts: rows.sort(), stats: report['x-oxmutate'].stats, mutants: Object.fromEntries(Object.entries(report.files).map(([f, x]) => [f, x.mutants.length])) };
  };

  // The four runs are made once, here: each takes a few seconds, and a case holds the per-case budget.
  type Run = ReturnType<typeof split>;
  const runs = {} as { chosen: Run; reference: Run; off: Run; all: Run };
  beforeAll(() => {
    runs.chosen = split();
    runs.reference = split({ OXMUTATE_ISOLATE_ALL: '1', OXMUTATE_ISOLATE_STATIC: '1' });
    runs.off = split({ OXMUTATE_FRESH_FIRST: '0' });
    runs.all = split({ OXMUTATE_FRESH_FIRST: '1' });
  }, FRESH_SPLIT_RUNS_MS);

  it('sends the mutants of the slow file to a fresh worker and runs the fast file warm, with the verdicts of a fresh worker for both', () => {
    const { chosen, reference } = runs;
    expect(chosen.verdicts).toEqual(reference.verdicts);
    // Every mutant of heavy.ts, and none of light.ts's.
    expect((chosen.stats.freshChosen ?? 0) + (chosen.stats.staticFresh ?? 0)).toBe(chosen.mutants['src/heavy.ts']);
    expect(chosen.stats.staticFresh).toBeGreaterThan(0);
    expect(Object.keys(chosen.stats.freshByFile ?? {}).map((f) => path.basename(f))).toEqual(['heavy.spec.ts']);
    expect(Object.keys(chosen.stats.warmByFile ?? {}).map((f) => path.basename(f))).toEqual(['light.spec.ts']);
    // What the choice is read from, and what it cost: the dry run's per-file figures, the fresh runs' and the warm units'.
    const dryFiles = byName(chosen.stats.dryFiles);
    expect([dryFiles['heavy.spec.ts']?.tests, dryFiles['light.spec.ts']?.tests]).toEqual([3, 2]);
    expect(dryFiles['heavy.spec.ts']?.testMs).toBeGreaterThanOrEqual(360);
    expect(dryFiles['light.spec.ts']?.testMs).toBeLessThan(50);
    expect(dryFiles['heavy.spec.ts']?.loadMs).toBeGreaterThan(0);
    const fresh = byName(chosen.stats.freshByFile)['heavy.spec.ts'];
    expect(fresh?.runs).toBeGreaterThan(0);
    expect(fresh?.ms).toBeGreaterThan(0);
    const warm = byName(chosen.stats.warmByFile)['light.spec.ts'];
    expect(warm?.units).toBe(1);
    expect(warm?.mutants).toBeGreaterThan(0);
    expect(warm?.mutants).toBeLessThanOrEqual(chosen.mutants['src/light.ts'] ?? 0);
    expect(warm?.ms).toBeGreaterThan(warm?.armedMs ?? Infinity);
    expect(chosen.stats.freshFirst?.mutants).toBeGreaterThanOrEqual(fresh?.runs ?? Infinity);
    expect(chosen.stats.freshFirst?.unitMs).toBeGreaterThan(chosen.stats.freshFirst?.runMs ?? Infinity);
    expect(chosen.stats.freshFirst?.runMs).toBeGreaterThan(0);
  });

  it('keeps every mutant warm when OXMUTATE_FRESH_FIRST=0, and sends every one when it is 1', () => {
    const { off: warm, all } = runs;
    expect([warm.stats.freshChosen, warm.stats.staticFresh]).toEqual([0, 0]);
    expect(Object.keys(warm.stats.warmByFile ?? {}).map((f) => path.basename(f)).sort()).toEqual(['heavy.spec.ts', 'light.spec.ts']);
    expect(all.stats.freshChosen).toBeGreaterThan(all.mutants['src/heavy.ts'] ?? 0);
    expect(all.stats.warmByFile).toBeUndefined();
    expect(all.verdicts).toEqual(warm.verdicts);
  });
});

// A hang is stopped at the limit of the test it hangs, not at the budget of the slowest test that covers the
// mutant, on a fresh worker as in a warm one (#1704 did the warm one). The fixture's 1 ms test never returns while
// its mutant is armed; a second test of 0.8 s sizes the whole mutant's budget (about 3.5 s) and sends the mutant
// to a fresh worker first. The stop comes at the 1 ms test's limit (about 0.5 s), well inside that.
describe.skipIf(!native || !existsSync(bin))('a hang on a fresh worker is stopped at its test\'s limit', () => {
  type Run = { verdicts: string[]; stops: number[] };
  const dir = path.join(pkg, 'test/fixtures/per-test-limit');
  const once = (env: Record<string, string>): Run => {
    const reportDir = mkdtempSync(path.join(tmpdir(), 'oxmutate-per-test-limit-'));
    spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe', env: { ...process.env, ...env } });
    const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }>; 'x-oxmutate': { stats: { warmStopsMs: number[] } } };
    discard(reportDir);
    return { verdicts: Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.status)), stops: report['x-oxmutate'].stats.warmStopsMs };
  };
  const runs = {} as { fresh: Run; warm: Run };
  beforeAll(() => {
    runs.fresh = once({ OXMUTATE_FRESH_FIRST: '1', OXMUTATE_ISOLATE_STATIC: '1' });
    runs.warm = once({ OXMUTATE_FRESH_FIRST: '0' });
  }, 120_000);

  it.each([['fresh first', 'fresh'], ['warm', 'warm']] as const)('%s: every hang is a Timeout, stopped inside 1.5 s', (_, which) => {
    const run = runs[which];
    expect(run.verdicts.length).toBeGreaterThan(0);
    expect(run.stops.length).toBeGreaterThan(0);
    expect(Math.min(...run.stops)).toBeLessThan(1500);
  });
});

// A fresh run held to its test's limit is given 3x that limit in place, once, when its worker is busy but under half a
// core (blocked in a call, or starved by a loaded machine), as a warm run is: killing it cost a server start and a re-run
// at that same 3x, and on a loaded machine a stop at the small limit turned a test that passes into a Timeout. A loop that
// burns its core is still stopped at the limit (the per-test-limit cases above). The fixture's test blocks the thread
// for 2.4 s while its mutant is armed, past its limit (about 1.25 s) and inside the 3x (about 3.75 s). The limit is long enough for
// the server's CPU readings to span the half second a share is read from; a stop on a younger server reads no share and is not graced.
describe.skipIf(!native || !existsSync(bin))('a starved fresh run keeps its stop in place', () => {
  const dir = path.join(pkg, 'test/fixtures/starved-limit');
  let stats: { watchdogGraced: number; warmStopsMs: number[]; idleStalls: number } = { watchdogGraced: 0, warmStopsMs: [], idleStalls: 0 };
  let verdicts: string[] = [];
  beforeAll(() => {
    const reportDir = mkdtempSync(path.join(tmpdir(), 'oxmutate-starved-limit-'));
    spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: dir, stdio: 'pipe', env: { ...process.env, OXMUTATE_FRESH_FIRST: '1', OXMUTATE_ISOLATE_STATIC: '1' } });
    const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: ReportMutant[] }>; 'x-oxmutate': { stats: typeof stats } };
    discard(reportDir);
    stats = report['x-oxmutate'].stats;
    verdicts = Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.status));
  }, 120_000);

  it('is not stopped: it is given its 3x in place, and no server restarts', () => {
    expect(stats.watchdogGraced).toBeGreaterThan(0);
    expect(stats.warmStopsMs).toEqual([]);
  });

  it('gives the verdict a fresh worker gives: the assertion kills the mutant', () => {
    expect(verdicts.length).toBeGreaterThan(0);
    expect(verdicts.every((v) => v === 'Killed')).toBe(true);
  });
});

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
