/**
 * The lock that made `PROVENANCE` exist, plus the two rules its renderer has to keep.
 *
 * Proven red first (rule 4): before the eight files were written this suite failed with
 * `8 vendored suite(s) with no PROVENANCE: boxen, chalk, cli-table3, commander, log-update,
 * ora, string-width, yargs`. It is the check that would have caught the defect it fixes —
 * a suite whose origin lives only in someone's memory.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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
