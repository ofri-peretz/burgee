/**
 * The lock that made `PROVENANCE` exist, plus the two rules its renderer has to keep.
 *
 * Proven red first (rule 4): before the eight files were written this suite failed with
 * `8 vendored suite(s) with no PROVENANCE: boxen, chalk, cli-table3, commander, log-update,
 * ora, string-width, yargs`. It is the check that would have caught the defect it fixes —
 * a suite whose origin lives only in someone's memory.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { executableAt } from './binaries.js';
import {
  disagreements,
  fieldsFromRecord,
  parseProvenance,
  PROVENANCE_FILE,
  readProvenance,
  renderProvenance,
  UNTAGGED,
} from './provenance.js';
import { type CompatRecord, readRecord } from './upstream.js';

const VENDOR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'vendor');

const suites = (): string[] =>
  existsSync(VENDOR)
    ? readdirSync(VENDOR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];

const record = (name: string): CompatRecord | undefined => readRecord(join(VENDOR, name));

const sample: CompatRecord = {
  repo: 'https://github.com/chalk/chalk',
  version: '6.0.0',
  tag: 'v6.0.0',
  commit: '661317e6f91fe7c90306c2c48ea9354562ee9146',
  vendored: '2026-09-08',
  files: 8,
  internalFiles: [],
  internals: [],
  hashes: {},
  tests: {},
  surface: {},
};

describe('the provenance header', () => {
  it('round-trips every field it renders', () => {
    const parsed = parseProvenance(renderProvenance(fieldsFromRecord('chalk', sample, '2026-09-14')));
    expect(parsed).toMatchObject({
      package: 'chalk',
      repo: sample.repo,
      version: '6.0.0',
      tag: 'v6.0.0',
      commit: sample.commit,
      vendored: '2026-09-08',
      files: '8',
      tool: 'scripts/vendor-suite.ts',
      verified: '2026-09-14',
    });
  });

  /**
   * A release with no tag is the one case where `vendor()` clones HEAD instead, and the
   * record says so with `tag: null`. Rendering that as an empty value would read as a tag
   * nobody filled in; it has to read as the fact it is.
   */
  it('says out loud when a release carried no tag rather than leaving the field blank', () => {
    const text = renderProvenance(fieldsFromRecord('x', { ...sample, tag: null }));
    expect(parseProvenance(text).tag).toBe(UNTAGGED);
  });

  it('stops reading at the first blank line, so the prose can never be parsed as a field', () => {
    expect(parseProvenance('package: chalk\n\ncommit: deadbeef\n')).toEqual({ package: 'chalk' });
  });

  it('names every field where a hand-edit made the two records disagree', () => {
    const parsed = parseProvenance(renderProvenance(fieldsFromRecord('chalk', sample)));
    expect(disagreements(parsed, sample)).toEqual([]);
    expect(disagreements({ ...parsed, commit: 'cafe' }, sample)).toEqual([
      { field: 'commit', provenance: 'cafe', source: sample.commit },
    ]);
  });

  it('skips a header line with no key, or a key that is not lower-case words', () => {
    // `orphan` has no colon; read as one, its first five letters would pass for a key.
    expect(parseProvenance('package: chalk\n: orphan\norphan\nno colon here\nNotAKey: x\nnote-2: y\ntag: v1\n')).toEqual({ package: 'chalk', tag: 'v1' });
  });

  it('renders a note last, and aligns every value one column past the longest key', () => {
    const header = renderProvenance({ ...fieldsFromRecord('chalk', sample, '2026-09-14'), note: 'hand-checked' }).split('\n\n')[0] as string;
    expect(header.split('\n').slice(-3)).toEqual(['tool:     scripts/vendor-suite.ts', 'verified: 2026-09-14', 'note:     hand-checked']);
  });

  it('reads a directory’s header, and nothing from one without the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'provenance-'));
    expect(readProvenance(dir)).toBeUndefined();
    writeFileSync(join(dir, PROVENANCE_FILE), renderProvenance(fieldsFromRecord('chalk', sample)));
    expect(readProvenance(dir)).toMatchObject({ package: 'chalk', version: '6.0.0' });
    rmSync(dir, { recursive: true, force: true });
  });

  it('names a field the header lacks as absent', () => {
    const { commit: _, ...parsed } = parseProvenance(renderProvenance(fieldsFromRecord('chalk', sample)));
    expect(disagreements(parsed, sample)).toEqual([{ field: 'commit', provenance: '(absent)', source: sample.commit }]);
  });

  it('names every omitted executable in the header count and in a section of its own', () => {
    const omitted = [
      { path: 'test/fixtures/fast-exit-darwin', format: 'Mach-O' as const, sha256: 'a'.repeat(64) },
      { path: 'test/fixtures/fast-exit-linux', format: 'ELF' as const, sha256: 'b'.repeat(64) },
    ];
    const withOmitted = { ...sample, omitted };
    const text = renderProvenance(fieldsFromRecord('execa', withOmitted));
    expect(parseProvenance(text).omitted).toBe('2');
    expect(text).toContain('Not vendored');
    expect(text).toContain(`    test/fixtures/fast-exit-darwin  Mach-O executable  sha256 ${'a'.repeat(64)}`);
    expect(text).toContain(`    test/fixtures/fast-exit-linux   ELF executable  sha256 ${'b'.repeat(64)}`);
    expect(disagreements(parseProvenance(text), withOmitted)).toEqual([]);
    // A count that drifts from the record, either way, is a hand-edit.
    expect(disagreements({ ...parseProvenance(text), omitted: '1' }, withOmitted)).toEqual([{ field: 'omitted', provenance: '1', source: '2' }]);
    expect(disagreements({ ...parseProvenance(renderProvenance(fieldsFromRecord('chalk', sample))), omitted: '2' }, sample)).toEqual([
      { field: 'omitted', provenance: '2', source: '0' },
    ]);
  });

  it('renders a suite with nothing omitted exactly as before the field existed', () => {
    const text = renderProvenance(fieldsFromRecord('chalk', { ...sample, omitted: [] }));
    expect(text).toBe(renderProvenance(fieldsFromRecord('chalk', sample)));
    expect(text).not.toContain('omitted');
    expect(text).toContain('byte for byte.\n\nWhy a clone');
  });

  it('prints the command that remakes the directory', () => {
    expect(renderProvenance(fieldsFromRecord('chalk', sample))).toContain('scripts/vendor-suite.ts chalk --version 6.0.0');
  });
});

describe('every vendored suite says where it came from', () => {
  it('has eight suites to account for', () => {
    expect(suites().length).toBeGreaterThan(0);
  });

  it('carries a PROVENANCE beside every .source.json', () => {
    const missing = suites().filter((n) => !existsSync(join(VENDOR, n, PROVENANCE_FILE)));
    expect(missing, `${missing.length} vendored suite(s) with no ${PROVENANCE_FILE}: ${missing.join(', ')}`).toEqual([]);
  });

  it('agrees with the machine record beside it, field for field', () => {
    const wrong: string[] = [];
    for (const name of suites()) {
      const source = record(name);
      const at = join(VENDOR, name, PROVENANCE_FILE);
      if (source === undefined || !existsSync(at)) continue;
      for (const d of disagreements(parseProvenance(readFileSync(at, 'utf8')), source)) {
        wrong.push(`${name}: ${d.field} is "${d.provenance}" but .source.json says "${d.source}"`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /**
   * **No vendored file is a compiled executable.** OpenSSF Scorecard's Binary-Artifacts check
   * scored this repository 8 / 10 for execa's `test/fixtures/fast-exit-darwin` and
   * `fast-exit-linux`, vendored verbatim with the rest of its tests. Read by content, over
   * every file git would commit here — tracked, or new and not ignored — so a binary put back
   * by hand is as red as one a re-vendor brings. Proven red by restoring `fast-exit-linux`.
   */
  it('holds no compiled executable, tracked or about to be', () => {
    const root = resolve(VENDOR, '..');
    const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'vendor'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((l) => l !== '');
    expect(listed.length, 'git listed nothing under vendor/, so this lock would pass vacuously').toBeGreaterThan(0);
    const found = listed.flatMap((rel) => {
      const at = join(root, rel);
      if (!existsSync(at) || !lstatSync(at).isFile()) return [];
      const format = executableAt(at);
      return format === undefined ? [] : [`${rel} (${format})`];
    });
    expect(found, `compiled executable(s) under vendor/ — the vendor step omits these (binaries.ts); delete them and record them under \`omitted\`: ${found.join(', ')}`).toEqual([]);
  });

  it('names every omitted file in PROVENANCE, and none of them is in the tree', () => {
    const wrong: string[] = [];
    for (const name of suites()) {
      const omitted = record(name)?.omitted ?? [];
      const at = join(VENDOR, name, PROVENANCE_FILE);
      const text = existsSync(at) ? readFileSync(at, 'utf8') : '';
      for (const o of omitted) {
        if (!text.includes(o.path) || !text.includes(o.sha256)) wrong.push(`${name}: ${o.path} is omitted in .source.json and not named in ${PROVENANCE_FILE}`);
        if (existsSync(join(VENDOR, name, o.path))) wrong.push(`${name}: ${o.path} is recorded as omitted and is still here`);
      }
    }
    expect(wrong).toEqual([]);
    // Not vacuous: execa's two are recorded.
    expect(record('execa')?.omitted?.map((o) => o.path)).toEqual(['test/fixtures/fast-exit-darwin', 'test/fixtures/fast-exit-linux']);
  });

  /**
   * The one thing `.source.json` cannot say and a reader most needs: no shim is committed
   * here, because its body names the target and `run.ts` writes it per run. A directory
   * whose PROVENANCE lost that paragraph would invite the next agent to commit one.
   */
  it('records that the shim is generated per run and not vendored', () => {
    const silent = suites().filter((n) => {
      const at = join(VENDOR, n, PROVENANCE_FILE);
      return existsSync(at) && !readFileSync(at, 'utf8').includes('COMPAT_TARGET');
    });
    expect(silent).toEqual([]);
  });
});
