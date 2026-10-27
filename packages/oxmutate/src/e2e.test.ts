/**
 * The whole tool on a fixture whose test leaves state behind when it fails. A polluting mutant
 * must restart the context, and the mutants after it must be judged from a clean state: if not,
 * leftover entries kill the `reset()` mutants, which no test checks.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(here, '..');
const fixture = path.join(pkg, 'test/fixtures/registry');
const bin = path.join(pkg, 'dist/bin.js');
// Needs the native core (`npm run build:native`). Skipped locally without it; CI sets
// OXMUTATE_REQUIRE_NATIVE (quality-full.yml), where a missing core fails instead of skipping.
const native = existsSync(path.join(pkg, 'binding')) && readdirSync(path.join(pkg, 'binding')).some((f) => f.endsWith('.node'));
if (!native && process.env['OXMUTATE_REQUIRE_NATIVE'] === '1') throw new Error('OXMUTATE_REQUIRE_NATIVE is set and no native core is built. fix: npm run build:native -w oxmutate');

interface ReportMutant {
  mutatorName: string;
  status: string;
  location: { start: { line: number } };
  static?: boolean;
  testsCompleted?: number;
}

it.skipIf(!native || !existsSync(bin))('restarts a polluted context and judges later mutants from a clean state', () => {
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

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

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
  await new Promise((r) => setTimeout(r, 5000));
  const left = servers.filter(alive);
  for (const pid of left) process.kill(pid, 'SIGKILL');
  rmSync(path.join(spin, 'reports'), { recursive: true, force: true });
  expect(left).toEqual([]);
}, 60_000);

it.skipIf(!native || !existsSync(bin))('confirms a watchdog stop with 3x the budget before reporting a timeout', () => {
  const slow = path.join(pkg, 'test/fixtures/slow');
  const reportDir = path.join(slow, 'reports');
  rmSync(reportDir, { recursive: true, force: true });
  mkdirSync(reportDir, { recursive: true });
  execFileSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reportDir, '--reporter', 'json'], { cwd: slow, stdio: 'pipe' });
  const report = JSON.parse(readFileSync(path.join(reportDir, 'mutation.json'), 'utf8')) as {
    files: Record<string, { mutants: ReportMutant[] }>;
    'x-oxmutate': { stats: { timeoutsOverturned: number } };
  };
  rmSync(reportDir, { recursive: true, force: true });
  expect(report.files['src/one.ts']?.mutants.map((m) => m.status)).toEqual(['Killed']);
  expect(report['x-oxmutate'].stats.timeoutsOverturned).toBe(1);
}, 90_000);

/** The CLI on a fixture with extra config keys, through a config file written for the run. */
const runWith = (dir: string, extra: Record<string, unknown>): { status: number | null; out: string; reports: string } => {
  const base = JSON.parse(readFileSync(path.join(dir, 'oxmutate.config.json'), 'utf8')) as Record<string, unknown>;
  const config = path.join(dir, 'reports', 'case.config.json');
  const reports = path.join(dir, 'reports', 'case');
  mkdirSync(reports, { recursive: true });
  writeFileSync(config, JSON.stringify({ ...base, ...extra }));
  const r = spawnSync(process.execPath, [bin, 'run', '--config', config, '--report-dir', reports, '--reporter', 'json'], { cwd: dir, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, reports };
};

describe.skipIf(!native || !existsSync(bin))('Stryker options the run honours', () => {
  const registry = path.join(pkg, 'test/fixtures/registry');
  const spin = path.join(pkg, 'test/fixtures/spin');
  afterAll(() => {
    rmSync(path.join(registry, 'reports'), { recursive: true, force: true });
    rmSync(path.join(spin, 'reports'), { recursive: true, force: true });
  });

  it('buildCommand: a failing build stops the run before the dry run, with exit 3', () => {
    const r = runWith(registry, { buildCommand: 'node -e process.exit(4)' });
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/buildCommand `node -e process.exit\(4\)` exited 4/);
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
