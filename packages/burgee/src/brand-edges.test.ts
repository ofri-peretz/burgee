/**
 * The burgee's optional parts and the card's text block, at the edges brand.test.ts does not
 * reach: a bordure of several bands or of none, markings, a subtitle long enough to wrap, and
 * a card with no title — each read off the SVG it produces.
 */
import { describe, expect, it } from 'vitest';

import { defineBurgee, type BurgeeBrand } from './brand.js';

const BRAND: BurgeeBrand = {
  mark: { lead: '#a84c17', follow: '#0a6b47' },
  field: [
    { offset: 0, color: '#0a6b47' },
    { offset: 0.5, color: '#0a0a0a' },
    { offset: 1, color: '#a84c17' },
  ],
};

const strokes = (svg: string): string[] => [...svg.matchAll(/stroke="(#[0-9a-f]+)" stroke-width="([\d.]+)"/g)].map((m) => `${m[1] ?? ''}@${m[2] ?? ''}`);

describe('the bordure', () => {
  it('draws several bands widest-first, each spanning every band inside it', () => {
    const flag = defineBurgee({ ...BRAND, bordure: [{ color: '#111111', width: 1 }, { color: '#222222', width: 2 }] }).flag();
    // Outer band: (1 + 2) × 2; inner band: 2 × 2. Filled over, each shows at its own width.
    expect(strokes(flag)).toEqual(['#111111@6', '#222222@4']);
  });
  it('draws nothing for an empty list', () => {
    expect(strokes(defineBurgee({ ...BRAND, bordure: [] }).flag())).toEqual([]);
  });
});

describe('markings', () => {
  it('sit inside the silhouette, clipped to it', () => {
    const b = defineBurgee({ ...BRAND, markings: '<circle id="m" r="3"/>' });
    expect(b.flag()).toContain(`<g clip-path="url(#${b.fieldId()}-c)"><circle id="m" r="3"/></g>`);
    expect(defineBurgee(BRAND).flag()).not.toContain('clip-path="url(#');
  });
});

const texts = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? '');

describe('the card’s text block', () => {
  it('wraps a long subtitle into lines at word boundaries, none of them empty', () => {
    const subtitle = Array.from({ length: 24 }, (_, i) => `word${String(i)}`).join(' ');
    const lines = texts(defineBurgee({ ...BRAND, name: 'Acme' }).og({ subtitle })).slice(1);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(subtitle);
    expect(lines.every((l) => l !== '' && !l.startsWith(' ') && !l.endsWith(' '))).toBe(true);
  });

  it('keeps a word longer than a line whole, on its own line', () => {
    const long = 'x'.repeat(200);
    expect(texts(defineBurgee({ ...BRAND, name: 'Acme' }).og({ subtitle: `short ${long} tail` })).slice(1)).toEqual(['short', long, 'tail']);
    // First, too: no empty line is pushed ahead of it.
    expect(texts(defineBurgee({ ...BRAND, name: 'Acme' }).og({ subtitle: `${long} tail` })).slice(1)).toEqual([long, 'tail']);
  });

  it('prints no subtitle line for a subtitle of only whitespace', () => {
    expect(texts(defineBurgee({ ...BRAND, name: 'Acme' }).og({ subtitle: '   ' }))).toEqual(['Acme']);
  });

  it('draws no title when there is neither a title nor a name, and labels the card “burgee”', () => {
    const card = defineBurgee(BRAND).og();
    expect(texts(card)).toEqual([]);
    expect(card).toContain('aria-label="burgee"');
  });

  it('falls back to the brand’s name for the label when the title is given empty', () => {
    const card = defineBurgee({ ...BRAND, name: 'Acme' }).cover({ title: '' });
    expect(texts(card)).toEqual([]);
    expect(card).toContain('aria-label="Acme"');
  });
});
