import { describe, expect, it } from 'vitest';

import { parseHex } from './hex.js';

const ORANGE = 0xff8000;

describe('parseHex', () => {
  describe('a valid colour', () => {
    it('reads six digits as a number', () => {
      expect(parseHex('#ff8000')).toBe(ORANGE);
    });

    it('reads upper-case digits', () => {
      expect(parseHex('#FF8000')).toBe(ORANGE);
    });
  });

  describe('rejects', () => {
    it('a value without the hash', () => {
      expect(() => parseHex('ff8000')).toThrow(/^not a hex colour: ff8000$/);
    });

    it('text before the hash', () => {
      expect(() => parseHex('x#ff8000')).toThrow(/^not a hex colour: x#ff8000$/);
    });

    it('a seventh digit', () => {
      expect(() => parseHex('#ff80000')).toThrow(/^not a hex colour: #ff80000$/);
    });

    it('five digits', () => {
      expect(() => parseHex('#ff800')).toThrow(/^not a hex colour: #ff800$/);
    });

    it('a digit outside hex', () => {
      expect(() => parseHex('#gg8000')).toThrow(/^not a hex colour: #gg8000$/);
    });
  });
});
