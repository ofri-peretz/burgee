/**
 * SC7, the Vitest 5 regression (.sdlc/intents/oxmutate/intent.md). Stryker 10.0.0's Vitest runner
 * picks a mutant's tests by name, joining suite names with a space. Vitest 5 joins them with ` > `,
 * so for a test inside a `describe` nothing matched, no test ran, and a mutant the tests kill was
 * reported Survived. oxmutate maps a mutant to its tests by Vitest's test id. On a fixture where
 * every test sits in a nested `describe`, a run under Vitest 5 must report every mutant Killed.
 *
 * The second case proves the fixture still reproduces the defect. With Stryker's name filter put
 * back (`vitest.stryker-filter.config.mjs`), the same mutants come back Survived having run no test,
 * so the first case's assertion would fail.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(here, '..');
const fixture = path.join(pkg, 'test/fixtures/vitest5-regression');
const bin = path.join(pkg, 'dist/bin.js');
// Needs the native core and the built CLI, as e2e.test.ts does. CI sets OXMUTATE_REQUIRE_NATIVE.
const native = existsSync(path.join(pkg, 'binding')) && readdirSync(path.join(pkg, 'binding')).some((f) => f.endsWith('.node'));
const ready = native && existsSync(bin);
if (!ready && process.env['OXMUTATE_REQUIRE_NATIVE'] === '1') throw new Error('OXMUTATE_REQUIRE_NATIVE is set and the native core or dist/bin.js is missing. fix: npm run build:native -w oxmutate && npm run build -w oxmutate');

interface Mutant {
  mutatorName: string;
  status: string;
  static?: boolean;
  coveredBy?: string[];
  killedBy?: string[];
  testsCompleted?: number;
  location: { start: { line: number; column: number } };
}

const out = mkdtempSync(path.join(tmpdir(), 'oxmutate-sc7-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

/** The built CLI on the fixture, with `vitest` overriding the fixture's Vitest config file. */
const run = (name: string, vitestConfig?: string): { status: number | null; out: string; mutants: Mutant[] } => {
  const base = JSON.parse(readFileSync(path.join(fixture, 'oxmutate.config.json'), 'utf8')) as Record<string, unknown>;
  const config = path.join(out, `${name}.config.json`);
  writeFileSync(config, JSON.stringify(vitestConfig ? { ...base, vitest: { configFile: vitestConfig } } : base));
  const reports = path.join(out, name);
  const r = spawnSync(process.execPath, [bin, 'run', '--config', config, '--report-dir', reports, '--reporter', 'json'], { cwd: fixture, encoding: 'utf8' });
  const report = JSON.parse(readFileSync(path.join(reports, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: Mutant[] }> };
  return { status: r.status, out: `${r.stdout}${r.stderr}`, mutants: report.files['src/hex.ts']?.mutants ?? [] };
};

const at = (m: Mutant): string => `${String(m.location.start.line)}:${String(m.location.start.column)} ${m.mutatorName}`;

describe.skipIf(!ready)('the Vitest 5 regression (SC7)', () => {
  it('runs the fixture under Vitest 5, the version the defect needs', () => {
    const version = (createRequire(path.join(fixture, 'package.json'))('vitest/package.json') as { version: string }).version;
    expect(Number(version.split('.')[0])).toBe(5);
  });

  it('reports no killed mutant as Survived: every mutant is Killed by a test that ran', () => {
    const r = run('clean');
    expect(r.status).toBe(0);
    // Both verdict paths are on the fixture: the warm per-test runs, and a static mutant's isolated run.
    expect(r.mutants.some((m) => m.static)).toBe(true);
    expect(r.mutants.filter((m) => !m.static).length).toBeGreaterThan(0);
    expect(r.mutants.filter((m) => m.status !== 'Killed').map((m) => `${at(m)}:${m.status}`)).toEqual([]);
    // A kill names its test and counts the tests that ran: none is a kill by a run that matched nothing.
    expect(r.mutants.filter((m) => !m.killedBy?.length || (m.testsCompleted ?? 0) < 1).map(at)).toEqual([]);
  });

  it("reproduces the defect: with Stryker 10.0.0's name filter put back, the same mutants are Survived having run no test", () => {
    const clean = run('clean-for-fault');
    const faulty = run('stryker-filter', 'vitest.stryker-filter.config.mjs');
    expect(faulty.mutants.map(at)).toEqual(clean.mutants.map(at));
    expect(faulty.mutants.length).toBeGreaterThan(0);
    // Each one is a killed mutant reported Survived, the fault SC7 names. The case above would fail.
    expect(faulty.mutants.map((m) => `${at(m)}:${m.status}:${String(m.testsCompleted ?? 0)}`)).toEqual(clean.mutants.map((m) => `${at(m)}:Survived:0`));
  });
});
