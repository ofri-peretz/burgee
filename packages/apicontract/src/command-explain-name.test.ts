import { describe, expect, it } from 'vitest';

import { fileSlug, fitted, stableHash, unique } from './command-explain-name.js';

describe('stableHash', () => {
  it('is FNV-1a 32-bit in base 36', () => {
    expect(stableHash('')).toBe((0x81_1c_9d_c5).toString(36));
    expect(stableHash('a')).toBe((0xe4_0c_29_2c).toString(36));
    expect(stableHash('listPets')).toBe(stableHash('listPets'));
    expect(stableHash('é')).not.toBe(stableHash('e'));
  });
});

describe('fitted', () => {
  it('keeps text that fits, and cuts the tail of text that does not for the hash of the full id', () => {
    expect(fitted('abc', 'abc', 3)).toBe('abc');
    const long = 'x'.repeat(70);
    const name = fitted(long, 'full', 64);
    expect(name).toHaveLength(64);
    expect(name.endsWith(`_${stableHash('full')}`)).toBe(true);
  });
});

describe('unique', () => {
  it('gives a colliding name the hash of each id, and leaves the rest', () => {
    const names = unique(['getPet', 'get_pet', 'listPets'], (id) => id.toLowerCase().replace('_', ''), 64);
    expect(names.get('listPets')).toBe('listpets');
    expect(names.get('getPet')).toBe(`getpet_${stableHash('getPet')}`);
    expect(names.get('get_pet')).toBe(`getpet_${stableHash('get_pet')}`);
  });

  it('counts names that differ only in case as a collision', () => {
    expect(unique(['getPet', 'GetPet'], (id) => id, 64).get('GetPet')).toBe(`GetPet_${stableHash('GetPet')}`);
  });

  it('keeps a colliding name within the limit', () => {
    const names = unique(['a', 'b'], () => 'y'.repeat(64), 64);
    expect(names.get('a')).toHaveLength(64);
  });
});

describe('fileSlug', () => {
  it('keeps word characters, dots and dashes, and turns the rest into one dash', () => {
    expect(fileSlug('listPets')).toBe('listPets');
    expect(fileSlug('get /pets/{id}')).toBe('get-pets-id');
    expect(fileSlug('../x')).toBe('x');
    expect(fileSlug('v1.pets-list')).toBe('v1.pets-list');
  });

  it('names an id with no usable character `operation`, and cuts a long one with its hash', () => {
    expect(fileSlug('{}')).toBe('operation');
    expect(fileSlug('z'.repeat(120))).toHaveLength(100);
  });
});
