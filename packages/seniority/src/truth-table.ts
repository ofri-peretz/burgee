/**
 * The precedence as a **truth table** (R1, criterion 2): one row per combination of sources
 * that set a value, and the source that wins it.
 *
 * `ORDER` is the declaration and this is its projection, so there is one thing to edit and
 * nothing to keep in step by hand. The resolver reads `ORDER` (through `RANK`); the docs page
 * `guides/truth-table` is generated from `TRUTH_TABLE`; `precedence-vectors.json` is the
 * reviewed answer both suites hold them to — seniority's against this table and `resolve`,
 * burgee's against a real program. Reordering `ORDER` therefore fails both suites at once,
 * which is the point: a change of precedence has to arrive as a diff to the vectors too.
 *
 * Imported by nothing on a resolve path. A program that only resolves carries none of it.
 */
import { ORDER, type BuiltinSource } from './precedence.js';

/** One combination: the sources that set a value, in the order given, and the one that wins. */
export interface TruthRow<S extends string = BuiltinSource> {
  readonly set: readonly S[];
  /** The first source of `set` in the order, or `null` when nothing set a value. */
  readonly winner: S | null;
}

/**
 * Every combination of `order`, grouped by winner, highest first: each source, then every
 * subset of the sources below it in increasing binary order, and last the row with nothing
 * set. 2ⁿ rows for n sources.
 */
export function truthTable<S extends string>(order: readonly S[]): TruthRow<S>[] {
  const rows: TruthRow<S>[] = [];
  for (const [i, winner] of order.entries()) {
    const below = order.slice(i + 1);
    for (let mask = 0; mask < 2 ** below.length; mask++) {
      rows.push({ set: [winner, ...below.filter((_, bit) => (mask & (1 << bit)) !== 0)], winner });
    }
  }
  rows.push({ set: [], winner: null });
  return rows;
}

/** The table for the five built-in sources: 32 rows, frozen. */
export const TRUTH_TABLE: readonly TruthRow[] = Object.freeze(truthTable(ORDER).map((row) => Object.freeze({ set: Object.freeze([...row.set]), winner: row.winner })));
