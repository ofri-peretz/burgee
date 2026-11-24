/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The Version PR that cuts a package's 1.0.0 must leave SECURITY.md true, without a person editing
 * it. These hold the rewrite to what `stable-status-lock.test.ts` asks of the section, and hold
 * `changeset:version` to running it after the bump.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { opening, releasedVersions, syncSupportedVersions, wrap } from "./sync-supported-versions.js";

const ROOT = join(import.meta.dirname, "..");

const section = (opening: string): string =>
  [
    "# Security policy",
    "",
    "## Supported versions",
    "",
    opening,
    "A fix, a security fix included, ships as a patch or minor release of the current major.",
    "Only the latest release is supported.",
    "",
    "## What reduces the attack surface here",
    "",
    "Nothing.",
    "",
  ].join("\n");

describe("opening", () => {
  it("names every package below 1.0, sorted, with its count", () => {
    expect(opening({ b: "0.2.0", a: "0.1.0", c: "1.0.0" })).toBe(
      "Every published package but `a` and `b`, which are pre-1.0, is at 1.0 or later, and its public API is under semver; those two may change their API in a minor release until each reaches 1.0.",
    );
  });

  it("speaks of one package in the singular", () => {
    expect(opening({ a: "0.1.0", c: "2.0.0" })).toBe(
      "Every published package but `a`, which is pre-1.0, is at 1.0 or later, and its public API is under semver; `a` may change its API in a minor release until it reaches 1.0.",
    );
  });

  it('says nothing about "pre-1.0" once every package is at 1.0', () => {
    expect(opening({ a: "1.0.0", b: "3.2.1" })).toBe("Every published package is at 1.0 or later, and its public API is under semver.");
  });

  it("counts past the words it has with digits", () => {
    const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`p${String(i).padStart(2, "0")}`, "0.1.0"]));
    expect(opening(many)).toContain("those 13 may change");
  });
});

describe("wrap", () => {
  it("fills lines up to the width and never splits a word", () => {
    expect(wrap("aa bb cc dd", 5)).toBe("aa bb\ncc dd");
    expect(wrap("aaaaaaa b", 5)).toBe("aaaaaaa\nb");
    expect(wrap("  ")).toBe("");
  });
});

describe("syncSupportedVersions", () => {
  const stale = section("Every published package but `a`, which is pre-1.0, is at 1.0 or later.");

  it("rewrites the opening for the versions and keeps the policy and the rest of the file", () => {
    const after = syncSupportedVersions(stale, { a: "1.0.0", b: "1.2.0" });
    expect(after).toContain(
      "Every published package is at 1.0 or later, and its public API is under semver. A fix, a security\nfix included, ships as a patch or minor release of the current major. Only the latest release is\nsupported.\n\n## What reduces",
    );
    expect(after.endsWith("Nothing.\n")).toBe(true);
  });

  it("names a package only while it is pre-1.0, and says pre-1.0 only while one is (stable-status-lock's rule)", () => {
    const before = syncSupportedVersions(stale, { a: "0.4.0", b: "1.0.0" });
    expect(before).toContain("`a`, which is pre-1.0");
    expect(before).not.toContain("`b`");
    const after = syncSupportedVersions(before, { a: "1.0.0", b: "1.0.0" });
    expect(after).not.toMatch(/`a`|pre-1\.0/u);
  });

  it("is idempotent", () => {
    const once = syncSupportedVersions(stale, { a: "0.4.0" });
    expect(syncSupportedVersions(once, { a: "0.4.0" })).toBe(once);
  });

  it("refuses a file with no section, or a section that lost the policy it keeps", () => {
    expect(() => syncSupportedVersions("# Security policy\n", {})).toThrow(/no "## Supported versions"/u);
    expect(() => syncSupportedVersions("## Supported versions\n\nAnything else.", {})).toThrow(/no longer opens its policy/u);
  });

  it("rewrites a section that is the last thing in the file", () => {
    expect(syncSupportedVersions("## Supported versions\n\nOld. A fix, a security fix included, ships.", {})).toBe(
      "## Supported versions\n\nEvery published package is at 1.0 or later, and its public API is under semver. A fix, a security\nfix included, ships.",
    );
  });
});

describe("the repository", () => {
  it("SECURITY.md is what the script writes from the manifests", () => {
    const security = readFileSync(join(ROOT, "SECURITY.md"), "utf8");
    expect(syncSupportedVersions(security, releasedVersions())).toBe(security);
  });

  it("changeset:version rewrites it after the bump, so a Version PR that cuts a 1.0.0 stays green", () => {
    const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["changeset:version"]).toMatch(/^changeset version && .*npx tsx scripts\/sync-supported-versions\.ts/u);
  });
});
