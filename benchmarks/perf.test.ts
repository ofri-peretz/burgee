/**
 * Lock — B2 measures the package it says it measures.
 *
 * B4 has had this check since CI caught it resolving commander 8.3.0 from the workspace
 * root. B2 did not, and B2 is the axis that feeds `cold-start-ratio`, the only band it
 * has. The fixtures are plain `.mjs` and Node resolves them by walking upward, so with
 * `benchmarks/node_modules/commander` moved aside — the CI cache state the setup-action
 * fix addresses — B2 raced the front-end against a commander from 2021 and reported:
 *
 * ```
 * burgee/commander ÷ commander   1.298 ratio   gate <= 1.4    PERF_EXIT=0
 * ```
 *
 * against **1.139** minutes earlier with commander 15 present. A 14% shift, comfortably
 * inside the gate, straight into the band — and afterwards undetectable, because the
 * records carried only `detail: { fixture }`.
 *
 * **This is the disease this whole PR is about**, one axis over from where it was found:
 * a benchmark resolved from the wrong tree produces a plausible number instead of an
 * error. So B2 now goes through the same `resolvePackage` guard, and this file proves the
 * guard fires — by putting a shadowing package on disk, never by editing the check.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { msRecord, ratioRecord, resolveVariants, ROUNDS, type Variant, VARIANTS } from './axes/perf.js';
import manifest from './package.json' with { type: 'json' };
import { packageDir, resolvePackage } from './resolve.js';

const declared: Record<string, string> = { ...manifest.dependencies, ...manifest.devDependencies };

/** A tree with one package in it, at whatever version the caller wants to shadow with. */
function treeWith(name: string, version: string): string {
  const root = mkdtempSync(join(tmpdir(), 'shadow-'));
  const dir = join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }));
  return root;
}

describe('every timed variant names the package whose version decides its number', () => {
  it('declares that package in benchmarks/package.json, so the version is pinned rather than hoisted', () => {
    for (const v of VARIANTS.filter((x) => x.parses)) {
      expect(v.pkg, `${v.id} is timed but names no package, so nothing checks which one it imported`).toBeDefined();
      expect(declared[v.pkg as string], `${v.id} imports ${String(v.pkg)}, which benchmarks/package.json does not declare`).toBeDefined();
    }
  });

  it('leaves the bare-node floor without one, because it imports nothing', () => {
    expect(VARIANTS.find((v) => v.id === 'bare node')?.pkg).toBeUndefined();
  });
});

describe('the guard fires on a package that is actually being shadowed', () => {
  it('stops the run rather than timing commander 8 against a gate written for commander 15', () => {
    const shadowed = treeWith('commander', '8.3.0');
    expect(() => resolvePackage('commander', shadowed)).toThrow(/resolved commander@8\.3\.0 .* declares "\^15\.0\.0"/s);
  });

  // The contrast is the whole point: the walk itself is perfectly happy, which is why B2
  // produced a number instead of an error for as long as it had no guard on top.
  it('where the bare upward walk B2 used to rely on finds it and says nothing', () => {
    const shadowed = treeWith('commander', '8.3.0');
    expect(packageDir('commander', shadowed).version).toBe('8.3.0');
  });

  it('refuses a package benchmarks/package.json does not declare at all', () => {
    expect(() => resolvePackage('left-pad', treeWith('left-pad', '1.0.0'))).toThrow(/does not declare it/);
  });
});

describe('resolveVariants, against the tree the fixtures will actually import from', () => {
  const resolved = resolveVariants();

  it('resolves every parsing variant to a version inside its declared range', () => {
    for (const v of VARIANTS.filter((x) => x.parses)) {
      expect(resolved.get(v.id)?.version, `${v.id} resolved to nothing`).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it('resolves commander to the 15.x this axis is written against, not the 8.3.0 the root hoists', () => {
    expect(resolved.get('commander')?.version).toMatch(/^15\./);
  });
});

describe('the records say which package they timed', () => {
  const ms = [10, 11, 12];
  const commander = VARIANTS.find((v) => v.id === 'commander') as Variant;
  const front = VARIANTS.find((v) => v.id === 'burgee/commander') as Variant;

  it('carries the version and the resolved path, the way B4 rows always have', () => {
    const record = msRecord(commander, ms, 5, { dir: '/x/node_modules/commander', version: '15.0.0' });
    expect(record.detail).toMatchObject({ fixture: 'commander.mjs', package: 'commander', version: '15.0.0' });
  });

  it('says nothing it does not know for the floor row, which has no package', () => {
    const bare = VARIANTS.find((v) => v.id === 'bare node') as Variant;
    expect(msRecord(bare, ms, 5).detail).toEqual({ fixture: 'node.mjs' });
  });

  it('puts both versions on the banded ratio row, where "against which version?" matters most', () => {
    const record = ratioRecord({ v: front, ours: ms, host: ms, gateMax: 1.4, versions: { ours: '0.3.0', host: '15.0.0' } });
    expect(record.detail).toEqual({ ours: 'burgee@0.3.0', host: 'commander@15.0.0' });
  });
});

describe('the interleaving rotation', () => {
  it('is a whole number of rounds per variant, so no variant goes first more often than another', () => {
    // 40 rounds over 7 variants gave offsets 0-4 six turns and 5-6 five: a systematic
    // 20% imbalance in who paid the scheduler first, inside the numbers being ratioed.
    expect(ROUNDS % VARIANTS.length).toBe(0);
  });
});
