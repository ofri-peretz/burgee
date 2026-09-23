/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every published bin answers `--help`, `--version` and no arguments without crashing.
 *
 * `roundel --help` printed `Cannot find module '/…/--help' imported from …/dist/check.js` and
 * exited 1: eight of the family's bins took their first argument as the plugin file to import,
 * so the first thing a new user types was read as a path. The `check` lock drove each `check`
 * with a plugin file and with nothing, and never with the two flags every command line is
 * asked first.
 *
 * It spawns the BUILT bin, the file npm links, rather than importing the source: what a user
 * runs is `argv` through `cli.ts`, and `cli.ts` is where `--help` was forwarded as a path.
 * `dist/` is there when this runs — the pre-push battery and CI both build before the root
 * suite — and a missing one fails with that said, rather than passing on nothing.
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const run = promisify(execFile);

interface Pkg {
  name: string;
  version: string;
  private?: boolean;
  bin?: string | Record<string, string>;
}

/** `[package, command, built bin, version]` for every published bin. */
function bins(): Array<[string, string, string, string]> {
  const out: Array<[string, string, string, string]> = [];
  for (const dir of readdirSync(join(root, "packages"))) {
    const manifest = join(root, "packages", dir, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8")) as Pkg;
    if (pkg.private === true || pkg.bin === undefined) continue;
    const map = typeof pkg.bin === "string" ? { [pkg.name]: pkg.bin } : pkg.bin;
    for (const [command, target] of Object.entries(map))
      out.push([pkg.name, command, join(root, "packages", dir, target), pkg.version]);
  }
  return out;
}

interface Outcome {
  code: number;
  stdout: string;
  stderr: string;
}

async function spawn(bin: string, args: string[]): Promise<Outcome> {
  if (!existsSync(bin)) throw new Error(`${bin} is not built; run \`npx turbo run build --filter='./packages/*'\` first`);
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, ...args], {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1" },
      timeout: 60_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

/** The crash this lock exists for, and any other uncaught one. */
const CRASH = /Cannot find module|ERR_MODULE_NOT_FOUND|\n\s+at .+:\d+:\d+/;

describe("every published bin handles the first three things a user types", () => {
  const all = bins();

  it("finds the family's bins", () => {
    expect(all.length).toBeGreaterThanOrEqual(9);
  });

  describe.each(all)("%s (bin %s)", (_name, _command, bin, version) => {
    it.each([["--help"], ["-h"]])("%s prints usage and exits 0", async (flag) => {
      const r = await spawn(bin, [flag]);
      expect(r.stderr).not.toMatch(CRASH);
      expect(r.stdout).toMatch(/usage/i);
      expect(r.code).toBe(0);
    });

    it("--version prints the package version and exits 0", async () => {
      const r = await spawn(bin, ["--version"]);
      expect(r.stderr).not.toMatch(CRASH);
      expect(r.stdout.trim()).toBe(version);
      expect(r.code).toBe(0);
    });

    it("no arguments is usage, never a crash", async () => {
      const r = await spawn(bin, []);
      expect(`${r.stdout}${r.stderr}`).not.toMatch(CRASH);
      expect(`${r.stdout}${r.stderr}`).toMatch(/usage/i);
      expect([0, 2]).toContain(r.code);
    });

    it("an unknown flag is a usage error (exit 2), not a module path", async () => {
      const r = await spawn(bin, ["--definitely-not-a-flag"]);
      expect(`${r.stdout}${r.stderr}`).not.toMatch(CRASH);
      expect(`${r.stdout}${r.stderr}`).toMatch(/--definitely-not-a-flag/);
      expect(r.code).toBe(2);
    });
  });
});
