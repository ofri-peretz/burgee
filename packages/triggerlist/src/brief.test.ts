import { describe, expect, it } from 'vitest';

import { briefText, MARKER, markerFor, previousFindings, reviewedHead } from './brief.js';
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
  });
});
