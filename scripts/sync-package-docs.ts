/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * One docs page per published package, projected from its README — into that package's own
 * docs app.
 *
 * The README is what npm and GitHub show, so it is the page people already read; a second,
 * hand-written copy on a site would start disagreeing with it the first time either changed.
 * So every site copy is generated, and `sync-package-docs.test.ts` fails when any of them
 * differs.
 *
 * Where each page goes is `.github/vercel-apps.json`'s decision, not this script's: a package
 * with an app of its own gets its README as that app's `content/docs/index.md`, served at
 * `<host>/docs`; the family app's own package, and any package the table lists under
 * `excluded`, get `content/docs/packages/<name>.md` on the family app. A package whose app is
 * built but `pending` its Vercel project gets both: its app's index, and the front door's
 * section every link still points at until the host is live. The family app also
 * gets `packages/index.md`, the family map — every package, what it replaces, where it lives.
 * Regrouping a package is a table edit; this script follows it.
 *
 * A package whose site carries the standard page set (`STANDARD_SITES` in
 * `api-reference.ts`) also gets its `CHANGELOG.md` as `content/docs/changelog.md`: changesets
 * writes the file on every release, `changeset:version` runs this script right after, and the
 * page is never a second copy anybody edits. A package in `FAMILY_SITE_REFERENCES` — burgee,
 * whose site is the family app — gets the same page at the family app's
 * `content/docs/changelog.md`.
 *
 * Output is `.md`, not `.mdx`: README prose is full of `{`, `<name>` and autolinks that MDX
 * would parse as JSX. The centred HTML header (logo, badges) and the `# name` heading are
 * dropped — the page renders its own title — and relative links point at GitHub, because
 * `./src/schema.json` means nothing on a docs host.
 *
 *   npx tsx scripts/sync-package-docs.ts [--check]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and scripts read the app table through its one typed reader rather than re-parsing it
import { appForPackage, familyApp, siteForPackage } from "../apps/docs-chassis/src/config";
// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and scripts read the app table through its one typed reader rather than re-parsing it
import { publicPackages } from "../apps/docs-chassis/src/packages";

import { FAMILY_SITE_REFERENCES, STANDARD_SITES } from "./api-reference.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = join(REPO_ROOT, "packages");
const BLOB = "https://github.com/ofri-peretz/burgee/blob/main/packages";

type Manifest = { name: string; description: string; private?: boolean };

/**
 * README text → the docs page body, for the package living in `packages/<dir>`.
 *
 * `familyOrigin` is set when the page lands on a package's own host: a README's root-relative
 * `/docs/…` link means the family site (it was written when there was one), and on another
 * host it would resolve to a page that host does not have.
 */
export function render(dir: string, manifest: Manifest, readme: string, familyOrigin?: string): string {
  const body = readme
    // Top-level HTML blocks: the centred logo and badge rows. Nothing else in a README uses them.
    .replace(/^<p[\s>][\s\S]*?^<\/p>\n*/gm, "")
    .trimStart()
    // Only a leading H1: with `m`, `^# ` would also match a shell comment inside a code fence.
    .replace(/^# .*\n+/, "")
    .replace(/\]\((\.\.?\/[^)\s]+)\)/g, (_, rel: string) => `](${new URL(rel, `${BLOB}/${dir}/`).href})`)
    .replace(/\]\((\/docs[^)\s]*)\)/g, (link, path: string) => (familyOrigin === undefined ? link : `](${familyOrigin}${path})`))
    .trimStart();
  return `---\ntitle: ${manifest.name}\ndescription: ${JSON.stringify(manifest.description)}\n---\n\n${body}`;
}

/**
 * CHANGELOG.md text → the docs page body. The `# name` heading goes (the page renders its
 * title); every `## x.y.z` and everything under it stays, links and all.
 */
export function renderChangelog(manifest: Manifest, changelog: string): string {
  const body = changelog.replace(/^# .*\n+/, "").trimStart();
  const description = `Every release of ${manifest.name}, newest first, from its CHANGELOG.md — what changed and the pull request it came from.`;
  return `---\ntitle: Changelog\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trimEnd()}\n`;
}

/** The family map: every public package, what it replaces, and the site its docs are on. */
export function familyIndex(): string {
  const all = publicPackages(PACKAGES);
  const host = (url: string): string => new URL(url).host;
  const rows = all.map((pkg) => `| [${pkg.name}](${pkg.url}) | ${pkg.replaces} | [${host(pkg.url)}](${new URL(pkg.url).origin}) |`);
  return [
    "---",
    "title: Packages",
    `description: ${JSON.stringify(`burgee and the ${all.length - 1} packages it is built from: what each replaces, and the site its docs live on.`)}`,
    "---",
    "",
    "Every package in the family is published on its own, depends on nothing outside this",
    "repository, and has a site of its own, or a section here until its site exists. Its page",
    "is its README, projected; the family-wide pages — [compatibility](/docs/compatibility),",
    "[comparison](/docs/comparison) and [gallery](/docs/gallery) — stay here, one copy each.",
    "",
    "| Package | Replaces | Site |",
    "| :-- | :-- | :-- |",
    ...rows,
    "",
    ...WHICH_ONE,
  ].join("\n");
}

/**
 * The package-choice question the map cannot answer by itself: two packages draw in a
 * terminal (controlroom spec R18). Prose, not data, so it is written here once rather than
 * derived; the coming-from guides link to its anchor, `#which-one-do-i-need`.
 */
const WHICH_ONE = [
  "## Which one do I need?",
  "",
  "Two packages draw in a terminal. They split on whether the program owns the screen.",
  "",
  "- **flagstaff, for inline output in a scrolling terminal.** Spinners, progress, task lists,",
  "  boxes and tables, drawn in place under what the program has already printed and left in",
  "  the scrollback as ordinary lines. It reads no keys. Usable today, with drop-in paths for",
  "  ora, log-update, boxen and cli-table3.",
  "- **controlroom, for a screen that reads keys.** Panes, tabs with key hints, focus and",
  "  collapse, an input line, with keys routed to the program, either inline under the",
  "  program's output or in the alternate screen. An ink program moves by its import, to",
  "  `controlroom/ink`. Coming from blessed, neo-blessed or terminal-kit? The",
  "  [coming-from guides](/docs/coming-from/blessed) map each one onto `open()`, and",
  "  `burgee migrate` reports their sites.",
  "",
  "If a program only draws, it is flagstaff, even when the drawing is busy. If it reads keys",
  "while it draws, it is controlroom, and its inline screen keeps that in the main screen,",
  "the shape of a chat CLI. A question asked once, such as a confirm or a pick, is neither:",
  "it is a prompt, and prompts are caique's.",
  "",
  "Off a terminal, flagstaff gives a pipe, CI, a screen reader and `--json` each component's",
  "static projection, never a redraw, and controlroom does the same for a whole screen.",
  "",
];

/**
 * The changelog page a package gets, as `[path, contents]`, or nothing: a `STANDARD_SITES`
 * package on its own site, a `FAMILY_SITE_REFERENCES` package on the family app.
 */
function changelogPage(dir: string, manifest: Manifest, siteDir: string, onFamily: boolean): [string, string] | undefined {
  const listed = onFamily ? FAMILY_SITE_REFERENCES : STANDARD_SITES;
  const path = join(PACKAGES, dir, "CHANGELOG.md");
  if (!listed.includes(manifest.name) || !existsSync(path)) return undefined;
  return [`${siteDir}/content/docs/changelog.md`, renderChangelog(manifest, readFileSync(path, "utf8"))];
}

/** The directory of the app built for `pkg` alone — deployable, or `pending` its Vercel project — or nothing. */
function ownSite(pkg: string): string | undefined {
  const site = siteForPackage(pkg);
  return site === undefined || site.familyPages ? undefined : site.dir;
}

/** Every page this script owns, as `repo-relative path → contents`, across every app. */
export function pages(): Map<string, string> {
  const out = new Map<string, string>();
  const family = familyApp();
  const sections: string[] = [];
  for (const e of readdirSync(PACKAGES, { withFileTypes: true })) {
    const manifestPath = join(PACKAGES, e.name, "package.json");
    const readmePath = join(PACKAGES, e.name, "README.md");
    if (!e.isDirectory() || !existsSync(manifestPath) || !existsSync(readmePath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    if (manifest.private) continue;
    const readme = readFileSync(readmePath, "utf8");
    // The front door keeps a section until the package's own host is live; the app built for
    // the package — deployable, or `pending` its Vercel project — carries the projection.
    const live = appForPackage(manifest.name);
    if (live === undefined || live.familyPages) {
      out.set(`${family.dir}/content/docs/packages/${e.name}.md`, render(e.name, manifest, readme));
      sections.push(e.name);
    }
    const site = ownSite(manifest.name);
    if (site !== undefined) out.set(`${site}/content/docs/index.md`, render(e.name, manifest, readme, family.productionUrl));
    const changelog = changelogPage(e.name, manifest, site ?? family.dir, site === undefined);
    if (changelog !== undefined) out.set(...changelog);
  }
  // The family's own package first, then any package kept as a section, alphabetically.
  const names = sections.toSorted((a, b) => Number(b === family.package) - Number(a === family.package) || a.localeCompare(b));
  out.set(`${family.dir}/content/docs/packages/index.md`, familyIndex());
  out.set(`${family.dir}/content/docs/packages/meta.json`, `${JSON.stringify({ title: "Packages", pages: ["index", ...names] }, null, 2)}\n`);
  return out;
}

/** Files in the family's `packages/` directory this script no longer writes — a package that moved to its own app. */
export function orphans(owned: ReadonlyMap<string, string>): string[] {
  const dir = `${familyApp().dir}/content/docs/packages`;
  if (!existsSync(join(REPO_ROOT, dir))) return [];
  return readdirSync(join(REPO_ROOT, dir))
    .map((file) => `${dir}/${file}`)
    .filter((path) => !owned.has(path));
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const check = process.argv.includes("--check");
  const owned = pages();
  const stale: string[] = [];
  for (const [file, text] of owned) {
    const path = join(REPO_ROOT, file);
    if (existsSync(path) && readFileSync(path, "utf8") === text) continue;
    stale.push(file);
    if (check) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  for (const orphan of orphans(owned)) {
    stale.push(`${orphan} (no longer owned)`);
    if (!check) rmSync(join(REPO_ROOT, orphan));
  }
  if (check && stale.length > 0) {
    console.error(`Out of date: ${stale.join(", ")}. Run \`npx tsx scripts/sync-package-docs.ts\`.`);
    process.exit(1);
  }
  console.log(check ? "Package docs are in sync." : `Wrote ${stale.length} file(s).`);
}
