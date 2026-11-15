/**
 * The bytes each surface is, pinned.
 *
 * `brand.test.ts` locks what a flag must be (a swallowtail, a charge on the Interlace angle, a
 * legible field) and `brand-edges.test.ts` the optional parts, each read off the SVG by a
 * property. Neither held the geometry itself: a coordinate, a layout fraction or a card size
 * could move and every assertion still pass. The one check that did hold it,
 * `npm run brand -- --check`, compares the committed `brand-assets/` in a separate process
 * against the built package, so a test run never saw it, and most of the mutants that survived
 * in `brand.ts` (mutation run, 2026-11-14) were those numbers.
 *
 * The header promises "the same brand always produces the same bytes". These snapshots are
 * those bytes, for one brand without options and one with every optional part, on each
 * surface. A change here is a change to every asset a brand has: regenerate the snapshot
 * (`vitest -u`) and `brand-assets/` (`npm run brand`) in the same commit, on purpose.
 */
import { describe, expect, it } from 'vitest';

import { defineBurgee, opposedField, type BurgeeBrand } from './brand.js';

const PLAIN: BurgeeBrand = {
  name: 'burgee',
  mark: { lead: '#a84c17', follow: '#0a6b47' },
  field: [
    { offset: 0, color: '#0a6b47' },
    { offset: 0.5, color: '#0a0a0a' },
    { offset: 1, color: '#a84c17' },
  ],
};

const DRESSED: BurgeeBrand = {
  name: "o'reilly & <co>",
  mark: { lead: '#5b21b6', follow: '#0ea5e9' },
  field: opposedField({ lead: '#5b21b6', follow: '#0ea5e9' }),
  sheen: 0.16,
  bevel: 0.28,
  markings: '<circle cx="50" cy="50" r="10" fill="#ffffff"/>',
  bordure: [
    { color: '#111111', width: 1 },
    { color: '#efe9dd', width: 0.75 },
  ],
};

const CUSTOM: BurgeeBrand = {
  mark: { lead: '#5b21b6', follow: '#0ea5e9' },
  field: [{ offset: 0, color: '#123456' }],
  shape: 'M0 50 A42 42 0 1 1 84 50 A42 42 0 1 1 0 50 Z',
  charge: '<rect x="40" y="40" width="20" height="20"/>',
  bevel: 0.3,
  bordure: { color: '#e8dcc8', width: 1.5 },
};

/** A sheen alone: the clip it needs is drawn for it, with no bevel or markings to ask for one. */
const LIT: BurgeeBrand = { ...PLAIN, name: 'lit', sheen: 0.2 };

/** Long enough to wrap on every card, with a double space a wrap must not keep. */
const SUBTITLE = 'One declaration, every identity surface:  the flag, the favicon, the social card and the cover, none of them able to drift.';

describe.each([
  ['a brand without options', PLAIN],
  ['a brand with every optional part', DRESSED],
  ['a brand with its own shape, charge and bevel', CUSTOM],
  ['a brand with a sheen alone', LIT],
])('the bytes of %s', (_what, declared) => {
  const brand = defineBurgee(declared);

  it('flag, at its own size and at 32', () => {
    expect(brand.flag()).toMatchSnapshot();
    expect(brand.flag(32)).toMatchSnapshot();
  });

  it('alive', () => {
    expect(brand.alive()).toMatchSnapshot();
  });

  it('favicon', () => {
    expect(brand.favicon()).toMatchSnapshot();
  });

  it('og, bare and with a wrapping subtitle', () => {
    expect(brand.og()).toMatchSnapshot();
    expect(brand.og({ title: 'burgee/brand', subtitle: SUBTITLE })).toMatchSnapshot();
  });

  it('cover, on both grounds', () => {
    expect(brand.cover()).toMatchSnapshot();
    expect(brand.cover({ theme: 'light', subtitle: SUBTITLE })).toMatchSnapshot();
  });

  it('lockup, on both grounds and on a ground of its own', () => {
    expect(brand.lockup()).toMatchSnapshot();
    expect(brand.lockup({ theme: 'light' })).toMatchSnapshot();
    expect(brand.lockup({ width: 300, height: 90, background: '#000000', foreground: '#ffffff', muted: '#888888', subtitle: 'cli' })).toMatchSnapshot();
  });
});
