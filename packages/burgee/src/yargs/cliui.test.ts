/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — measuring a cell's padding is linear in the cell.
 *
 * Upstream measured it with an unanchored trailing `\s*$` match and a leading one. The
 * trailing form is quadratic: the engine retries at every start position, and each attempt
 * walks the remaining whitespace before failing on the character that is not the end.
 * CodeQL raised it as alert 35, "polynomial regular expression used on uncontrolled data",
 * once `stripAnsi` came from linegauge and the string counted as library input.
 *
 * **The alert named the wrong character.** It says "strings with many repetitions of
 * '\t'", and a tab never reaches the regex at length: `shouldApplyLayoutDSL` routes any
 * string containing a tab or a newline into `applyLayoutDSL`, which splits on '\t' first,
 * so `measurePadding` sees 50,000 one-character columns and finishes in 11 ms. A space is
 * not in that test. It goes straight to `colFromString`, which hands the whole string over.
 * Measured here on `' '.repeat(50_000) + 'x'` through `div()`: **1,346 ms before the fix,
 * 0.2 ms after.** A finding that is real for a reason its own report gets wrong is worth
 * writing down, because the next reader checks the reported input, sees 11 ms, and closes
 * it.
 *
 * 250 ms is deliberately loose: 5x under the unfixed cost and a thousand times over the
 * fixed one, so a slow runner does not turn this red while a reintroduced backtracking
 * regex still does.
 *
 * ---
 *
 * Lock — rendering a row is linear in the cell.
 *
 * `toString()` on the same cell cost ~1,200 ms with `div()` already fixed, and the cause is
 * a second copy of the same mistake one function over: `rowToString` ended each line with
 * `str.replace(/ +$/, "")`. That start is unanchored too. The line it runs on is the cell
 * plus its left padding — 100,001 characters for a 50,000-space cell, the first 50,000 of
 * them spaces — so the engine retries at every one of those positions and walks to the end
 * each time.
 *
 * Measured here on `' '.repeat(50_000) + 'x'`, node v24.18.0, macOS, `toString()` only:
 * **1,223 ms before, 69 ms after**, of which the trailing-space trim alone was 1,049 ms.
 * The shape, not just the number: doubling the cell used to quadruple the time
 * (12.5k / 25k / 50k / 100k = 64 / 250 / 988 / 3,947 ms for the trim); it now doubles it
 * (14 / 32 / 69 / 135 ms for the whole call). What is left is `linegauge`'s `wrap`, which
 * is linear.
 *
 * `trimEnd()` is not the fix — it removes `\t` as well, and a trailing tab does reach this
 * line. With `wrap: false`, `rasterize` splits the cell on newlines and nothing else: no
 * `wrap` to expand the tab into spaces, and no `applyLayoutDSL` to split on it, since that
 * route is behind `this.wrap`. The first test below is what would catch the swap.
 *
 * 400 ms on the same 50,000-space cell: 3x under the unfixed cost, 6x over the fixed one.
 * Tighter than the `div()` budget above because the linear floor here is 69 ms rather than
 * 0.2 ms — and it still holds, because the quadratic it guards against overshoots it by
 * 800 ms. Measured reverted: 1,058 ms.
 */
import { describe, expect, it } from "vitest";

import { cliui } from "./cliui.js";

describe("padding measurement", () => {
  it("counts leading and trailing whitespace", () => {
    const ui = cliui({ width: 40 });
    ui.div("  indented and trailing   ");
    expect(ui.toString()).toBe("  indented and trailing");
  });

  it("does not backtrack on a cell that is mostly whitespace", () => {
    const ui = cliui({ width: 80 });
    // Spaces, not tabs — see above. A tab would be split into columns before it got here.
    const pathological = `${" ".repeat(50_000)}x`;

    const started = performance.now();
    ui.div(pathological);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(250);
  });
});

describe("row rendering", () => {
  it("trims trailing spaces and only trailing spaces", () => {
    const ui = cliui({ width: 40, wrap: false });
    ui.div("ends with a tab\t   ");
    // The spaces go, the tab stays. `trimEnd()` would take both.
    expect(ui.toString()).toBe("ends with a tab\t");
  });

  it("does not backtrack when trimming a wide row's trailing spaces", () => {
    const ui = cliui({ width: 80 });
    const pathological = `${" ".repeat(50_000)}x`;
    ui.div(pathological);

    const started = performance.now();
    const rendered = ui.toString();
    const elapsed = performance.now() - started;

    expect(rendered.endsWith("x")).toBe(true);
    expect(elapsed).toBeLessThan(400);
  });
});
