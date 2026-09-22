/**
 * Lock — the audit's own total is derived from its rows.
 *
 * `.sdlc/intents/burgee/spec.md` audits 114 requirements and states a tally. The paragraph that
 * states it is itself a record of getting that wrong: *"The prose above says 92 and 'Ninety-two
 * requirements'; both are wrong, and wrong the same way."* They drifted because a human counted
 * once and then rows were added.
 *
 * The same drift is now guaranteed in the other direction, because rows move from `Not built` to
 * **Built** as they get built — which is the point of the document — and nothing was keeping the
 * sentence in step. So the sentence is checked against the tables it summarises. A row built
 * without the tally moving fails here, which is a two-character fix caught in the commit that
 * caused it rather than a number nobody trusts six months later.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SPEC = join(resolve(fileURLToPath(new URL('..', import.meta.url))), '.sdlc/intents/burgee/spec.md');

describe("the burgee audit's tally", () => {
  const spec = readFileSync(SPEC, 'utf8');

  /**
   * A status cell is the second column of a row whose first is a requirement id.
   *
   * The cell is matched loosely on purpose: `O5` and `E5` read `**Built** 2026-09-16`, and the
   * first draft of this reader demanded the cell be *exactly* a status. It reported 112 rows
   * against 114 requirements and accused the document of being two short. The second draft
   * appended `\b`, which cannot follow `**` because an asterisk is not a word character, and
   * reported **zero**. A lock whose first two findings are its own reader is the failure mode
   * this repository has the most of, so both are written down rather than quietly fixed — and
   * the first assertion below exists because a reader that matches nothing passes every count
   * it is asked to make.
   */
  const rows = [...spec.matchAll(/^\| ([A-Z]+\d+) \| (\*\*Built\*\*|Built|Not built)[^|]*\|/gm)];

  it('has rows to count, so a changed table shape cannot make this gate vacuous', () => {
    expect(rows.length, 'no audit rows were found — the reader is broken, not the document').toBeGreaterThan(100);
  });

  it('states the number of built rows it actually has', () => {
    const built = rows.filter((r) => (r[2] ?? '').includes('Built')).length;
    const stated = Number(/\*\*Built: (\d+)\./.exec(spec)?.[1] ?? '-1');
    expect(stated, `the document says Built: ${String(stated)} and the tables hold ${String(built)}`).toBe(built);
  });

  it('states the number of unbuilt rows it actually has', () => {
    const notBuilt = rows.filter((r) => r[2] === 'Not built').length;
    const stated = Number(/Not built: (\d+)\*\*/.exec(spec)?.[1] ?? '-1');
    expect(stated, `the document says Not built: ${String(stated)} and the tables hold ${String(notBuilt)}`).toBe(notBuilt);
  });

  it('numbers every requirement once', () => {
    const ids = rows.map((r) => r[1]);
    const seen = new Set<string>();
    const twice = ids.filter((id) => (seen.has(id ?? '') ? true : (seen.add(id ?? ''), false)));
    expect(twice, 'a requirement id appears in two rows, so one of them is being audited twice').toEqual([]);
  });
});
