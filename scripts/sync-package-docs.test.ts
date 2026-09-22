/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The docs site's package pages are the READMEs, projected. This is the lock that keeps them
 * the same text: edit a README and forget the sync, and this names the file and the fix.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OUT, pages, render } from "./sync-package-docs.js";

describe("package docs pages are projected from the READMEs", () => {
  it("has a page for every published package and none for private ones", () => {
    const files = [...pages().keys()];
    expect(files).toContain("burgee.md");
    expect(files).not.toContain("compat-oracle.md");
  });

  it("matches what is on disk", () => {
    const stale = [...pages()].filter(([file, text]) => !existsSync(join(OUT, file)) || readFileSync(join(OUT, file), "utf8") !== text);
    expect(stale.map(([f]) => f), "Run `npx tsx scripts/sync-package-docs.ts`.").toEqual([]);
  });

  it("drops the HTML header and H1, keeps prose, and points relative links at GitHub", () => {
    const readme = '<p align="center">\n  <img src="x.svg" />\n</p>\n\n# roundel\n\nColour. See [chalk](../chalk/README.md) and [a](./LICENSE).\n';
    expect(render("roundel", { name: "roundel", description: 'the "colours"' }, readme)).toBe(
      '---\ntitle: roundel\ndescription: "the \\"colours\\""\n---\n\n' +
        "Colour. See [chalk](https://github.com/ofri-peretz/burgee/blob/main/packages/chalk/README.md) and [a](https://github.com/ofri-peretz/burgee/blob/main/packages/roundel/LICENSE).\n",
    );
  });
});
