/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the benchmark recorder does not trigger on its own output.
 *
 * `bench.yml` runs on every push to `main`. On a push it writes `benchmarks/results/`,
 * opens a PR with the diff, and enables auto-merge. That PR's merge is a push to `main`,
 * which runs `bench.yml` again. The step's own guard — "is there anything new to record"
 * — is always true, because the run overwrites the published measurements with this
 * runner's, and `cold-start-ms` is a property of the box. So one commit's observations
 * came back as #275, #277, #282, #284, #286, #288 and #289: seven pull requests, each
 * opened by the merge of the one before it, with no state at which the queue is empty.
 *
 * `paths-ignore` on the push trigger is what terminates it. It skips a push only when
 * *every* changed file matches, so a commit carrying code alongside results still runs
 * and still records — the loop is cut, the measurement is not.
 *
 * Locking the trigger rather than the step: the step is already guarded and the guard is
 * not the thing that failed. What failed is a workflow subscribing to a directory it
 * writes, which is a shape, and the shape is in the `on:` block.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The `on:` block, as text. `scripts/lint-workflows.ts` reads these files the same way and
 * for the same reason: `yaml` is not a dependency of this repo, only something that
 * happens to be under `node_modules` today, and a lock that leans on a transitive install
 * is a lock that disappears the week the tree is deduped.
 */
function triggers(workflow: string): string {
  const text = readFileSync(
    resolve(REPO_ROOT, ".github/workflows", workflow),
    "utf8",
  );
  const start = text.indexOf("\non:\n");
  // Ends at the next top-level key — a line starting in column 0 that is not a comment.
  const rest = text.slice(start + 1);
  const end = rest.search(/\n(?![\s#])\S/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("bench.yml does not trigger on the directory it writes", () => {
  const on = triggers("bench.yml");

  it("still runs on pushes to main", () => {
    expect(on).toMatch(/push:\n\s+branches: \[main]/);
  });

  it("ignores a push that only moved benchmarks/results", () => {
    const ignored =
      on
        .slice(on.indexOf("push:"))
        .match(/paths-ignore:\n((?:\s+- .*\n)+)/)?.[1] ?? "";
    expect(ignored).toContain("- 'benchmarks/results/**'");
  });
});
