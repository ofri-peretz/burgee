/** Names and literals at their boundaries: the first and last character each rule covers. */
import { describe, expect, it } from 'vitest';

import { memberName, newNameState, pascalCase, propertyName, quote } from './gen-ts-text.js';

describe('quote', () => {
  it.each([
    ['the last ASCII character, kept as it is', '\u007F', '"\u007F"'],
    ['the first character past ASCII', '\u0080', String.raw`"\u0080"`],
    ['the last control character, beside the first two kept', '\u001F ~', String.raw`"\u001F ~"`],
    ['every escape the printer names', '\v\f\b\r\n\t', String.raw`"\v\f\b\r\n\t"`],
    ['a NUL', '\0', String.raw`"\0"`],
    ['a NUL before a letter', '\0a', String.raw`"\0a"`],
    ['a NUL before a digit, which would read as octal', '\u00000', String.raw`"\x000"`],
    ['a NUL before a digit that other text follows', '\u00009x', String.raw`"\x009x"`],
    ['a NUL with a digit later, not next', '\0x9', String.raw`"\0x9"`],
  ])('%s', (_, given, expected) => {
    expect(quote(given)).toBe(expected);
  });
});

describe('propertyName', () => {
  it.each([
    [0, '0'],
    [0.5, '0.5'],
    [1, '1'],
    [-1, '"-1"'],
    ['1', '1'],
    ['-1', '"-1"'],
  ])('%j is %s', (given, expected) => {
    expect(propertyName(given)).toBe(expected);
  });
});

describe('memberName', () => {
  it.each([
    ['0a', 'Value0a'],
    ['1a', 'Value1a'],
    ['a', 'a'],
  ])('%s is %s', (given, expected) => {
    expect(memberName(given, newNameState())).toBe(expected);
  });
});

describe('pascalCase', () => {
  it.each([
    ['fooBar', 'FooBar'],
    ['  foo  bar ', 'FooBar'],
    ['a b', 'AB'],
    // A digit opens a later word behind an underscore, and never the first one.
    ['a 0b', 'A_0b'],
    ['a 9b', 'A_9b'],
    ['a--1', 'A_1'],
    ['-1', '1'],
    ['a éb', 'AÉb'],
  ])('%j is %s', (given, expected) => {
    expect(pascalCase(given)).toBe(expected);
  });
});
