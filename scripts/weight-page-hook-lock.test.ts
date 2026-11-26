/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — pre-push regenerates the weight page whenever the push could change it, and only then.
 *
 * `weight-page` took 155 s alone on a warm tree (2026-11-26), the largest step of a pre-push that
 * ran 383-675 s and once outlived the SSH connection carrying the push
 * (`.sdlc/intents/pre-push-under-three-minutes/`). It now carries a lefthook `glob`, so a push
 * that touches none of the page's inputs skips it. CI's ratchet runs it on every PR regardless.
 *
 * What fails here: the glob dropping an input (a package change would then push a stale page and
 * fail CI, the six-cycle week of 2026-11-23 again), or the step losing its glob entirely.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");

type Command = { run: string; glob?: string | string[] };

describe("pre-push weight-page", () => {
  const step = (
    loadYaml(read("lefthook.yml")) as {
      "pre-push": { commands: Record<string, Command> };
    }
  )["pre-push"].commands["weight-page"];

  it("still runs the check CI runs", () => {
    expect(step?.run).toBe("npm run weight:page -- --check");
  });

  it("runs when the push changes any input of the page", () => {
    // The inputs, read from scripts/subpath-weight.ts: every package's build, the page it writes,
    // the script itself, and the dependency versions the bundles resolve.
    expect(read("scripts/subpath-weight.ts")).toContain(
      "'apps/docs/content/docs/weight.mdx'",
    );
    expect(step?.glob).toEqual([
      "packages/*",
      "apps/docs/content/docs/weight.mdx",
      "scripts/subpath-weight.ts",
      "package-lock.json",
    ]);
  });
});
