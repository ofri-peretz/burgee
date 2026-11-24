import { describe, expect, it } from 'vitest';

import { briefText, MARKER, MAX_REPLIES, MAX_REPLY_CHARS, markerFor, previousFindings, previousRound, repliesSince, reviewedHead } from './brief.js';
import { type Item } from './checklist.js';

const ITEM: Item = { id: 'spawn', trigger: { paths: ['src/**'] }, question: 'Does it spawn through bellpull?', check: 'run the lock', sources: [] };

describe('the marker', () => {
  it('names the head it reviewed, and reads it back', () => {
    expect(markerFor('abc123')).toBe('<!-- triggerlist-review head=abc123 -->');
    expect(markerFor('abc123').startsWith(MARKER)).toBe(true);
    expect(reviewedHead(`findings\n\n${markerFor('abc123')}`)).toBe('abc123');
    expect(reviewedHead('no marker here')).toBeUndefined();
    expect(reviewedHead(undefined)).toBeUndefined();
  });
});

describe('previousFindings', () => {
  it('is the last comment that carries the marker', () => {
    const comments = [{ body: `first\n${markerFor('a1')}` }, { body: 'a person says hi' }, { body: null }, { body: `second\n${markerFor('b2')}` }, {}];
    expect(previousFindings(comments)).toBe(`second\n${markerFor('b2')}`);
  });

  it('is undefined on a pull request with no review yet', () => {
    expect(previousFindings([{ body: 'hello' }])).toBeUndefined();
    expect(previousFindings([])).toBeUndefined();
  });
});

describe('repliesSince', () => {
  const author = { login: 'ofri-peretz', type: 'User' };
  const replies = [
    { body: 'before the round', created_at: '2026-11-20T10:00:00Z', user: author },
    { body: 'a test file is not shipped; a changeset would cut an empty release', created_at: '2026-11-20T12:00:00Z', user: author },
    { body: 'bot chatter', created_at: '2026-11-20T12:30:00Z', user: { login: 'claude[bot]', type: 'Bot' } },
    { body: 'another bot', created_at: '2026-11-20T12:31:00Z', user: { login: 'helper', type: 'Bot' } },
    { body: '   ', created_at: '2026-11-20T12:32:00Z', user: author },
    { body: 'on the thread', created_at: '2026-11-20T11:30:00Z', user: author, path: 'src/a.test.ts', line: 4 },
  ];

  it('keeps the non-bot replies after the previous round, oldest first', () => {
    expect(repliesSince(replies, '2026-11-20T11:00:00Z').map((r) => r.body)).toEqual(['on the thread', 'a test file is not shipped; a changeset would cut an empty release']);
  });

  it('is empty with no previous round to count from', () => {
    expect(repliesSince(replies, undefined)).toEqual([]);
    expect(repliesSince(replies, null)).toEqual([]);
    expect(repliesSince(replies, 'not a time')).toEqual([]);
  });

  it('keeps only the latest replies, each trimmed', () => {
    const many = Array.from({ length: MAX_REPLIES + 3 }, (_, i) => ({ body: `r${i} ${'x'.repeat(MAX_REPLY_CHARS)}`, created_at: `2026-11-21T00:00:${String(i).padStart(2, '0')}Z`, user: author }));
    const kept = repliesSince(many, '2026-11-20T00:00:00Z');
    expect(kept).toHaveLength(MAX_REPLIES);
    expect(kept[0]?.body?.startsWith('r3 ')).toBe(true);
    expect(kept[0]?.body?.endsWith(' [trimmed]')).toBe(true);
    expect(kept[0]?.body?.length).toBe(MAX_REPLY_CHARS + ' [trimmed]'.length);
  });
});

describe('previousRound', () => {
  it('carries the time the last marked comment was posted', () => {
    expect(previousRound([{ body: `a\n${markerFor('a1')}`, created_at: '2026-01-01T00:00:00Z' }, { body: 'hi', created_at: '2026-01-02T00:00:00Z' }])?.created_at).toBe('2026-01-01T00:00:00Z');
  });
});

describe('briefText', () => {
  const brief = { rules: 'origin/main:REVIEW.md', rulesText: '# Rules\n\n- one\n', range: 'origin/main...HEAD', fired: [{ item: ITEM, at: [{ file: 'src/a.ts', line: 3, side: 'added' as const }] }], head: 'f00d' };

  it('hands over the base rules, what fired, no previous round, and the marker to end with', () => {
    expect(briefText({ ...brief, previous: undefined })).toBe(
      [
        '## The rules (origin/main:REVIEW.md, as the base branch has them)',
        '',
        '# Rules\n\n- one',
        '',
        '## The rules this diff fires (origin/main...HEAD)',
        '',
        '1 checklist item(s) fire for origin/main...HEAD:\n\nspawn: Does it spawn through bellpull?\n  check: run the lock\n  at: src/a.ts:3',
        '',
        '## Your findings from the previous round',
        '',
        'None: this is the first review of this pull request.',
        '',
        '## The commit under review',
        '',
        'f00d. End your one summary comment with this line, exactly:',
        '',
        '<!-- triggerlist-review head=f00d -->',
      ].join('\n'),
    );
  });

  it('carries the previous findings with the head they were made at', () => {
    const text = briefText({ ...brief, previous: `  - src/a.ts:3 spawns directly\n${markerFor('beef')}\n` });
    expect(text).toContain('## Your findings from the previous round\n\nReviewed at beef. Say which of these the new commits fixed, and do not repeat a finding that still stands unless it changed.\n\n- src/a.ts:3 spawns directly\n<!-- triggerlist-review head=beef -->\n\n## The commit under review');
    expect(briefText({ ...brief, previous: 'an older summary without a head' })).toContain('Reviewed at an unrecorded head.');
    expect(text).not.toContain('replies');
  });

  it("quotes the author's replies after the previous findings and says an answered finding is not repeated", () => {
    const replies = [
      { body: 'A test file is not shipped.\nA changeset would cut an empty release.', created_at: '2026-11-20T12:00:00Z', user: { login: 'ofri-peretz', type: 'User' } },
      { body: 'fixed', created_at: '2026-11-20T12:05:00Z', user: { login: 'ofri-peretz', type: 'User' }, path: 'src/a.ts', line: 3 },
    ];
    const text = briefText({ ...brief, previous: `changeset-for-package-change fires\n${markerFor('beef')}`, replies });
    expect(text).toContain(
      [
        '<!-- triggerlist-review head=beef -->',
        '',
        "## The author's replies since that round",
        '',
        'A finding the author answered here is not repeated unless the new diff changes the facts it rests on. Instead, say in one line that it was answered and why that answer holds or does not.',
        '',
        '- @ofri-peretz, 2026-11-20T12:00:00Z:',
        '',
        '> A test file is not shipped.',
        '> A changeset would cut an empty release.',
        '',
        '- @ofri-peretz, 2026-11-20T12:05:00Z on src/a.ts:3:',
        '',
        '> fixed',
        '',
        '## The commit under review',
      ].join('\n'),
    );
    expect(briefText({ ...brief, previous: undefined, replies })).not.toContain('replies');
  });
});
