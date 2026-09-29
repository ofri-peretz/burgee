/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The citation probe's scoring: what counts as naming burgee, and which URLs are ours.
 * A probe that miscounts is worse than none, because four weeks of it will be quoted.
 */
import { describe, expect, it } from 'vitest';

import { FAMILY_PACKAGES, isOurs, ourUrls, scoreAnswer, urlsInText } from './citation-probe-score';

describe('scoreAnswer: burgee', () => {
  it('counts burgee in any case', () => {
    for (const text of ['Try burgee.', 'Try Burgee.', 'TRY BURGEE', "burgee's --json flag"]) {
      expect(scoreAnswer(text), text).toMatchObject({ named: true, mentions: ['burgee'] });
    }
  });

  it('does not count burgee inside another word', () => {
    for (const text of ['The burgeeing ecosystem', 'aburgee', 'burgees are flags']) {
      expect(scoreAnswer(text), text).toEqual({ named: false, mentions: [], excerpt: null });
    }
  });

  it('keeps an excerpt around the first mention', () => {
    const text = `${'x '.repeat(200)}Use burgee for this. ${'y '.repeat(200)}`;
    const { excerpt } = scoreAnswer(text);
    expect(excerpt).toContain('Use burgee for this.');
    expect(excerpt?.startsWith('…')).toBe(true);
    expect(excerpt?.endsWith('…')).toBe(true);
    expect(excerpt!.length).toBeLessThan(260);
  });

  it('scores an empty answer as not named', () => {
    expect(scoreAnswer('')).toEqual({ named: false, mentions: [], excerpt: null });
  });
});

describe('scoreAnswer: family packages', () => {
  it('counts a family package presented as the answer', () => {
    const cases: [string, string][] = [
      ['Use `closeout` to stop prompts hanging in CI.', 'closeout'],
      ['Run `npm install -D roundel` and wrap your program.', 'roundel'],
      ["import { schema } from 'linegauge';", 'linegauge'],
      ["const bp = require('bellpull');", 'bellpull'],
      ['1. **Flagstaff** — a zero-dependency parser.', 'flagstaff'],
      ['The paratext package renders help.', 'paratext'],
      ['pnpm add caique', 'caique'],
      ['`seniority@1.2.0`', 'seniority'],
    ];
    for (const [text, name] of cases) expect(scoreAnswer(text), text).toMatchObject({ named: true, mentions: [name] });
  });

  it('does not count a family name used as an ordinary word in passing', () => {
    for (const text of [
      'Seniority matters less than clear error messages.',
      'At the closeout of the sprint, run the suite.',
      'A roundel on the flagstaff is a nice touch.',
    ]) {
      expect(scoreAnswer(text), text).toEqual({ named: false, mentions: [], excerpt: null });
    }
  });

  it('lists burgee first, then family packages in family order, without repeats', () => {
    const text = 'Use `closeout`, then `roundel`, then burgee, then `closeout` again.';
    expect(scoreAnswer(text).mentions).toEqual(['burgee', 'roundel', 'closeout']);
    expect(scoreAnswer(text).excerpt).toContain('`closeout`');
  });

  it('ignores packages that are not in the family', () => {
    expect(scoreAnswer('Use `commander` or `npm install yargs`.').named).toBe(false);
  });

  it('knows nine family packages', () => {
    expect(FAMILY_PACKAGES).toHaveLength(9);
  });
});

describe('urlsInText', () => {
  it('pulls bare and markdown URLs, trimming trailing punctuation, without repeats', () => {
    const text = 'See https://burgee.interlace.tools/docs. Or [repo](https://github.com/ofri-peretz/burgee), and https://burgee.interlace.tools/docs again!';
    expect(urlsInText(text)).toEqual(['https://burgee.interlace.tools/docs', 'https://github.com/ofri-peretz/burgee']);
  });

  it('finds nothing in an empty answer', () => {
    expect(urlsInText('')).toEqual([]);
  });
});

describe('isOurs', () => {
  it('accepts interlace.tools and every subdomain of it', () => {
    for (const url of ['https://interlace.tools', 'https://burgee.interlace.tools/docs/json', 'https://a.b.interlace.tools/', 'http://ROUNDEL.Interlace.Tools/x']) {
      expect(isOurs(url), url).toBe(true);
    }
  });

  it('rejects hosts that only look like interlace.tools', () => {
    for (const url of ['https://fakeinterlace.tools', 'https://interlace.tools.evil.com', 'https://evil.com/interlace.tools']) {
      expect(isOurs(url), url).toBe(false);
    }
  });

  it('accepts ofriperetz.dev, the burgee repo, and npm pages of burgee and the family', () => {
    for (const url of [
      'https://ofriperetz.dev/blog/x',
      'https://www.ofriperetz.dev',
      'https://github.com/ofri-peretz/burgee',
      'https://github.com/Ofri-Peretz/burgee/blob/main/README.md',
      'https://github.com/ofri-peretz/burgee.git',
      'https://www.npmjs.com/package/burgee',
      'https://npmjs.com/package/closeout?activeTab=readme',
    ]) {
      expect(isOurs(url), url).toBe(true);
    }
  });

  it('rejects other repos, other packages and non-URLs', () => {
    for (const url of [
      'https://github.com/ofri-peretz/eslint',
      'https://github.com/someone/burgee',
      'https://github.com/ofri-peretz/burgee-fork',
      'https://www.npmjs.com/package/commander',
      'https://www.npmjs.com/search?q=burgee',
      'not a url',
      'ftp://interlace.tools/x',
      '',
    ]) {
      expect(isOurs(url), url).toBe(false);
    }
  });

  it('ourUrls keeps the order of the input', () => {
    expect(ourUrls(['https://x.com', 'https://b.interlace.tools', 'https://ofriperetz.dev'])).toEqual(['https://b.interlace.tools', 'https://ofriperetz.dev']);
  });
});
