/**
 * R1, criterion 2 and 5 — the precedence as a truth table, held to the shared vectors.
 *
 * `precedence-vectors.json` is the reviewed answer: one row per combination of the five
 * sources. This file holds `TRUTH_TABLE` (what the docs page is generated from) and `resolve`
 * (what a run does) to it; `packages/burgee/src/precedence-vectors.test.ts` holds a real burgee
 * program to the same rows. Editing `ORDER` without the vectors fails both suites, and so does
 * editing the vectors without `ORDER`.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ORDER, resolve, type BuiltinSource, type Layers } from './precedence.js';
import { TRUTH_TABLE, truthTable } from './truth-table.js';

const VECTORS = JSON.parse(readFileSync(new URL('precedence-vectors.json', import.meta.url), 'utf8')) as ReadonlyArray<{
  set: BuiltinSource[];
  winner: BuiltinSource | null;
}>;

describe('TRUTH_TABLE is the shared vectors, row for row', () => {
  it('has one row per combination of the five sources', () => {
    expect(TRUTH_TABLE).toHaveLength(2 ** ORDER.length);
    expect(new Set(TRUTH_TABLE.map((r) => r.set.join('+'))).size).toBe(TRUTH_TABLE.length);
  });

  it('equals precedence-vectors.json', () => {
    expect(TRUTH_TABLE).toEqual(VECTORS);
  });

  it('is generated from ORDER, so it is the same object whoever asks', () => {
    expect(truthTable(ORDER)).toEqual(TRUTH_TABLE);
    expect(Object.isFrozen(TRUTH_TABLE)).toBe(true);
  });
});

describe('truthTable over any order', () => {
  it('groups by winner, highest first, lists each set in the order given, and ends on nothing set', () => {
    expect(truthTable(['a', 'b', 'c'])).toEqual([
      { set: ['a'], winner: 'a' },
      { set: ['a', 'b'], winner: 'a' },
      { set: ['a', 'c'], winner: 'a' },
      { set: ['a', 'b', 'c'], winner: 'a' },
      { set: ['b'], winner: 'b' },
      { set: ['b', 'c'], winner: 'b' },
      { set: ['c'], winner: 'c' },
      { set: [], winner: null },
    ]);
  });

  it('has the one empty row for an empty order', () => {
    expect(truthTable([])).toEqual([{ set: [], winner: null }]);
  });
});

/** Every source sets `region` to its own name, so a winning value names its source too. */
function layersFor(set: readonly BuiltinSource[]): Layers {
  return {
    flags: set.includes('flag') ? { region: 'flag' } : {},
    env: set.includes('env') ? { APP_REGION: 'env' } : {},
    envPrefix: 'APP',
    ...(set.includes('config') ? { config: { path: '/w/app.config.json', data: { region: 'config' } } } : {}),
    ...(set.includes('package') ? { pkg: { path: '/w/package.json', data: { region: 'package' } } } : {}),
  };
}

describe('resolve agrees with every row', () => {
  it.each(VECTORS.map((v) => [v.set.join(' + ') || 'nothing set', v] as const))('%s', (_, { set, winner }) => {
    const specs = { region: set.includes('default') ? { default: 'default' } : {} };
    const r = resolve(specs, layersFor(set));
    expect(r.values['region']).toBe(winner ?? undefined);
    expect(r.provenance['region']?.source).toBe(winner ?? undefined);
  });
});
