/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * One docs page per published package, projected from its README.
 *
 * The README is what npm and GitHub show, so it is the page people already read; a second,
 * hand-written copy on the site would start disagreeing with it the first time either
 * changed. So the site copy is generated, and `sync-package-docs.test.ts` fails when the
 * two differ.
 *
 * Output is `.md`, not `.mdx`: README prose is full of `{`, `<name>` and autolinks that MDX
 * would parse as JSX. The centred HTML header (logo, badges) and the `# name` heading are
 * dropped — the page renders its own title — and relative links point at GitHub, because
 * `./src/schema.json` means nothing on the docs host.
 *
 *   npx tsx scripts/sync-package-docs.ts [--check]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = join(REPO_ROOT, "apps", "docs", "content", "docs", "packages");
const BLOB = "https://github.com/ofri-peretz/burgee/blob/main/packages";

type Manifest = { name: string; description: string; private?: boolean };

/** README text → the docs page body, for the package living in `packages/<dir>`. */
export function render(dir: string, manifest: Manifest, readme: string): string {
  const body = readme
    // Top-level HTML blocks: the centred logo and badge rows. Nothing else in a README uses them.
    .replace(/^<p[\s>][\s\S]*?^<\/p>\n*/gm, "")
    .trimStart()
    // Only a leading H1: with `m`, `^# ` would also match a shell comment inside a code fence.
    .replace(/^# .*\n+/, "")
    .replace(/\]\((\.\.?\/[^)\s]+)\)/g, (_, rel: string) => `](${new URL(rel, `${BLOB}/${dir}/`).href})`)
    .trimStart();
  return `---\ntitle: ${manifest.name}\ndescription: ${JSON.stringify(manifest.description)}\n---\n\n${body}`;
}

/** Every page this script owns, as `file name → contents`, in package-directory order. */
export function pages(): Map<string, string> {
  const out = new Map<string, string>();
  const root = join(REPO_ROOT, "packages");
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const manifestPath = join(root, e.name, "package.json");
    const readmePath = join(root, e.name, "README.md");
    if (!e.isDirectory() || !existsSync(manifestPath) || !existsSync(readmePath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    if (manifest.private) continue;
    out.set(`${e.name}.md`, render(e.name, manifest, readFileSync(readmePath, "utf8")));
  }
  // burgee first: it is the framework, the other eight are what it is built from.
  const names = [...out.keys()].map((f) => f.replace(/\.md$/, "")).sort((a, b) => Number(b === "burgee") - Number(a === "burgee") || a.localeCompare(b));
  out.set("meta.json", `${JSON.stringify({ title: "Packages", pages: names }, null, 2)}\n`);
  return out;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const check = process.argv.includes("--check");
  const stale: string[] = [];
  mkdirSync(OUT, { recursive: true });
  for (const [file, text] of pages()) {
    const path = join(OUT, file);
    if (existsSync(path) && readFileSync(path, "utf8") === text) continue;
    stale.push(file);
    if (!check) writeFileSync(path, text);
  }
  if (check && stale.length > 0) {
    console.error(`Out of date: ${stale.join(", ")}. Run \`npx tsx scripts/sync-package-docs.ts\`.`);
    process.exit(1);
  }
  console.log(check ? "Package docs are in sync." : `Wrote ${stale.length} file(s).`);
}
