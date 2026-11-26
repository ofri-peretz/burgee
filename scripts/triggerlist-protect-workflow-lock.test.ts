/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock: every pull request runs `triggerlist protect` in CI, in observe mode (triggerlist intent,
 * "a protected-checks job"; spec R6).
 *
 * Before 2026-11-26 protect ran only as a pre-push step, which a push from a clone without hooks
 * never runs, and which leaves no record the enforce decision can be read from. Held:
 *
 *   1. `.github/workflows/triggerlist-protect.yml` runs on every PR push (no `paths` filter: a
 *      gate and its code can sit anywhere in the tree);
 *   2. it builds triggerlist from this checkout and runs `protect` against the PR's base SHA, so
 *      the gate list is the base branch's, never one the PR edited;
 *   3. it runs in observe mode: no `--enforce` until a decision file moves it (the intent's
 *      constraint), and a flagged PR leaves a `::warning` the decision can count;
 *   4. its check is not a required one (a required check is a branch-protection change, which the
 *      owner decides).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

import { REQUIRED_CHECKS } from "./required-checks.mjs";

const ROOT = join(import.meta.dirname, "..");
const WORKFLOW = join(ROOT, ".github/workflows/triggerlist-protect.yml");

interface Step {
  readonly name?: string;
  readonly run?: string;
}
interface Workflow {
  readonly on: { readonly pull_request?: { readonly types?: readonly string[]; readonly paths?: unknown } };
  readonly jobs: Record<string, { readonly name?: string; readonly steps: readonly Step[] }>;
}

const workflow = (): Workflow => loadYaml(readFileSync(WORKFLOW, "utf8")) as Workflow;
const runs = (): string => Object.values(workflow().jobs).flatMap((job) => job.steps.map((step) => step.run ?? "")).join("\n");

describe("triggerlist protect runs on every pull request", () => {
  it("exists and runs on every PR push, with no paths filter", () => {
    expect(existsSync(WORKFLOW), `${WORKFLOW} is missing: protect would run only where hooks are installed`).toBe(true);
    const pr = workflow().on.pull_request;
    expect(pr?.types).toEqual(expect.arrayContaining(["opened", "synchronize", "reopened"]));
    expect(pr?.paths).toBeUndefined();
  });

  it("builds triggerlist from this checkout and protects against the base SHA", () => {
    expect(runs()).toMatch(/turbo run build --filter=triggerlist\.\.\./u);
    expect(runs()).toMatch(/node packages\/triggerlist\/dist\/bin\.js protect "\$BASE_SHA"/u);
    const env = JSON.stringify(workflow().jobs);
    expect(env).toContain("github.event.pull_request.base.sha");
  });

  it("stays in observe mode and leaves a warning for each flagged PR", () => {
    expect(runs()).not.toMatch(/--enforce/u);
    expect(runs()).toMatch(/::warning title=triggerlist protect::/u);
  });

  it("is not a required check", () => {
    const names = Object.values(workflow().jobs).map((job) => job.name);
    for (const name of names) expect(REQUIRED_CHECKS).not.toContain(name);
  });
});
