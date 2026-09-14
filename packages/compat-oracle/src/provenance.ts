/**
 * Where a vendored suite came from, written down where a reader will find it.
 *
 * `.source.json` beside each suite already carries the release, the tag, the commit and a
 * hash per file — it is the machine's record, and `diffRecords` reads it. What it does not
 * carry is the one thing a person opening `vendor/chalk/` needs: *how this directory was
 * made, and how to make it again*. That was tribal knowledge until 2026-09-13, and tribal
 * knowledge is what a `PROVENANCE` file exists to end.
 *
 * Two facts belong here rather than in a commit message, because both were measured and
 * both are counter-intuitive:
 *
 *   1. **A vendored suite is a repo clone at the release tag, never a tarball extract.**
 *      No incumbent ships its tests to npm. Measured 2026-09-13: `npm pack ansi-escapes`
 *      then `tar tzf … | grep -c test` answers **0**, and the same for `strip-ansi` and
 *      `which`. A `files` array that lists `dist` and nothing else is the norm, so the
 *      tarball route cannot produce any of these directories.
 *
 *   2. **There is no shim committed beside the tests.** `shim.js` is written *per run* by
 *      `run.ts`, because its body names `COMPAT_TARGET`: the control run points it at the
 *      incumbent's own package and a target run at ours, which is what lets one unedited
 *      suite grade both. `vendor()` deletes any stale shim for exactly that reason.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type CompatRecord } from './upstream.js';

/** The file name, one constant, so the tool and the lock cannot disagree about it. */
export const PROVENANCE_FILE = 'PROVENANCE';

/** What a tag reads as when the release carried none and `vendor()` fell back to HEAD. */
export const UNTAGGED = '(none — release was not tagged; HEAD was used)';

/** What an unestablished field reads as. Honest beats plausible: never invent a sha. */
export const UNKNOWN = 'unknown';

export interface ProvenanceFields {
  /** The incumbent, which is also the directory name. */
  package: string;
  repo: string;
  version: string;
  tag: string | null;
  commit: string;
  /** ISO date the copy was taken. */
  vendored: string;
  /** Test files the vendor step counted, which is the runner's own denominator. */
  files: number;
  /**
   * How the tag→commit pair was confirmed against the upstream host, and when. Absent when
   * nobody has checked; never fabricated.
   */
  verified?: string;
  /** Set when the origin could not be established, saying so in place of a guess. */
  note?: string;
}

const KEY = /^[a-z][a-z-]*$/;

/**
 * The `key: value` header, up to the first blank line. Everything after it is prose for a
 * person; nothing reads it, so nothing can rot against it.
 *
 * Split at the first colon rather than matched with one pattern: a header key and its
 * padded value are two quantifiers that a single regex lets trade characters, and this file
 * is read by a lock that runs on every commit.
 */
export function parseProvenance(text: string): Record<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (line.trim() === '') break;
    const at = line.indexOf(':');
    if (at <= 0) continue;
    const key = line.slice(0, at);
    if (KEY.test(key)) out.set(key, line.slice(at + 1).trim());
  }
  return Object.fromEntries(out);
}

/** The fields a `.source.json` record already establishes, as a provenance header. */
export function fieldsFromRecord(name: string, record: CompatRecord, verified?: string): ProvenanceFields {
  const fields: ProvenanceFields = {
    package: name,
    repo: record.repo,
    version: record.version,
    tag: record.tag,
    commit: record.commit,
    vendored: record.vendored,
    files: record.files,
  };
  if (verified !== undefined) fields.verified = verified;
  return fields;
}

const header = (fields: ProvenanceFields): string => {
  const rows: [string, string][] = [
    ['package', fields.package],
    ['repo', fields.repo],
    ['version', fields.version],
    ['tag', fields.tag ?? UNTAGGED],
    ['commit', fields.commit],
    ['vendored', fields.vendored],
    ['files', String(fields.files)],
    ['tool', 'scripts/vendor-suite.ts'],
  ];
  if (fields.verified !== undefined) rows.push(['verified', fields.verified]);
  if (fields.note !== undefined) rows.push(['note', fields.note]);
  const width = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${k}:${' '.repeat(width - k.length + 1)}${v}`).join('\n');
};

/** The command that remakes this directory, byte for byte apart from the `vendored` date. */
export const reproduceCommand = (fields: ProvenanceFields): string =>
  `npx tsx scripts/vendor-suite.ts ${fields.package} --version ${fields.version}`;

/**
 * The whole file. Deterministic in its fields, so re-running the tool on an unchanged
 * release rewrites the same bytes — except `vendored`, which is a date and says so.
 */
export function renderProvenance(fields: ProvenanceFields): string {
  const tag = fields.tag ?? 'HEAD';
  return `${header(fields)}

How this directory was made
---------------------------
A shallow clone of ${fields.repo} at ${tag}, then that repository's own test directory and
its fixtures copied here. The only edit is to the import specifiers that reach the library:
each is rewritten to a generated shim, so one unedited suite can grade any implementation.
Everything else — assertions, fixtures, helpers — is upstream's, byte for byte.

Why a clone and not the npm tarball
-----------------------------------
No incumbent ships its tests to npm. Measured 2026-09-13:

    npm pack ansi-escapes && tar tzf ansi-escapes-*.tgz | grep -c test   ->  0

and the same for strip-ansi and for which. A tarball extract could not produce this
directory, so "vendoring" here means a repo clone at the release tag and nothing else.

The shim is not in here
-----------------------
There is deliberately no shim committed beside these tests. \`shim.js\` — or \`shim.mjs\`
under a \`type: commonjs\` package, because the extension has to say the file is ESM — is
written per run by packages/compat-oracle/src/run.ts, since its body names COMPAT_TARGET:
the control run re-exports ${fields.package} itself, a target run re-exports ours. The
vendor step deletes any shim it finds, so a stale one can never grade the wrong thing.

Reproduce
---------
    ${reproduceCommand(fields)}

Every field above is reproduced exactly, with one exception that is a date and not a
defect: \`vendored\` is the day the copy was taken, so a fresh run writes today's.
`;
}

/** Read a directory's provenance header, if it has one. */
export function readProvenance(hostDir: string): Record<string, string> | undefined {
  const at = join(hostDir, PROVENANCE_FILE);
  return existsSync(at) ? parseProvenance(readFileSync(at, 'utf8')) : undefined;
}

export interface Disagreement {
  field: string;
  provenance: string;
  source: string;
}

/**
 * Where a directory's `PROVENANCE` and its `.source.json` disagree. The two are written
 * from one record, so any disagreement means one of them was edited by hand — which is the
 * failure mode a written-down origin is supposed to remove, not introduce.
 */
export function disagreements(provenance: Record<string, string>, record: CompatRecord): Disagreement[] {
  const expected: Record<string, string> = {
    repo: record.repo,
    version: record.version,
    tag: record.tag ?? UNTAGGED,
    commit: record.commit,
    vendored: record.vendored,
    files: String(record.files),
  };
  return Object.entries(expected)
    .filter(([field, value]) => provenance[field] !== value)
    .map(([field, value]) => ({ field, provenance: provenance[field] ?? '(absent)', source: value }));
}
