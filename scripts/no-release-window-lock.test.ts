/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — no release window (D-20261027-no-release-window).
 *
 * The owner, 2026-10-27: "No release window, we should release all day long every time we wish
 * to release." Until then a minor merged within 7 days of its package's previous minor was held
 * on `main`, every fix to that package waited with it, and `release.yml` deferred whatever slipped
 * past. Now every pending changeset goes into the next Version PR, and every version `main` holds
 * that npm does not publishes on the next release run.
 *
 * Read from the workflows' text, as the other release locks read them (no YAML dependency). Each
 * case fails on `main` before this change, where `scripts/release-window.mts plan`, `version` and
 * `publishable` sat between a merge and npm.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = (file: string): string =>
  readFileSync(join(ROOT, ".github/workflows", file), "utf8");

/** One job of a workflow: from its key to the next job's key. */
function job(text: string, name: string): string {
  const start = text.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  const next = /\n {2}[\w-]+:\n/u.exec(text.slice(start + 1));
  return next === null
    ? text.slice(start)
    : text.slice(start, start + 1 + next.index);
}

/** The step in `body` that contains `marker`: from its `- name:` to the next one. */
function step(body: string, marker: string): string {
  const at = body.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const end = body.indexOf("- name:", at);
  return body.slice(
    body.lastIndexOf("- name:", at),
    end === -1 ? undefined : end,
  );
}

describe("no release window — every release goes out when it merges", () => {
  it("a minor merged one day after the previous minor is in the next Version PR: changeset version runs over every pending changeset, unconditionally", () => {
    const version = job(workflow("changesets-pr.yml"), "version");
    const refresh = step(version, "uses: changesets/action@");
    expect(refresh).toContain("version-script: npm run changeset:version");
    expect(refresh, "nothing decides whether the Version PR opens").not.toMatch(
      /\n\s+if:/u,
    );
    expect(version, "no plan sets a changeset aside").not.toContain(
      "scripts/release-window",
    );
  });

  it("a patch is never deferred: release.yml publishes every version npm lacks, with nothing filtering the plan", () => {
    const detect = job(workflow("release.yml"), "detect");
    expect(detect).not.toContain("scripts/release-window");
    // The rows the npm diff appended are the plan, as they are.
    const diffed = detect.indexOf(
      'publish=$(jq -c --argjson row "$row" \'. + [$row]\' <<<"$publish")',
    );
    const emitted = detect.indexOf('echo "plan=$publish" >> "$GITHUB_OUTPUT"');
    expect(diffed).toBeGreaterThan(-1);
    expect(emitted).toBeGreaterThan(diffed);
    expect(
      detect.slice(diffed, emitted),
      "nothing reassigns the plan between the npm diff and its output",
    ).not.toMatch(/\n\s+publish=/u);
  });

  it("nothing waits on a clock for a window to open: neither workflow runs on a schedule", () => {
    for (const file of ["changesets-pr.yml", "release.yml"])
      expect(workflow(file), file).not.toMatch(/\n {2}schedule:/u);
  });

  it("the semver lock stays: a behaviour the incumbent shipped as a major is still refused below major on every PR", () => {
    const required = job(workflow("changesets-pr.yml"), "required");
    expect(step(required, "run: node scripts/changeset-lock.mts")).toContain(
      "if: steps.check.outputs.status == 'present'",
    );
  });
});
