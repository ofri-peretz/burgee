/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The dated-line rule is the whole of this script, and it is the half that cannot be
 * checked by running it: a rewriter that ignored dates would go green by editing release
 * notes into a lie, which is exactly what `roadmap-facts` grants the exemption to prevent.
 */
import { describe, expect, it } from "vitest";

import { retarget } from "./sync-doc-versions.js";

const versions = new Map([["burgee", "0.5.0"]]);

describe("retarget", () => {
  it("moves an undated claim to the manifest", () => {
    const { text, changed } = retarget("ships as burgee@0.4.0 today", versions);
    expect(text).toBe("ships as burgee@0.5.0 today");
    expect(changed).toEqual(["1: burgee@0.4.0 → 0.5.0"]);
  });

  it("leaves a dated line exactly as written — it is history, not a claim about now", () => {
    const line = "2026-09-01 — released burgee@0.4.0";
    const { text, changed } = retarget(line, versions);
    expect(text).toBe(line);
    expect(changed).toEqual([]);
  });

  it("says nothing when the claim already agrees", () => {
    const { text, changed } = retarget("burgee@0.5.0", versions);
    expect(text).toBe("burgee@0.5.0");
    expect(changed).toEqual([]);
  });

  it("rewrites every claim on one line, and reports each", () => {
    const { text, changed } = retarget(
      "burgee@0.4.0 and burgee@0.1.0",
      versions,
    );
    expect(text).toBe("burgee@0.5.0 and burgee@0.5.0");
    expect(changed).toHaveLength(2);
  });
});
