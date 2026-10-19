/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * windows-lane-holds R1 and R2 — per-case durations come from the cell, and a check names every
 * case above half its timeout.
 *
 * The PowerShell completion case spent 59.7 s of its 120 s on a passing Windows cell
 * (2026-10-18), and was only noticed when it lost at 122 s. These cases hold the three parts:
 * the reporter writes duration and effective timeout, `slow-cases.mts` names the case past half,
 * and `lint:workflows` keeps compat's cells uploading the reports with a dispatch that can pick
 * one cell.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

import { type DurationReport, durationsProblems, readReports, slowCases } from './slow-cases.mjs';
import DurationsReporter from './vitest-durations-reporter.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/slow-cases.mts');

const report = (cases: [name: string, duration: number, timeout: number][]): DurationReport => ({
  version: 1,
  cwd: 'packages/burgee',
  platform: 'win32',
  node: 'v26.0.0',
  cases: cases.map(([name, duration, timeout]) => ({ file: 'packages/burgee/src/completions-shells.test.ts', name, state: 'passed', duration, timeout })),
});

const scratch: string[] = [];
const dir = (): string => {
  const at = mkdtempSync(join(tmpdir(), 'slow-cases-'));
  scratch.push(at);
  return at;
};
afterEach(() => {
  for (const at of scratch.splice(0)) rmSync(at, { recursive: true, force: true });
});

const run = (...args: string[]): { status: number | null; stdout: string } => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout };
};

describe('windows-lane-holds R2 — a case above half its timeout is named', () => {
  it('R2 — names the case at 61 of 120 s, and not the one at exactly half', () => {
    const slow = slowCases([report([['PowerShell', 61_000, 120_000], ['zsh', 60_000, 120_000], ['bash', 2_000, 30_000]])]);
    expect(slow.map((c) => [c.name, c.share])).toEqual([['PowerShell', 61_000 / 120_000]]);
    expect(slow[0]).toMatchObject({ platform: 'win32', node: 'v26.0.0', file: 'packages/burgee/src/completions-shells.test.ts' });
  });

  it('orders by the share of the timeout used, not by duration', () => {
    const slow = slowCases([report([['long', 50_000, 60_000], ['short', 29_000, 30_000], ['none', 1, 0]])]);
    expect(slow.map((c) => c.name)).toEqual(['short', 'long']);
  });

  it('exits 1 and prints the case when one is over half; exits 0 when none is', () => {
    const at = dir();
    writeFileSync(join(at, 'a.json'), JSON.stringify(report([['PowerShell', 61_000, 120_000]])));
    const over = run(at);
    expect(over.status).toBe(1);
    expect(over.stdout).toContain('51% — 61000 of 120000 ms · win32 v26.0.0 · packages/burgee/src/completions-shells.test.ts › PowerShell');
    expect(over.stdout).toContain('1 of 1 case(s) above half their timeout');

    writeFileSync(join(at, 'a.json'), JSON.stringify(report([['PowerShell', 9_000, 120_000]])));
    const under = run(join(at, 'a.json'));
    expect(under.status).toBe(0);
    expect(under.stdout).toBe('0 of 1 case(s) above half their timeout\n');
  });

  it('a check that read nothing has not passed', () => {
    const at = dir();
    writeFileSync(join(at, 'a.json'), JSON.stringify(report([])));
    writeFileSync(join(at, 'notes.txt'), 'not a report');
    expect(run(at)).toEqual({ status: 1, stdout: 'read no case: a check that read nothing has not passed\n' });
    expect(run().status).toBe(2);
    writeFileSync(join(at, 'b.json'), '{"cases":[]}');
    expect(() => readReports([at])).toThrow(/not a vitest durations report/);
  });
});

/** A vitest TestCase shaped just enough for the reporter: a name, a timeout, a duration. */
const fakeTest = (name: string, timeout: number | undefined, duration: number | undefined) => ({
  fullName: name,
  options: { timeout },
  result: () => ({ state: 'passed' }),
  diagnostic: () => (duration === undefined ? undefined : { duration }),
});

describe('windows-lane-holds R1 — durations come from the cell', () => {
  it('the reporter writes each case’s duration and effective timeout into $VITEST_DURATIONS_DIR', () => {
    const at = dir();
    const before = process.env['VITEST_DURATIONS_DIR'];
    process.env['VITEST_DURATIONS_DIR'] = at;
    try {
      const reporter = new DurationsReporter();
      reporter.onInit({ config: { testTimeout: 30_000 } });
      const module = {
        moduleId: join(ROOT, 'packages', 'burgee', 'src', 'x.test.ts'),
        project: { config: { testTimeout: undefined } },
        children: { allTests: () => [fakeTest('own', 120_000, 61_000.4), fakeTest('inherited', undefined, 12), fakeTest('skipped', undefined, undefined)] },
      };
      reporter.onTestRunEnd([module] as unknown as Parameters<DurationsReporter['onTestRunEnd']>[0]);
      const files = readdirSync(at);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^root-\d+\.json$/);
      const written = JSON.parse(readFileSync(join(at, files[0] ?? ''), 'utf8')) as DurationReport;
      expect(written).toMatchObject({ version: 1, cwd: '.', platform: process.platform, node: process.version });
      expect(written.cases).toEqual([
        { file: 'packages/burgee/src/x.test.ts', name: 'own', state: 'passed', duration: 61_000, timeout: 120_000 },
        { file: 'packages/burgee/src/x.test.ts', name: 'inherited', state: 'passed', duration: 12, timeout: 30_000 },
      ]);
    } finally {
      if (before === undefined) delete process.env['VITEST_DURATIONS_DIR'];
      else process.env['VITEST_DURATIONS_DIR'] = before;
    }
  });

  it('the reporter writes nothing when $VITEST_DURATIONS_DIR is unset', () => {
    const before = process.env['VITEST_DURATIONS_DIR'];
    delete process.env['VITEST_DURATIONS_DIR'];
    try {
      const modules = { [Symbol.iterator]: () => { throw new Error('read the modules with nowhere to write'); } };
      expect(() => new DurationsReporter().onTestRunEnd(modules as unknown as Parameters<DurationsReporter['onTestRunEnd']>[0])).not.toThrow();
    } finally {
      if (before !== undefined) process.env['VITEST_DURATIONS_DIR'] = before;
    }
  });

  it('R1 — compat’s matrix and floor upload durations on every OS, and the dispatch picks one cell', () => {
    const compat = loadYaml(readFileSync(join(ROOT, '.github/workflows/compat.yml'), 'utf8')) as Parameters<typeof durationsProblems>[1];
    expect(durationsProblems('compat.yml', compat)).toEqual([]);
  });

  it('the rule is not blind: no inputs, no directory and no upload are each named', () => {
    const bare = { on: { workflow_dispatch: null }, jobs: { matrix: { steps: [{ uses: 'actions/upload-artifact@x', with: { path: 'vitest-durations' } }] } } };
    expect(durationsProblems('compat.yml', bare)).toEqual([
      expect.stringContaining('no `os` input'),
      expect.stringContaining('no `node` input'),
      expect.stringContaining('compat.yml → matrix: does not set `VITEST_DURATIONS_DIR`'),
      expect.stringContaining('compat.yml → matrix: has no `if: always()` upload-artifact step'),
      expect.stringContaining('has no `floor` job'),
    ]);
    expect(durationsProblems('other.yml', bare)).toEqual([]);
  });
});
