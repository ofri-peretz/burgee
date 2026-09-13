/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R3 — remove the sequences a terminal consumes, and leave the text it prints.
 *
 * The design says to use `util.stripVTControlCharacters` "where it is exact and a local scan
 * where it is not — measured, and the divergence recorded rather than assumed". Measured, on
 * Node 24 over sixteen sequence shapes: **fifteen agree with `strip-ansi` and one does not.**
 *
 *   ESC[38:2::255:0:0m   node -> ":2::255:0:0m"     strip-ansi -> ""
 *
 * That is the colon form of an extended colour (ITU T.416, which `chalk`, `wrap-ansi` and
 * every 24-bit-colour library emit): Node's scanner stops at the first `:` and leaves the
 * rest of the sequence in the output as text. One shape, and the one that matters most,
 * because it is **not** a rare dialect — it is how a truecolor SGR is written when the
 * sub-parameter form is used.
 *
 * It was a live bug here, not a theoretical one. `width.ts` called
 * `stripVTControlCharacters`, so `width("ESC[38:2::255:0:0mred ESC[39m")` answered **15**
 * where `string-width` answers **3** — and every caller that measures went with it: `wrap`,
 * `slice`, `truncate`, `widest`, and in `flagstaff` the box, the table and the spinner.
 *
 * So the local scan is the whole implementation, over `style.ts`'s `ANSI_ESCAPE` — which has
 * always handled the colon form, because `wrap` needs to reopen those colours across a row.
 * The package understood the syntax in one module and mis-stripped it in another, which is
 * precisely the duplication the consolidation exists to remove.
 */

import { stripVTControlCharacters as nodeStrip } from 'node:util';

import { forEachSegment } from './style.js';

/**
 * Everything a terminal would print, with the escape sequences removed: CSI (SGR and the
 * cursor and erase forms), OSC including `OSC 8` hyperlinks under both terminators, DCS, the
 * charset selections, and the single-character escapes. A lone `ESC` with nothing that parses
 * after it is text and is kept — the same answer `strip-ansi` gives.
 *
 * Two passes, which is the design's prescription taken literally: *"using
 * `util.stripVTControlCharacters` where it is exact and a local scan where it is not."*
 *
 *   1. The local scan, over `style.ts`'s `ANSI_ESCAPE`. It removes CSI and OSC **including
 *      the colon form** of an extended colour, which is the one shape Node gets wrong.
 *   2. Node's stripper on what is left — the single-character escapes (`ESC c`), the charset
 *      selections (`ESC ( B`) and a truncated sequence at the end of a string. `ANSI_ESCAPE`
 *      matches none of those, because `wrap` never needed them: it was built to find the
 *      sequences it has to *reopen*, and a charset selection is not one.
 *
 * Order is load-bearing. Ours runs first so the colon form is already gone by the time Node
 * sees the string; reversed, pass 2 would leave `:2::255:0:0m` behind as text and pass 1
 * would have nothing left to match.
 */
export function strip(string: string): string {
  if (string === '') return '';
  let out = '';
  forEachSegment(string, (text) => {
    out += text;
  });
  return nodeStrip(out);
}
