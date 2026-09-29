/**
 * `suggestSimilar` — commander's own "Did you mean" rule, ported: optimal string alignment
 * distance, at most three edits, above 40% similarity, and only the nearest distance found.
 * And the unknown-option wording built on it.
 */
import { describe, expect, it } from 'vitest';

import { suggestSimilar } from './suggest.js';
import { singleDashHint, unknownOption } from './unknown-option.js';

describe('suggestSimilar', () => {
  it('offers nothing for no candidates', () => {
    expect(suggestSimilar('--x', undefined)).toBe('');
    expect(suggestSimilar('--x', [])).toBe('');
  });

  it('names the one nearest candidate', () => {
    expect(suggestSimilar('--colour', ['--color', '--verbose'])).toBe('\n(Did you mean --color?)');
    expect(suggestSimilar('stauts', ['status', 'start'])).toBe('\n(Did you mean status?)');
  });

  it('counts a swap of two neighbours as one edit', () => {
    // Levenshtein counts `rbg` → `rgb` as two; the alignment distance says one, which is what
    // puts it at the nearest distance alongside `rb`, one deletion away.
    expect(suggestSimilar('--rbg', ['--rgb', '--rb'])).toBe('\n(Did you mean one of --rb, --rgb?)');
  });

  it('keeps only the nearest distance, whichever order the candidates come in', () => {
    expect(suggestSimilar('--colour', ['--colors', '--color'])).toBe('\n(Did you mean --color?)');
    expect(suggestSimilar('--colour', ['--color', '--colors'])).toBe('\n(Did you mean --color?)');
  });

  it('lists every candidate at the nearest distance, sorted, once each', () => {
    expect(suggestSimilar('--fo', ['--foo', '--fob', '--foo'])).toBe('\n(Did you mean one of --fob, --foo?)');
  });

  it('never guesses a one-character name', () => {
    // `x` is zero edits from `x`; a guess of one character is no guess.
    expect(suggestSimilar('--x', ['--x', '--xy'])).toBe('\n(Did you mean --xy?)');
  });

  it('offers nothing when the nearest is too far or too different', () => {
    expect(suggestSimilar('--verbose', ['--quiet'])).toBe('');
    expect(suggestSimilar('--ab', ['--abcdefgh'])).toBe('');
  });
});

const parseError = (flag: string): Error => new Error(`Unknown option '${flag}'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "${flag}"`);

describe('unknownOption', () => {
  it('names the flag and the nearest declared one, as a hint and as the fix', () => {
    expect(unknownOption(parseError('--nmae'), ['name', 'force'])).toEqual({ message: 'unknown option --nmae', hint: 'did you mean --name?', fix: '--name' });
  });
  it('points at --help, and names no fix, when nothing is near', () => {
    expect(unknownOption(parseError('--zzzzzz'), ['name'])).toEqual({ message: 'unknown option --zzzzzz', hint: 'run --help to see the available options' });
  });
  it('says nothing about a cause that is not an Error, or is not this error', () => {
    // A thrown object that only looks like parseArgs' error is not one.
    expect(unknownOption({ message: "Unknown option '--x'" }, ['x'])).toBeUndefined();
    expect(unknownOption(new Error('something else'), ['x'])).toBeUndefined();
  });
});

describe('singleDashHint', () => {
  it('reads -foo=bar as the long flag a person meant', () => {
    expect(singleDashHint(['-name=ada'])).toBe('did you mean --name? a single dash introduces one-letter options');
  });
  it('stops at --, after which a -word is a value', () => {
    expect(singleDashHint(['run', '--', '-name'])).toBeUndefined();
    expect(singleDashHint(['-v'])).toBeUndefined();
  });
});
