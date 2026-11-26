import { describe, expect, it } from 'vitest';

import { type Comment, candidatesMarkdown, type Finding, findingsOf, ghQueries, mine, parseComments, prose, RULE_BOTS, wordsOf } from './mine.js';

const comment = (over: Partial<Comment>): Comment => ({
  pr: 1,
  author: 'claude[bot]',
  body: '',
  reply: false,
  inline: false,
  ...over,
});
const finding = (pr: number, text: string, author = 'ofri'): Finding => ({
  pr,
  author,
  text,
});

describe('ghQueries', () => {
  it('reads inline review comments and pull request comments since the date, one JSON object a line', () => {
    const [inline, summary] = ghQueries('o/r', '2026-11-01');
    expect(inline).toEqual([
      'api',
      '--paginate',
      'repos/o/r/pulls/comments?per_page=100&since=2026-11-01T00:00:00Z',
      '--jq',
      '.[] | {pr: (.pull_request_url | split("/") | last | tonumber), author: .user.login, body, reply: (.in_reply_to_id != null), inline: true}',
    ]);
    expect(summary).toEqual([
      'api',
      '--paginate',
      'repos/o/r/issues/comments?per_page=100&since=2026-11-01T00:00:00Z',
      '--jq',
      '.[] | select(.html_url | test("/pull/")) | {pr: (.html_url | capture("/pull/(?<n>[0-9]+)").n | tonumber), author: .user.login, body, reply: false, inline: false}',
    ]);
  });
});

describe('parseComments', () => {
  it('reads one comment a line and skips blank lines', () => {
    const lines = `${JSON.stringify(comment({ pr: 3 }))}\n  \n${JSON.stringify(comment({ pr: 4 }))}\n`;
    expect(parseComments(lines).map((one) => one.pr)).toEqual([3, 4]);
  });
});

describe('findingsOf', () => {
  it('takes an inline comment whole, as its prose', () => {
    expect(
      findingsOf(
        comment({
          pr: 7,
          author: 'ofri',
          inline: true,
          body: '  An empty catch swallows the error.  ',
        }),
      ),
    ).toEqual([{ pr: 7, author: 'ofri', text: 'An empty catch swallows the error.' }]);
  });

  it('skips a reply and a comment from a bot that is a rule already firing', () => {
    expect(findingsOf(comment({ inline: true, reply: true, body: 'agreed' }))).toEqual([]);
    expect(
      findingsOf(
        comment({
          inline: true,
          author: 'github-advanced-security[bot]',
          body: 'CodeQL alert',
        }),
      ),
    ).toEqual([]);
    expect([...RULE_BOTS]).toEqual([
      'github-advanced-security[bot]',
      'dependabot[bot]',
      'vercel[bot]',
      'codecov[bot]',
      'sonarqubecloud[bot]',
      'github-actions[bot]',
    ]);
  });

  it('takes from a summary comment only the lines that open with a severity tag', () => {
    const body = [
      '### Review',
      '**Summary:** 0 [Important], 1 [Nit], 0 [Pre-existing].',
      '  [Nit] `a.ts:3` plain tag  ',
      '#### [Important] heading tag',
      '**[Pre-existing]** bold tag',
      '**`changeset-rule`** — [Nit] bold rule id then tag',
      '`rule` - [Nit] code id then hyphen',
      'The [Nit] from the last round was answered.',
    ].join('\n');
    expect(findingsOf(comment({ pr: 2, body })).map((one) => one.text)).toEqual([
      '[Nit] `a.ts:3` plain tag',
      '#### [Important] heading tag',
      '**[Pre-existing]** bold tag',
      '**`changeset-rule`** — [Nit] bold rule id then tag',
      '`rule` - [Nit] code id then hyphen',
    ]);
    expect(findingsOf(comment({ pr: 2, body }))[0]).toEqual({
      pr: 2,
      author: 'claude[bot]',
      text: '[Nit] `a.ts:3` plain tag',
    });
  });
});

describe('prose', () => {
  it('drops HTML comments, folded details, fenced code, tags and badge lines', () => {
    const body = [
      '<!-- generated -->',
      '**<img src="x"> Major** · **Security** · **Quick win**',
      '**Check the receiver.**',
      '<details>\n<summary>Prompt</summary>\nfix it like this\n</details>',
      '```suggestion\nconst x = 1\n```',
      '  ✅ Addressed in commit abc',
      'Keep <b>Map</b> out.',
    ].join('\n');
    expect(prose(body)).toBe('**Check the receiver.**\n \n \nKeep  Map  out.');
  });

  it('keeps a line with one bold mark, which is a sentence, not badges', () => {
    expect(prose('**Major** and more')).toBe('**Major** and more');
  });
});

describe('wordsOf', () => {
  it('keeps content words in order, without paths, numbers, links or filler', () => {
    expect(wordsOf('[Nit] `packages/a/b.ts:12` — the `rmSync` call REFUSES a linked dir; see [docs](https://x.y/z) and https://a.b/c 3.0 v2 ok.')).toEqual([
      'rmsync',
      'call',
      'refuses',
      'linked',
      'dir',
      'see',
      'docs',
    ]);
  });

  it('strips edge punctuation but keeps an inner hyphen and underscore', () => {
    expect(wordsOf('-skip-changeset- my_flag. :tag:')).toEqual(['skip-changeset', 'my_flag', 'tag']);
  });
});

describe('mine', () => {
  const options = { minPrs: 2, limit: 10 };

  it('drafts a pair of content words seen in two pull requests, with one finding from each, newest first', () => {
    const found = mine(
      [finding(1, 'Empty catch swallows errors'), finding(1, 'empty catch again'), finding(3, 'An empty catch here'), finding(2, 'unrelated words entirely')],
      options,
    );
    expect(found).toEqual([
      {
        phrase: 'empty catch',
        prs: [3, 1],
        examples: [finding(3, 'An empty catch here'), finding(1, 'Empty catch swallows errors')],
      },
    ]);
  });

  it('needs minPrs pull requests, not minPrs findings', () => {
    expect(mine([finding(1, 'empty catch'), finding(1, 'empty catch')], options)).toEqual([]);
    expect(
      mine([finding(1, 'empty catch'), finding(2, 'empty catch')], {
        minPrs: 3,
        limit: 10,
      }),
    ).toEqual([]);
  });

  it('ranks by pull requests, then by phrase, and stops at the limit', () => {
    const findings = [
      finding(1, 'alpha beta'),
      finding(2, 'alpha beta'),
      finding(3, 'alpha beta'),
      finding(4, 'gamma delta'),
      finding(5, 'gamma delta'),
      finding(6, 'beta zeta'),
      finding(7, 'beta zeta'),
    ];
    expect(mine(findings, options).map((one) => one.phrase)).toEqual(['alpha beta', 'beta zeta', 'gamma delta']);
    expect(mine(findings, { minPrs: 2, limit: 1 }).map((one) => one.phrase)).toEqual(['alpha beta']);
  });

  it('drafts a cluster once: a pair whose pull requests all sit under a drafted pair is dropped', () => {
    const findings = [
      finding(1, 'missing changeset label'),
      finding(2, 'missing changeset label'),
      finding(3, 'missing changeset label'),
      finding(4, 'missing changeset'),
    ];
    expect(mine(findings, options).map((one) => [one.phrase, one.prs])).toEqual([['missing changeset', [4, 3, 2, 1]]]);
    const overlap = [...findings, finding(5, 'changeset label')];
    expect(mine(overlap, options).map((one) => [one.phrase, one.prs])).toEqual([
      ['changeset label', [5, 3, 2, 1]],
      ['missing changeset', [4, 3, 2, 1]],
    ]);
  });

  it('drafts a pattern however often one reviewer writes it', () => {
    const often = [1, 2, 3, 4, 5, 6].map((pr) => finding(pr, 'missing changeset', 'claude[bot]'));
    expect(mine(often, options).map((one) => one.prs.length)).toEqual([6]);
  });
});

describe('candidatesMarkdown', () => {
  it('heads the draft and lists each candidate with one finding a pull request', () => {
    const long = `${'x'.repeat(250)}`;
    const text = candidatesMarkdown(
      [
        {
          phrase: 'empty catch',
          prs: [3, 1],
          examples: [finding(3, 'An   empty\ncatch'), finding(1, long)],
        },
        {
          phrase: 'b c',
          prs: [2, 1],
          examples: [finding(2, 'b c'), finding(1, 'b c')],
        },
      ],
      { slug: 'o/r', since: '2026-11-01', findings: 9 },
    );
    expect(text).toBe(
      [
        '# Rule candidates for o/r',
        '',
        'Drafted by `replz mine` from 9 review finding(s) since 2026-11-01. Each pattern below was',
        'written by hand in two or more pull requests. Turn one into a lint rule or lock test in a pull',
        'request, or delete it: nothing here is a rule until a person makes it one.',
        '',
        '## 1. "empty catch": 2 pull requests',
        '',
        '- #3: An empty catch',
        `- #1: ${'x'.repeat(199)}…`,
        '',
        '## 2. "b c": 2 pull requests',
        '',
        '- #2: b c',
        '- #1: b c',
        '',
      ].join('\n'),
    );
  });

  it('keeps a finding of exactly the limit whole', () => {
    expect(candidatesMarkdown([{ phrase: 'p q', prs: [1], examples: [finding(1, 'y'.repeat(200))] }], { slug: 's', since: 'd', findings: 1 })).toContain(
      `- #1: ${'y'.repeat(200)}\n`,
    );
  });
});
