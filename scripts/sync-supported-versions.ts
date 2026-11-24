/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * SECURITY.md's "Supported versions" paragraph, written from the manifests.
 *
 * `stable-status-lock.test.ts` holds that paragraph to the versions in `packages/*\/package.json`:
 * it names every released package still under 1.0, and says "pre-1.0" only while one is. Typed
 * by hand, that sentence was wrong on the commit that cut a package's 1.0.0: the Version PR
 * (`changeset:version`) bumped the manifest, the lock went red on the PR that is merged by a
 * workflow, and nobody owned the edit. `changeset:version` runs this right after the bump, so
 * the paragraph moves in the same commit as the versions it describes.
 *
 * Only the opening sentence changes; the policy that follows "A fix, a security fix included"
 * is kept word for word.
 *
 *   npx tsx scripts/sync-supported-versions.ts [--check]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and `released` is the one place a package released ahead of its flip is decided
import { released } from "../apps/docs-chassis/src/packages";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const WIDTH = 100;
const COUNT = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** Where the kept policy starts: everything before it is this script's. */
const POLICY = "A fix, a security fix included,";

const code = (name: string): string => `\`${name}\``;

/** `a`, `a` and `b`, `a`, `b` and `c`. */
const list = (names: readonly string[]): string =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;

/** The opening sentence for these versions: the stable policy, naming each package below 1.0. */
export function opening(versions: Readonly<Record<string, string>>): string {
  const early = Object.keys(versions)
    .filter((name) => Number(versions[name]!.split(".")[0]) < 1)
    .sort()
    .map(code);
  if (early.length === 0) return "Every published package is at 1.0 or later, and its public API is under semver.";
  if (early.length === 1) {
    return `Every published package but ${early[0]!}, which is pre-1.0, is at 1.0 or later, and its public API is under semver; ${early[0]!} may change its API in a minor release until it reaches 1.0.`;
  }
  const many = COUNT[early.length] ?? String(early.length);
  return `Every published package but ${list(early)}, which are pre-1.0, is at 1.0 or later, and its public API is under semver; those ${many} may change their API in a minor release until each reaches 1.0.`;
}

/** Fill words into lines of at most `width` columns; a word longer than that stands alone. */
export function wrap(text: string, width = WIDTH): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    if (line !== "" && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line === "" ? word : `${line} ${word}`;
  }
  if (line !== "") lines.push(line);
  return lines.join("\n");
}

/**
 * `security` with the first paragraph of "## Supported versions" rewritten for `versions`.
 * Throws when the section, or the policy sentence it keeps, is missing: a rewrite that cannot
 * find what it keeps would drop it.
 */
export function syncSupportedVersions(security: string, versions: Readonly<Record<string, string>>): string {
  const heading = /^## Supported versions\n\n/mu.exec(security);
  if (heading === null) throw new Error('SECURITY.md has no "## Supported versions" section followed by a paragraph');
  const start = heading.index + heading[0].length;
  const end = security.indexOf("\n\n", start);
  const paragraph = security.slice(start, end === -1 ? undefined : end);
  const flat = paragraph.replace(/\s+/gu, " ");
  const at = flat.indexOf(POLICY);
  if (at === -1) throw new Error(`SECURITY.md: "Supported versions" no longer opens its policy with "${POLICY}"; update this script with it`);
  const next = wrap(`${opening(versions)} ${flat.slice(at)}`);
  return security.slice(0, start) + next + (end === -1 ? "" : security.slice(end));
}

/** Every released package under `packages/` that has a README, with its manifest's version (as the lock reads them). */
export function releasedVersions(root = ROOT): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dir of readdirSync(join(root, "packages")).sort()) {
    const manifestPath = join(root, "packages", dir, "package.json");
    if (!existsSync(manifestPath) || !existsSync(join(root, "packages", dir, "README.md"))) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name: string; version: string; private?: boolean };
    if (released(manifest)) out[dir] = manifest.version;
  }
  return out;
}

/* v8 ignore start -- the CLI shell: reads and writes the real file; the functions above are what the tests hold */
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = join(ROOT, "SECURITY.md");
  const before = readFileSync(file, "utf8");
  const after = syncSupportedVersions(before, releasedVersions());
  if (process.argv.includes("--check")) {
    if (after !== before) {
      process.stderr.write("SECURITY.md: \"Supported versions\" does not match the manifests.\nfix: npx tsx scripts/sync-supported-versions.ts\n");
      process.exit(1);
    }
  } else if (after !== before) {
    writeFileSync(file, after);
    process.stdout.write("SECURITY.md: \"Supported versions\" rewritten from the manifests\n");
  }
}
/* v8 ignore stop */
