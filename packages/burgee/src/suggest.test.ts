/**
 * `suggestSimilar` — commander's own "Did you mean" rule, ported: optimal string alignment
 * distance, at most three edits, above 40% similarity, and only the nearest distance found.
 * And the unknown-option wording built on it.
 */
import { describe, expect, it } from 'vitest';

import { suggestSimilar } from './suggest.js';
import { jsonSpelling, singleDashHint, unknownOption } from './unknown-option.js';

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
    expect(unknownOption(parseError('--nmae'), ['name', 'force'], ['--nmae'])).toEqual({ message: 'unknown option --nmae', hint: 'did you mean --name?', fix: '--name' });
  });
  it('points at --help, and names no fix, when nothing is near', () => {
    expect(unknownOption(parseError('--zzzzzz'), ['name'], ['--zzzzzz'])).toEqual({ message: 'unknown option --zzzzzz', hint: 'run --help to see the available options' });
  });
  it('says nothing about a cause that is not an Error, or is not this error', () => {
    // A thrown object that only looks like parseArgs' error is not one.
    expect(unknownOption({ message: "Unknown option '--x'" }, ['x'], ['--x'])).toBeUndefined();
    expect(unknownOption(new Error('something else'), ['x'], [])).toBeUndefined();
  });
  it('offers --json, which every command parses, for a near miss of it', () => {
    expect(unknownOption(parseError('--jsno'), ['name'], ['--jsno'])).toEqual({ message: 'unknown option --jsno', hint: 'did you mean --json?', fix: '--json' });
  });
  // B1: 14 of 20 runs of the task that asks for JSON opened with `--format json` or `--output json`,
  // and a refusal that only said "run --help" sent each of them looking for the flag.
  it('reads --format json and --output=json as a request for --json', () => {
    const json = { hint: 'did you mean --json?' };
    expect(unknownOption(parseError('--format'), ['name'], ['get', 'k', '--format', 'json'])).toEqual({ message: 'unknown option --format', ...json, fix: 'get k --json' });
    expect(unknownOption(parseError('--output'), ['name'], ['get', '--output=json', 'k'])).toEqual({ message: 'unknown option --output', ...json, fix: 'get --json k' });
    // Another format is not JSON, and a near declared flag still wins over nothing.
    expect(unknownOption(parseError('--format'), ['name'], ['--format', 'yaml'])).toEqual({ message: 'unknown option --format', hint: 'run --help to see the available options' });
  });
  // B1 at ba8a89c: `fix: --json` sent the agent to rebuild the line around a flag. The fix is the
  // line as typed with the flag corrected — its value kept — and none when no word can be corrected.
  it('names the whole line as the fix, with the flag corrected and its value kept', () => {
    expect(unknownOption(parseError('--nmae'), ['name'], ['tool', 'greet', '--nmae=Ada Lovelace', 'x'])).toEqual({ message: 'unknown option --nmae', hint: 'did you mean --name?', fix: "tool greet '--name=Ada Lovelace' x" });
    expect(unknownOption(parseError('--nmae'), ['name'], [])).toEqual({ message: 'unknown option --nmae', hint: 'did you mean --name?' });
  });
});

describe('jsonSpelling', () => {
  it('counts the words that ask for JSON in another CLI\'s spelling, and nothing else', () => {
    expect(jsonSpelling(['--format', 'json'], 0)).toBe(2);
    expect(jsonSpelling(['--output=json'], 0)).toBe(1);
    expect(jsonSpelling(['x', '--output', 'json'], 1)).toBe(2);
    expect(jsonSpelling(['--format'], 0)).toBe(0);
    expect(jsonSpelling(['--format=agent'], 0)).toBe(0);
    expect(jsonSpelling(['--json'], 0)).toBe(0);
    expect(jsonSpelling([], 0)).toBe(0);
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
