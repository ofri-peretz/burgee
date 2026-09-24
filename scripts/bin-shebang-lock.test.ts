/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every published `bin` is an executable a shell can run.
 *
 * burgee@0.10.0 published `dist/cli.js` without `#!/usr/bin/env node`, so the installed
 * `burgee` and `npx burgee` were handed to `/bin/sh` and died on line one with
 * `import: command not found`. Eight sibling bins had the line; burgee's source simply did
 * not, and `tsc` adds no shebang the source lacks.
 *
 * Two halves. `check:artifacts` (`binProblems`) reads the BUILT file in the pack list, which
 * is what npm links — the check that runs before publish. The source half below needs no
 * build, so it runs on every commit: each bin's `src/*.ts` twin must open with the line,
 * because that is where `tsc` copies it from.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  binProblems,
  SHEBANG,
  type PackEntry,
  type Pkg,
} from "./check-published-artifacts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const pack = (...paths: string[]): PackEntry => ({
  name: "demo",
  size: 0,
  unpackedSize: 0,
  files: paths.map((path) => ({ path })),
});

describe("binProblems — the built half", () => {
  const pkg: Pkg = { name: "demo", bin: { demo: "./dist/cli.js" } };

  it("passes a bin that starts with the shebang", () => {
    expect(
      binProblems(pkg, pack("dist/cli.js"), () => `${SHEBANG}\nimport "x";\n`),
    ).toEqual([]);
  });

  it("refuses a bin without it — burgee@0.10.0", () => {
    expect(
      binProblems(
        pkg,
        pack("dist/cli.js"),
        () => "import { mkdirSync } from 'node:fs';\n",
      ),
    ).toEqual([expect.stringContaining('does not start with "#!/usr/bin/env node"')]);
  });

  it("refuses a bin the pack list leaves out", () => {
    expect(binProblems(pkg, pack("dist/index.js"), () => SHEBANG)).toEqual([
      expect.stringContaining("is not in the pack list"),
    ]);
  });

  it("reads the string form of `bin` under the package name", () => {
    expect(
      binProblems({ name: "demo", bin: "./dist/cli.js" }, pack("dist/cli.js"), () => "x"),
    ).toEqual([expect.stringContaining("bin demo -> ./dist/cli.js")]);
  });
});

/** Every published package's bins, as `[package, command, source file]`. */
function sourceBins(): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  for (const dir of readdirSync(join(root, "packages"))) {
    let pkg: Pkg;
    try {
      pkg = JSON.parse(
        readFileSync(join(root, "packages", dir, "package.json"), "utf8"),
      ) as Pkg;
    } catch {
      continue;
    }
    if (pkg.private === true || pkg.bin === undefined) continue;
    const bins = typeof pkg.bin === "string" ? { [pkg.name]: pkg.bin } : pkg.bin;
    for (const [command, target] of Object.entries(bins)) {
      const source = target
        .replace(/^\.\/dist\//, "src/")
        .replace(/\.js$/, ".ts");
      out.push([pkg.name, command, join(root, "packages", dir, source)]);
    }
  }
  return out;
}

describe("every published bin's source opens with the shebang", () => {
  const bins = sourceBins();

  it("finds the family's bins", () => {
    expect(bins.map(([name]) => name)).toContain("burgee");
  });

  it.each(bins)("%s: bin %s", (_name, _command, source) => {
    expect(readFileSync(source, "utf8").split("\n", 1)[0]).toBe(SHEBANG);
  });
});
