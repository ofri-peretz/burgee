/**
 * The contrast lock.
 *
 * burgee's own flag has to clear WCAG AA, and so does the ground the docs site
 * flies it on. Both were worked out by hand once; this is what stops them
 * drifting back. If someone darkens the docs background or brightens the field's
 * middle stop, this goes red with the measured ratio attached, which is the only
 * form of the argument that survives a year.
 */
import { describe, expect, it } from 'vitest';

import { AA, auditBurgee, contrast, fieldColorAt, luminance, mix, report } from './contrast.js';

const ROCK = '#a84c17';
const JUNIPER = '#0a6b47';
const INK = '#0a0a0a';

/** burgee's declaration, mirroring scripts/brand.mts. */
const BURGEE = {
  mark: { lead: ROCK, follow: JUNIPER },
  field: [
    { offset: 0, color: JUNIPER },
    { offset: 0.5, color: INK },
    { offset: 1, color: ROCK },
  ],
};

/** The docs app's ground, mirroring apps/docs/src/app/global.css. */
const DOCS_GROUND = ['#eaf1ec', '#f7efe3'];

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    // Black on white is exactly 21:1 by definition — if this drifts, the
    // luminance curve is wrong and every other number here is fiction.
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBeCloseTo(0, 5);
  });

  it('accepts short hex and rejects nonsense', () => {
    expect(contrast('#fff', '#000')).toBeCloseTo(21, 5);
    expect(() => contrast('red', '#000')).toThrow(/not a hex colour/);
  });

  it('reads a colour from part-way along a gradient', () => {
    expect(fieldColorAt(BURGEE.field, 0)).toBe(JUNIPER);
    expect(fieldColorAt(BURGEE.field, 1)).toBe(ROCK);
    expect(fieldColorAt(BURGEE.field, 0.5)).toBe(INK);
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe("burgee's own flag", () => {
  const findings = auditBurgee(BURGEE, DOCS_GROUND);

  it('clears AA everywhere, on its own field and on the docs ground', () => {
    const failed = findings.filter((f) => !f.passes);
    expect(report(findings)).toContain('pass');
    expect(failed).toEqual([]);
  });

  it('holds the two numbers the design rests on', () => {
    // The middle stop exists to lift these above 3:1. They are the reason the
    // field is three stops and not two.
    const [lead, follow] = findings;
    expect(lead?.ratio).toBeGreaterThanOrEqual(AA.GRAPHIC);
    expect(follow?.ratio).toBeGreaterThanOrEqual(AA.GRAPHIC);
    // And this is what the field would be without it — the failure being avoided.
    expect(contrast(ROCK, JUNIPER)).toBeLessThan(1.5);
  });

  it('fails loudly when a ground is too dark for it', () => {
    // Every dark ground tested during design failed; this keeps that finding
    // attached to the code rather than to a conversation.
    const dark = auditBurgee(BURGEE, ['#0a0a0f', '#12201b']);
    expect(dark.some((f) => !f.passes)).toBe(true);
  });

  it('catches a brand whose bars vanish into its own field', () => {
    const broken = auditBurgee({
      mark: { lead: JUNIPER, follow: '#0a7a52' },
      field: [{ offset: 0, color: JUNIPER }],
    });
    expect(broken.every((f) => !f.passes)).toBe(true);
    expect(report(broken)).toContain('FAIL');
  });
});
