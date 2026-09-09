/**
 * The declaration reader — `upstream-watch` R1, R4 and constraint 5.
 *
 * Two things here are load-bearing and neither is obvious.
 *
 * **A declared name is not always an npm name.** We call the prompts library `clack`; its
 * repo is `bombshell-dev/clack`; `clack` on npm is an unrelated placeholder at 0.1.0. A
 * watch that resolved the declared name would have downloaded that package, fingerprinted
 * it and reported a perfectly plausible number for the wrong library.
 *
 * **A competitor can be watched twice, at two resolutions.** flagstaff itemises ora's
 * dependency bill, where chalk is 5.6.2, and roundel is graded against chalk's latest,
 * 6.0.0. Collapsing those into one watch would make one of the two numbers wrong.
 */
import { describe, expect, it } from 'vitest';

import { type Declaration, assertResolvable, npmNameOf, watchList } from './competitors.js';

const declaration = (owner: string, subpaths: Declaration['subpaths']): Declaration => ({
  owner,
  dir: `/packages/${owner}`,
  file: `/packages/${owner}/competitors.json`,
  subpaths,
});

describe('resolving a declared name to an npm package', () => {
  it('passes an ordinary name through', () => {
    expect(npmNameOf({ package: 'ora' })).toBe('ora');
  });

  it('maps clack to the scoped package it actually is', () => {
    expect(npmNameOf({ package: 'clack' })).toBe('@clack/prompts');
  });

  it('lets an entry override the map explicitly', () => {
    expect(npmNameOf({ package: 'clack', registry: '@clack/core' })).toBe('@clack/core');
  });
});

describe('the watch list', () => {
  it('collects every claim made against one package into a single watch', () => {
    const list = watchList([
      declaration('roundel', { './chalk': [{ package: 'chalk', claim: 'compat', seen: null }] }),
      declaration('flagstaff', { './box': [{ package: 'chalk', claim: 'surface', seen: null }] }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.claims.map((c) => c.owner).sort()).toEqual(['flagstaff', 'roundel']);
    // compat beats surface: the strongest claim decides what a change costs.
    expect(list[0]?.strongest).toBe('compat');
  });

  it('keeps two resolutions of one package apart', () => {
    // chalk inside ora's bill (5.6.2) and chalk as roundel's graded host (latest) are two
    // watches. One entry would overwrite one of the two figures with the other's.
    const list = watchList([
      declaration('flagstaff', { './ora': [{ package: 'chalk', claim: 'weight', via: 'ora', seen: null }] }),
      declaration('roundel', { './chalk': [{ package: 'chalk', claim: 'compat', seen: null }] }),
    ]);
    expect(list).toHaveLength(2);
    expect(list.map((w) => w.via)).toEqual([undefined, 'ora']);
  });

  it('watches the npm package, so two names for one package are one fetch', () => {
    const list = watchList([
      declaration('caique', { './ask': [{ package: 'clack', claim: 'surface', seen: null }] }),
      declaration('other', { './x': [{ package: 'clack', registry: '@clack/prompts', claim: 'surface', seen: null }] }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.npm).toBe('@clack/prompts');
  });
});

describe('a competitor the watch cannot resolve', () => {
  it('is an error, not a shorter report', () => {
    const list = watchList([declaration('caique', { './ask': [{ package: 'made-up', claim: 'surface', seen: null }] })]);
    expect(() => assertResolvable(list, new Set(['ora']))).toThrow(/no confirmed npm package: made-up/u);
  });

  it('passes when every name is confirmed', () => {
    const list = watchList([declaration('caique', { './ask': [{ package: 'clack', claim: 'surface', seen: null }] })]);
    expect(() => assertResolvable(list, new Set(['@clack/prompts']))).not.toThrow();
  });
});
