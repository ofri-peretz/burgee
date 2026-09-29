/**
 * `npm run compat` end to end: argv in, lines out, files written, exit code back.
 *
 * `main()` is the one place the oracle's number is printed and ratcheted, so these pin what
 * it prints and what it decides — which hosts a run grades and against what, which rows it
 * re-grades before believing a red, what goes into `results.json`, and which exit code the
 * gate reads. Nothing here clones, installs or fetches: `grade`, `vendor`, `latestVersion`
 * and the competitor watch are fakes, and every path `main` writes to is a scratch directory
 * handed in through `Paths`, so this package's own `results.json` is never touched.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { active, gradable, HOSTS, type Host, hostNamed, PREVIOUS_MAJORS } from './hosts.js';
import { main, type Paths, upstreamMode, verdict } from './report.js';
import { controlName, grade, type Grade } from './run.js';
import { type CompatRecord, latestVersion, renderDiff, renderMissingExtras, diffRecords } from './upstream.js';
import { vendor, type VendorResult } from './vendor.js';
import { check, fingerprint } from './watch.js';

vi.mock('./run.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('./run.js')>()), grade: vi.fn() }));
vi.mock('./vendor.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('./vendor.js')>()), vendor: vi.fn() }));
vi.mock('./upstream.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('./upstream.js')>()), latestVersion: vi.fn() }));
vi.mock('./watch.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('./watch.js')>()), check: vi.fn(), fingerprint: vi.fn() }));

const gradeOf = vi.mocked(grade);
const vendorOf = vi.mocked(vendor);
const latest = vi.mocked(latestVersion);

let root: string;
let paths: Paths;
let out: string;
const write = (s: string): void => {
  out += s;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'report-'));
  paths = {
    vendor: join(root, 'vendor'),
    baseline: join(root, 'baseline'),
    majors: join(root, 'baseline', 'majors'),
    results: join(root, 'results.json'),
    controlResults: join(root, 'results.control.json'),
    vendorDiff: join(root, 'vendor-diff.md'),
    upstream: join(root, 'upstream.json'),
    competitors: join(root, 'competitors-upstream.json'),
    packages: join(root, 'packages'),
    repoRoot: root,
  };
  mkdirSync(paths.majors, { recursive: true });
  out = '';
  vi.resetAllMocks();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const byName = (name: string): Host => hostNamed(name) as Host;
const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const baseline = (name: string, passed: number, reference: number, dir = paths.baseline): void => {
  writeFileSync(join(dir, `${name}.json`), JSON.stringify({ reference, passed, rate: passed / reference }));
};
const graded = (host: string, over: Partial<Grade> = {}): Grade => ({ host, target: host, files: 1, tests: 58, passed: 58, failed: 0, skipped: 0, reference: 58, rate: 1, ...over });
/** What a run printed for one grade. */
const printed = async (g: Grade, argv: string[] = [g.host]): Promise<string> => {
  gradeOf.mockReturnValue(g);
  await main(argv, write, paths);
  return out;
};
const record = (version: string, tests: Record<string, string[]>): CompatRecord => ({
  repo: 'r',
  version,
  tag: `v${version}`,
  commit: 'c'.repeat(40),
  vendored: '2026-09-29',
  files: 1,
  internalFiles: [],
  internals: [],
  hashes: {},
  tests,
  surface: {},
});
/** A host vendored at `version`, as `.source.json` records it. */
const vendoredAt = (name: string, version: string): void => {
  mkdirSync(join(paths.vendor, name), { recursive: true });
  writeFileSync(join(paths.vendor, name, '.source.json'), JSON.stringify({ ...record(version, { 'test/a.js': ['a'] }), hashes: { 'test/a.js': 'h' } }));
};

describe('choosing what to grade', () => {
  it('refuses a host it does not grade, and grades nothing', async () => {
    expect(await main(['chalk', 'nope', '--control'], write, paths)).toBe(1);
    expect(out).toBe('\n✖ not an active host: nope\n');
    expect(gradeOf).not.toHaveBeenCalled();
  });

  it('grades a named host against its façade, with the reference its baseline recorded', async () => {
    baseline('chalk', 56, 58);
    gradeOf.mockReturnValue(graded('chalk', { target: 'roundel/chalk', passed: 57, failed: 1, rate: 57 / 58 }));
    expect(await main(['chalk'], write, paths)).toBe(0);
    expect(gradeOf.mock.calls).toEqual([[byName('chalk'), paths.vendor, 'roundel/chalk', 58]]);
    expect(out).toContain(`\ncompatibility\n\n  chalk        ${'█'.repeat(24)}    57 / 58     98.3% ▲ 1\n`);
  });

  it('grades every host against one `--target=` when one is given, and against reference 0 with no baseline', async () => {
    gradeOf.mockImplementation((h) => graded(h.name));
    await main(['chalk', 'which', '--target=burgee/x '], write, paths);
    expect(gradeOf.mock.calls.map(([h, , target, reference]) => [h.name, target, reference])).toEqual([
      ['chalk', 'burgee/x', 0],
      ['which', 'burgee/x', 0],
    ]);
  });

  it('grades every active host when none is named, and every previous major under --majors', async () => {
    gradeOf.mockImplementation((h) => graded(h.name));
    await main([], write, paths);
    expect(gradeOf.mock.calls.map(([h]) => h.name)).toEqual(active().map((h) => h.name));
    gradeOf.mockClear();
    baseline('commander-14', 1, 1360, paths.majors);
    await main(['--majors'], write, paths);
    expect(gradeOf.mock.calls.map(([h, , , reference]) => [h.name, reference])).toEqual(PREVIOUS_MAJORS.map((h) => [h.name, h.name === 'commander-14' ? 1360 : 0]));
  });

  it('grades the control against the incumbent’s npm name, and writes it to its own results file', async () => {
    gradeOf.mockImplementation((h, _dir, target) => graded(h.name, { target }));
    expect(await main(['clack', '--control'], write, paths)).toBe(0);
    expect(gradeOf.mock.calls[0]?.[2]).toBe('@clack/prompts');
    expect(controlName(byName('clack'))).toBe('@clack/prompts');
    expect(out).toContain('\ncontrol — each host graded against its real package\n\n');
    expect(existsSync(paths.results)).toBe(false);
    expect(json<{ grades: Grade[] }>(paths.controlResults).grades.map((g) => g.target)).toEqual(['@clack/prompts']);
  });
});

describe('the line each host prints', () => {

  it('names an error in place of the counts', async () => {
    expect(await printed(graded('chalk', { error: 'boom' }))).toContain('\n  chalk        boom\n');
  });

  it('prints a note as zero of the reference, or of the registered tests where there is none', async () => {
    expect(await printed(graded('chalk', { tests: 1, passed: 0, rate: 0, note: 'target not built yet: x' }))).toContain(`\n  chalk        ${'░'.repeat(24)}     0 / 58      0.0%  target not built yet: x\n`);
    out = '';
    expect(await printed(graded('chalk', { passed: 0, rate: 0, reference: 0, tests: 3, note: 'n' }))).toContain(`\n  chalk        ${'░'.repeat(24)}     0 / 3       0.0%  n\n`);
  });

  it('says so every time a skip, a reclassified pass or a platform-absent case is in the number', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      baseline('cosmiconfig', 187, 243);
      const g = graded('cosmiconfig', { tests: 240, passed: 186, failed: 54, skipped: 1, exceeded: 2, reference: 243, rate: 186 / 243 });
      const full = Math.round((186 / 243) * 24);
      expect(await printed(g)).toContain(
        `\n  cosmiconfig  ${'█'.repeat(full)}${'░'.repeat(24 - full)}   186 / 243    76.5% ▼ -1   (1 skipped on this OS)   (2 the host marks failing and we pass)   (2 the suite does not register on darwin, counted against us)\n`,
      );
    } finally {
      Object.defineProperty(process, 'platform', platform);
    }
  });

  it('prints nothing extra for a zero skip, a zero reclassification, or a host absent nowhere, and no arrow without a baseline', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      expect(await printed(graded('cosmiconfig', { exceeded: 0, passed: 243, tests: 243, reference: 243 }))).toContain(`\n  cosmiconfig  ${'█'.repeat(24)}   243 / 243   100.0%\n`);
      // With no reference yet, the registered count is the denominator printed.
      out = '';
      expect(await printed(graded('cosmiconfig', { passed: 3, tests: 3, reference: 0 }))).toContain(`\n  cosmiconfig  ${'█'.repeat(24)}     3 / 3     100.0%\n`);
    } finally {
      Object.defineProperty(process, 'platform', platform);
    }
  });

  it('adds the informational internals line under a host that has one', async () => {
    expect(await printed(graded('chalk', { internals: { files: 2, tests: 9, passed: 7 } }))).toContain(
      `\n  ${' '.repeat(12)} internals     7 / 9     — 2 file(s) testing the host's own file layout; informational, never the gate\n`,
    );
  });

  it('lists the planned hosts after the grades, and nothing when there are none', async () => {
    const planned = HOSTS.filter((h) => h.status === 'planned');
    expect(planned.length).toBeGreaterThan(0);
    expect(await printed(graded('chalk'))).toContain(`\n  planned: ${planned.map((h) => h.name).join(', ')}\n`);
    out = '';
    for (const h of planned) h.status = 'rejected';
    try {
      expect(await printed(graded('chalk'))).not.toContain('planned');
      expect(json<{ planned: string[] }>(paths.results).planned).toEqual([]);
    } finally {
      for (const h of planned) h.status = 'planned';
    }
  });
});

describe('results.json', () => {
  it('replaces the re-graded rows, keeps the rest, orders them as the oracle grades them and records what is planned', async () => {
    writeFileSync(paths.results, JSON.stringify({ measured: 'then', grades: [graded('retired-host'), graded('gone-host'), graded('chalk', { passed: 1 }), graded('commander')] }));
    gradeOf.mockImplementation((h) => graded(h.name, { passed: 57 }));
    await main(['chalk', 'which'], write, paths);
    const written = json<{ measured: string; planned: string[]; grades: Grade[] }>(paths.results);
    // A row for a host the oracle no longer grades is kept, after every graded one, in the order it had.
    expect(written.grades.map((g) => [g.host, g.passed])).toEqual([
      ['commander', 58],
      ['chalk', 57],
      ['which', 57],
      ['retired-host', 58],
      ['gone-host', 58],
    ]);
    expect(written.planned).toEqual(HOSTS.filter((h) => h.status === 'planned').map((h) => h.name));
    expect(Date.parse(written.measured)).not.toBeNaN();
  });
});

describe('the verdict main returns', () => {
  it('re-grades a row that fell, and believes the red only when every attempt agrees', async () => {
    baseline('chalk', 58, 58);
    gradeOf.mockReturnValue(graded('chalk', { passed: 57, failed: 1 }));
    expect(await main(['chalk'], write, paths)).toBe(1);
    expect(gradeOf).toHaveBeenCalledTimes(3);
    expect(out).toContain('\n✖ chalk: 57 passing, baseline was 58\n');
    expect(json<{ grades: Grade[] }>(paths.results).grades[0]?.attempts).toEqual([57, 57, 57]);
  });

  it('names a row that recovered, and passes', async () => {
    baseline('chalk', 58, 58);
    gradeOf.mockReturnValueOnce(graded('chalk', { passed: 57, failed: 1 })).mockReturnValue(graded('chalk'));
    expect(await main(['chalk'], write, paths)).toBe(0);
    expect(out).toContain('\n⚠ chalk: fell on attempt 1 and recovered on attempt 2 (57 → 58 passing)');
  });

  it('re-grades a control that fell short of its own package, and fails the run when it stays short', async () => {
    gradeOf.mockReturnValue(graded('clack', { passed: 0, failed: 58, rate: 0 }));
    expect(await main(['clack', '--control'], write, paths)).toBe(1);
    expect(gradeOf).toHaveBeenCalledTimes(3);
    expect(out).toContain('\n✖ clack: nothing passed against its own package — the control proves the gate, so it has to pass\n');
  });

  it('re-grades a row that could not be graded, and counts it as broken', async () => {
    gradeOf.mockReturnValue(graded('chalk', { error: 'boom' }));
    expect(await main(['chalk'], write, paths)).toBe(1);
    expect(gradeOf).toHaveBeenCalledTimes(3);
    expect(out).toContain('\n✖ 1 host(s) could not be graded\n');
  });

  it('is 0 for a control that passes against its own package', () => {
    expect(verdict([graded('chalk')], {}, write, true)).toBe(0);
    expect(out).toBe('');
  });
});

/** What `vendor()` hands back for one host. */
const result = (host: string, over: Partial<VendorResult> = {}): VendorResult => ({
  host,
  commit: 'abcdef1234567890',
  version: '5.6.2',
  tag: 'v5.6.2',
  files: 3,
  internalFiles: ['i.js'],
  internals: ['lib/a.js', 'lib/b.js'],
  missingExtras: [],
  record: record('5.6.2', {}),
  ...over,
});

describe('--vendor', () => {
  beforeEach(() => {
    gradeOf.mockImplementation((h) => graded(h.name));
  });

  it('re-vendors each host into the vendor dir before grading, and writes what moved to vendor-diff.md', async () => {
    const before = record('5.6.1', { 'test/a.js': ['old'] });
    const after = record('5.6.2', { 'test/a.js': ['new', 'newer'] });
    const diff = diffRecords(before, after);
    vendorOf.mockReturnValueOnce(result('chalk', { tag: null, missingExtras: ['fixtures', 'x.jpg'], previous: before, diff, record: after }));
    await main(['chalk', '--vendor'], write, paths);
    expect(vendorOf.mock.calls).toEqual([[byName('chalk'), paths.vendor]]);
    expect(out).toContain('vendored chalk 5.6.2 (untagged @ abcdef12) — 3 files (1 internal-only), 2 internal module(s) shimmed\n');
    expect(out).toContain('  extraDirs not shipped at 5.6.2, skipped: fixtures, x.jpg\n');
    expect(out).toContain('  moved from 5.6.1: +2/-1 tests, +0/-0 surface names\n');
    expect(readFileSync(paths.vendorDiff, 'utf8')).toBe(`${renderDiff('chalk', before, after, diff)}\n`);
  });

  it('removes a stale vendor-diff.md when nothing moved, and says nothing about a first vendoring or an empty diff', async () => {
    writeFileSync(paths.vendorDiff, 'stale');
    const same = record('5.6.2', {});
    vendorOf.mockReturnValueOnce(result('chalk')).mockReturnValueOnce(result('which', { previous: same, diff: diffRecords(same, same) }));
    await main(['chalk', 'which', '--vendor'], write, paths);
    expect(out).toContain('vendored chalk 5.6.2 (v5.6.2 @ abcdef12)');
    expect(out).not.toContain('moved from');
    expect(out).not.toContain('extraDirs');
    expect(existsSync(paths.vendorDiff)).toBe(false);
  });

  it('never vendors without being asked', async () => {
    await main(['chalk'], write, paths);
    expect(vendorOf).not.toHaveBeenCalled();
  });
});

describe('--upstream', () => {

  it('checks every active host against npm, diffs a newer release in scratch, and writes upstream.json', async () => {
    vendoredAt('chalk', '5.6.2');
    vendoredAt('commander', '14.0.0');
    vendoredAt('clack', '1.0.0');
    const releases: Record<string, string> = { chalk: '6.0.0', commander: '14.0.0', '@clack/prompts': '1.1.0' };
    latest.mockImplementation((pkg) => releases[pkg] as string);
    const scratch: string[] = [];
    vendorOf.mockImplementation((h, into, version) => {
      scratch.push(into);
      const fresh = JSON.parse(readFileSync(join(paths.vendor, h.name, '.source.json'), 'utf8')) as CompatRecord;
      // chalk's release moved a test; clack's is a re-tag of what is vendored.
      const record = h.name === 'chalk' ? { ...fresh, version: version as string, tests: { 'test/a.js': ['a', 'b'] } } : { ...fresh, version: version as string };
      return { host: h.name, commit: 'c', version: version as string, tag: null, files: 1, internalFiles: [], internals: [], missingExtras: h.name === 'chalk' ? ['fixture.jpg'] : [], record };
    });
    expect(await main(['--upstream'], write, paths)).toBe(0);
    // Only the npm name reaches the registry: clack's key names no package.
    expect(latest.mock.calls.map(([pkg]) => pkg).sort()).toEqual(['@clack/prompts', 'chalk', 'commander']);
    expect(out).toContain('\nupstream releases\n\n');
    expect(out).toContain('  chalk        5.6.2 → 6.0.0: +1/-0 tests, +0/-0 surface names, 0 file(s) changed; extraDirs not shipped: fixture.jpg\n');
    expect(out).toContain('  commander    14.0.0 — up to date\n');
    expect(out).toContain('  clack        1.0.0 → 1.1.0: no test or surface changes\n');
    expect(out).toContain('  yargs        not vendored\n');
    expect(out).toContain('\n  2 host(s) have a newer release — see upstream.json\n');
    const written = json<{ updates: { host: string; from: string; to: string; report: string }[]; failures: unknown[] }>(paths.upstream);
    expect(written.failures).toEqual([]);
    expect(written.updates.map((u) => [u.host, u.from, u.to])).toEqual([
      ['chalk', '5.6.2', '6.0.0'],
      ['clack', '1.0.0', '1.1.0'],
    ]);
    const chalkUpdate = written.updates[0] as { report: string };
    expect(chalkUpdate.report).toContain(renderMissingExtras('6.0.0', ['fixture.jpg']));
    expect(chalkUpdate.report.startsWith('## chalk: 5.6.2 → 6.0.0')).toBe(true);
    // Each scratch clone is gone once its diff is taken.
    expect(scratch).toHaveLength(2);
    for (const dir of scratch) expect(existsSync(dir)).toBe(false);
  });

  it('says every host is current when none moved', async () => {
    latest.mockReturnValue('0.0.0');
    expect(await main(['--upstream'], write, paths)).toBe(0);
    expect(out).toContain('\n  every host checked is at its latest release\n');
  });

  it('records a host whose check threw something that is not an Error, by its string', () => {
    const out2: string[] = [];
    const code = upstreamMode((s) => out2.push(s), { hosts: [byName('chalk')], check: () => { throw 'registry said no'; }, out: paths.upstream });
    expect(code).toBe(1);
    expect(json<{ failures: unknown[] }>(paths.upstream).failures).toEqual([{ host: 'chalk', message: 'registry said no' }]);
  });
});

describe('--competitors and --fingerprint', () => {
  const checked = vi.mocked(check);
  const fingerprinted = vi.mocked(fingerprint);

  it('reports a clean watch, writes the empty update list, and exits 0', async () => {
    checked.mockResolvedValue({ updates: [], unfingerprinted: [], errors: [] });
    expect(await main(['--competitors'], write, paths)).toBe(0);
    expect(checked.mock.calls).toEqual([[paths.packages, paths.repoRoot, write]]);
    expect(out).toBe('\ncompetitor releases\n\n\n  every competitor is at its recorded release\n');
    expect(json<{ updates: unknown[] }>(paths.competitors).updates).toEqual([]);
  });

  it('names the unfingerprinted, counts the moved, and fails on a competitor it could not fetch', async () => {
    const update = { name: 'chalk', npm: 'chalk', from: '5.6.2', to: '6.0.0', title: 't', report: 'r' };
    checked.mockResolvedValue({ updates: [update], unfingerprinted: ['ink', 'ora'], errors: [{ npm: 'x', error: 'gone' }] });
    expect(await main(['--competitors'], write, paths)).toBe(1);
    expect(out).toContain('\n  2 competitor(s) hold no fingerprint yet: ink, ora\n');
    expect(out).toContain('\n  1 competitor(s) moved — see competitors-upstream.json\n');
    expect(out).toContain('\n✖ 1 competitor(s) could not be fingerprinted\n');
    expect(json<{ updates: unknown[] }>(paths.competitors).updates).toEqual([update]);
  });

  it('fingerprints the packages dir, and fails when any competitor did', async () => {
    fingerprinted.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    expect(await main(['--fingerprint'], write, paths)).toBe(0);
    expect(out).toBe('\nfingerprinting competitors\n\n\n  every competitor fingerprinted\n');
    expect(fingerprinted.mock.calls[0]).toEqual([paths.packages, write]);
    out = '';
    expect(await main(['--fingerprint'], write, paths)).toBe(1);
    expect(out).toContain('\n✖ 2 competitor(s) failed\n');
  });
});

describe('the hosts the oracle grades', () => {
  it('are the current majors, then the previous ones', () => {
    expect(gradable()).toEqual([...active(), ...PREVIOUS_MAJORS]);
  });
});
