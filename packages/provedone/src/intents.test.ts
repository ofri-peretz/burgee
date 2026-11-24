import { describe, expect, it } from 'vitest';

import { checkIntent, criteria, evidenceRows, expectedExit, fillTemplate, indexDrift, missingOutput, SLUG, statusOf, unevidenced } from './intents.js';

const intent = (status: string, extra = ''): string =>
  [`# Intent — a title`, '', `**Status:** ${status} · **Opened:** \`2026-11-23\``, '', '## What is wanted', 'x', '## Why now', 'x', '## Constraints', 'x', '## Success criteria', '- one', '- two', extra].join('\n');

const rules = (slug: string, text: string, spec?: string): string[] => checkIntent(slug, text, spec).map((f) => f.rule);

describe('checkIntent', () => {
  it('finds nothing in a well-formed intent', () => {
    expect(checkIntent('ok', intent('review'), undefined)).toEqual([]);
  });

  it('names the intent, the rule, the message and the fix of each finding', () => {
    expect(checkIntent('bad', intent('review').replace('# Intent — a title', '# A title'), undefined)).toEqual([
      {
        intent: 'bad',
        rule: 'title',
        message: 'no `# Intent — <title>` line',
        fix: 'make the first line `# Intent — <short title>`',
      },
    ]);
  });

  it('needs the title at the start of a line', () => {
    expect(rules('t', intent('review').replace('# Intent — a title', 'see # Intent — a title'))).toEqual(['title']);
  });

  it('needs a non-blank title after the dash', () => {
    expect(rules('t', intent('review').replace('# Intent — a title', '# Intent — '))).toEqual(['title']);
  });

  it('refuses an unknown or missing status, naming the statuses', () => {
    expect(checkIntent('s', intent('unknown'), undefined)).toEqual([
      {
        intent: 's',
        rule: 'status',
        message: 'unknown or missing status "unknown"',
        fix: 'write `**Status:** <draft|review|approved|shipped|dropped>` under the title',
      },
    ]);
    expect(checkIntent('s', intent('review').replace('**Status:**', 'Status:'), undefined)[0]?.message).toBe('unknown or missing status "undefined"');
  });

  it.each(['draft', 'review', 'dropped'])('accepts %s without a spec', (status) => {
    expect(rules('s', intent(status))).toEqual([]);
  });

  it('names each missing section', () => {
    const text = intent('review').replace('## Why now', '## Why').replace('## Constraints', '## Limits');
    expect(checkIntent('m', text, undefined)).toEqual([
      {
        intent: 'm',
        rule: 'section',
        message: 'lacks ## Why now',
        fix: 'add a `## Why now` section',
      },
      {
        intent: 'm',
        rule: 'section',
        message: 'lacks ## Constraints',
        fix: 'add a `## Constraints` section',
      },
    ]);
    expect(rules('m', intent('review').replace('## What is wanted', '## Wanted'))).toEqual(['section']);
  });

  it('accepts either success heading, and names the missing one', () => {
    expect(rules('h', intent('review').replace('## Success criteria', '## How we will know it worked'))).toEqual([]);
    expect(checkIntent('h', intent('review').replace('## Success criteria', '## Done'), undefined)).toEqual([
      {
        intent: 'h',
        rule: 'success',
        message: 'no `## Success criteria`',
        fix: 'add `## Success criteria`: each line checkable by a person or a command',
      },
    ]);
  });

  it.each(['approved', 'shipped'])('needs a spec when %s', (status) => {
    expect(checkIntent('d', intent(status, '## Shipped'), undefined)).toEqual([
      {
        intent: 'd',
        rule: 'spec',
        message: `is "${status}" but has no spec.md`,
        fix: 'write .sdlc/intents/d/spec.md, or set the status back to review',
      },
    ]);
    expect(rules('d', intent(status), '## Rejected alternatives\n')).toEqual([]);
  });

  it.each(['Rejected alternatives', 'Explicit non-goals', 'Non-goals', 'Out of scope', 'Risks and rejected options'])('accepts a spec that records "%s"', (heading) => {
    expect(rules('r', intent('review'), `# Design\n\n## ${heading}\n`)).toEqual([]);
  });

  it('refuses a spec that rejects nothing, even when the word appears mid-line', () => {
    expect(checkIntent('r', intent('review'), 'text ## Rejected\n### Rejected\n## Rejectedness')).toEqual([
      {
        intent: 'r',
        rule: 'rejected',
        message: 'spec.md records nothing rejected',
        fix: 'add `## Rejected alternatives` or `## Out of scope` to spec.md',
      },
    ]);
  });
});

describe('statusOf', () => {
  it('reads the status on any line, and only after the bold label', () => {
    expect(statusOf('x\n**Status:**   shipped · y')).toBe('shipped');
    expect(statusOf('x **Status:** shipped')).toBeUndefined();
  });
});

describe('unevidenced', () => {
  it('is true for a shipped intent with no evidence', () => {
    expect(unevidenced(intent('shipped'))).toBe(true);
  });

  it.each(['## Shipped', '## Shipped 2026-11-01', '## Restated', '| Criterion | Command | Output |', '|Criterion|x|'])('is false when it carries %s', (evidence) => {
    expect(unevidenced(intent('shipped', `\n${evidence}`))).toBe(false);
  });

  it('is false for an intent that is not shipped, and true for evidence words that are not its headings', () => {
    expect(unevidenced(intent('review'))).toBe(false);
    expect(unevidenced(intent('shipped', '\n## Shippedness\ntext ## Shipped\n| Criteria |\nsee | Criterion |'))).toBe(true);
  });
});

describe('indexDrift', () => {
  const readme = [
    '| Intent | Status |',
    '| --- | --- |',
    '| [`a/`](a/intent.md) | review |',
    '| [`b/`](b/intent.md) | shipped |',
    '| [`c/`](c/intent.md) | not a status |',
    'see [`a/`] | draft |',
    '| [`b/`](b/intent.md) | an extra cell | review |',
  ].join('\n');

  it('reports each index row whose status disagrees with the intent', () => {
    const statuses = new Map([
      ['a', 'shipped'],
      ['b', 'shipped'],
      ['c', 'draft'],
    ]);
    expect(indexDrift(readme, statuses)).toEqual([
      {
        intent: 'a',
        rule: 'index',
        message: 'the index says "review", the intent says "shipped"',
        fix: 'set the index row\'s status to "shipped"',
      },
      {
        intent: 'b',
        rule: 'index',
        message: 'the index says "review", the intent says "shipped"',
        fix: 'set the index row\'s status to "shipped"',
      },
    ]);
  });

  it('reports an intent with no status of its own', () => {
    expect(indexDrift(readme, new Map([['b', undefined]]))[0]?.message).toBe('the index says "shipped", the intent says "undefined"');
  });

  it('is empty for an intent the index does not list', () => {
    expect(indexDrift(readme, new Map([['z', 'draft']]))).toEqual([]);
  });
});

describe('criteria', () => {
  it('lists the success criteria in order', () => {
    expect(criteria(intent('review'))).toEqual(['one', 'two']);
  });

  it('reads the other heading, and is empty with neither', () => {
    expect(criteria('## How we will know it worked\n- a\n')).toEqual(['a']);
    expect(criteria('## Other\n- a\n')).toEqual([]);
  });
});

describe('evidenceRows', () => {
  const text = [
    '| Criterion | Command | Output |',
    '| --- | --- | --- |',
    '| C1. a | `npm test` | `ok` |',
    '| C2. b | `a` and `b` | x |',
    '| C3. c | ran `npm test` | x |',
    '| C4. d | `npm test` (twice) | x |',
    '| C5. e |',
    '| C6. f | `npm test` |',
    '| C7. g | `x` | |',
  ].join('\n');

  it('sets the command only when the cell is one code span alone, and skips a row with fewer than three cells', () => {
    expect(evidenceRows(text)).toEqual([
      { criterion: 'C1. a', command: 'npm test', output: '`ok`' },
      { criterion: 'C2. b', command: undefined, output: 'x' },
      { criterion: 'C3. c', command: undefined, output: 'x' },
      { criterion: 'C4. d', command: undefined, output: 'x' },
      { criterion: 'C7. g', command: 'x', output: '' },
    ]);
  });
});

describe('expectedExit', () => {
  it('reads `exit N`, else 0', () => {
    expect(expectedExit('refused, exit 2')).toBe(2);
    expect(expectedExit('exit 12 later')).toBe(12);
    expect(expectedExit('exited 2, exit2')).toBe(0);
    expect(expectedExit('fine')).toBe(0);
  });
});

describe('missingOutput', () => {
  it('lists the recorded code spans the output no longer contains', () => {
    expect(missingOutput('`a` then `b c` and `d`', 'xx a xx b c')).toEqual(['d']);
    expect(missingOutput('prose only', '')).toEqual([]);
  });
});

describe('fillTemplate', () => {
  it('fills every date and handle placeholder', () => {
    expect(fillTemplate('<YYYY-MM-DD> @<handle> <YYYY-MM-DD> <handle>', '2026-11-23', 'me')).toBe('2026-11-23 @me 2026-11-23 me');
  });
});

describe('SLUG', () => {
  it.each(['a', 'a-b', 'v2-x9'])('accepts %s', (slug) => {
    expect(SLUG.test(slug)).toBe(true);
  });

  it.each(['A', 'a_b', '-a', 'a-', 'a--b', 'a b', '', 'x/a'])('refuses "%s"', (slug) => {
    expect(SLUG.test(slug)).toBe(false);
  });
});
