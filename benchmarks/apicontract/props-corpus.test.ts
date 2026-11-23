/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The pure half of the props corpus lane (`.sdlc/intents/contract-properties/`, success criterion
 * 1): how one `contractdiff props --json` run becomes a row, and how the rows fold into the reading.
 * The runner itself spawns the built CLI over the pinned set and is exercised by the lane.
 */
import { describe, expect, it } from 'vitest';

import { foldProps, propsRow, renderPropsSummary, type PropsRow } from './props-corpus.js';

const tally = (checked: number, failed = 0, discarded = 0): { checked: number; discarded: number; failed: number } => ({ checked, discarded, failed });

const passing = JSON.stringify({
  ok: true,
  data: {
    seed: 1,
    runs: 1000,
    tallies: { agreement: tally(5000), 'round-trip': tally(5000), normalise: tally(5000), soundness: tally(0) },
    counterexamples: [],
    reported: [{ keyword: 'enum-with-constraints', at: ['/'] }],
    skipped: [],
  },
});

const failing = JSON.stringify({
  ok: false,
  data: {
    seed: 1,
    runs: 1000,
    tallies: { agreement: tally(5000, 1), 'round-trip': tally(5000), normalise: tally(5000), soundness: tally(2000, 1, 300) },
    counterexamples: [
      { property: 'agreement', operation: 'getPet', payload: 'response:200', value: 1, detail: 'refused a valid value' },
      { property: 'soundness', operation: 'placeOrder', payload: 'body', value: 2, detail: 'called compatible (backward)' },
    ],
    reported: [],
    skipped: [{ operation: 'x', payload: 'y', reason: 'z' }],
  },
});

const unreadable = JSON.stringify({ ok: false, error: { kind: 'runtime', code: 1, message: 'no input format reads bad.json. fix: pass a document one of these reads: openapi' } });

describe('propsRow', () => {
  it('reads a passing run: every tally, no counterexample, the reported keywords counted', () => {
    const row = propsRow({ id: 'a', kind: 'document' }, { stdout: passing, stderr: '', status: 0, ms: 1200 });
    expect(row).toEqual({
      id: 'a',
      kind: 'document',
      read: true,
      ok: true,
      checked: { agreement: 5000, 'round-trip': 5000, normalise: 5000, soundness: 0 },
      counterexamples: {},
      reported: 1,
      skipped: 0,
      ms: 1200,
      error: null,
    });
  });

  it('reads a failing run: each counterexample counted under the property it breaks', () => {
    const row = propsRow({ id: 'p', kind: 'pair' }, { stdout: failing, stderr: '', status: 1, ms: 900 });
    expect(row.read).toBe(true);
    expect(row.ok).toBe(false);
    expect(row.counterexamples).toEqual({ agreement: 1, soundness: 1 });
    expect(row.checked.soundness).toBe(2000);
    expect(row.skipped).toBe(1);
    expect(row.error).toBeNull();
  });

  it('reads a document the CLI cannot read as not read, with its first error line', () => {
    const row = propsRow({ id: 'b', kind: 'document' }, { stdout: unreadable, stderr: 'noise', status: 1, ms: 50 });
    expect(row.read).toBe(false);
    expect(row.ok).toBeNull();
    expect(row.error).toBe('no input format reads bad.json. fix: pass a document one of these reads: openapi');
  });

  it('reads a crash or a timeout (no envelope) as not run, never as a pass', () => {
    const row = propsRow({ id: 'c', kind: 'document' }, { stdout: '', stderr: 'FATAL ERROR: heap out of memory\n', status: null, ms: 120_000, timedOut: true });
    expect(row.read).toBeNull();
    expect(row.ok).toBeNull();
    expect(row.error).toBe('timed out after 120000 ms');
  });
});

describe('foldProps', () => {
  const rows: PropsRow[] = [
    propsRow({ id: 'a', kind: 'document' }, { stdout: passing, stderr: '', status: 0, ms: 1000 }),
    propsRow({ id: 'p', kind: 'pair' }, { stdout: failing, stderr: '', status: 1, ms: 3000 }),
    propsRow({ id: 'b', kind: 'document' }, { stdout: unreadable, stderr: '', status: 1, ms: 50 }),
    propsRow({ id: 'c', kind: 'document' }, { stdout: '', stderr: 'boom', status: 134, ms: 10 }),
  ];

  it('counts what ran, what held, what broke, what could not be read and what crashed', () => {
    const summary = foldProps(rows, { runs: 1000, seed: 1 });
    expect(summary.runs).toBe(1000);
    expect(summary.seed).toBe(1);
    expect(summary.documents).toEqual({ total: 3, ran: 1, held: 1, failed: 0, unread: 1, crashed: 1 });
    expect(summary.pairs).toEqual({ total: 1, ran: 1, held: 0, failed: 1, unread: 0, crashed: 0 });
    expect(summary.checked).toEqual({ agreement: 10_000, 'round-trip': 10_000, normalise: 10_000, soundness: 2000 });
    expect(summary.counterexamples).toEqual({ agreement: 1, 'round-trip': 0, normalise: 0, soundness: 1 });
    expect(summary.failing).toEqual([{ id: 'p', kind: 'pair' }]);
    expect(summary.medianMs).toBe(2000);
  });

  it('never calls a contract that did not run passed', () => {
    const text = renderPropsSummary(foldProps(rows.slice(0, 1), { runs: 1000, seed: 1 }), 'r');
    expect(text).toContain('Every property held on every contract that ran:');
    expect(text).not.toContain('did not run');
    expect(text.endsWith('|\n')).toBe(true);
  });

  it('says every property held only when something ran and nothing broke', () => {
    expect(foldProps([], { runs: 1000, seed: 1 }).held).toBe(false);
    expect(foldProps(rows.slice(0, 1), { runs: 1000, seed: 1 }).held).toBe(true);
    expect(foldProps(rows, { runs: 1000, seed: 1 }).held).toBe(false);
  });

  it('renders a summary that names each failing contract and the seed that replays it', () => {
    const text = renderPropsSummary(foldProps(rows, { runs: 1000, seed: 1 }), '2026-11-23-abc');
    expect(text).toContain('# contractdiff props on the corpus — 2026-11-23-abc');
    expect(text).toContain('| soundness | 2000 | 1 |');
    expect(text).toContain('2 contract(s) did not run (unread, crashed or timed out): unmeasured, not passed.');
    expect(text).toContain('- `p` (replay: `contractdiff props <new> --against <old> --runs 1000 --seed 1`)');
  });
});
