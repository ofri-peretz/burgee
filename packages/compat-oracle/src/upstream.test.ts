import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { HOSTS, type Host } from './hosts.js';
import { type Update, upstreamMode } from './report.js';

import { type CompatRecord, diffRecords, isEmptyDiff, latestVersion, renderDiff, renderMissingExtras, sha256, snapshot, surfaceNames, testNames } from './upstream.js';

// `npm view` is the one network call in this file, so it is the one call faked.
vi.mock('node:child_process', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:child_process')>()), execFileSync: vi.fn() }));

const record = (over: Partial<CompatRecord>): CompatRecord => ({
  repo: 'r',
  version: '1.0.0',
  tag: 'v1.0.0',
  commit: 'a'.repeat(40),
  vendored: '2026-09-07',
  files: 1,
  internalFiles: [],
  internals: [],
  hashes: { 'tests/a.test.js': 'h1' },
  tests: { 'tests/a.test.js': ['one', 'two'] },
  surface: { 'typings/index.d.ts': ['Command', 'Command.option'] },
  ...over,
});

describe('fingerprinting an upstream release', () => {
  it('reads test titles as written, in order, for node:test and mocha styles', () => {
    const src = `test('when x then y', () => {});\n  it("quoted \\"inner\\" name", async () => {});\ndescribe(\`tpl\`, () => {});`;
    expect(testNames(src)).toEqual(['when x then y', 'quoted \\"inner\\" name', 'tpl']);
  });

  it('reads exported names and Class.method names from a typings file', () => {
    const dts = [
      'export class Command extends EventEmitter {',
      '  constructor(name?: string);',
      '  option(flags: string): this;',
      '  requiredOption<T>(flags: string): this;',
      '}',
      'export function createCommand(name?: string): Command;',
      'export interface ParseOptions { from: string }',
    ].join('\n');
    expect(surfaceNames(dts)).toEqual(['Command', 'Command.option', 'Command.requiredOption', 'ParseOptions', 'createCommand']);
  });
});

describe('diffing two records', () => {
  it('is empty when a release re-tags the same tests and surface', () => {
    const before = record({});
    const after = record({ version: '1.0.1', tag: 'v1.0.1', commit: 'b'.repeat(40) });
    expect(isEmptyDiff(diffRecords(before, after))).toBe(true);
    expect(renderDiff('h', before, after, diffRecords(before, after))).toMatch(/re-tag of what is vendored/);
  });

  it('names exactly what a release added, removed and changed', () => {
    const before = record({});
    const after = record({
      version: '1.1.0',
      hashes: { 'tests/a.test.js': 'h2', 'tests/b.test.js': 'h3' },
      tests: { 'tests/a.test.js': ['one', 'three'], 'tests/b.test.js': ['four'] },
      surface: { 'typings/index.d.ts': ['Command', 'Command.option', 'Command.helpGroup'] },
    });
    const diff = diffRecords(before, after);
    expect(diff.files).toEqual({ added: ['tests/b.test.js'], removed: [], changed: ['tests/a.test.js'] });
    expect(diff.tests.added).toEqual(['tests/a.test.js :: three', 'tests/b.test.js :: four']);
    expect(diff.tests.removed).toEqual(['tests/a.test.js :: two']);
    expect(diff.surface.added).toEqual(['typings/index.d.ts :: Command.helpGroup']);
    const body = renderDiff('commander', before, after, diff);
    expect(body).toMatch(/## commander: 1\.0\.0 → 1\.1\.0/);
    expect(body).toMatch(/### Surface names added \(1\)/);
    expect(body).toMatch(/Command\.helpGroup/);
  });
});

describe('the edges of a record', () => {
  it('keeps a backslash that ends the file inside the title rather than reading past it', () => {
    expect(testNames("test('ends in \\")).toEqual(['ends in \\']);
  });

  it('fingerprints the graded files and whichever declared surface files exist', () => {
    const clone = mkdtempSync(join(tmpdir(), 'snapshot-'));
    mkdirSync(join(clone, 'test', 'issues'), { recursive: true });
    writeFileSync(join(clone, 'test', 'a.test.js'), "test('a', () => {});\n");
    writeFileSync(join(clone, 'test', 'issues', 'b.test.js'), "it('b', () => {});\n");
    writeFileSync(join(clone, 'index.d.ts'), 'export declare function run(): void;\n');
    const host = { ...(HOSTS[0] as Host), testDir: 'test', testGlob: '*.test.js', surfaceFiles: ['index.d.ts', 'gone.d.ts'] };
    const meta = { version: '1.0.0', tag: null, commit: 'c', vendored: 'd', files: 2, internalFiles: [], internals: [] };
    const record = snapshot(clone, host, meta);
    expect(record.tests).toEqual({ 'test/a.test.js': ['a'], 'test/issues/b.test.js': ['b'] });
    expect(record.surface).toEqual({ 'index.d.ts': ['run'] });
    expect(record.hashes['index.d.ts']).toBe(sha256('export declare function run(): void;\n'));
    // A host that declares no surface files fingerprints its tests alone.
    const { surfaceFiles: _, ...bare } = host;
    expect(snapshot(clone, bare, meta).surface).toEqual({});
    rmSync(clone, { recursive: true, force: true });
  });

  it('prints an untagged release as a dash, and points the re-vendor at its commit', () => {
    const before = record({ tag: null });
    const after = record({ version: '1.1.0', tag: null, commit: 'b'.repeat(40), tests: { 'tests/a.test.js': ['one'] } });
    const body = renderDiff('h', before, after, diffRecords(before, after));
    expect(body).toContain('| tag | — | — |');
    expect(body).toContain(`re-vendors at ${'b'.repeat(8)};`);
  });

  it('asks npm for the newest release, and trims what it prints', () => {
    vi.mocked(execFileSync).mockReturnValueOnce('6.0.0\n');
    expect(latestVersion('chalk')).toBe('6.0.0');
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith('npm', ['view', 'chalk', 'version'], { encoding: 'utf8' });
  });
});

describe('a fixture the release stopped shipping', () => {
  it('says "them" when it skipped more than one', () => {
    const body = renderMissingExtras('18.0.4', ['tests/.env.vault', 'tests/.env.me']);
    expect(body).toContain("pruning them from the host's `extraDirs`, and checking the control still loads without them.");
  });

  it('adds nothing to the issue body when every extraDirs entry was shipped', () => {
    expect(renderMissingExtras('18.0.4', [])).toBe('');
  });

  it('names the skipped fixture in the issue body, so the re-vendor prunes it', () => {
    // dotenv 18 removed `tests/.env.vault`; the upstream issue has to carry that, because
    // the vendor step now skips it rather than throwing and nothing else would say so.
    const body = renderMissingExtras('18.0.4', ['tests/.env.vault']);
    expect(body).toMatch(/### Fixtures `extraDirs` names that 18\.0\.4 does not ship \(1\)/);
    expect(body).toContain('tests/.env.vault');
    expect(body).toMatch(/pruning it from the host's `extraDirs`/);
  });
});

describe('one host that throws, in --upstream', () => {
  // dotenv's ENOENT on 2026-09-27 ended the check for every host after it and wrote no
  // `upstream.json`, so no issue opened for the seven releases already found. The check is
  // injected here: this is about the loop, not about cloning anything.
  const [first, broken, last] = HOSTS.slice(0, 3) as [Host, Host, Host];
  const run = (): { code: number; checked: string[]; log: string; written: { updates: Update[]; failures: { host: string; message: string }[] } } => {
    const dir = mkdtempSync(join(tmpdir(), 'upstream-mode-'));
    const out = join(dir, 'upstream.json');
    const checked: string[] = [];
    let log = '';
    const code = upstreamMode((s) => (log += s), {
      hosts: [first, broken, last],
      out,
      check: (host) => {
        checked.push(host.name);
        if (host === broken) throw new Error("ENOENT: no such file or directory, lstat 'tests/.env.vault'");
        return { host: host.name, from: '1.0.0', to: '2.0.0', report: `## ${host.name}` };
      },
    });
    const written = JSON.parse(readFileSync(out, 'utf8')) as { updates: Update[]; failures: { host: string; message: string }[] };
    rmSync(dir, { recursive: true, force: true });
    return { code, checked, log, written };
  };

  it('still checks every host after it, and writes the releases the others found', () => {
    const { checked, written } = run();
    expect(checked).toEqual([first.name, broken.name, last.name]);
    expect(written.updates.map((u) => u.host)).toEqual([first.name, last.name]);
  });

  it('records the failure by host and message, and exits non-zero so the job stays red', () => {
    const { code, written, log } = run();
    expect(code).toBe(1);
    expect(written.failures).toEqual([{ host: broken.name, message: "ENOENT: no such file or directory, lstat 'tests/.env.vault'" }]);
    expect(log).toMatch(/1 host\(s\) could not be checked/);
    expect(log).toContain(`${broken.name}: ENOENT`);
  });

  it('exits zero when no host throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'upstream-mode-'));
    const code = upstreamMode(() => undefined, { hosts: [first, last], out: join(dir, 'upstream.json'), check: () => undefined });
    rmSync(dir, { recursive: true, force: true });
    expect(code).toBe(0);
  });
});
