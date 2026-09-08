/**
 * The burgee lock.
 *
 * The flag is the one thing in this package a person recognises before reading a
 * line of it, so it is locked the way the CLI's shape is: a test that goes red
 * rather than a comment that asks nicely.
 *
 * The load-bearing test is `keeps the charge legible against its own field`. The
 * middle gradient stop is not a style choice — deep rock on deep juniper is
 * 1.16:1, invisible. If someone simplifies the field to two stops, that test
 * fails with the measured ratio, which is the only way to explain why the stop
 * exists to whoever is deleting it.
 */
import { describe, expect, it } from 'vitest';

import {
  BURGEE_ANGLE,
  DEFAULT_GROUND,
  FIELD_AXIS,
  burgeeBody,
  burgeeFlagPath,
  defineBurgee,
  fieldId,
  opposedField,
  type BurgeeBrand,
} from './brand.js';

/** The charge sits at the flag's centre, which is the field's middle stop. */
const MIDPOINT = 0.5;

const ROCK = '#a84c17';
const JUNIPER = '#0a6b47';
const INK = '#0a0a0a';

const BURGEE: BurgeeBrand = {
  name: 'burgee',
  mark: { lead: ROCK, follow: JUNIPER },
  field: [
    { offset: 0, color: JUNIPER },
    { offset: 0.5, color: INK },
    { offset: 1, color: ROCK },
  ],
};

/** WCAG relative luminance, then the contrast ratio between two sRGB hexes. */
function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour of the field at a given offset, for stops that are flat or interpolated. */
function fieldColorAt(brand: BurgeeBrand, offset: number): string {
  const exact = brand.field.find((s) => s.offset === offset);
  if (exact === undefined) throw new Error(`no stop at ${offset}`);
  return exact.color;
}

describe('the flag', () => {
  it('is a swallowtail: the notch bites back from the fly', () => {
    // Five points, and the middle one is further toward the hoist than its
    // neighbours — that notch is the whole difference between a burgee and a
    // pennant, so it is asserted rather than assumed.
    expect(burgeeFlagPath()).toBe('M10 20 L94 32 L66 50 L94 68 L10 80 Z');
  });

  it('carries the charge on the Interlace angle, never another', () => {
    expect(BURGEE_ANGLE).toBe(-30);
    expect(burgeeBody(BURGEE)).toContain('rotate(-30 50 50)');
  });

  it('runs the field backwards along the axis the bars are stacked on', () => {
    // Hoist-top is juniper, and the leading bar there is rock; fly-bottom is
    // rock, and the following bar there is juniper. Each half of the mark sits
    // against its opposite — the reason the gradient is reversed at all.
    expect(fieldColorAt(BURGEE, 0)).toBe(JUNIPER);
    expect(BURGEE.mark.lead).toBe(ROCK);
    expect(fieldColorAt(BURGEE, 1)).toBe(ROCK);
    expect(BURGEE.mark.follow).toBe(JUNIPER);
    expect(FIELD_AXIS.y1).toBeLessThan(FIELD_AXIS.y2);
  });
});

describe('contrast', () => {
  it('keeps the charge legible against its own field', () => {
    // The charge sits at the centre, which is the 0.5 stop. Both bars must clear
    // 3:1 there — WCAG's floor for a graphical object.
    const under = fieldColorAt(BURGEE, MIDPOINT);
    expect(contrast(BURGEE.mark.lead, under)).toBeGreaterThanOrEqual(3);
    expect(contrast(BURGEE.mark.follow, under)).toBeGreaterThanOrEqual(3);
  });

  it('records why the middle stop exists', () => {
    // Without it the charge would sit on the field's own end colours, where the
    // deep pair is indistinguishable. This is the number that justifies the stop.
    expect(contrast(ROCK, JUNIPER)).toBeLessThan(1.5);
  });
});

describe('defineBurgee', () => {
  const brand = defineBurgee(BURGEE);

  it('is deterministic — same declaration, same bytes', () => {
    const again = defineBurgee(BURGEE);
    for (const surface of ['favicon', 'og', 'cover', 'lockup'] as const) {
      expect(brand[surface]()).toBe(again[surface]());
    }
    expect(brand.flag(32)).toBe(again.flag(32));
  });

  it('derives the one id it needs from the declaration', () => {
    // A gradient cannot be anonymous, so the id is hashed from the brand: stable
    // across runs, and distinct per brand so two can share a page.
    const other = defineBurgee({ ...BURGEE, mark: { lead: '#ffffff', follow: '#000000' } });
    expect(brand.fieldId()).toBe(fieldId(BURGEE));
    expect(brand.fieldId()).not.toBe(other.fieldId());
    expect(brand.favicon()).toContain(`id="${brand.fieldId()}"`);
  });

  it('emits no timestamps and no randomness', () => {
    const all = [brand.favicon(), brand.og({ subtitle: 'x' }), brand.cover()].join('\n');
    expect(all).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
  });

  it('needs no theme pairing — the flag carries its own field', () => {
    // One favicon file serves light and dark grounds, which is the whole payoff
    // of a field instead of a bare mark.
    expect(brand.favicon()).toBe(brand.flag(512));
  });

  it('sizes each surface to what consumes it', () => {
    expect(brand.og()).toContain('width="1200" height="630"');
    expect(brand.cover()).toContain('width="1000" height="420"');
    expect(brand.favicon()).toContain('width="512" height="512"');
  });

  it('omits the bordure unless one is declared', () => {
    expect(brand.favicon()).not.toContain('stroke=');
    const edged = defineBurgee({ ...BURGEE, bordure: { color: '#e8dcc8', width: 1.5 } });
    expect(edged.favicon()).toContain('stroke="#e8dcc8" stroke-width="3"');
  });

  it('escapes text rather than letting it close a tag', () => {
    expect(brand.og({ title: '<script>&"' })).toContain('&lt;script&gt;&amp;&quot;');
    expect(brand.og({ title: '<script>&"' })).not.toContain('<script>');
  });

  it('names the flag when the brand names itself, and hides it when it does not', () => {
    expect(brand.flag()).toContain('aria-label="burgee"');
    const anon = defineBurgee({ mark: BURGEE.mark, field: BURGEE.field });
    expect(anon.flag()).toContain('aria-hidden="true"');
  });
});

describe('someone else\u2019s burgee', () => {
  // The point of the subpath: another CLI declares two colours and its own
  // glyph, and gets the same seven surfaces without copying any of this.
  const OTHER = {
    lead: '#5b21b6',
    follow: '#0ea5e9',
  };

  it('derives a field from two colours, reversed and through a dark midpoint', () => {
    const field = opposedField(OTHER);
    // Reversed: the LEADING colour lands at the far end, so the leading half of
    // the charge sits against the following colour.
    expect(field[0]?.color).toBe(OTHER.follow);
    expect(field[2]?.color).toBe(OTHER.lead);
    expect(field[1]?.color).toBe(DEFAULT_GROUND);
  });

  it('takes a custom charge instead of the bars', () => {
    const glyph = '<circle cx="50" cy="50" r="30" fill="#ffffff"/>';
    const mine = defineBurgee({
      name: 'acme',
      mark: OTHER,
      charge: glyph,
      field: opposedField(OTHER),
    });
    expect(mine.flag()).toContain(glyph);
    // The bars must be gone entirely — a custom charge replaces them, never
    // draws underneath them.
    expect(mine.flag()).not.toContain('rx="12"');
  });

  it('gives a different brand a different gradient id', () => {
    const a = defineBurgee({ mark: OTHER, field: opposedField(OTHER) });
    const b = defineBurgee({ mark: OTHER, field: opposedField(OTHER), charge: '<rect/>' });
    expect(a.fieldId()).not.toBe(b.fieldId());
  });

  it('still projects every surface', () => {
    const mine = defineBurgee({ name: 'acme', mark: OTHER, field: opposedField(OTHER) });
    for (const surface of ['favicon', 'og', 'cover', 'lockup'] as const) {
      expect(mine[surface]()).toContain('<svg');
    }
  });
});
