/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the artifact ratchet weighs both numbers a consumer pays.
 *
 * `artifact-size-baseline.json` has recorded `size` and `unpackedSize` side by side
 * since the file existed, and for just as long only `size` was ever compared. That is
 * wrong in both directions, and burgee@0.4.0 hit both on the same release:
 *
 *   - The tarball fired at +12.1% while the unpacked tree grew 5.9%, because `dist/`
 *     moved from flat to nested (`dist/commander-command.js` ->
 *     `dist/commander/command.js`) and gzip pays for every new path. A ratchet that
 *     moves on a rename is measuring layout, not weight.
 *   - Going the other way, an unpacked regression rode in free for as long as it
 *     compressed well — `unpackedSize` is what lands on disk and what Node reads at
 *     require time, and nothing was watching it.
 *
 * The `unpacked` case below is the one that fails on the old single-dimension check.
 */
import { describe, expect, it } from "vitest";

import {
  sizeVerdict,
  type Baseline,
  type PackEntry,
  type Pkg,
} from "./check-published-artifacts";

const pkg: Pkg = { name: "demo" };

const pack = (size: number, unpackedSize: number): PackEntry => ({
  name: "demo",
  size,
  unpackedSize,
  files: [],
});

/** 10% is the allowance, so 1000 -> 1101 is over and 1000 -> 1100 is not. */
const base = (): Baseline => ({ demo: { size: 1000, unpackedSize: 5000 } });

describe("artifact size ratchet", () => {
  it("catches a gzipped-tarball regression", () => {
    expect(sizeVerdict(pkg, pack(1200, 5000), base(), false)).toEqual([
      expect.stringContaining("gzipped tarball grew 20.0%"),
    ]);
  });

  it("catches an unpacked regression the tarball hides", () => {
    /*
     * The tarball is flat — well-compressed additions, or a layout that packs the
     * same — while what lands on disk grew 20%. The single-dimension check read
     * this as no change at all.
     */
    expect(sizeVerdict(pkg, pack(1000, 6000), base(), false)).toEqual([
      expect.stringContaining("unpacked grew 20.0%"),
    ]);
  });

  it("names both when both regress", () => {
    expect(sizeVerdict(pkg, pack(1200, 6000), base(), false)).toHaveLength(2);
  });

  it("allows growth inside the 10% allowance", () => {
    expect(sizeVerdict(pkg, pack(1100, 5500), base(), false)).toEqual([]);
  });

  it("does not fail a shrink in either dimension", () => {
    expect(sizeVerdict(pkg, pack(900, 4000), base(), false)).toEqual([]);
  });

  it("records a package that has no baseline yet", () => {
    const baseline: Baseline = {};
    expect(sizeVerdict(pkg, pack(1000, 5000), baseline, false)).toEqual([]);
    expect(baseline["demo"]).toEqual({ size: 1000, unpackedSize: 5000 });
  });

  it("rewrites both numbers under --update-baseline", () => {
    const baseline = base();
    expect(sizeVerdict(pkg, pack(9999, 8888), baseline, true)).toEqual([]);
    expect(baseline["demo"]).toEqual({ size: 9999, unpackedSize: 8888 });
  });
});
