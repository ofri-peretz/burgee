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

import { retarget, retargetRanges } from "./sync-doc-versions.js";

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

describe("retargetRanges", () => {
  const versions = new Map([["closeout", "0.4.0"], ["burgee", "2.3.1"]]);

  it("moves a 0.x caret range the version has left", () => {
    const { text, changed } = retargetRanges('{ "exit-hook": "npm:closeout@^0.3" }', versions);
    expect(text).toBe('{ "exit-hook": "npm:closeout@^0.4" }');
    expect(changed).toEqual(["npm:closeout@^0.3 → ^0.4"]);
  });

  it("leaves a range that still holds exactly as written", () => {
    const text = "npm:closeout@^0.4 and npm:burgee@^2.1 and npm:burgee@^2";
    expect(retargetRanges(text, versions)).toEqual({ text, changed: [] });
  });

  it("moves a >=1 range across a major", () => {
    expect(retargetRanges("npm:burgee@^1.9", versions).text).toBe("npm:burgee@^2");
  });

  it("does not touch a package it has no version for", () => {
    const text = "npm:string-width@^7";
    expect(retargetRanges(text, versions).text).toBe(text);
  });
});
