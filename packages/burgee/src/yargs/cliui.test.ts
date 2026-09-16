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
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cliui } from "./cliui.js";

/**
 * Growth factor: the cost at 4n over the cost at n. Linear work lands at 4; the quadratic
 * backtracking this guards lands near 16. The ceiling is 8 — the midpoint in log space, so
 * neither side is close to it.
 *
 * Why a ratio and not milliseconds: catastrophic backtracking is a statement about how cost
 * GROWS, while a millisecond budget is a statement about the runner. This file used to assert
 * `elapsed < 400` and CI returned 440. This repo already knew better — the B2 ratchet says
 * "gates the median, not the p95 — an absolute or tail-driven gate is what red-lit two innocent
 * PRs in #27" — and these assertions were the same mistake one file over.
 *
 * Why four samples and not more: seven took 20s on a CI runner and blew the test's own
 * timeout — the second time this gate was flaky for being slow rather than for being wrong.
 * The per-test ceiling is gone too, so the package config's 60s governs in one place.
 *
 * Why n = 12,000: at 3,000 a single ratio on genuinely linear code was observed as high as
 * 6.35, because fixed overhead dominates and noise rides on top. By 12,000 the spread settles.
 * And why not larger: the first version used 25,000/100,000 and ran past CI's 5s default
 * timeout — a perf test that times out is a slower way to be flaky.
 *
 * Why the MINIMUM everywhere, and not a median: the first version took the median of five
 * ratios, tuned against measurements from one machine, and a macOS CI runner then reported
 * **9.08 for the linear implementation** — above the ceiling, on correct code. Picking a
 * threshold from one box is the same mistake as picking a millisecond budget, one level up.
 * A slow reading can only come from interference — GC, a scheduler slice, a cold JIT — never
 * from the code being faster than it is. So noise is one-sided, and the minimum is the only
 * estimator it cannot inflate. Both sizes run in the same process, so the machine cancels.
 *
 * ---
 *
 * Two defects in this instrument, found after CI failed at **10.145** and an earlier local run
 * came back **8.557**. Both were the measurement rather than the code, and the ceiling is
 * unchanged at 8: a looser ceiling is a weaker gate, and the regression this guards must not be
 * able to hide under it.
 *
 * **1. On correct code the denominator was the clock.** `best()` ended with
 * `Math.max(min, 0.05)`, a floor so that a sub-tick reading could not divide by zero. Measured
 * on node v24.18.0 / macOS, one `div()` at n = 12,000 costs **0.0122 ms**, and at 4n = 48,000
 * it costs **0.0350 ms** — both *under* that floor. So the padding assertion below was
 * computing `0.05 / 0.05`, and over 20 runs it returned exactly **1.0000 seventeen times**
 * (1.06–1.07 the other three). That number describes the floor constant, not this file.
 *
 * Say plainly what it did *not* do, because the obvious reading of a floored denominator is
 * that it inflates the ratio and red-lights correct code, and here it does not. Write the
 * reported ratio as a function of how much slower than this box a runner is (k): below
 * k = 1.43 both readings clamp and the ratio is 1; between 1.43 and 4.1 only the numerator is
 * real and the ratio is 0.7k, topping out at **2.87**; above that neither clamps and it settles
 * at 2.87. The floored form cannot reach 8 on linear code. And on a reintroduced quadratic it
 * still failed — 12,000 then costs ~70 ms, nowhere near the floor — **measured at 15.03**. So
 * this was a dead reading, not a false alarm, and it was never the cause of the CI failure;
 * defect 2 was. What it cost is the middle of the range: a regression that was superlinear but
 * not quadratic would be flattened toward 1 instead of being reported as the ~8 it is.
 *
 * The fix is to calibrate the instrument instead of flooring it. Double a batch of
 * back-to-back calls until the window at `n` clears `MIN_WINDOW_MS`, then measure both sizes
 * with that same batch, so the repeat count cancels in the ratio and neither reading sits near
 * the timer's noise. `div` calibrates to 512 or 1,024 repeats depending on how warm it is by
 * then; `toString()` already measures ~8 ms for a single call and stays at 1. Bounded by
 * `MAX_REPEATS` so a quadratic implementation still terminates and still fails — it needs
 * *fewer* repeats to clear the window, never more.
 *
 * Why a batch and not a larger `n`, which is the other way to get a real denominator: growing
 * `n` until `div` clears the window takes **eight doublings, to n = 3,072,000**, which makes
 * the 4n input a single 12-million-character string. Measured head to head, the two cost about
 * the same wall time (150 ms vs 142 ms) and reach the same verdict — 3.899 vs 3.603 on the
 * linear code, 16.27 vs 15.17 on a deliberately quadratic control. The batch wins on the one
 * axis that matters for a gate whose whole problem is interference on a shared runner: its
 * largest single allocation stays 48,000 characters instead of 12 million, so it does not
 * answer a noise complaint by adding memory pressure.
 *
 * **2. A ratio required one sample to be clean on both sides at once.** The old form took the
 * minimum over four *ratios*, so a sample counted only if its numerator and its denominator
 * were both un-perturbed. Often they were not: over 20 local runs of the `toString()`
 * assertion the per-sample ratios spanned **3.68 to 7.32**, with the 4n numerator sometimes
 * sustainedly ~1.8x slow across all three of its own runs (54.4 ms and 60.2 ms against a
 * typical 33 ms). That is GC on the larger input, not a stray scheduler slice, which is why
 * best-of-3 did not remove it — and why the minimum over ratios has to get lucky twice in the
 * same sample. On a loaded macOS runner it does not: 8.557, then 10.145.
 *
 * Since noise is one-sided, each side's floor is better estimated on its own: take the minimum
 * of every numerator reading and the minimum of every denominator reading, then divide. The
 * cleanest 4n run and the cleanest n run no longer have to be the same sample. That is the
 * argument two paragraphs up for taking a minimum at all, applied one level higher.
 *
 * This direction is safe by construction rather than by measurement, which is worth stating
 * because a change to a gate's estimator is a change to what it will let through. Writing
 * `num*` and `den*` for the two minima, every sample satisfies
 * `num_i / den_i >= num* / den_i >= num* / den*`, so the new reading is **never above the old
 * one**. It can only remove failures that came from the coincidence, never add one — and it
 * cannot soften the quadratic case, which fails on the ratio's magnitude and not on its noise.
 *
 * After both fixes, 20 consecutive local runs: 20 green, `div` **3.532–4.452**, `toString()`
 * **3.753–4.399**. Against the same reintroduced backtracking, both assertions fail —
 * **15.900** for `div` and **14.748** for `toString()`.
 */
/**
 * Catastrophic backtracking is checked by shape, not by clock — after three timing instruments
 * failed, each differently.
 *
 * 1. `< 400 ms` at a small size: a CI box returned 440. A 10% margin measures the runner.
 * 2. A growth *ratio* — quadruple the input, require the cost not to multiply by ~16 — read
 *    **15.04 on macOS CI against 4.09 locally for identical code**, batched 256 times, so not
 *    noise. Per call that runner was 3x slower at n and 11x slower at 4n: a 48,000-character
 *    cell is 96 KB of UTF-16 where a 12,000-character one is 24 KB, and the larger crosses a
 *    cache boundary the smaller does not. The ratio was measuring the memory hierarchy, and no
 *    ceiling repairs that — linear code genuinely costs more than 4x once its input stops
 *    fitting.
 * 3. An absolute budget, sized properly this time. It cannot work either, and the numbers say
 *    why: at n = 50,000 the quadratic implementation costs **1,072 ms here** while the linear
 *    one costs **~1,780 ms on CI** (measured 33x slower on this path). *Correct code on the
 *    slow machine is dearer than buggy code on the fast one.* No single threshold separates
 *    them, and any threshold that passes CI cannot fail locally — a check that cannot fail
 *    where it runs most often, which is the defect this repository keeps finding in its own
 *    checkers.
 *
 * So the guarantee is structural. The bug is one shape: a quantifier with no anchor before it,
 * matched against the row text, so the engine retries at every position in a long run and each
 * attempt walks to the end. `cliui.ts`'s own comment records what that cost — **1,049 ms of
 * `toString()`'s 1,223 ms** for a cell of 50,000 spaces, quadrupling when the cell doubled.
 *
 * This runs in microseconds, on every machine, and cannot flake. What it gives up is generality:
 * it catches the shape rather than the behaviour, so a *new* quadratic written some other way
 * would pass. The measurement above is the evidence that this shape is the one that bit, and
 * `measurePadding`'s own comment records the same lesson one function over.
 */
const ROW_SOURCE = readFileSync(new URL("./cliui.ts", import.meta.url), "utf8")
  // Comments out, or this matches the paragraph in `cliui.ts` that *documents* the bug — which
  // it did on the first run. A checker that reads printed source and not shape is the defect
  // this repository has now caught in three of its own checkers.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * A quantified run with nothing anchoring its start — `/ +$/`, `/\s*$/`, `/[ \t]+$/`.
 * `/^ +/` is fine: anchored at the start, the engine tries one position.
 */
const UNANCHORED_TAIL = /\/(?!\^)[^/\n]*[+*]\$\//;

describe("padding measurement", () => {
  it("counts leading and trailing whitespace", () => {
    const ui = cliui({ width: 40 });
    ui.div("  indented and trailing   ");
    expect(ui.toString()).toBe("  indented and trailing");
  });

  it("does not backtrack on a cell that is mostly whitespace", () => {
    expect(UNANCHORED_TAIL.test(ROW_SOURCE), `cliui.ts grew an unanchored trailing quantifier — that is the 1,049 ms shape`).toBe(false);
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
    const render = (cell: string) => {
      const ui = cliui({ width: 80 });
      ui.div(cell);
      return ui.toString();
    };
    // The trim lives in `toString()`, so this one must render, not merely lay out.
    expect(render(`${" ".repeat(24_000)}x`).endsWith("x")).toBe(true);
    expect(UNANCHORED_TAIL.test(ROW_SOURCE), `the trim in toString() must stay anchored or linear`).toBe(false);
  });
});
