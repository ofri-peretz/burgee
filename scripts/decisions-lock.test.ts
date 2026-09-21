/**
 * The decisions ledger, and the ratchet that makes a question closeable.
 *
 * 102 open questions had accumulated across 48 intents because `## Open questions` is a
 * place to raise one and nothing could close one. These three checks are what turn
 * `.sdlc/DECISIONS.md` from a document into a mechanism: the count cannot drift upward, a
 * row cannot be half-written, and the ids cannot collide.
 *
 * Proven red before green — each assertion was run against a mutation of the tree it
 * guards, and each failed for its own reason:
 *   1. ceiling 102 -> 101 with the tree unchanged: "103 open ... against a ceiling of 101".
 *   2. D-009's answer column emptied: "D-009 has an empty Answer".
 *   3. D-011 renumbered to D-010: "duplicate decision id D-010".
 *   4. D-057 superseded by D-999: "D-057 is superseded by D-999, which is not another
 *      decision in this ledger".
 *   5. a seven-column row: "this row has 8 columns, not six, so every other check in this
 *      file skips it silently". This one was written after a renumbering pass produced
 *      exactly that row and the three checks above all passed over it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ceiling, openQuestions, total } from './decisions.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(REPO_ROOT, '.sdlc/DECISIONS.md');
/** `| D-001 | subject | answer | taken | date | superseded |` — the six columns a closed decision needs. */
const ROW = /^\| (D-\d{3}) \| ([^|]*) \| ([^|]*) \| ([^|]*) \| ([^|]*) \| ([^|]*) \|$/gm;

/** Every closed row, as its six captured columns. */
const ledgerRows = (): RegExpMatchArray[] => [...readFileSync(LEDGER, 'utf8').matchAll(ROW)];

describe('decisions ledger', () => {
  it('keeps the open-question count at or under its committed ceiling', () => {
    const rows = openQuestions();
    const sum = total(rows);
    expect(sum, `${String(sum)} open across ${String(rows.length)} intents, against a ceiling of ${String(ceiling())}. Close one in .sdlc/DECISIONS.md, or raise the ceiling there deliberately.`).toBeLessThanOrEqual(ceiling());
  });

  it('carries no half-written row — every closed decision has an answer, a taker and a date', () => {
    const rows = ledgerRows();
    expect(rows.length, 'the ledger lists no decisions').toBeGreaterThan(0);
    for (const [, id, subject, answer, taken, date] of rows) {
      expect(subject?.trim(), `${id ?? '?'} has an empty Subject`).not.toBe('');
      expect(answer?.trim(), `${id ?? '?'} has an empty Answer`).not.toBe('');
      expect(taken?.trim(), `${id ?? '?'} has an empty Taken / Accepted`).not.toBe('');
      expect(date?.trim(), `${id ?? '?'} has an empty Date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('numbers every decision once', () => {
    const ids = ledgerRows().map((m) => m[1] ?? '');
    const seen = new Set<string>();
    for (const id of ids) {
      expect(seen.has(id), `duplicate decision id ${id}`).toBe(false);
      seen.add(id);
    }
  });
  it('points every supersession at a decision that exists', () => {
    const rows = ledgerRows();
    const ids = new Set(rows.map((m) => m[1] ?? ''));
    const links = rows
      .map((m) => [m[1] ?? '', (m[6] ?? '').trim()] as const)
      .filter(([, ref]) => ref !== '—');
    for (const [id, ref] of links) {
      expect(ref, `${id} has "${ref}" under Superseded by — that column takes a D-NNN id, or an em dash when nothing reverses the row`).toMatch(/^D-\d{3}$/);
      expect(ids.has(ref) && ref !== id, `${id} is superseded by ${ref}, which is not another decision in this ledger`).toBe(true);
    }
  });
  it('leaves no row the other checks cannot see', () => {
    const ledger = readFileSync(LEDGER, 'utf8');
    const declared = ledger.split('\n').filter((l) => l.startsWith('| D-'));
    const matched = new Set(ledgerRows().map((m) => m[0] ?? ''));
    for (const line of declared) {
      expect(matched.has(line), `this row has ${String(line.split('|').length - 1)} columns, not six, so every other check in this file skips it silently: ${line.slice(0, 60)}...`).toBe(true);
    }
  });
});
