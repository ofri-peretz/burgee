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
import { APPS, EXCLUDED, familyApp, PENDING, siteForPackage } from "../apps/docs-chassis/src/config";

import { FAMILY_SITE_REFERENCES, STANDARD_SITES } from "./api-reference.js";
import { orphans, pages, render, renderChangelog } from "./sync-package-docs.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("package docs pages are projected from the READMEs", () => {
  it("gives every standard site, and the family app for its own package, its CHANGELOG as changelog.md, and no other site one", () => {
    const changelogs = [...pages().keys()].filter((f) => f.endsWith("/content/docs/changelog.md"));
    const expected = [...STANDARD_SITES, ...FAMILY_SITE_REFERENCES].map((pkg) => `${siteForPackage(pkg)?.dir}/content/docs/changelog.md`);
    expect(changelogs.toSorted()).toEqual(expected.toSorted());
    // burgee's changelog is the family app's: there is no other place for it to land.
    for (const pkg of FAMILY_SITE_REFERENCES) expect(APPS.find((a) => a.package === pkg)?.dir).toBe(familyApp().dir);
    const page = renderChangelog({ name: "x", description: "" }, "# x\n\n## 1.0.0\n\n- a change\n");
    expect(page).toContain("title: Changelog");
    expect(page).not.toContain("# x\n");
    expect(page.endsWith("## 1.0.0\n\n- a change\n")).toBe(true);
  });

  it("lists every changelog page in its site's nav", () => {
    const changelogs = [...pages().keys()].filter((f) => f.endsWith("/content/docs/changelog.md"));
    const unlisted = changelogs.filter((file) => {
      const meta = JSON.parse(readFileSync(join(REPO_ROOT, file.replace(/changelog\.md$/u, "meta.json")), "utf8")) as { pages: string[] };
      return !meta.pages.includes("changelog");
    });
    expect(unlisted, "add \"changelog\" to the site's content/docs/meta.json").toEqual([]);
  });

  it("gives every app with a package of its own that package's README as its index", () => {
    const files = [...pages().keys()];
    for (const app of [...APPS, ...PENDING].filter((a) => !a.familyPages)) expect(files).toContain(`${app.dir}/content/docs/index.md`);
    expect(files).toContain(`${familyApp().dir}/content/docs/packages/burgee.md`);
    expect(files.some((f) => f.includes("compat-oracle"))).toBe(false);
  });

  it("matches what is on disk, in every app", () => {
    const stale = [...pages()].filter(([file, text]) => !existsSync(join(REPO_ROOT, file)) || readFileSync(join(REPO_ROOT, file), "utf8") !== text);
    expect(stale.map(([f]) => f), "Run `npx tsx scripts/sync-package-docs.ts`.").toEqual([]);
  });

  it("keeps a pending app's package as a front-door section too, since every link still points there", () => {
    const files = [...pages().keys()];
    for (const app of PENDING) {
      expect(EXCLUDED[app.package], `${app.package} is pending with no "excluded" reason`).toBeDefined();
      expect(files).toContain(`${familyApp().dir}/content/docs/packages/${app.package}.md`);
    }
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
