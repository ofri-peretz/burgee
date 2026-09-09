/**
 * The range resolver, tested directly — because the weight number depends on it.
 *
 * Every byte figure the watch publishes comes from resolving a competitor's own dependency
 * ranges the way npm would. Get `^5.0.0` wrong and ora's bill silently itemises chalk 6.0.0
 * at 21,417 B instead of 5.6.2 at 16,727, and the total still looks entirely plausible —
 * which is the failure mode this repo has already shipped once, in a benchmark that resolved
 * a hoisted package. A wrong resolution here is not a crash; it is a believable wrong number.
 *
 * So the cases are the ones that decide a real figure in this repo, plus the forms npm
 * actually writes into `dependencies`.
 */
import { describe, expect, it } from 'vitest';

import { bumpKind, maxSatisfying, parseVersion, satisfies } from './semver.js';

const PUBLISHED = ['4.0.0', '5.0.0', '5.3.0', '5.6.2', '6.0.0', '6.1.0-beta.1'];

describe('caret ranges', () => {
  it('stays inside the major — the rule that keeps chalk at 5.6.2 inside ora', () => {
    expect(maxSatisfying(PUBLISHED, '^5.0.0')).toBe('5.6.2');
  });

  it('treats ^0.x as locked to the minor', () => {
    expect(satisfies('0.2.9', '^0.2.3')).toBe(true);
    expect(satisfies('0.3.0', '^0.2.3')).toBe(false);
  });

  it('treats ^0.0.x as locked to the patch', () => {
    expect(satisfies('0.0.3', '^0.0.3')).toBe(true);
    expect(satisfies('0.0.4', '^0.0.3')).toBe(false);
  });

  it('reads a partial caret as bounding the major', () => {
    expect(maxSatisfying(PUBLISHED, '^5')).toBe('5.6.2');
  });
});

describe('the other forms npm writes', () => {
  it('tilde bounds the minor', () => expect(maxSatisfying(PUBLISHED, '~5.3.0')).toBe('5.3.0'));
  it('an exact version is itself', () => expect(maxSatisfying(PUBLISHED, '5.3.0')).toBe('5.3.0'));
  it('a bare major is a prefix match', () => expect(maxSatisfying(PUBLISHED, '5')).toBe('5.6.2'));
  it('an x wildcard is the same', () => expect(maxSatisfying(PUBLISHED, '5.x')).toBe('5.6.2'));
  it('comparators combine', () => expect(maxSatisfying(PUBLISHED, '>=5.0.0 <6.0.0')).toBe('5.6.2'));
  it('a union takes the best of either branch', () => expect(maxSatisfying(PUBLISHED, '^4.0.0 || ^6.0.0')).toBe('6.0.0'));
  it('a hyphen range is inclusive at both ends', () => expect(maxSatisfying(PUBLISHED, '4.0.0 - 5.3.0')).toBe('5.3.0'));
  it('* takes the newest release', () => expect(maxSatisfying(PUBLISHED, '*')).toBe('6.0.0'));
});

describe('what it refuses', () => {
  it('never selects a prerelease, which npm install would not either', () => {
    expect(satisfies('6.1.0-beta.1', '^6.0.0')).toBe(false);
    expect(maxSatisfying(PUBLISHED, '^6.0.0')).toBe('6.0.0');
  });

  it('satisfies nothing for a range it cannot parse, so the caller falls back rather than guessing', () => {
    // A git url or an npm alias. Quietly picking `latest` here would put a version in the
    // weight total that the range never asked for.
    expect(satisfies('5.6.2', 'github:chalk/chalk#main')).toBe(false);
    expect(maxSatisfying(PUBLISHED, 'npm:other@^5')).toBeNull();
  });

  it('returns null when nothing published satisfies', () => {
    expect(maxSatisfying(PUBLISHED, '^9.0.0')).toBeNull();
  });

  it('parses nothing out of a non-version', () => {
    expect(parseVersion('not-a-version')).toBeNull();
  });
});

describe('the bump between two releases', () => {
  it.each([
    ['9.4.1', '10.0.0', 'major'],
    ['9.4.1', '9.5.0', 'minor'],
    ['9.4.1', '9.4.2', 'patch'],
    ['9.4.1', '9.4.1', 'none'],
  ])('%s → %s is %s', (from, to, expected) => {
    expect(bumpKind(from, to)).toBe(expected);
  });
});
