// The review action diffs `origin/<base>...HEAD`, so the merge base has to stay reachable. Its
// caller checks out with fetch-depth: 0; a later `git fetch --depth=1` of the base marks the
// base tip shallow and hides its history. Once main had moved past a PR's merge ref the brief
// step failed with "origin/main...HEAD: no merge base" (burgee#1790, run 45403147622), and the
// review check went red on a diff it never read.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const action = readFileSync(
  join(
    import.meta.dirname,
    "..",
    ".github",
    "actions",
    "triggerlist-review",
    "action.yml",
  ),
  "utf8",
);
const fetches = action
  .split("\n")
  .filter(
    (line) => !line.trim().startsWith("#") && /\bgit fetch\b/u.test(line),
  );

describe("triggerlist-review keeps the merge base reachable", () => {
  it("fetches the base branch", () => {
    expect(fetches.length).toBeGreaterThan(0);
  });

  it("never fetches shallow", () => {
    for (const line of fetches) expect(line).not.toMatch(/--depth|--shallow/u);
  });
});
