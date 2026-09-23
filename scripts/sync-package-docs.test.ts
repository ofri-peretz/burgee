/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Every docs app's package page is its README, projected. This is the lock that keeps them the
 * same text across all of them: edit a README and forget the sync, and this names the file and
 * the fix — whichever app the page lives in.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and scripts read the app table through its one typed reader rather than re-parsing it
import { APPS, familyApp } from "../apps/docs-chassis/src/config";

import { orphans, pages, render } from "./sync-package-docs.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("package docs pages are projected from the READMEs", () => {
  it("gives every app with a package of its own that package's README as its index", () => {
    const files = [...pages().keys()];
    for (const app of APPS.filter((a) => !a.familyPages)) expect(files).toContain(`${app.dir}/content/docs/index.md`);
    expect(files).toContain(`${familyApp().dir}/content/docs/packages/burgee.md`);
    expect(files.some((f) => f.includes("compat-oracle"))).toBe(false);
  });

  it("matches what is on disk, in every app", () => {
    const stale = [...pages()].filter(([file, text]) => !existsSync(join(REPO_ROOT, file)) || readFileSync(join(REPO_ROOT, file), "utf8") !== text);
    expect(stale.map(([f]) => f), "Run `npx tsx scripts/sync-package-docs.ts`.").toEqual([]);
  });

  it("leaves no page behind on the family app for a package that has its own", () => {
    expect(orphans(pages()), "Run `npx tsx scripts/sync-package-docs.ts` — it removes them.").toEqual([]);
  });

  it("points a README's root-relative /docs link at the family host when the page lands elsewhere", () => {
    const readme = "Published at [/docs/benchmarks](/docs/benchmarks).\n";
    expect(render("roundel", { name: "roundel", description: "" }, readme, "https://burgee.interlace.tools")).toContain("[/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks)");
    expect(render("burgee", { name: "burgee", description: "" }, readme)).toContain("[/docs/benchmarks](/docs/benchmarks)");
  });

  it("drops the HTML header and H1, keeps prose, and points relative links at GitHub", () => {
    const readme = '<p align="center">\n  <img src="x.svg" />\n</p>\n\n# roundel\n\nColour. See [chalk](../chalk/README.md) and [a](./LICENSE).\n';
    expect(render("roundel", { name: "roundel", description: 'the "colours"' }, readme)).toBe(
      '---\ntitle: roundel\ndescription: "the \\"colours\\""\n---\n\n' +
        "Colour. See [chalk](https://github.com/ofri-peretz/burgee/blob/main/packages/chalk/README.md) and [a](https://github.com/ofri-peretz/burgee/blob/main/packages/roundel/LICENSE).\n",
    );
  });
});
