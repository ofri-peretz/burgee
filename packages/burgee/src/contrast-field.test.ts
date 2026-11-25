/**
 * `fieldColorAt` — the colour under a point of the gradient, which every contrast finding
 * about a burgee is measured against. Past the second of three stops, before the first, after
 * the last, and a field with no stops at all.
 */
import { describe, expect, it } from 'vitest';

import { auditBurgee, check, fieldColorAt, report } from './contrast.js';

const THREE = [
  { offset: 1, color: '#0000ff' },
  { offset: 0, color: '#ff0000' },
  { offset: 0.5, color: '#00ff00' },
];

describe('fieldColorAt', () => {
  it('reads stops in offset order, whatever order they were given in', () => {
    expect(fieldColorAt(THREE, 0.5)).toBe('#00ff00');
  });
  it('mixes between the two stops either side of the point, past the second stop too', () => {
    expect(fieldColorAt(THREE, 0.25)).toBe('#808000');
    expect(fieldColorAt(THREE, 0.75)).toBe('#008080');
  });
  it('holds the end colours outside the stops', () => {
    expect(fieldColorAt(THREE, -1)).toBe('#ff0000');
    expect(fieldColorAt(THREE, 2)).toBe('#0000ff');
  });
  it('reads a point that is not a number as the last stop, rather than mixing towards NaN', () => {
    expect(fieldColorAt(THREE, Number.NaN)).toBe('#0000ff');
  });
  it('returns an end stop’s own colour, as given, at its exact offset', () => {
    // A mix would write it back out lower-cased; the stop itself is returned untouched.
    const ends = [{ offset: 0, color: '#FF0000' }, { offset: 1, color: '#0000FF' }];
    expect(fieldColorAt(ends, 0)).toBe('#FF0000');
    expect(fieldColorAt(ends, 1)).toBe('#0000FF');
  });
  it('refuses a field with no stops', () => {
    expect(() => fieldColorAt([], 0.5)).toThrow('burgee: a field needs at least one stop');
  });
});

describe('check and report', () => {
  it('passes a ratio exactly at what is required', () => {
    expect(check('ink', '#000000', '#ffffff', 21)).toMatchObject({ ratio: 21, passes: true });
    expect(check('ink', '#000000', '#ffffff', 21.01).passes).toBe(false);
  });

  it('aligns each finding under the longest name, one line each', () => {
    const findings = [check('a', '#000000', '#ffffff', 4.5), check('longer', '#777777', '#888888', 3)];
    expect(report(findings)).toBe('pass  a       #000000 on #ffffff  21.00:1 (needs 4.5:1)\nFAIL  longer  #777777 on #888888  1.26:1 (needs 3:1)');
  });
});

describe('auditBurgee', () => {
  it('checks each ground against the flag’s first edge, then its last', () => {
    const findings = auditBurgee({ mark: { lead: '#ffffff', follow: '#ffffff' }, field: [{ offset: 0, color: '#111111' }, { offset: 1, color: '#222222' }] }, ['#eeeeee']);
    expect(findings.slice(2).map((f) => f.a)).toEqual(['#111111', '#222222']);
  });
});
