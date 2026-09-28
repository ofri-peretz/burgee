/**
 * The decisions ledger, and the ratchet that makes a question closeable.
 *
 * 102 open questions had accumulated across 48 intents because `## Open questions` is a
 * place to raise one and nothing could close one. These checks are what turn
 * `.sdlc/decisions/` from a folder into a mechanism: the count cannot drift upward, a
 * decision cannot be half-written, and the ids cannot collide.
 *
 * Proven red before green — each assertion was run against a mutation of the tree it
 * guards, and each failed for its own reason (1–5 against the single-table ledger):
 *   1. ceiling 102 -> 101 with the tree unchanged: "103 open ... against a ceiling of 101".
 *   2. D-009's answer column emptied: "D-009 has an empty Answer".
 *   3. D-011 renumbered to D-010: "duplicate decision id D-010".
 *   4. D-057 superseded by D-999: "D-057 is superseded by D-999, which is not another
 *      decision in this ledger".
 *   5. a seven-column row: "this row has 8 columns, not six, so every other check in this
 *      file skips it silently". This one was written after a renumbering pass produced
 *      exactly that row and the three checks above all passed over it.
 *
 * On 2026-09-27 the ledger became one file per decision (D-20260927-per-entry-ledgers),
 * because every PR appending "the next id" to one table conflicted with every other. Each
 * check above was re-pointed at the files, and the proofs are no longer a comment: the
 * `fails on a broken fixture` block below runs every check against a deliberately broken
 * input on every run, so a check that stops being able to fail fails itself. Check 5's
 * heir is "reads every file": a file with a misspelt field, no front matter, or a name that
 * is not its id is reported, never skipped. Three checks are new with the layout — the
 * sequence is frozen, every sequential id is still there, and DECISIONS.md holds no rows —
 * and one guards the move itself: every path to an entry resolves.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { ceiling, openQuestions, total } from './decisions.js';
import {
  danglingLinks,
  danglingSupersessions,
  type Decision,
  DECISION_ROW,
  decisionIdProblems,
  DECISIONS_DIR,
  duplicateIds,
  halfWrittenDecisions,
  LEGACY_LATE,
  legacyDecisionIds,
  missingLegacy,
  parseDecision,
  readDecisions,
  renderDecisions,
  REPO_ROOT,
  rowsLeftIn,
  scaffold,
  serializeDecision,
} from './ledgers.js';

const { entries, problems } = readDecisions();
const LEDGER_MD = readFileSync(join(REPO_ROOT, '.sdlc/DECISIONS.md'), 'utf8');

/** A decision that passes every check, to break one field at a time. */
const good = (over: Partial<Decision> = {}): Decision => ({
  file: 'D-001.md',
  id: 'D-001',
  subject: 'a subject',
  answer: '**An answer.**',
  taken: 'Taken',
  date: '2026-09-20',
  supersededBy: '—',
  ...over,
});

/** A path to an entry, assembled so this file does not itself cite an entry that does not exist. */
const to = (dir: string, id: string): string => `.sdlc/${dir}/${id}.md`;

/**
 * Tracked files that name an entry path, as `[path, text]` — `git grep` picks them, so the check
 * reads a few dozen files rather than every file in the tree (the first version read all of them
 * and timed out at 30 s on a loaded pre-push). None of the caller's GIT_* variables leak in.
 */
function citingFiles(): [string, string][] {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  let listed = '';
  try {
    listed = execFileSync('git', ['grep', '-l', '-z', '-E', String.raw`(decisions|gaps)/[A-Z][A-Za-z0-9-]*\.md`, '--', '.', ':!package-lock.json', ':!.sdlc/research/issues', ':!**/vendor/**'], {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    // `git grep` exits 1 when nothing matches; anything else is a real failure.
    if ((error as { status?: number }).status !== 1) throw error;
  }
  return listed
    .split('\0')
    .filter(Boolean)
    .map((p): [string, string] => [p, readFileSync(join(REPO_ROOT, p), 'utf8')]);
}

describe('decisions ledger', () => {
  it('keeps the open-question count at or under its committed ceiling', () => {
    const rows = openQuestions();
    const sum = total(rows);
    expect(sum, `${String(sum)} open across ${String(rows.length)} intents, against a ceiling of ${String(ceiling())}. Close one in .sdlc/decisions/, or raise the ceiling in .sdlc/bands/open-questions.json deliberately.`).toBeLessThanOrEqual(ceiling());
  });

  it('reads every file in .sdlc/decisions/ as a decision, so none is skipped silently', () => {
    expect(entries.length, 'the ledger lists no decisions').toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  it('carries no half-written decision — every one has a subject, an answer, a taker and a date', () => {
    expect(halfWrittenDecisions(entries)).toEqual([]);
  });

  it('numbers every decision once', () => {
    expect(duplicateIds(entries.map((d) => d.id), 'decision')).toEqual([]);
  });

  it('points every supersession at a decision that exists', () => {
    expect(danglingSupersessions(entries)).toEqual([]);
  });

  it('keeps every sequential id, D-001 to D-151 and D-161, D-163, D-164 — they are cited in commits, specs and PR titles', () => {
    expect(missingLegacy(entries.map((d) => d.id), legacyDecisionIds(), 'decision')).toEqual([]);
  });

  it('names every new decision D-YYYYMMDD-slug, never the next number', () => {
    expect(decisionIdProblems(entries)).toEqual([]);
  });

  it('holds no decision rows in DECISIONS.md, so the old instruction fails instead of appending to a dead file', () => {
    expect(rowsLeftIn(LEDGER_MD, 'DECISIONS.md', DECISION_ROW)).toEqual([]);
  });

  it('resolves every path to a decision or a gap, wherever the tree cites one', () => {
    const files = citingFiles();
    expect(files.map(([p]) => p), 'git grep found no file citing an entry — the reader is broken, not the tree').toContain('README.md');
    expect(danglingLinks(files)).toEqual([]);
  });

  it('renders every decision as one row of the old six-column shape', () => {
    const ROW = /^\| (D-[\w-]+) \| ([^|]|\\\|)* \| ([^|]|\\\|)* \| ([^|]|\\\|)* \| \d{4}-\d{2}-\d{2} \| [^|]* \|$/;
    const rows = renderDecisions(entries).split('\n').slice(2);
    expect(rows.length).toBe(entries.length);
    for (const row of rows) expect(row, 'a rendered row is not six columns').toMatch(ROW);
  });
});

describe('each decisions check fails on a broken fixture', () => {
  const dirs: string[] = [];
  const temp = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'decisions-lock-'));
    dirs.push(dir);
    return dir;
  };
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('the ceiling: one open question against a ceiling of zero', () => {
    const root = temp();
    mkdirSync(join(root, '.sdlc/intents/x'), { recursive: true });
    mkdirSync(join(root, '.sdlc/bands'), { recursive: true });
    writeFileSync(join(root, '.sdlc/intents/x/intent.md'), '# x\n\n## Open questions\n\n- is this open?\n');
    writeFileSync(join(root, '.sdlc/bands/open-questions.json'), '{ "ceiling": 0 }');
    expect(total(openQuestions(join(root, '.sdlc/intents')))).toBeGreaterThan(ceiling(root));
  });

  it('half-written: each of the four fields emptied in turn', () => {
    expect(halfWrittenDecisions([good({ subject: ' ' })])).toEqual(['D-001 has an empty Subject']);
    expect(halfWrittenDecisions([good({ answer: '' })])).toEqual(['D-001 has an empty Answer']);
    expect(halfWrittenDecisions([good({ taken: '' })])).toEqual(['D-001 has an empty Taken / Accepted']);
    expect(halfWrittenDecisions([good({ date: '' })])[0]).toMatch(/D-001 has an empty Date/);
  });

  it('duplicates: D-011 renumbered to D-010', () => {
    expect(duplicateIds(['D-010', 'D-010'], 'decision')).toEqual(['duplicate decision id D-010']);
  });

  it('supersession: to a decision that does not exist, to itself, and to prose', () => {
    expect(danglingSupersessions([good({ id: 'D-057', supersededBy: 'D-999' })])).toEqual(['D-057 is superseded by D-999, which is not another decision in this ledger']);
    expect(danglingSupersessions([good({ supersededBy: 'D-001' })])[0]).toMatch(/not another decision/);
    expect(danglingSupersessions([good({ supersededBy: 'the next one' })])[0]).toMatch(/takes a decision id/);
  });

  it('unreadable files: no front matter, a misspelt field, a missing field, a name that is not its id', () => {
    expect(parseDecision('| D-151 | a | b | Taken | 2026-09-27 | — |\n', 'D-151.md')).toEqual([expect.stringMatching(/does not open with a --- front-matter block/)]);
    const text = serializeDecision(good());
    expect(parseDecision(text.replace('superseded_by', 'superseded-by'), 'D-001.md')).toEqual(
      expect.arrayContaining([expect.stringMatching(/"superseded-by", which no check reads/), expect.stringMatching(/has no "superseded_by"/)]),
    );
    expect(parseDecision(text, 'D-002.md')).toEqual([expect.stringMatching(/D-002.md holds D-001/)]);
    expect(parseDecision(text.replace('subject: a subject', 'subject: a: b'), 'D-001.md')).toEqual([expect.stringMatching(/not YAML/)]);
  });

  it('unreadable files: something other than a decision in the directory', () => {
    const root = temp();
    mkdirSync(join(root, DECISIONS_DIR), { recursive: true });
    writeFileSync(join(root, DECISIONS_DIR, 'D-001.md'), serializeDecision(good()));
    writeFileSync(join(root, DECISIONS_DIR, 'notes.txt'), 'D-151: remember to write this up');
    const read = readDecisions(root);
    expect(read.entries.map((d) => d.id)).toEqual(['D-001']);
    expect(read.problems).toEqual([expect.stringMatching(/notes.txt is in .* and is not an entry/)]);
  });

  it('the frozen sequence: D-152, a mis-dated id, an upper-case slug, an overlong slug', () => {
    expect(decisionIdProblems([good({ id: 'D-152' })])[0]).toMatch(/continues the sequential numbering, which stopped at D-151/);
    expect(decisionIdProblems([good({ id: 'D-20260926-x', date: '2026-09-27' })])[0]).toMatch(/is dated 2026-09-27/);
    expect(decisionIdProblems([good({ id: 'D-20260927-Per-Entry', date: '2026-09-27' })])[0]).toMatch(/is not a decision id/);
    expect(decisionIdProblems([good({ id: `D-20260927-${'a'.repeat(41)}`, date: '2026-09-27' })])[0]).toMatch(/slug is 41 characters/);
    expect(decisionIdProblems([good({ id: 'D-20260927-per-entry-ledgers', date: '2026-09-27' })])).toEqual([]);
  });

  it('the frozen sequence admits exactly the three late ids: D-161, D-163, D-164, and not the numbers around them', () => {
    for (const id of LEGACY_LATE) expect(decisionIdProblems([good({ id })])).toEqual([]);
    for (const id of ['D-160', 'D-162', 'D-165']) expect(decisionIdProblems([good({ id })])[0]).toMatch(/continues the sequential numbering, which stopped at D-151/);
    const ids = legacyDecisionIds().filter((id) => id !== 'D-163');
    expect(missingLegacy(ids, legacyDecisionIds(), 'decision')).toEqual([expect.stringMatching(/^decision D-163 is gone/)]);
  });

  it('a sequential id deleted', () => {
    const ids = legacyDecisionIds().filter((id) => id !== 'D-102');
    expect(missingLegacy(ids, legacyDecisionIds(), 'decision')).toEqual([expect.stringMatching(/^decision D-102 is gone/)]);
  });

  it('a row appended to DECISIONS.md the old way', () => {
    const appended = `${LEDGER_MD}\n| D-151 | a subject | **an answer** | Taken | 2026-09-27 | — |\n`;
    expect(rowsLeftIn(appended, 'DECISIONS.md', DECISION_ROW)).toEqual([expect.stringMatching(/DECISIONS.md holds an entry row again/)]);
  });

  it('a link to an entry that does not exist', () => {
    expect(danglingLinks([['README.md', `the decision is [D-999](./${to('decisions', 'D-999')})`]])).toEqual([`README.md points at ${to('decisions', 'D-999').slice(6)}, which does not exist`]);
    expect(danglingLinks([['x.yml', `see ${to('gaps', 'C99')}`]])).toEqual([`x.yml points at ${to('gaps', 'C99').slice(6)}, which does not exist`]);
    expect(danglingLinks([['README.md', `[D-102](./${to('decisions', 'D-102')})`]])).toEqual([]);
  });

  it('`ledger new decision` writes a file that fails until it is filled in', () => {
    const root = temp();
    mkdirSync(join(root, DECISIONS_DIR), { recursive: true });
    const path = scaffold({ kind: 'decision', slug: 'Some Choice', root, date: '2026-09-27' });
    expect(path.endsWith(join(DECISIONS_DIR, 'D-20260927-some-choice.md'))).toBe(true);
    const read = readDecisions(root);
    expect(read.problems).toEqual([]);
    expect(decisionIdProblems(read.entries)).toEqual([]);
    expect(halfWrittenDecisions(read.entries)).toEqual([
      'D-20260927-some-choice has an empty Subject',
      'D-20260927-some-choice has an empty Answer',
      'D-20260927-some-choice has an empty Taken / Accepted',
    ]);
    expect(() => scaffold({ kind: 'decision', slug: 'some choice', root, date: '2026-09-27' })).toThrow(/already exists/);
  });
});
