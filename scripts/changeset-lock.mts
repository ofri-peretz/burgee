#!/usr/bin/env node

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * changeset-lock.mts — an incumbent's major is our major.
 *
 * burgee 1.5.0 (#1064) and flagstaff 1.2.0 (#827) shipped as minors a behaviour commander 13 and
 * boxen 9 shipped as majors. A changeset whose summary matches a behaviour the incumbent shipped
 * under a major (`.sdlc/bands/incumbent-majors.json`) cannot be `minor` or `patch` for the package
 * that drops that incumbent in. `changesets-pr.yml` runs it on every PR that adds a changeset.
 *
 * Until 2026-10-27 this file was `release-window.mts` and also held a 7-day window between non-fix
 * releases of a package. The owner removed the window (D-20261027-no-release-window): every
 * release goes out when it merges. The lock is semver honesty, not cadence, and stays.
 *
 * Plain Node (type stripping, builtins only), as `release-order.mts`.
 *
 *   node scripts/changeset-lock.mts   # the lock over .changeset/*.md; exit 1 on a violation
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import url from "node:url";

export type Bump = "major" | "minor" | "patch" | "none";

export interface Changeset {
  /** The file name under `.changeset/`. */
  file: string;
  releases: { name: string; type: Bump }[];
  summary: string;
}

const BUMPS: readonly string[] = ["major", "minor", "patch", "none"];
const FENCE = "---";

/** `"name"`, `'name'` or `name`, as written either side of the colon. */
const unquote = (text: string): string => {
  const bare = text.trim();
  return bare.length > 1 &&
    (bare[0] === '"' || bare[0] === "'") &&
    bare.endsWith(bare[0])
    ? bare.slice(1, -1)
    : bare;
};

/** One `"name": bump` line. Split at the last colon, so a scoped name keeps its own. */
function releaseLine(file: string, line: string): { name: string; type: Bump } {
  const at = line.lastIndexOf(":");
  const type = unquote(line.slice(at + 1));
  if (at <= 0 || !BUMPS.includes(type))
    throw new Error(
      `${file}: cannot read the release line ${JSON.stringify(line)}`,
    );
  return { name: unquote(line.slice(0, at)), type: type as Bump };
}

/** A `.changeset/*.md` file: front matter of `"name": bump` lines, then the summary. Read as lines, no pattern. */
export function parseChangeset(file: string, text: string): Changeset {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  const close = lines.indexOf(FENCE, 1);
  if (lines[0] !== FENCE || close === -1)
    throw new Error(`${file}: no front matter`);
  // `changeset --empty` writes no release lines at all: `---\n---\n`.
  const releases = lines
    .slice(1, close)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => releaseLine(file, line));
  return {
    file,
    releases,
    summary: lines
      .slice(close + 1)
      .join("\n")
      .trim(),
  };
}

/** The file changesets writes, front matter first. */
export function formatChangeset(changeset: Changeset): string {
  return `---\n${changeset.releases.map((r) => `"${r.name}": ${r.type}`).join("\n")}\n---\n\n${changeset.summary}\n`;
}

export interface IncumbentMajorRow {
  incumbent: string;
  /** The incumbent's release that made the change, a major. */
  version: string;
  behaviour: string;
  /**
   * Phrases, compared in lower case with backticks removed. A string matches when the summary
   * contains it; a list matches when one sentence of the summary contains every phrase in it.
   * Phrases, not patterns: the table is data, and nothing here builds a regular expression from it.
   */
  match: (string | string[])[];
  /** The family packages that drop this incumbent in, or `*` for a change every incumbent ships as a major. */
  packages: string[] | "*";
  source: string;
}

export interface LockViolation {
  file: string;
  name: string;
  type: Bump;
  row: IncumbentMajorRow;
}

/** The summary as the table's phrases are compared with: lower case, no backticks. */
const plain = (text: string): string => text.toLowerCase().replaceAll("`", "");

/** The summary's sentences: split after a full stop, a question or an exclamation mark that ends a word, and at blank lines. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    const ends =
      ((ch === "." || ch === "!" || ch === "?") &&
        (next === undefined || next === " " || next === "\n")) ||
      (ch === "\n" && next === "\n");
    if (ends) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

/** Does this summary describe the row's behaviour? */
export function describes(summary: string, row: IncumbentMajorRow): boolean {
  const text = plain(summary);
  const parts = sentences(text);
  return row.match.some((phrase) =>
    typeof phrase === "string"
      ? text.includes(phrase)
      : parts.some((s) => phrase.every((p) => s.includes(p))),
  );
}

const below = (type: Bump): boolean => type === "minor" || type === "patch";
const covers = (row: IncumbentMajorRow, name: string): boolean =>
  row.packages === "*" || row.packages.includes(name);

/** Every entry below `major` whose summary matches a row that names its package. */
export function lockViolations(
  changesets: readonly Changeset[],
  rows: readonly IncumbentMajorRow[],
): LockViolation[] {
  return changesets.flatMap((cs) =>
    rows
      .filter((row) => describes(cs.summary, row))
      .flatMap((row) =>
        cs.releases
          .filter((r) => below(r.type) && covers(row, r.name))
          .map((r) => ({ file: cs.file, name: r.name, type: r.type, row })),
      ),
  );
}

const ROOT = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "..",
);

/** Every changeset under `dir` (`.changeset`), README excluded. */
export function readChangesets(dir: string): Changeset[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .toSorted()
    .map((f) => parseChangeset(f, fs.readFileSync(path.join(dir, f), "utf8")));
}

/** What the lock reads and where it reports: injected by the tests, the real thing otherwise. */
export interface Io {
  root: string;
  /** Workflow commands and results; `::error` lines go here, where the runner reads them. */
  write: (text: string) => void;
}

const realIo = (): Io => ({
  root: ROOT,
  write: (text) => process.stdout.write(text),
});

/** The lock over `root/.changeset`: an `::error` line per violation, and exit 1 when there is one. */
export function main(io: Io = realIo()): number {
  const rows = (
    JSON.parse(
      fs.readFileSync(
        path.join(io.root, ".sdlc/bands/incumbent-majors.json"),
        "utf8",
      ),
    ) as { rows: IncumbentMajorRow[] }
  ).rows;
  const changesets = readChangesets(path.join(io.root, ".changeset"));
  const violations = lockViolations(changesets, rows);
  for (const v of violations) {
    io.write(
      `::error file=.changeset/${v.file}::${v.name} is a ${v.type}, but this changeset describes "${v.row.behaviour}", which ${v.row.incumbent} shipped as a major (${v.row.incumbent}@${v.row.version}; ${v.row.source}). Make it "${v.name}": major, or reword the summary if it does not change that behaviour.\n`,
    );
  }
  if (violations.length === 0)
    io.write(
      `changeset lock: ${changesets.length} changeset(s), none below major for a behaviour an incumbent shipped as a major\n`,
    );
  return violations.length === 0 ? 0 : 1;
}

const isMain =
  path.resolve(process.argv[1] ?? "") === url.fileURLToPath(import.meta.url);
if (isMain) process.exitCode = main();
