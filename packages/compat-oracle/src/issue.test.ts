/**
 * `upstream-watch` R6 and R8 — the issue body, asserted byte-for-byte.
 *
 * "Proven by a fixture, not by waiting: a recorded 'old' fingerprint and a recorded 'new'
 * one produce a known issue body." The renderer is pure, so this needs no network and no
 * upstream release: the whole body is compared as one string, which is the only way a
 * change to the wording is a change somebody has to look at.
 *
 * The bump cases are the ones with teeth. An added export on a `compat` claim is a `minor`;
 * a **removed** export proposes no bump at all, because a façade dropping a method is a
 * decision a person makes and an issue proposing `major` would be proposing that decision.
 */
import { describe, expect, it } from 'vitest';

import { type IssueInput, issueTitle, proposeBump, renderIssue } from './issue.js';

const ORA_MOVED: IssueInput = {
  name: 'ora',
  npm: 'ora',
  from: '9.4.1',
  to: '9.5.0',
  shasum: '0f1e2d3c4b5a69788796a5b4c3d2e1f009182736',
  surface: { added: ['oraStream'], removed: [], filesChanged: ['index.d.ts', 'index.js'], filesAdded: [], filesRemoved: [] },
  weight: { before: 113_577, after: 118_204, packagesBefore: 17, packagesAfter: 17 },
  claims: [
    {
      owner: 'flagstaff',
      subpath: './ora',
      claim: 'compat',
      targets: ['packages/flagstaff/src/ora.ts', 'packages/flagstaff/src/ora.test.ts'],
      citations: [{ file: 'packages/flagstaff/src/weight.test.ts', line: 75, text: 'against ora 9.4.1 — 113,577 B in seventeen packages' }],
    },
  ],
};

const EXPECTED = `## ora: 9.4.1 → 9.5.0

A minor release. Fingerprinted from the published tarball, read-only — no install, nothing executed.

### What changed

| | |
| :-- | :-- |
| exports added | \`oraStream\` |
| exports removed | — |
| weight | 113,577 → 118,204 B (+4.1%) across 17 packages |
| files changed | \`index.d.ts\`, \`index.js\` |
| files added | — |
| files removed | — |
| tarball sha1 | \`0f1e2d3c4b5a69788796a5b4c3d2e1f009182736\` |

### What it costs us

\`flagstaff/ora\` claims **compat** against ora and is graded by its own suite.
\`oraStream\` is new upstream — the grade is now against a suite that has moved.
This published figure is now stale:
- \`packages/flagstaff/src/weight.test.ts:75\` — against ora 9.4.1 — 113,577 B in seventeen packages

### What our change should be

- [ ] \`packages/flagstaff/src/ora.ts\`
- [ ] \`packages/flagstaff/src/ora.test.ts\`
- [ ] \`packages/flagstaff/src/weight.test.ts:75\` — the ora figure

\`\`\`changeset
---
'flagstaff': minor
---

\`flagstaff/ora\` follows ora 9.5.0: adds \`oraStream\`.

The weight comparison moves with it — ora 9.5.0 is 118,204 B across 17 packages, against 113,577 B at 9.4.1.
\`\`\`
`;

describe('the issue body', () => {
  it('renders a known before/after pair byte-for-byte', () => {
    expect(renderIssue(ORA_MOVED)).toBe(EXPECTED);
  });

  it('titles one issue per (competitor, version), which is what the workflow dedupes on', () => {
    expect(issueTitle('ora', '9.5.0')).toBe('upstream: ora 9.5.0 released');
  });

  it('names the npm package when it is not what we call the competitor', () => {
    const body = renderIssue({ ...ORA_MOVED, name: 'clack', npm: '@clack/prompts' });
    expect(body).toContain('## clack (`@clack/prompts`): 9.4.1 → 9.5.0');
  });
});

describe('the proposed bump', () => {
  it('is minor for an added export on a compat claim', () => {
    expect(proposeBump(ORA_MOVED)).toBe('minor');
  });

  it('is nothing at all for a removed export — that is a decision, not a follow', () => {
    const removed: IssueInput = { ...ORA_MOVED, surface: { added: [], removed: ['oraPromise'], filesChanged: [], filesAdded: [], filesRemoved: [] } };
    expect(proposeBump(removed)).toBeNull();
    const body = renderIssue(removed);
    expect(body).toContain('No changeset is proposed');
    expect(body).toContain('proposing a bump here would be proposing that decision');
    expect(body).not.toContain("'flagstaff': major");
  });

  it('is patch when only the weight moved: numbers change, code does not', () => {
    const weightOnly: IssueInput = { ...ORA_MOVED, surface: { added: [], removed: [], filesChanged: [], filesAdded: [], filesRemoved: [] } };
    expect(proposeBump(weightOnly)).toBe('patch');
  });

  it('is nothing for a surface claim, which has promised nothing to break', () => {
    const surfaceOnly: IssueInput = {
      ...ORA_MOVED,
      claims: [{ owner: 'flagstaff', subpath: './box', claim: 'surface', targets: [], citations: [] }],
    };
    expect(proposeBump(surfaceOnly)).toBeNull();
    expect(renderIssue(surfaceOnly)).toContain('nothing is graded yet, so nothing is broken');
  });
});

describe('a release that stops shipping a file', () => {
  // Not hypothetical: commander 15.0.0 dropped `esm.mjs` and `typings/esm.d.mts` while its
  // 141 exported names stayed identical. A diff that only compared files present on both
  // sides would have called that major "eleven files changed" and proposed a bump for it.
  const dropped: IssueInput = {
    ...ORA_MOVED,
    surface: { added: [], removed: [], filesChanged: [], filesAdded: [], filesRemoved: ['esm.mjs', 'typings/esm.d.mts'] },
  };

  it('names the dropped files rather than folding them into "changed"', () => {
    expect(renderIssue(dropped)).toContain('| files removed | `esm.mjs`, `typings/esm.d.mts` |');
  });

  it('proposes no bump: a disappearing entry point is a decision', () => {
    expect(proposeBump(dropped)).toBeNull();
    expect(renderIssue(dropped)).toContain('No changeset is proposed');
  });

  it('says an entry point vanishing breaks callers whatever the name list says', () => {
    expect(renderIssue(dropped)).toContain('an entry point that disappears breaks callers who import it');
  });
});

describe('what the issue refuses to say', () => {
  it('invents no file when none could be derived', () => {
    const noTargets: IssueInput = {
      ...ORA_MOVED,
      claims: [{ owner: 'flagstaff', subpath: './ora', claim: 'compat', targets: [], citations: [] }],
    };
    expect(renderIssue(noTargets)).toContain('_No file in the tree could be derived for this change._');
  });

  it('marks a first fingerprint as such rather than reporting every export as an addition', () => {
    const first: IssueInput = {
      ...ORA_MOVED,
      from: null,
      surface: { added: [], removed: [], filesChanged: [], filesAdded: [], filesRemoved: [] },
      weight: { before: null, after: 113_577, packagesBefore: null, packagesAfter: 17 },
    };
    const body = renderIssue(first);
    expect(body).toContain('A first fingerprint release.');
    expect(body).toContain('113,577 B across 17 packages (first fingerprint)');
  });
});
