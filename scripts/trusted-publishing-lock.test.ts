/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Trusted-publishing lock — npm publishes through OIDC, and no long-lived npm token comes back.
 *
 * GAPS C7, D-154. `release.yml` handed `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to its publish
 * step long after the secret was gone: run 36093911201 (2026-09-25) logged `NODE_AUTH_TOKEN:`
 * empty and still published all nine packages, each with `_npmUser` "GitHub Actions
 * <npm-oidc-no-reply@github.com>" and SLSA provenance from `release.yml`. The npm CLI tries OIDC
 * first and falls back to a token silently (docs.npmjs.com/trusted-publishers: "uses them for
 * authentication before falling back to traditional tokens"), so a token left in the workflow
 * is a second, long-lived way to publish that nobody sees being used. This keeps it out.
 *
 * Static half: no workflow or composite action names an npm token; the publish job holds
 * `id-token: write` at job level, has no `registry-url` (which exports a placeholder
 * NODE_AUTH_TOKEN and writes `_authToken=${NODE_AUTH_TOKEN}`), reads no secret but
 * `GITHUB_TOKEN`, and keeps `--provenance`. Executed half: the publish loop and the npm-version
 * guard are lifted out of the parsed workflow and run under `bash` with `npm` stubbed.
 *
 * Proven red, one mutation at a time (2026-09-27):
 *
 * | mutation | fails |
 * | :-- | :-- |
 * | restore `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` on the publish step | names no npm token in any workflow; reads no secret but GITHUB_TOKEN |
 * | restore `registry-url` on the publish job's setup-node | has no registry-url |
 * | drop `id-token: write` from the publish job | holds id-token: write at job level |
 * | drop `--provenance` from the publish command | keeps provenance on |
 * | drop `--logs-dir "$logs"` from the publish command | says OIDC published it; names npm's OIDC failure |
 * | guard step: delete the `npm install -g` branch | upgrades an npm too old for OIDC |
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = join(REPO_ROOT, ".github", "workflows");
const ACTIONS = join(REPO_ROOT, ".github", "actions");

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
}
interface Job {
  permissions?: Record<string, string> | string;
  env?: Record<string, unknown>;
  steps?: Step[];
}
interface Workflow {
  permissions?: unknown;
  jobs: Record<string, Job>;
}

const readYaml = (file: string): unknown =>
  loadYaml(readFileSync(file, "utf8"));
const release = (): Workflow =>
  readYaml(join(WORKFLOWS, "release.yml")) as Workflow;
const PUBLISHES = /\bnpm publish\b/;
const publishJob = (): Job => {
  const hit = Object.values(release().jobs).find((j) =>
    (j.steps ?? []).some((s) => PUBLISHES.test(s.run ?? "")),
  );
  if (!hit) throw new Error("release.yml has no job that runs `npm publish`");
  return hit;
};
const loopStep = (): Step =>
  (publishJob().steps ?? []).find((s) => PUBLISHES.test(s.run ?? "")) as Step;
const guardStep = (): Step => {
  const s = (publishJob().steps ?? []).find((x) =>
    /\b11\.5\.1\b/.test(x.run ?? ""),
  );
  if (!s?.run)
    throw new Error(
      "release.yml → publish has no step that checks npm ≥ 11.5.1",
    );
  return s;
};

/** Every key and string value in a parsed YAML document — comments are already gone. */
function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const x of node) strings(x, out);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      out.push(k);
      strings(v, out);
    }
  return out;
}

const yamlFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => join(dir, f));

const NPM_TOKEN = /\b(NPM_TOKEN|NODE_AUTH_TOKEN)\b/;

describe("no long-lived npm token", () => {
  it("names no npm token in any workflow or composite action", () => {
    const files = [...yamlFiles(WORKFLOWS), ...yamlFiles(ACTIONS)];
    expect(files.length).toBeGreaterThan(5);
    const hits = files.flatMap((f) =>
      strings(readYaml(f))
        .filter((s) => NPM_TOKEN.test(s))
        .map(
          (s) =>
            `${f.slice(REPO_ROOT.length + 1)}: ${s
              .split("\n")
              .find((l) => NPM_TOKEN.test(l))
              ?.trim()}`,
        ),
    );
    expect(hits).toEqual([]);
  });

  it("the publish job reads no secret but GITHUB_TOKEN", () => {
    const secrets = strings(publishJob()).flatMap((s) =>
      [...s.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]),
    );
    expect(secrets.filter((name) => name !== "GITHUB_TOKEN")).toEqual([]);
  });

  it("the publish job has no registry-url on setup-node", () => {
    const setups = (publishJob().steps ?? []).filter((s) =>
      s.uses?.startsWith("actions/setup-node@"),
    );
    expect(setups.length).toBe(1);
    for (const s of setups)
      expect(s.with ?? {}).not.toHaveProperty("registry-url");
  });
});

describe("OIDC is available to the publish", () => {
  it("holds id-token: write at job level", () => {
    const perms = publishJob().permissions;
    expect(typeof perms).toBe("object");
    expect((perms as Record<string, string>)["id-token"]).toBe("write");
  });

  it("keeps provenance on", () => {
    const step = loopStep();
    expect(step.run).toMatch(/npm publish [^\n]*--provenance/);
    expect(step.env?.NPM_CONFIG_PROVENANCE).toBe("true");
  });
});

/** Stub `npm` in a scratch dir: NPM_VERSION for `-v`, INSTALLS records `install`, `view` misses, `publish` writes OIDC_LOG to its debug log and exits PUBLISH_EXIT. */
function sandbox(): { dir: string; bin: string } {
  const dir = mkdtempSync(join(tmpdir(), "trusted-publishing-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const shim = (name: string, body: string[]) => {
    writeFileSync(
      join(bin, name),
      ["#!/usr/bin/env bash", ...body, ""].join("\n"),
    );
    chmodSync(join(bin, name), 0o755);
  };
  shim("npm", [
    'case "$1" in',
    '  -v) echo "$NPM_VERSION"; exit 0 ;;',
    '  install) echo "$*" >> "$INSTALLS"; exit 0 ;;',
    "  view) exit 1 ;;",
    "  publish)",
    '    logs=""; prev=""',
    '    for a in "$@"; do [ "$prev" = "--logs-dir" ] && logs="$a"; prev="$a"; done',
    '    if [ -n "$logs" ]; then mkdir -p "$logs"; printf "%b" "$OIDC_LOG" > "$logs/2026-09-27T00_00_00_000Z-debug-0.log"; fi',
    '    exit "${PUBLISH_EXIT:-0}" ;;',
    "esac",
    "exit 2",
  ]);
  shim("git", ["exit 0"]);
  shim("gh", ['[ "$1 $2" = "release view" ] && exit 1', "exit 0"]);
  shim("sleep", ["exit 0"]);
  return { dir, bin };
}

function runStep(
  step: Step,
  env: Record<string, string>,
): { status: number; output: string; dir: string } {
  const { dir, bin } = sandbox();
  mkdirSync(join(dir, "scripts"));
  copyFileSync(
    join(REPO_ROOT, "scripts", "changelog-section.sh"),
    join(dir, "scripts", "changelog-section.sh"),
  );
  mkdirSync(join(dir, "packages", "leaf", "dist"), { recursive: true });
  writeFileSync(
    join(dir, "packages", "leaf", "package.json"),
    JSON.stringify({ name: "leaf", version: "1.0.0" }),
  );
  const summary = join(dir, "summary");
  writeFileSync(summary, "");
  const script = join(dir, "step.sh");
  writeFileSync(script, step.run ?? "");
  const r = spawnSync("bash", [script], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      HOME: dir,
      RUNNER_TEMP: dir,
      GITHUB_STEP_SUMMARY: summary,
      INSTALLS: join(dir, "installs"),
      ...env,
    },
  });
  return {
    status: r.status ?? -1,
    output: `${r.stdout ?? ""}${r.stderr ?? ""}`,
    dir,
  };
}

const executes = it.skipIf(process.platform === "win32");
const LEAF_PLAN = JSON.stringify([
  { dir: "leaf", name: "leaf", version: "1.0.0", deps: [] },
]);
const loopEnv = (oidcLog: string, publishExit: number) => ({
  DRY_RUN: "false",
  DIST_TAG: "latest",
  DEP_WAIT_SECONDS: "10",
  PLAN: LEAF_PLAN,
  OIDC_LOG: oidcLog,
  PUBLISH_EXIT: String(publishExit),
});

describe("the publish loop says which credential published, executed", () => {
  executes("says OIDC published it, quoting npm", () => {
    const r = runStep(
      loopStep(),
      loopEnv(
        "3 silly oidc Skipped nothing\\n9 verbose oidc Successfully retrieved and set token\\n",
        0,
      ),
    );
    expect(r.status, r.output).toBe(0);
    expect(r.output).toMatch(/Credential: npm trusted publishing \(OIDC\)/);
    expect(r.output).toMatch(
      /leaf@1\.0\.0 published with npm trusted publishing \(OIDC\).*npm: Successfully retrieved and set token/,
    );
  });

  executes("names npm's OIDC failure when the publish is refused", () => {
    const r = runStep(
      loopStep(),
      loopEnv(
        "9 verbose oidc Failed token exchange request with body message: no trusted publisher\\n",
        1,
      ),
    );
    expect(r.status).not.toBe(0);
    expect(r.output).toMatch(
      /::error::npm publish leaf@1\.0\.0 failed\. OIDC exchange: Failed token exchange request with body message: no trusted publisher\./,
    );
    expect(r.output).toMatch(
      /Trusted publishing names ofri-peretz\/burgee and release\.yml/,
    );
  });
});

describe("the npm version guard, executed", () => {
  executes("upgrades an npm too old for OIDC", () => {
    const r = runStep(guardStep(), { NPM_VERSION: "11.4.2" });
    expect(r.status, r.output).toBe(0);
    expect(readFileSync(join(r.dir, "installs"), "utf8")).toMatch(
      /^install -g npm@11\.\d+\.\d+$/m,
    );
  });

  executes("leaves an npm that already supports OIDC alone", () => {
    for (const v of ["11.5.1", "11.6.2", "12.0.0"]) {
      const r = runStep(guardStep(), { NPM_VERSION: v });
      expect(r.status, r.output).toBe(0);
      expect(
        () => readFileSync(join(r.dir, "installs"), "utf8"),
        `npm ${v} was reinstalled`,
      ).toThrow();
    }
  });
});
