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

import { declared, drift, rows, unlisted } from './roadmap-index.js';

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
    // `**review** (was `shipped`)` is a correction, and the correction is the status.
    const corrected = rows().filter((r) => r.raw.includes('(was `shipped`)'));
    expect(corrected.length).toBeGreaterThan(0);
    for (const row of corrected) expect(row.says).not.toBe('shipped');
  });

  it('returns nothing for an intent it cannot read, rather than a default', () => {
    // The template does declare a status (`draft`) — it is skipped by name, not by failing
    // to parse. A missing directory is the case that must not quietly become `draft`.
    expect(declared('no-such-intent-here')).toBeUndefined();
    expect(declared('_template')).toBe('draft');
  });
});
