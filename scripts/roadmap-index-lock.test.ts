/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the roadmap index and the intents it summarises say the same status word.
 *
 * The index rotted twice in three days. The second time, ten intents claimed `shipped`
 * while their rows said `review — 3 of 6` and named the unmet criteria: every drift was in
 * the flattering direction, and nothing in the repository could see it.
 */
import { describe, expect, it } from 'vitest';

import { declared, drift, rows, statusIn, unlisted } from './roadmap-index.js';

describe('roadmap index', () => {
  it('every row says what its intent says', () => {
    expect(
      drift().map((d) => `${d.slug}: row says ${d.says}, intent.md says ${d.declares}`),
      'a stale row is read as work remaining, so the work is redone or deferred behind something already finished',
    ).toEqual([]);
  });

  it('every intent is mentioned in the index', () => {
    expect(unlisted(), 'an intent the roadmap never names is work nobody schedules').toEqual([]);
  });

  it('reads the status word rather than the first word that looks like one', () => {
    // `**review** (was `shipped`)` is a correction, and the correction is the status. The index's
    // one such row (`sdlc-locks-evals-bands`) shipped on 2026-10-27, so the case is stated here.
    expect(statusIn('](./x/) | thing | — | **review** (was `shipped`) — 3 of 6 |')).toBe('review');
    expect(statusIn('](./x/) | thing | — | **shipped** 2026-10-27. Before: **approved** (was `shipped`) |')).toBe('shipped');
    expect(statusIn('](./x/) | thing | — | (was `shipped`, then `approved`) now **review** |')).toBe('review');
    expect(statusIn('](./x/) | thing | — | review(was `shipped`) |')).toBe('review');
    expect(statusIn('](./x/) | thing | — | nothing yet |')).toBeUndefined();
    for (const row of rows().filter((r) => r.raw.includes('(was `shipped`)'))) expect(row.says, row.slug).toBe(declared(row.slug));
  });

  it('returns nothing for an intent it cannot read, rather than a default', () => {
    // The template does declare a status (`draft`) — it is skipped by name, not by failing
    // to parse. A missing directory is the case that must not quietly become `draft`.
    expect(declared('no-such-intent-here')).toBeUndefined();
    expect(declared('_template')).toBe('draft');
  });
});
