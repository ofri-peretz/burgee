/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The write half of `roadmap-facts`' "prints no version that disagrees with its package".
 *
 * `changeset version` bumps manifests and changelogs. It does not touch prose, so every
 * release leaves the docs claiming the versions we shipped *last* time and the lock goes
 * red on the Version Packages PR — nineteen claims at once the first time it happened.
 * Catching it there was right; leaving a human to retype the numbers was not.
 *
 * The rule is the lock's rule, deliberately duplicated rather than shared: a line carrying
 * a date is a historical claim and is left exactly as written, and an undated `name@x.y.z`
 * is a statement about now and is rewritten to the manifest. If the two ever disagree the
 * lock is the one that decides — this script only ever has to make it green.
 *
 *   npx tsx scripts/sync-doc-versions.ts [--check]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = ["README.md", ".sdlc/intents/README.md"];
const SEMVER = String.raw`\d+\.\d+\.\d+`;
const DATED_LINE = /\d{4}-\d{2}-\d{2}/;

/** Workspace package name → the version its own manifest declares. */
function workspaceVersions(): Map<string, string> {
  const out = new Map<string, string>();
  const dir = join(REPO_ROOT, "packages");
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const manifest = join(dir, e.name, "package.json");
    if (!existsSync(manifest)) continue;
    const {
      name,
      version,
      private: isPrivate,
    } = JSON.parse(readFileSync(manifest, "utf-8"));
    if (name && version && !isPrivate) out.set(name, version);
  }
  return out;
}

/** A package name is a literal here, not a pattern: `a.b` must not match `axb`. */
function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** The doc with every undated claim moved to the manifest, and what changed. */
export function retarget(
  text: string,
  versions: Map<string, string>,
): { text: string; changed: string[] } {
  const changed: string[] = [];
  const lines = text.split("\n").map((line, i) => {
    if (DATED_LINE.test(line)) return line;
    let next = line;
    for (const [name, version] of versions) {
      // The rule's own guidance: not a finding when the pattern is escaped before
      // construction, which `escape` above is for. The name is a workspace manifest's, not
      // a caller's, and it is a literal by the time it gets here.
      // eslint-disable-next-line secure-coding/detect-non-literal-regexp
      const claim = new RegExp(String.raw`${escape(name)}@(${SEMVER})`, "g");
      next = next.replace(claim, (whole, claimed: string) => {
        if (claimed === version) return whole;
        changed.push(`${i + 1}: ${name}@${claimed} → ${version}`);
        return `${name}@${version}`;
      });
    }
    return next;
  });
  return { text: lines.join("\n"), changed };
}

/**
 * The same move for an install example's range: `npm:closeout@^0.3` in a README, which
 * `readme-range-lock.test.ts` requires the package's version to satisfy. A minor release of
 * a 0.x package moves the version out of its own caret range, so without this every such
 * release left the lock red for the next PR to trip over (closeout 0.4.0, 2026-09-23).
 *
 * Only an unsatisfied range is rewritten, to the caret range the version heads — `^0.4` for
 * 0.4.x, `^2` for 2.x — at the precision it was written in, so a range that still holds is
 * left exactly as the author wrote it.
 */
export function retargetRanges(
  text: string,
  versions: Map<string, string>,
): { text: string; changed: string[] } {
  const changed: string[] = [];
  let next = text;
  for (const [name, version] of versions) {
    const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
    // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- `escape` makes the manifest name a literal, as in `retarget`
    const alias = new RegExp(String.raw`npm:${escape(name)}@\^(\d+)(?:\.(\d+))?(?:\.(\d+))?`, "g");
    next = next.replace(alias, (whole, a: string, b?: string, c?: string) => {
      const [ra, rb = 0, rc = 0] = [Number(a), Number(b ?? 0), Number(c ?? 0)];
      const holds =
        major === 0
          ? ra === 0 && rb === minor && (c === undefined || patch >= rc)
          : ra === major && (minor > rb || (minor === rb && patch >= rc));
      if (holds) return whole;
      const range = major === 0 ? `0.${minor}` : String(major);
      changed.push(`npm:${name}@^${[a, b, c].filter((x) => x !== undefined).join(".")} → ^${range}`);
      return `npm:${name}@^${range}`;
    });
  }
  return { text: next, changed };
}

/** Every published package's README: the install examples live there. */
function packageReadmes(): string[] {
  const dir = join(REPO_ROOT, "packages");
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "README.md")))
    .map((e) => join("packages", e.name, "README.md"));
}

function main(): void {
  const check = process.argv.includes("--check");
  const versions = workspaceVersions();
  let stale = 0;
  for (const doc of DOCS) {
    const path = join(REPO_ROOT, doc);
    const { text, changed } = retarget(readFileSync(path, "utf-8"), versions);
    if (changed.length === 0) continue;
    stale += changed.length;
    process.stdout.write(
      `${doc}\n${changed.map((c) => `  ${c}`).join("\n")}\n`,
    );
    if (!check) writeFileSync(path, text);
  }
  for (const doc of packageReadmes()) {
    const path = join(REPO_ROOT, doc);
    const { text, changed } = retargetRanges(readFileSync(path, "utf-8"), versions);
    if (changed.length === 0) continue;
    stale += changed.length;
    process.stdout.write(`${doc}\n${changed.map((c) => `  ${c}`).join("\n")}\n`);
    if (!check) writeFileSync(path, text);
  }
  if (stale === 0)
    process.stdout.write("doc versions already agree with the manifests\n");
  else if (check) process.exitCode = 1;
  else process.stdout.write(`rewrote ${stale} claim(s)\n`);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")
)
  main();
