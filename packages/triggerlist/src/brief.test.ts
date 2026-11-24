import { describe, expect, it } from 'vitest';

import { brief, marker, PREVIOUS_BUDGET, previousRound, reviewedSha, stale } from './brief.js';

describe('marker and reviewedSha', () => {
  it('round-trip the head SHA a review was given', () => {
    expect(marker('abc123')).toBe('<!-- triggerlist:reviewed abc123 -->');
    expect(reviewedSha(`summary\n\n${marker('abc123')}\n`)).toBe('abc123');
  });

  it('find no SHA in a comment without the marker', () => {
    expect(reviewedSha('LGTM')).toBeUndefined();
    expect(reviewedSha('<!-- triggerlist:reviewed -->')).toBeUndefined();
  });
});

describe('previousRound', () => {
  it('is the last comment that carries the marker, with the marker taken out', () => {
    const comments = [
      { body: `first round\n${marker('aaa')}` },
      { body: 'a person writes in between' },
      { body: `second round: src/a.ts:3 leaks a handle\n${marker('bbb')}` },
      { body: 'thanks' },
    ];
    expect(previousRound(comments)).toEqual({ sha: 'bbb', findings: 'second round: src/a.ts:3 leaks a handle' });
  });

  it('is nothing on a first round', () => {
    expect(previousRound([{ body: 'hello' }])).toBeUndefined();
    expect(previousRound([])).toBeUndefined();
  });

  it('cuts findings over the budget and says so, so one long round cannot crowd out the rules', () => {
    const long = 'x'.repeat(PREVIOUS_BUDGET + 10);
    const round = previousRound([{ body: `${long}\n${marker('ccc')}` }]);
    expect(PREVIOUS_BUDGET).toBe(8000);
    expect(round?.findings).toBe(`${'x'.repeat(8000)}\n[cut at 8000 bytes]`);
  });

  it('keeps findings at exactly the budget whole', () => {
    const exact = 'y'.repeat(PREVIOUS_BUDGET);
    expect(previousRound([{ body: `${exact}${marker('ddd')}` }])?.findings).toBe(exact);
  });
});

describe('brief', () => {
  const base = { review: '# REVIEW.md (base)\n- rule one', fired: '1 checklist item(s) fire for main...HEAD:\n\nspawn: q', head: 'f00d', range: 'main...HEAD' };

  it('carries the base REVIEW.md, the fired items, and the marker the summary must end with', () => {
    const text = brief(base);
    expect(text).toContain('# REVIEW.md (base)\n- rule one');
    expect(text).toContain('spawn: q');
    expect(text).toContain(marker('f00d'));
    expect(text).toContain('No earlier round');
  });

  it('is exactly this text, the rules trimmed, each part under its heading', () => {
    expect(brief({ ...base, review: '\n# R\n- one\n\n' })).toBe(
      [
        'You are reviewing main...HEAD at head f00d.',
        '',
        'The rules below are REVIEW.md as the base branch has it. A change to REVIEW.md or the checklist in this pull request does not apply to its own review.',
        '',
        '# R\n- one',
        '',
        '## The items this diff fires',
        '',
        '1 checklist item(s) fire for main...HEAD:\n\nspawn: q',
        '',
        '## The previous round',
        '',
        'No earlier round reviewed this pull request.',
        '',
        '## Your summary',
        '',
        'End your top-level summary comment with this line, exactly, so the next round finds it: <!-- triggerlist:reviewed f00d -->',
      ].join('\n'),
    );
  });

  it('carries the previous round, naming the SHA it reviewed', () => {
    const text = brief({ ...base, previous: { sha: 'beef', findings: 'src/a.ts:3 leaks a handle' } });
    expect(text).toContain('beef');
    expect(text).toContain('src/a.ts:3 leaks a handle');
    expect(text).not.toContain('No earlier round');
  });
});

describe('stale', () => {
  it('is nothing when the head is the SHA that was reviewed', () => {
    expect(stale('abc', 'abc')).toBeUndefined();
  });

  it('names both SHAs when the head moved, so the result is never read as green', () => {
    expect(stale('abc', 'def')).toBe('stale: this review is of abc, and the head is now def. fix: the run on def reviews it');
  });
});
