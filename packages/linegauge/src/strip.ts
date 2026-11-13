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
 * Node 24 over sixteen sequence shapes: **fifteen agreed with `strip-ansi` and one did not.**
 * Since ansi-regex 6.5.0 a second one differs, the other way round: Node removes an unterminated
 * `ESC[31` whole, and strip-ansi keeps it, because a CSI's final byte is never a digit.
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
 * So Node's stripper is not used at all. Since 2026-09-30 the implementation is the incumbent's
 * own grammar in one regex (below), which strips the colon form and is `strip-ansi` by
 * construction rather than by a second pass patching the first.
 */

/**
 * `strip-ansi` 7.2.0's own grammar — `ansi-regex` 6.6.0's pattern, which a fresh install of it
 * resolves since 2026-11-08 — in one pass. Until 2026-09-30 this was two: `style.ts`'s scanner and then Node's
 * `stripVTControlCharacters` over what was left, 3.7× strip-ansi's time (B5), and the scanner's
 * whole style stack in `linegauge/strip`'s bundle. The pattern, tried in this order:
 *
 *   palette  the Linux console's `ESC ] P` + seven hex digits and `ESC ] R`, which have no
 *         terminator, with one taken if it is right there — before OSC, so a later `BEL` cannot
 *         swallow the visible text between them;
 *   OSC   `ESC ]` or `0x9D`, a payload that stops at the first terminator, cancel (`CAN`, `SUB`)
 *         or C1 control — so an unterminated one cannot rescan the rest of the input or swallow
 *         the next sequence — then `BEL`, `ESC \` or `0x9C`;
 *   control string  DCS, SOS, PM, APC and the screen window title (`ESC P X ^ _ k` or their C1
 *         bytes), whose opaque payload ends on `ESC \` or `0x9C` only — a `BEL` does not end it;
 *   CSI   `ESC [` or `0x9B`, ECMA-48's parameter bytes (`0`–`?`), intermediate bytes (space–`/`),
 *         then any final byte from `@` to `~`. The colon form of an extended colour
 *         (`ESC[38:2::255:0:0m`) is in it, which is the shape Node's stripper got wrong before
 *         v24.21 and the reason this module was written. The final byte is never a digit, so an
 *         unterminated `ESC[31` is kept as text; and since every final is in the class,
 *         `ESC[5d` is one sequence (6.5.0's narrower class kept it whole as text);
 *   escape  `ESC`, intermediates, then a final from `0` to `~` (`ESC ( 0`, `ESC # 8`), or one of
 *         the two-byte escapes — a digit among them, so `ESC 7` and `ESC 8` (save and restore the
 *         cursor) end at the digit and `ESC 7 l` leaves the `l`.
 *
 * Linear: every quantifier is over a class the next token cannot also match. `strip.test.ts`
 * holds it to `strip-ansi` shape by shape.
 */
const ST = String.raw`(?:\u001B\u005C|\u009C)`;
const STRING_CONTROLS = String.raw`\u0018\u001A\u001B\u0080-\u009F`;
const ANSI = new RegExp(
  [
    String.raw`\u001B\](?:P[\dA-Fa-f]{7}|R)(?:\u0007|${ST})?`,
    String.raw`(?:\u001B\]|\u009D)[^\u0007${STRING_CONTROLS}]*(?:\u0007|${ST})`,
    String.raw`(?:\u001B[PX^_k]|[\u0090\u0098\u009E\u009F])[^${STRING_CONTROLS}]*${ST}`,
    String.raw`(?:\u001B\[|\u009B)[\u0030-\u003F]*[\u0020-\u002F]*[\u0040-\u007E]`,
    String.raw`\u001B(?:[\u0020-\u002F]+[\u0030-\u007E]|[\dA-PR-TZcf-oq-uy=><~|}])`,
  ].join('|'),
  'g',
);

/**
 * Everything a terminal would print, with the escape sequences removed: CSI (SGR and the
 * cursor and erase forms), OSC including `OSC 8` hyperlinks under all three terminators, the
 * C1 introducers, and the single-character escapes. A lone `ESC` with nothing that parses
 * after it is text and is kept — the same answer `strip-ansi` gives, because it is the same
 * pattern. A string with neither `ESC` nor `0x9B` is returned as it is, without a replace —
 * strip-ansi's own fast path, including what it leaves alone: a C1 OSC (`0x9D`) with no `ESC`
 * or `0x9B` beside it is kept by the incumbent, and so it is kept here.
 */
export function strip(string: string): string {
  return string.includes('\u001B') || string.includes('\u009B') ? string.replace(ANSI, '') : string;
}

/**
 * The same function again, as the default export, because `strip-ansi`'s own suite imports
 * a default — and that suite is now this module's grader
 * (`compat-oracle/vendor/strip-ansi`, `baseline/strip-ansi.json`).
 *
 * It is a *subpath* default rather than the package's, and it has to be: R8 spends the root
 * default on `width`, so `overrides: { "string-width": "npm:linegauge@^1" }` resolves. A
 * `strip-ansi` façade can therefore only ever be `linegauge/strip`, and this is the line
 * that makes `import stripAnsi from 'linegauge/strip'` read exactly like the import it
 * replaces. `truncate` and `widest` deliberately do not have one yet: an export is a
 * contract forever, and neither has a vendored suite holding it to the incumbent's shape.
 *
 * Spelled `strip as default` rather than `export default strip` to match how `index.ts`
 * publishes `width as default`: the alias is a live binding to the same declaration, so
 * there is exactly one `strip` in the module however it is imported — which is the property
 * `facade-defaults.test.ts` asserts with `toBe`, not `toEqual`.
 */
// eslint-disable-next-line import-next/no-default-export -- the incumbent's own suite imports a default; see above. This is the drop-in surface, not a style choice.
export { strip as default };
