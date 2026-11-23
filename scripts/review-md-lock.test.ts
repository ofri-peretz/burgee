/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — REVIEW.md is what the checklist compiles to, within the reviewer's budget.
 *
 * The reviewer reads REVIEW.md and `.sdlc/checklist.yaml` from the base branch
 * (.sdlc/intents/triggerlist/). A hand edit to REVIEW.md, or a checklist change nobody compiled,
 * would leave the two telling the reviewer different things; and rules past the review tool's
 * limit drop silently, so the budget is held here rather than discovered by a missed finding.
 * Fix either failure with `npx triggerlist compile` (build the package first).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { CHECKLIST, parseChecklist } from '../packages/triggerlist/src/checklist.js';
// eslint-disable-next-line import-next/no-relative-packages -- as above
import { compile, DEFAULT_BUDGET } from '../packages/triggerlist/src/compile.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('REVIEW.md', () => {
  const checklist = parseChecklist(CHECKLIST, readFileSync(resolve(ROOT, CHECKLIST), 'utf8'));
  const compiled = compile(checklist, CHECKLIST, DEFAULT_BUDGET);

  it('is exactly what `triggerlist compile` writes from the checklist', () => {
    expect(readFileSync(resolve(ROOT, 'REVIEW.md'), 'utf8'), 'fix: run `npx triggerlist compile` and commit REVIEW.md').toBe(compiled.text);
  });

  it('fits the reviewer budget, so no rule is dropped silently', () => {
    expect(compiled.drop, `fix: drop these rules or raise the budget by decision: ${compiled.drop.join(', ')}`).toEqual([]);
  });

  it('lists the checklist and REVIEW.md among its own gates, so a change to them is never judged by itself', () => {
    expect(checklist.gates).toEqual(expect.arrayContaining(['REVIEW.md', CHECKLIST, 'scripts/*-lock.test.ts']));
  });

  it('cites a source that exists for every local link', () => {
    const missing = checklist.items.flatMap((item) => item.sources.filter((source) => !source.includes('://')).filter((source) => {
      try {
        readFileSync(resolve(ROOT, source));
        return false;
      } catch {
        return true;
      }
    }));
    expect(missing).toEqual([]);
  });
});
