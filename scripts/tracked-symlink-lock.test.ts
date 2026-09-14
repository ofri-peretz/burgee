/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a tracked symlink resolves inside the repository.
 *
 * `50cc1a325` (#280) committed a symlink at the repository root:
 *
 *   node_modules -> /Users/ofri/repos/ofriperetz.dev/burgee/node_modules
 *
 * It reached `main` with every check green, because nothing was looking. `.gitignore`
 * opened the hole: its first line was `node_modules/`, and a trailing slash matches a
 * **directory** only — git offers a symlink of that name to `git add` without complaint.
 * The line is now `node_modules`, which matches both.
 *
 * An absolute target is worse than dead weight. It is a public record of one contributor's
 * home directory, it resolves to whatever happens to sit at that path on any machine that
 * has one, and on a runner it is a dangling link at the exact path the package manager
 * writes to. The vendored commander fixtures show the shape that is fine — `../pm`,
 * `./pm`, `../other-dir/pm` — all relative, all landing inside the tree.
 *
 * So the rule is about the target, not the name: relative, and it stays in the repo. That
 * refuses the next `/Users/...` blob as well as this one, which a `node_modules` blacklist
 * would not.
 *
 * Reading the index rather than the working tree is deliberate: the offending link was
 * never present in a fresh clone's `node_modules` position by accident, it was recorded as
 * mode 120000, and that is the only place the fact survives a checkout on a machine where
 * the path happens to exist.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every tracked symlink, as `[path, target]`. Mode 120000 is git's symlink mode. */
function trackedSymlinks(): Array<[string, string]> {
  const rows = execFileSync("git", ["ls-files", "-s"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line.startsWith("120000 "));

  return rows.map((line) => {
    const path = line.slice(line.indexOf("\t") + 1);
    const target = execFileSync("git", ["show", `:${path}`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return [path, target] as [string, string];
  });
}

/** Where the link lands, relative to the repo root. `..`-prefixed means it escaped. */
function escapes(path: string, target: string): boolean {
  if (isAbsolute(target)) return true;
  const landing = resolve(REPO_ROOT, dirname(path), target);
  return relative(REPO_ROOT, landing).startsWith("..");
}

describe("tracked symlinks stay inside the repository", () => {
  const links = trackedSymlinks();

  it("finds the tracked symlinks", () => {
    // Not an assertion about the count — about the reader. A zero here means either the
    // tree genuinely has none or `git ls-files -s` stopped reporting mode 120000, and the
    // two are worth telling apart before trusting the rest of this file.
    expect(links.map(([path]) => path)).toMatchInlineSnapshot(`
      [
        "packages/compat-oracle/vendor/commander/tests/fixtures/another-dir/pm",
        "packages/compat-oracle/vendor/commander/tests/fixtures/other-dir/pm",
        "packages/compat-oracle/vendor/commander/tests/fixtures/pmlink",
      ]
    `);
  });

  it("records no absolute target", () => {
    const absolute = links
      .filter(([, target]) => isAbsolute(target))
      .map(([path, target]) => `${path} -> ${target}`);
    expect(absolute).toEqual([]);
  });

  it("records no target outside the tree", () => {
    const outside = links
      .filter(([path, target]) => escapes(path, target))
      .map(([path, target]) => `${path} -> ${target}`);
    expect(outside).toEqual([]);
  });

  it("ignores a node_modules symlink, not only a node_modules directory", () => {
    // `node_modules/` matches a directory; the symlink that caused this file did not match.
    const ignore = readFileSync(resolve(REPO_ROOT, ".gitignore"), "utf8");
    expect(ignore.split("\n")).toContain("node_modules");
  });
});
