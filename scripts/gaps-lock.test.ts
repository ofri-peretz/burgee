/**
 * The gap ledger — one file per gap under `.sdlc/gaps/`.
 *
 * `.sdlc/GAPS.md` was four tables with nothing checking them, and every PR that opened or
 * struck a gap edited the one file. Taking "the next number" in parallel had already produced
 * two rows called C5 — one a release-queue setting six workflows cite, one a struck lint gap —
 * and nothing noticed. On 2026-09-27 each row became a file (D-20260927-per-entry-ledgers),
 * and these are the checks the decisions ledger has always had, applied to gaps: every file
 * reads, none is half-written, no id twice, the sequential ids all survive, no new one
 * continues the sequence, and GAPS.md holds no rows.
 *
 * Every check is run against a deliberately broken fixture in the second block below, so a
 * check that stops being able to fail fails itself.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  duplicateIds,
  type Gap,
  GAP_ROW,
  gapIdProblems,
  GAPS_DIR,
  halfWrittenGaps,
  legacyGapIds,
  missingLegacy,
  parseGap,
  readGaps,
  renderGaps,
  REPO_ROOT,
  rowsLeftIn,
  scaffold,
  serializeGap,
} from './ledgers.js';

const { entries, problems } = readGaps();
const GAPS_MD = readFileSync(join(REPO_ROOT, '.sdlc/GAPS.md'), 'utf8');

const good = (over: Partial<Gap> = {}): Gap => ({
  file: 'A13.md',
  id: 'A13',
  section: 'A',
  status: 'open',
  body: 'caique: clack 14/17',
  cells: { source: 'compat baselines', done_when: 'the twelve prompts' },
  ...over,
});

describe('gap ledger', () => {
  it('reads every file in .sdlc/gaps/ as a gap, so none is skipped silently', () => {
    expect(entries.length, 'the ledger lists no gaps').toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  it('carries no half-written gap', () => {
    expect(halfWrittenGaps(entries)).toEqual([]);
  });

  it('numbers every gap once', () => {
    expect(duplicateIds(entries.map((g) => g.id), 'gap')).toEqual([]);
  });

  it('keeps every sequential id — A1..A30 (A2 was never written), B1..B22, C1..C7, and C8 from main', () => {
    expect(missingLegacy(entries.map((g) => g.id), legacyGapIds(), 'gap')).toEqual([]);
  });

  it("names every new gap <letter>-YYYYMMDD-slug, with its section's letter", () => {
    expect(gapIdProblems(entries)).toEqual([]);
  });

  it('holds no gap rows in GAPS.md, so the old instruction fails instead of appending to a dead file', () => {
    expect(rowsLeftIn(GAPS_MD, 'GAPS.md', GAP_ROW)).toEqual([]);
  });

  it('renders every gap into its section', () => {
    const rows = renderGaps(entries).split('\n').filter((l) => GAP_ROW.test(l));
    expect(rows.length).toBe(entries.length);
  });
});

describe('each gaps check fails on a broken fixture', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('half-written: an empty body, an empty column', () => {
    expect(halfWrittenGaps([good({ body: '' })])).toEqual(['A13 says nothing about the gap — its body is empty']);
    expect(halfWrittenGaps([good({ cells: { source: 'x', done_when: ' ' } })])).toEqual(['A13 has an empty done_when']);
  });

  it('duplicates: the two C5s this ledger actually held', () => {
    expect(duplicateIds(['C5', 'C5'], 'gap')).toEqual(['duplicate gap id C5']);
  });

  it("unreadable files: no front matter, another section's column, an unknown section, a bad status, a wrong name", () => {
    expect(parseGap('| A31 | a gap | here | done |\n', 'A31.md')).toEqual([expect.stringMatching(/does not open with a --- front-matter block/)]);
    const text = serializeGap(good());
    expect(parseGap(text.replace('done_when:', 'needs:'), 'A13.md')).toEqual(
      expect.arrayContaining([expect.stringMatching(/"needs", which no check reads/), expect.stringMatching(/has no "done_when"/)]),
    );
    expect(parseGap(text.replace('section: A', 'section: D'), 'A13.md')).toEqual([expect.stringMatching(/section "D"/)]);
    expect(parseGap(text.replace('status: open', 'status: struck'), 'A13.md')).toEqual([expect.stringMatching(/status "struck"/)]);
    expect(parseGap(text, 'A14.md')).toEqual([expect.stringMatching(/A14.md holds A13/)]);
  });

  it('the frozen sequence: A31, the hole A2, a letter from another section, a malformed id', () => {
    expect(gapIdProblems([good({ id: 'A31' })])[0]).toMatch(/continues the sequential numbering, which stopped at A30/);
    expect(gapIdProblems([good({ id: 'A2' })])[0]).toMatch(/continues the sequential numbering/);
    expect(gapIdProblems([good({ id: 'B-20260927-x' })])).toEqual(['B-20260927-x is in section A, whose ids start with A']);
    expect(gapIdProblems([good({ id: 'C9', section: 'release' })])[0]).toMatch(/stopped at C7/);
    expect(gapIdProblems([good({ id: 'C8', section: 'C' })]), 'C8 is the one late gap id main holds').toEqual([]);
    expect(gapIdProblems([good({ id: 'A31' })])[0]).toMatch(/stopped at A30/);
    expect(gapIdProblems([good({ id: 'A-2026-09-27-x' })])[0]).toMatch(/is not a gap id/);
    expect(gapIdProblems([good({ id: 'C-20260927-merge-queue', section: 'release' })])).toEqual([]);
  });

  it('a sequential id deleted', () => {
    const ids = legacyGapIds().filter((id) => id !== 'C5');
    expect(missingLegacy(ids, legacyGapIds(), 'gap')).toEqual([expect.stringMatching(/^gap C5 is gone/)]);
  });

  it('a row appended or struck in GAPS.md the old way', () => {
    expect(rowsLeftIn(`${GAPS_MD}\n| A31 | a new gap | here | done |\n`, 'GAPS.md', GAP_ROW)).toHaveLength(1);
    expect(rowsLeftIn(`${GAPS_MD}\n| ~~A13~~ | ~~caique~~ — **closed** | x | done |\n`, 'GAPS.md', GAP_ROW)).toHaveLength(1);
  });

  it('`ledger new gap` writes a file that fails until it is filled in', () => {
    const root = mkdtempSync(join(tmpdir(), 'gaps-lock-'));
    dirs.push(root);
    mkdirSync(join(root, GAPS_DIR), { recursive: true });
    scaffold({ kind: 'gap', slug: 'merge queue', section: 'release', root, date: '2026-09-27' });
    const read = readGaps(root);
    expect(read.problems).toEqual([]);
    expect(read.entries.map((g) => [g.id, g.section, g.status])).toEqual([['C-20260927-merge-queue', 'release', 'open']]);
    expect(gapIdProblems(read.entries)).toEqual([]);
    expect(halfWrittenGaps(read.entries)).toEqual([
      'C-20260927-merge-queue says nothing about the gap — its body is empty',
      'C-20260927-merge-queue has an empty setting',
      'C-20260927-merge-queue has an empty done_when',
    ]);
    writeFileSync(join(root, GAPS_DIR, 'README'), 'stray');
    expect(readGaps(root).problems).toEqual([expect.stringMatching(/README is in .* and is not an entry/)]);
  });
});
