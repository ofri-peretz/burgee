/**
 * `upstream-watch` R4/R5 — the competitor pass, proved offline.
 *
 * The decisions this file locks are the ones that decide whether a scheduled job is useful
 * or is noise, and all three are documented in `watch.ts` as deliberate:
 *
 *   - **The first run records, it does not report.** With no held fingerprint there is
 *     nothing to diff, and a `compare` that treated every export as an addition would open
 *     an issue per competitor on day one. `moved` refuses for the same reason.
 *   - **A `via` watch reads the parent's resolved tree**, not the competitor's own latest.
 *     flagstaff publishes chalk's bytes *as ora resolves them*; fingerprinting chalk@latest
 *     would be a plausible number computed from the wrong release — the hoisted-package
 *     defect this repo has already shipped once, in another costume.
 *   - **A competitor missing from the parent's tree is an error**, not a zero. A silent zero
 *     is how an itemised figure keeps being published after its source stopped existing.
 *
 * Nothing here touches the network: the registry seam takes the same built-byte-by-byte fake
 * that `registry.test.ts` uses, so a drift in the tar writer fails both suites at once rather
 * than letting each agree with its own copy.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakeRegistry } from './__fixtures__/fake-registry.js';
import { type Seen } from './competitors.js';
import { type Fingerprint, check, compare, fingerprint, moved, takeFingerprint } from './watch.js';

/** A held fingerprint, with only the fields a case cares about overridden. */
function held(over: Partial<Seen> = {}): Seen {
  return {
    version: '1.0.0',
    shasum: 'aaa',
    weight: 100,
    packages: 1,
    files: { 'index.js': 'h1' },
    exports: ['a'],
    ...over,
  } as Seen;
}

/** A freshly taken fingerprint, same defaults, so a case states only what moved. */
function fresh(over: Partial<Fingerprint> = {}): Fingerprint {
  return {
    version: '1.0.0',
    shasum: 'aaa',
    weight: 100,
    self: 100,
    packages: 1,
    files: { 'index.js': 'h1' },
    exports: ['a'],
    ...over,
  };
}

const NOTHING = { added: [], removed: [], filesChanged: [], filesAdded: [], filesRemoved: [] };

describe('compare — what moved between the held fingerprint and the fresh one', () => {
  it('reports nothing on the first run rather than every export as an addition', () => {
    expect(compare(null, fresh({ exports: ['a', 'b', 'c'] }))).toEqual(NOTHING);
  });

  it('reports nothing when the held record predates exports and files being recorded', () => {
    // A `seen` block written by an older version of the fingerprinter. Diffing against
    // absent fields would read every export as new, which is the day-one problem again.
    const older = { version: '1.0.0', weight: 100 } as Seen;
    expect(compare(older, fresh())).toEqual(NOTHING);
  });

  it('names exports added and removed, sorted, and leaves the unchanged ones out', () => {
    const surface = compare(held({ exports: ['a', 'b'] }), fresh({ exports: ['b', 'z', 'c'] }));
    expect(surface.added).toEqual(['c', 'z']);
    expect(surface.removed).toEqual(['a']);
  });

  it('separates a file whose hash moved from one that appeared and one that went', () => {
    const before = held({ files: { 'index.js': 'h1', 'gone.js': 'h9', 'same.js': 'h5' } });
    const after = fresh({ files: { 'index.js': 'CHANGED', 'same.js': 'h5', 'new.js': 'h7' } });
    const surface = compare(before, after);

    expect(surface.filesChanged).toEqual(['index.js']);
    expect(surface.filesAdded).toEqual(['new.js']);
    expect(surface.filesRemoved).toEqual(['gone.js']);
  });
});

describe('moved — whether a release is worth an issue', () => {
  it('is false with nothing held: the first run records', () => {
    expect(moved(null, fresh(), NOTHING)).toBe(false);
  });

  it('is false when the held version is null, for the same reason', () => {
    expect(moved(held({ version: null }), fresh(), NOTHING)).toBe(false);
  });

  it('is true on a new version', () => {
    expect(moved(held(), fresh({ version: '2.0.0' }), NOTHING)).toBe(true);
  });

  it('is true when the version is the same but the tarball is not', () => {
    // A republished release under the same version — the case a version check alone misses.
    expect(moved(held(), fresh({ shasum: 'bbb' }), NOTHING)).toBe(true);
  });

  it('is true when the weight moved, which is the figure the READMEs publish', () => {
    expect(moved(held(), fresh({ weight: 101 }), NOTHING)).toBe(true);
  });

  it('is true on a surface change alone, with version, shasum and weight all steady', () => {
    expect(moved(held(), fresh(), { ...NOTHING, added: ['brandNew'] })).toBe(true);
  });

  it('is false when nothing moved at all', () => {
    expect(moved(held(), fresh(), NOTHING)).toBe(false);
  });
});

describe('takeFingerprint', () => {
  const REGISTRY = fakeRegistry({
    chalk: {
      '5.6.2': { files: { 'index.js': 'export const a = 1;\n' } },
      '6.0.0': { files: { 'index.js': 'export const a = 1;\nexport const b = 2;\n' } },
    },
    ora: {
      '9.0.0': { files: { 'index.js': 'export default 1;\n' }, dependencies: { chalk: '5.6.2' } },
    },
    picocolors: {
      '1.1.1': { files: { 'index.js': 'export const p = 1;\n' } },
    },
  });

  it('fingerprints the competitor’s own latest when it is watched on its own', async () => {
    const print = await takeFingerprint({ npm: 'chalk' }, REGISTRY);
    expect(print.version).toBe('6.0.0');
  });

  it('fingerprints the version the parent resolves, not latest, when watched via a parent', async () => {
    // The whole point of `via`: ora resolves chalk 5.6.2 while chalk's latest is 6.0.0.
    // Reading latest here would publish a byte count computed from a release ora never loads.
    const print = await takeFingerprint({ npm: 'chalk', via: 'ora' }, REGISTRY);
    expect(print.version).toBe('5.6.2');
    expect(print.packages).toBe(1);
  });

  it('refuses when the competitor is absent from the parent’s tree instead of reporting zero', async () => {
    // picocolors is a real package in this registry, but nothing in ora's tree resolves it.
    await expect(takeFingerprint({ npm: 'picocolors', via: 'ora' }, REGISTRY)).rejects.toThrow(
      /is not in .*resolved tree/,
    );
  });
});

/** A `Write` that keeps what it was given, so a case can assert on the report text. */
function lines(): { out: string; write: (text: string) => void } {
  const sink = { out: '', write: (text: string) => void (sink.out += text) };
  return sink;
}

/**
 * `check` and `fingerprint` against a workspace on disk.
 *
 * `readDeclarations` walks a directory, so the fixture is a real directory: three lines of
 * `competitors.json` under a temp root, which is cheaper to read than a mocked `fs` and
 * exercises the JSON round-trip `fingerprint` actually performs.
 */
describe('check and fingerprint, over a workspace', () => {
  const REGISTRY = fakeRegistry({
    chalk: { '6.0.0': { files: { 'index.js': 'export const a = 1;\n' } } },
    ora: { '9.0.0': { files: { 'index.js': 'export default 1;\n' } } },
  });

  const roots: string[] = [];

  /** A packages dir holding one `competitors.json` per owner. */
  function workspace(owners: Record<string, unknown>): { root: string; packagesDir: string } {
    const root = mkdtempSync(join(tmpdir(), 'watch-'));
    roots.push(root);
    const packagesDir = join(root, 'packages');
    for (const [owner, declaration] of Object.entries(owners)) {
      mkdirSync(join(packagesDir, owner), { recursive: true });
      writeFileSync(join(packagesDir, owner, 'competitors.json'), `${JSON.stringify(declaration, null, 2)}\n`);
    }
    return { root, packagesDir };
  }

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('reports a competitor with no held fingerprint as unfingerprinted, and opens nothing', async () => {
    // The day-one case at the level the workflow sees it: `check` names what needs
    // recording, and `updates` stays empty so no issue is opened for a first sighting.
    const { root, packagesDir } = workspace({
      roundel: { './index': [{ package: 'chalk', claim: 'surface' }] },
    });
    const sink = lines();

    const result = await check(packagesDir, root, sink.write, REGISTRY);

    expect(result.unfingerprinted).toEqual(['chalk']);
    expect(result.updates).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(sink.out).toContain('no fingerprint held');
  });

  it('says up to date, and opens nothing, when the held fingerprint still matches', async () => {
    const { root, packagesDir } = workspace({
      roundel: { './index': [{ package: 'chalk', claim: 'surface' }] },
    });
    // Take the real fingerprint first, so "unchanged" means byte-identical to what the
    // registry serves rather than to a number typed into the fixture.
    await fingerprint(packagesDir, () => {}, REGISTRY);

    const sink = lines();
    const result = await check(packagesDir, root, sink.write, REGISTRY);

    expect(result.updates).toEqual([]);
    expect(result.unfingerprinted).toEqual([]);
    expect(sink.out).toContain('up to date');
  });

  it('reports one update when the held version is behind what the registry serves', async () => {
    const { root, packagesDir } = workspace({
      roundel: {
        './index': [
          { package: 'chalk', claim: 'surface', seen: { version: '5.0.0', weight: 1, packages: 1, shasum: 'old', files: {}, exports: [] } },
        ],
      },
    });
    const sink = lines();

    const result = await check(packagesDir, root, sink.write, REGISTRY);

    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toMatchObject({ npm: 'chalk', from: '5.0.0', to: '6.0.0' });
    expect(result.updates[0]?.title).toBeTruthy();
  });

  it('records a failed competitor and keeps going, rather than losing the whole run to one', async () => {
    // The scheduled job watches every competitor the family declares. One package that
    // 404s must not cost the report on all the others.
    const { root, packagesDir } = workspace({
      roundel: {
        './index': [
          { package: 'nonexistent-package', claim: 'surface' },
          { package: 'chalk', claim: 'surface' },
        ],
      },
    });
    const sink = lines();

    const result = await check(packagesDir, root, sink.write, REGISTRY);

    expect(result.errors.map((e) => e.npm)).toEqual(['nonexistent-package']);
    expect(result.unfingerprinted).toEqual(['chalk']);
  });

  it('leaves competitors.json untouched: check reports, the workflow writes', async () => {
    const { root, packagesDir } = workspace({
      roundel: { './index': [{ package: 'chalk', claim: 'surface' }] },
    });
    const file = join(packagesDir, 'roundel', 'competitors.json');
    const before = readFileSync(file, 'utf8');

    await check(packagesDir, root, () => {}, REGISTRY);

    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('fingerprint writes the seen block back, which is what makes it a reviewable diff', async () => {
    const { packagesDir } = workspace({
      roundel: { './index': [{ package: 'chalk', claim: 'surface' }] },
    });
    const file = join(packagesDir, 'roundel', 'competitors.json');

    const failures = await fingerprint(packagesDir, () => {}, REGISTRY);

    expect(failures).toBe(0);
    const written = JSON.parse(readFileSync(file, 'utf8')) as { './index': { seen?: { version: string } }[] };
    expect(written['./index'][0]?.seen?.version).toBe('6.0.0');
  });

  it('counts a competitor it could not fetch as a failure, and still writes the rest', async () => {
    const { packagesDir } = workspace({
      roundel: {
        './index': [
          { package: 'nonexistent-package', claim: 'surface' },
          { package: 'ora', claim: 'surface' },
        ],
      },
    });
    const file = join(packagesDir, 'roundel', 'competitors.json');

    const failures = await fingerprint(packagesDir, () => {}, REGISTRY);

    expect(failures).toBe(1);
    const written = JSON.parse(readFileSync(file, 'utf8')) as { './index': { package: string; seen?: { version: string } }[] };
    const ora = written['./index'].find((e) => e.package === 'ora');
    expect(ora?.seen?.version).toBe('9.0.0');
  });
});
