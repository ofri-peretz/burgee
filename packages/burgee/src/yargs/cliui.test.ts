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

/**
 * Median ratio of the cost at 4n to the cost at n. Linear work lands at 4; the quadratic
 * backtracking this guards lands near 16. The ceiling is 8 — the midpoint in log space, so
 * neither side is close to it.
 *
 * Why a ratio and not milliseconds: catastrophic backtracking is a statement about how cost
 * GROWS, while a millisecond budget is a statement about the runner. This file used to assert
 * `elapsed < 400` and CI returned 440. This repo already knew better — the B2 ratchet says
 * "gates the median, not the p95 — an absolute or tail-driven gate is what red-lit two innocent
 * PRs in #27" — and these assertions were the same mistake one file over.
 *
 * Why n = 12,000 and a median of samples, both measured: at 3,000 a single best-of-3 ratio on
 * genuinely linear code was observed as high as 6.35, because fixed overhead dominates and
 * noise rides on top. By 12,000 the spread is 3.75–4.40. And why not larger: the first version
 * used 25,000/100,000 and ran past CI's 5s default timeout — a perf test that times out is a
 * slower way to be flaky.
 *
 * Best-of within each size, median across ratios: a slow run can only come from noise (GC, a
 * scheduler slice, a cold JIT), never from the code being faster than it is, so the minimum is
 * the least noisy estimate; the median across samples then discards a pathological pairing.
 * Both sizes run in the same process, so whatever the machine is, it cancels.
 */
function growth(work: (n: number) => unknown, n = 12_000, samples = 5): number {
  const best = (size: number, runs = 3) => {
    let min = Infinity;
    for (let i = 0; i < runs; i++) {
      const started = performance.now();
      work(size);
      min = Math.min(min, performance.now() - started);
    }
    return Math.max(min, 0.05); // a floor, so a sub-tick measurement cannot divide by zero
  };
  const ratios: number[] = [];
  for (let i = 0; i < samples; i++) ratios.push(best(n * 4) / best(n));
  ratios.sort((a, b) => a - b);
  // `?? Infinity` rather than a non-null assertion: with no samples the gate should fail
  // loudly, not pass on an undefined that got asserted away.
  return ratios[Math.floor(ratios.length / 2)] ?? Infinity;
}

describe("padding measurement", () => {
  it("counts leading and trailing whitespace", () => {
    const ui = cliui({ width: 40 });
    ui.div("  indented and trailing   ");
    expect(ui.toString()).toBe("  indented and trailing");
  });

  it(
    "does not backtrack on a cell that is mostly whitespace",
    { timeout: 20_000 },
    () => {
      // Shape, not wall clock. The bug is catastrophic backtracking, which is a statement about
      // how the cost GROWS, and an absolute millisecond budget is a statement about the runner:
      // this file asserted `< 400` and a CI box came back with 440. This repo already learned
      // that lesson for the ratchet gates, which say in as many words that "an absolute or
      // tail-driven gate is what red-lit two innocent PRs in #27".
      //
      // Quadrupling the input must not multiply the cost by ~16. The ceiling is generous on
      // purpose: it has to clear linear overhead and scheduler noise on a shared runner, while
      // staying far enough below quadratic that the regression this guards cannot hide under it.
      expect(
        growth((n) => cliui({ width: 80 }).div(`${" ".repeat(n)}x`)),
      ).toBeLessThan(8);
    },
  );
});

describe("row rendering", () => {
  it("trims trailing spaces and only trailing spaces", () => {
    const ui = cliui({ width: 40, wrap: false });
    ui.div("ends with a tab\t   ");
    // The spaces go, the tab stays. `trimEnd()` would take both.
    expect(ui.toString()).toBe("ends with a tab\t");
  });

  it(
    "does not backtrack when trimming a wide row's trailing spaces",
    { timeout: 20_000 },
    () => {
      const render = (n: number) => {
        const ui = cliui({ width: 80 });
        ui.div(`${" ".repeat(n)}x`);
        return ui.toString();
      };
      expect(render(24_000).endsWith("x")).toBe(true);
      expect(growth(render)).toBeLessThan(8);
    },
  );
});
