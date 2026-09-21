/**
 * Lock — the root README's claim table cannot over-claim.
 *
 * Every figure in that table was stale on 2026-09-20, and one of them was stale *and*
 * green: `the core entry point is under 52 KB bundled | 34,841 bytes | ✅ met`, against a
 * measurement of **57,880**. The bar had been passed weeks earlier and the page still said
 * met, which is the exact failure this repository keeps finding in itself — a published
 * claim checked by nobody, going the flattering way.
 *
 * Two assertions, and the second is deliberately **asymmetric**:
 *
 *   1. Every row here names a claim `benchmarks/claims.ts` actually declares. The README
 *      publishes a *subset* — the full ledger is the benchmarks page — so the reverse is
 *      not asserted: a declared claim with no row here is a summary decision, not a defect.
 *      A row with no claim behind it is a promise nobody measures.
 *   2. A row marked **met** must be satisfied by the newest results document. A row marked
 *      **not met** needs no backing at all.
 *   3. That newest document must not be stale.
 *
 * **What this lock cannot do, stated so nobody trusts it further than it goes.** It checks
 * the table against the last *published* measurement, not against the tree. On the day it
 * was written those differed badly: the newest document said `weight burgee bundled-bytes`
 * was **40,562** while the tree measured **57,880**, because the Benchmarks workflow went
 * red on 2026-09-15 and nothing has published since. So the mutation that flips
 * `core-under-52kb-bundled` back to ✅ *passes* assertion 2 — the stored number really is
 * under the bar — and only assertion 3 stands between that and a green build. A claim that
 * goes false after the last publish is invisible here until the publish resumes, which is
 * the whole argument for assertion 3 existing and for its threshold being short.
 *
 * The asymmetry is the point. Over-claiming is the failure that costs credibility;
 * under-claiming costs nothing, and a gate that punished it would push back toward
 * optimism every time a measurement drifted. This one can only ever say "you said met and
 * the numbers do not".
 *
 * Proven red before green — three mutations, each failing for its own reason:
 *   1. `core-under-52kb-bundled`'s row flipped back to ✅: "core-under-52kb-bundled is
 *      marked met and nothing in the newest results measures it" — the newest document
 *      carries no weight axis at all, which is itself worth knowing.
 *   2. a row invented for a claim nothing declares: "README.md publishes a claim nothing
 *      declares: lighter-than-everything".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLAIMS } from 'benchmarks/claims.js';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const README = join(REPO_ROOT, 'README.md');
const RESULTS = join(REPO_ROOT, 'benchmarks/results/cli-benchmarks');

/**
 * `| <claim prose> | \`<gate id>\` | <measured> | <verdict> |` — the table's four columns.
 *
 * The **Gate** column exists for this lock. Matching a row to a claim by its prose was the
 * first design and it is the mistake this repository has a memory of: the README wrote
 * "`burgee` starts at or below `cac`" where `claims.ts` says "the engine starts at or below
 * cac", so a prefix match paired nothing and the only repairs available were a looser
 * matcher or edited prose. An id is exact, survives every rewording, and tells a reader
 * which gate backs the line they are reading.
 */
const ROW = /^\| ([^|]+) \| `([a-z0-9-]+)` \| ([^|]+) \| ([^|]*) \|$/gm;

interface Record_ {
  axis: string;
  variant: string;
  metric: string;
  median: number;
}

/** The newest results document, published or observation — the most recent thing measured. */
function newest(): { records: Record_[]; measured: string } {
  const files = readdirSync(RESULTS)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const last = files.at(-1);
  if (last === undefined) throw new Error(`no results in ${RESULTS} — a claim gate with nothing to read is not a gate`);
  return JSON.parse(readFileSync(join(RESULTS, last), 'utf8')) as { records: Record_[]; measured: string };
}

const MET = /✅/;
const NOT_MET = /❌/;
/**
 * How old the newest results document may be.
 *
 * `bench.yml` runs on every push to main and weekly (`40 5 * * 2`), so fourteen days is two
 * missed weekly cycles — long enough that a quiet week is not a failure, short enough that a
 * publishing pipeline which has stopped is caught before the claim table drifts a month from
 * the tree. It was five days old when this was written, and the reason it was five rather
 * than one is that the workflow itself had been failing since 2026-09-15.
 */
const MAX_RESULTS_AGE_DAYS = 14;
const MS_PER_DAY = 86_400_000;

describe('the README claim table', () => {
  const readme = readFileSync(README, 'utf8');
  const rows = [...readme.matchAll(ROW)].filter((m) => MET.test(m[4] ?? '') || NOT_MET.test(m[4] ?? '') || /unmeasured/i.test(m[4] ?? ''));

  it('names only claims that are actually declared', () => {
    expect(rows.length, 'README.md has no claim table').toBeGreaterThan(0);
    for (const row of rows) {
      const id = row[2] ?? '';
      expect(CLAIMS.some((c) => c.id === id), `README.md publishes a claim nothing declares: ${id}`).toBe(true);
    }
  });

  it('is checked against a measurement that is not stale', () => {
    const { measured } = newest();
    const ageDays = (Date.now() - Date.parse(measured)) / MS_PER_DAY;
    expect(ageDays, `the newest benchmark results are ${ageDays.toFixed(1)} days old (${measured}). Every verdict in the README claim table is read from them, so a ledger that has stopped updating turns this gate into a gate on history. Find out why bench.yml is not publishing.`).toBeLessThanOrEqual(MAX_RESULTS_AGE_DAYS);
  });

  it('never marks a claim met that the newest measurement does not satisfy', () => {
    const records = newest().records;
    for (const claim of CLAIMS) {
      const row = rows.find((r) => r[2] === claim.id);
      if (row !== undefined && MET.test(row[4] ?? '')) checkMet(claim, records);
    }
  });
});

/**
 * One claim the README marks met, against the newest measurement of it.
 *
 * A **missing** record fails rather than skipping. The first version of this `continue`d
 * past it, and the mutation that flipped `core-under-52kb-bundled` back to ✅ sailed through
 * — the assertion it was supposed to make simply never ran. A gate that verifies nothing
 * while reporting success is the precise defect this file exists to stop, and it committed
 * it on the first draft.
 */
function checkMet(claim: (typeof CLAIMS)[number], records: readonly Record_[]): void {
  const record = records.find((r) => r.axis === claim.from.axis && r.variant === claim.from.variant && r.metric === claim.from.metric);
  expect(record, `${claim.id} is marked met and nothing in the newest results measures it`).toBeDefined();
  if (record === undefined) return;
  const { max, min } = claim.test;
  if (max !== undefined) expect(record.median, `${claim.id} is marked met, but the newest results say ${String(record.median)} against max ${String(max)}`).toBeLessThanOrEqual(max);
  if (min !== undefined) expect(record.median, `${claim.id} is marked met, but the newest results say ${String(record.median)} against min ${String(min)}`).toBeGreaterThanOrEqual(min);
}
