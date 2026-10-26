/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `agent-headroom` R3 — how a success is written when `--max-bytes` or a registered format was
 * typed: the row budget, and the format's rendering. Its own chunk, imported by `fields.js`, which
 * `execute.ts` loads only when one of those words is on the command line (M2).
 *
 * **Truncation is legible or it does not happen** (intent constraint 2). A list result over the
 * budget is cut at the last whole row that fits, so the document still parses, and it says so:
 * `truncated: { of, returned }`, absent when nothing was cut. A result that is not a list is never
 * cut — a broken document is the failure this exists to prevent — so it comes back whole with
 * `truncated: { of: 1, returned: 1, over }`, `over` being how many bytes the document sent is over
 * the budget. The same `over` rides on a list that does not fit even empty. No continuation token:
 * a framework cannot page a handler it did not write, so the next step is the command's own
 * arguments (D-20261025-agent-headroom-design-accepted).
 *
 * The line formats have no envelope to carry that, so stdout keeps whole rows and the same
 * `{"truncated":…}` object goes to stderr as one JSON line — where the failure's structured line
 * goes, and where it cannot corrupt a table.
 */

/** The success envelope `execute.ts` writes. */
export interface Envelope {
  ok: boolean;
  data: unknown;
  meta: object;
}

interface Truncated {
  of: number;
  returned: number;
  over?: number;
}

/** How a success is written: the text for stdout, or `undefined` to leave it to the engine. */
export type Print = (envelope: Envelope, json: boolean, io: { err: { write: (s: string) => unknown } }) => string | undefined;

/** Bytes, not characters: a caller's context pays per byte, and `.length` reads non-ASCII low. */
const bytes = (text: string): number => new TextEncoder().encode(text).length;

/** The data `--json` would carry, as a format receives it: `toJSON` applied, `undefined` dropped. */
const plain = (data: unknown): unknown => JSON.parse(JSON.stringify(data) ?? 'null') as unknown;

/**
 * The longest prefix of `rows` whose text fits `max`: `text(k)` grows with `k`, so a binary
 * search finds it in a logarithmic number of renderings rather than one per row.
 */
function fit(rows: readonly unknown[], max: number, text: (k: number) => string): number {
  let [low, high] = [0, rows.length];
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (bytes(text(mid)) <= max) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * The text with `over` set to what that very text is over the budget. The figure is part of the
 * document it measures, so it is settled by iterating: each pass can only grow it by a digit,
 * and it stops at the first figure that is true of the text carrying it.
 */
function settled(max: number, text: (over: number) => string): string {
  let over = 0;
  let out = text(over);
  while (bytes(out) - max !== over) {
    over = bytes(out) - max;
    out = text(over);
  }
  return out;
}

/** The `--json` envelope under a budget of `max` bytes, newline included. */
export function budgetJson(envelope: Envelope, max: number): string {
  const line = (truncated?: Truncated): string => `${JSON.stringify(truncated ? { ...envelope, truncated } : envelope)}\n`;
  const whole = line();
  if (bytes(whole) <= max) return whole;
  const { data } = envelope;
  if (!Array.isArray(data)) return settled(max, (over) => line({ of: 1, returned: 1, over }));
  // An `over` left undefined is dropped by `JSON.stringify`, so a cut that fits carries none.
  const cut = (k: number, over?: number): string => `${JSON.stringify({ ...envelope, data: data.slice(0, k), truncated: { of: data.length, returned: k, over } })}\n`;
  const k = fit(data, max, cut);
  return bytes(cut(k)) <= max ? cut(k) : settled(max, (over) => cut(k, over));
}

/** A line format's rendering under a budget: whole rows on stdout, the notice on stderr. */
function budgetLines(render: (value: unknown) => string, data: unknown, max: number, err: { write: (s: string) => unknown }): string {
  const whole = render(data);
  if (bytes(whole) <= max) return whole;
  const note = (truncated: Truncated): void => void err.write(`${JSON.stringify({ truncated })}\n`);
  if (!Array.isArray(data)) {
    note({ of: 1, returned: 1, over: bytes(whole) - max });
    return whole;
  }
  const k = fit(data, max, (n) => render(data.slice(0, n)));
  const out = render(data.slice(0, k));
  note({ of: data.length, returned: k, ...(bytes(out) > max ? { over: bytes(out) - max } : {}) });
  return out;
}

/**
 * How a success is written once a format or a budget was typed. `--json` wins over a format, as it
 * always has, and is budgeted when `max` is set; a format renders the data `--json` would carry.
 * Neither leaves the run to the engine's human rendering — which only a run that `fields.js`
 * refused (`--max-bytes` with no machine format) could reach.
 */
export function printer(render: ((value: unknown) => string) | undefined, max: number | undefined): Print {
  return (envelope, json, io) => {
    if (json) return max === undefined ? undefined : budgetJson(envelope, max);
    if (render === undefined) return undefined;
    const data = plain(envelope.data);
    return max === undefined ? render(data) : budgetLines(render, data, max, io.err);
  };
}
