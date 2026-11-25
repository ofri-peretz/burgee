/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock: shipped intents' evidence is re-run every week, and the run re-runs something (provedone
 * intent, success criterion 1, spec R3).
 *
 * `provedone intent check --evidence` shipped with R3 on 2026-11-23, but nothing ran it: no
 * workflow, hook or script named it, and on 2026-11-25 it re-ran 0 rows on `main`, because no
 * shipped intent had a `| Criterion | Command | Output |` row whose command is one code span. A
 * check that runs nothing reads green forever. Three things are held:
 *
 *   1. `.github/workflows/intent-evidence.yml` runs on a weekly schedule (and by dispatch), builds
 *      the packages first, and runs `intent check --evidence` with its exit code kept;
 *   2. the workflow fails a run that re-ran no row;
 *   3. at least one shipped intent has a row provedone re-runs, so (2) cannot fire on `main`;
 *   4. the count of re-run rows only goes up (`RERUN_FLOOR`), so a row deleted or an intent moved
 *      off `shipped` is a decision someone makes in this file, not a silent drop;
 *   5. a row that filters its test file by name (`-t "…"`) records a passed count. A `-t` that
 *      matches nothing exits 0 with every case skipped, so a renamed or deleted test would leave
 *      the row green; the count is what makes it fail (seen 2026-11-25: `-t "band for bnad"`
 *      exited 0, and with `1 passed` recorded `intent check --evidence` reported it). The rule
 *      itself is provedone's `filter-count` finding, so other repos get it from `intent check`.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `provedone` resolves from another checkout's dist/ in an uninstalled worktree
import { checkIntent, evidenceRows, statusOf } from "../packages/provedone/src/intents.js";
// eslint-disable-next-line import-next/no-relative-packages -- as above
import { runnable } from "../packages/provedone/src/store.js";

const ROOT = join(import.meta.dirname, "..");
const WORKFLOW = join(ROOT, ".github/workflows/intent-evidence.yml");
const INTENTS = join(ROOT, ".sdlc/intents");

interface Step {
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
}
interface Workflow {
  readonly on: {
    readonly schedule?: readonly { cron: string }[];
    readonly workflow_dispatch?: unknown;
  };
  readonly jobs: Record<
    string,
    { readonly steps: readonly Step[]; readonly "timeout-minutes"?: number }
  >;
}

const workflow = (): Workflow =>
  loadYaml(readFileSync(WORKFLOW, "utf8")) as Workflow;
const steps = (): readonly Step[] =>
  Object.values(workflow().jobs).flatMap((job) => job.steps);

/**
 * Rows `intent check --evidence` re-runs on `main`. Raise it when you add rows; lowering it is a
 * decision: say in the PR which row went and why.
 */
const RERUN_FLOOR = 16;

interface Rerunnable {
  readonly id: string;
  readonly command: string;
  readonly output: string;
}

/** The shipped intents' rows that `intent check --evidence` re-runs. */
const rerunnable = (): Rerunnable[] =>
  readdirSync(INTENTS)
    .map((slug) => [slug, join(INTENTS, slug, "intent.md")] as const)
    .filter(([, file]) => existsSync(file))
    .flatMap(([slug, file]) => {
      const text = readFileSync(file, "utf8");
      if (statusOf(text) !== "shipped") return [];
      return evidenceRows(text)
        .filter(
          (row) => row.command !== undefined && runnable(row.command, ROOT),
        )
        .map((row) => ({
          id: `${slug}: ${row.criterion}`,
          command: row.command as string,
          output: row.output,
        }));
    });

describe("shipped intents’ evidence is re-run weekly (provedone criterion 1, R3)", () => {
  it("runs on a weekly schedule, and by dispatch", () => {
    const { on } = workflow();
    expect(on.workflow_dispatch).not.toBeUndefined();
    const crons = (on.schedule ?? []).map((s) => s.cron);
    expect(crons).toHaveLength(1);
    // minute hour * * <one weekday>: once a week, never daily.
    expect(crons[0]).toMatch(/^\d+ \d+ \* \* [0-6]$/u);
  });

  it("builds the packages, then runs intent check --evidence and keeps its exit code", () => {
    const all = steps();
    const build = all.findIndex(
      (s) => s.run?.includes("turbo run build") === true,
    );
    const check = all.findIndex(
      (s) =>
        s.run?.includes(
          "packages/provedone/dist/bin.js intent check --evidence",
        ) === true,
    );
    expect(build, "a step builds the packages").toBeGreaterThanOrEqual(0);
    expect(check, "a step runs intent check --evidence").toBeGreaterThan(build);
    const run = all[check]?.run ?? "";
    expect(run).toMatch(/\|\| status=\$\?/u);
    expect(run).toMatch(/exit "\$status"/u);
  });

  it("fails a run that re-ran no row", () => {
    const run =
      steps().find((s) => s.run?.includes("intent check --evidence") === true)
        ?.run ?? "";
    expect(run).toMatch(
      /data\.reruns\.length === 0\)[\s\S]*process\.exitCode = 1/u,
    );
  });

  it("has at least one shipped intent row to re-run", () => {
    expect(rerunnable().length).toBeGreaterThan(0);
  });

  it(`re-runs at least ${String(RERUN_FLOOR)} rows, a floor that only rises`, () => {
    expect(
      rerunnable().length,
      `fix: a re-runnable evidence row was removed or its intent left "shipped"; restore it, or lower RERUN_FLOOR in this file and say why in the PR`,
    ).toBeGreaterThanOrEqual(RERUN_FLOOR);
  });

  it("records a passed count on every row that filters tests by name", () => {
    const blind = readdirSync(INTENTS)
      .map((slug) => [slug, join(INTENTS, slug, "intent.md")] as const)
      .filter(([, file]) => existsSync(file))
      .flatMap(([slug, file]) =>
        checkIntent(slug, readFileSync(file, "utf8"), undefined),
      )
      .filter((finding) => finding.rule === "filter-count")
      .map((finding) => `${finding.intent}: ${finding.message}`);
    expect(
      blind,
      "fix: add the run's count to the Output cell, e.g. `1 passed`: a -t that matches nothing exits 0",
    ).toEqual([]);
  });
});
