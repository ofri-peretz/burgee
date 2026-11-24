/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the replz cases are runnable, and the history only grows.
 *
 * `replz run` (.sdlc/intents/replz/) is a monthly, paid run: a case that does not parse, or a
 * config that names a stage the reviewer never reports, is found then, after the money is spent.
 * So `replz check` runs here on every push, and the history (replz spec R6) is held to what the
 * last run wrote: one JSON report per line, dated, never rewritten.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { CASES, HISTORY, runCheck } from '../packages/replz/src/cli.js';
// eslint-disable-next-line import-next/no-relative-packages -- as above
import { CONFIG } from '../packages/replz/src/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('the replz cases', () => {
  // `replz check` itself refuses a case that does not parse, a file not named by its id, a draft's
  // placeholder answer, two cases with one id and a set of one kind; this runs it on every push.
  it('pass replz check: each runnable, named by its id, with both kinds in each set', () => {
    expect(() => runCheck({ repo: ROOT, config: CONFIG, cases: CASES })).not.toThrow();
  });

  it('reach the reviewer through REPLZ_REPO, which replz sets, not a path the case worktree may lack', () => {
    expect(readFileSync(join(ROOT, CONFIG), 'utf8')).toMatch(/^reviewer: bash "\$REPLZ_REPO\/\.sdlc\/replz\/reviewer\.sh"$/m);
  });
});

describe('the replz history', () => {
  const file = join(ROOT, HISTORY);
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line !== '') : [];

  it('is one dated report per line, in date order', () => {
    const dates = lines.map((line) => (JSON.parse(line) as { date: string; report: unknown }).date);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dates).toEqual(dates.toSorted());
  });
});
