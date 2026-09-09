/**
 * The competitor pass — `upstream-watch` R4 and R5.
 *
 * For every competitor any package declares, fetch the latest published release, fingerprint
 * the tarball, diff it against the fingerprint we hold, and render the issue when something
 * moved. Hosts with a vendored suite keep their richer clone-based watch; this covers
 * everything else, which is most of the list and all of the weight-only claims — the ones
 * the intent says "rot quietly", because no test of ours goes red when picocolors ships.
 *
 * Two modes, deliberately separated:
 *
 *   - `check()` is **read-only** and is what CI runs. It reports; the workflow opens issues.
 *   - `fingerprint()` **writes** the `seen` block back into `competitors.json`. A person runs
 *     it and commits the diff, which is how an upstream release arrives as a reviewable git
 *     diff on a committed file rather than as state inside a workflow.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { type Declaration, type Entry, type Seen, type Watched, npmNameOf, readDeclarations, watchList } from './competitors.js';
import { claimSite } from './facts.js';
import { type IssueInput, issueTitle, renderIssue } from './issue.js';
import { type RegistryClient, cached, fromRegistry, liveRegistry } from './registry.js';
import { sha256 } from './upstream.js';

/** The fingerprint of one release, as it is recorded and as it is compared. */
export interface Fingerprint {
  version: string;
  shasum: string;
  weight: number;
  self: number;
  packages: number;
  files: Record<string, string>;
  exports: string[];
}

const exportsOf = (surface: Record<string, string[]>): string[] => [...new Set(Object.values(surface).flat())].sort();

/** A competitor watched on its own: its latest release, weighed across its whole tree. */
async function fingerprintLatest(npm: string, client: RegistryClient): Promise<Fingerprint> {
  const { record, weight, shasum } = await fromRegistry(npm, 'latest', client);
  return {
    version: record.version,
    shasum,
    weight: weight.total,
    self: weight.self,
    packages: Object.keys(weight.packages).length,
    files: record.hashes,
    exports: exportsOf(record.surface),
  };
}

/**
 * A competitor watched as a line in another's bill: the version and the bytes it contributes
 * **inside the parent's resolved tree**, not its own latest release.
 *
 * flagstaff publishes `chalk 16,727` as part of ora's 113,577. That is chalk 5.6.2, which is
 * what ora resolves; chalk's latest is 6.0.0 at 21,417. Reading the figure out of the parent's
 * tree is what makes it reproduce, and it means the number moves exactly when ora's resolution
 * moves — which is the event that would actually make flagstaff's published bill wrong.
 */
/** The version and bytes one package contributes to a resolved tree, or null if absent. */
function itemised(packages: Record<string, number>, npm: string): { version: string; bytes: number } | null {
  const prefix = `${npm}@`;
  for (const [key, bytes] of Object.entries(packages)) {
    if (key.startsWith(prefix)) return { version: key.slice(prefix.length), bytes };
  }
  return null;
}

async function fingerprintVia(npm: string, parent: string, client: RegistryClient): Promise<Fingerprint> {
  const tree = await fromRegistry(parent, 'latest', client);
  const line = itemised(tree.weight.packages, npm);
  if (line === null) {
    throw new Error(`${npm} is not in ${parent}@${tree.record.version}'s resolved tree — the itemised figure has no source`);
  }
  const { version, bytes } = line;
  // Fetch the exact version the parent resolves, so the hashes and the surface belong to the
  // same release as the byte count. Fingerprinting latest here would be the hoisted-package
  // defect in another costume: a plausible number computed from the wrong files.
  const { record, shasum } = await fromRegistry(npm, version, client);
  if (record.version !== version) throw new Error(`${npm}: asked for ${version} inside ${parent}, got ${record.version}`);
  return { version, shasum, weight: bytes, self: bytes, packages: 1, files: record.hashes, exports: exportsOf(record.surface) };
}

export async function takeFingerprint(watched: Pick<Watched, 'npm' | 'via'>, client: RegistryClient): Promise<Fingerprint> {
  if (watched.via === undefined) return await fingerprintLatest(watched.npm, client);
  return await fingerprintVia(watched.npm, watched.via, client);
}

/** What moved between the fingerprint we hold and the one we just took. */
export function compare(before: Seen | null, after: Fingerprint): IssueInput['surface'] {
  const heldExports = new Set(before?.exports ?? []);
  const freshExports = new Set(after.exports);
  const heldFiles = before?.files ?? {};
  const filesChanged = Object.keys(after.files)
    .filter((path) => path in heldFiles && heldFiles[path] !== after.files[path])
    .sort();
  const filesAdded = Object.keys(after.files).filter((path) => !(path in heldFiles)).sort();
  const filesRemoved = Object.keys(heldFiles).filter((path) => !(path in after.files)).sort();
  // With no held fingerprint there is nothing to diff: the first run records, it does not
  // report every export as an addition. That would be a hundred issues on day one.
  const nothing = { added: [], removed: [], filesChanged: [], filesAdded: [], filesRemoved: [] };
  if (before === null || before.exports === undefined || before.files === undefined) return nothing;
  return {
    added: [...freshExports].filter((n) => !heldExports.has(n)).sort(),
    removed: [...heldExports].filter((n) => !freshExports.has(n)).sort(),
    filesChanged,
    filesAdded,
    filesRemoved,
  };
}

function claimsFor(watched: Watched, declarations: Declaration[], root: string): IssueInput['claims'] {
  const sites: IssueInput['claims'] = [];
  for (const declaration of declarations) {
    for (const [subpath, entries] of Object.entries(declaration.subpaths)) {
      for (const entry of entries) {
        // Match the resolution too: chalk-in-ora's-bill and chalk-as-roundel's-host are
        // different watches, and each issue should name only the claims it actually covers.
        if (npmNameOf(entry) !== watched.npm || (entry.via ?? '') !== (watched.via ?? '')) continue;
        sites.push(claimSite(declaration, subpath, entry, root));
      }
    }
  }
  return sites;
}

/** Whether anything about this release is worth an issue. */
export function moved(before: Seen | null, after: Fingerprint, surface: IssueInput['surface']): boolean {
  if (before === null || before.version === null) return false; // never fingerprinted: record first.
  if (before.version !== after.version) return true;
  if (before.shasum !== undefined && before.shasum !== after.shasum) return true;
  if (before.weight !== null && before.weight !== after.weight) return true;
  return surface.added.length > 0 || surface.removed.length > 0 || surface.filesChanged.length > 0 || surface.filesAdded.length > 0 || surface.filesRemoved.length > 0;
}

export interface CompetitorUpdate {
  name: string;
  npm: string;
  from: string | null;
  to: string;
  title: string;
  report: string;
}

export interface CheckResult {
  updates: CompetitorUpdate[];
  /** Competitors with no held fingerprint yet — reported, never issued. */
  unfingerprinted: string[];
  errors: { npm: string; error: string }[];
}

function buildInput(watched: Watched, before: Seen | null, after: Fingerprint, claims: IssueInput['claims']): IssueInput {
  return {
    name: watched.name,
    npm: watched.npm,
    from: before?.version ?? null,
    to: after.version,
    shasum: after.shasum,
    surface: compare(before, after),
    weight: {
      before: before?.weight ?? null,
      after: after.weight,
      packagesBefore: before?.packages ?? null,
      packagesAfter: after.packages,
    },
    claims,
  };
}

export type Write = (text: string) => void;

/** A watch is keyed by (npm package, resolution), which is what `via` makes distinct. */
const keyOf = (e: Pick<Entry, 'package' | 'registry' | 'via'>): string => `${npmNameOf(e)}|${e.via ?? ''}`;

const ISO_DATE_LENGTH = 'YYYY-MM-DD'.length;
const BYTES_COL = 7;

const COL = 26;

/** `chalk` on its own; `chalk<ora` when the figure is a line in ora's bill. */
const label = (w: Pick<Watched, 'npm' | 'via'>): string => (w.via === undefined ? w.npm : `${w.npm}<${w.via}`);

/**
 * Read-only: fetch, diff, report. Nothing is written to `competitors.json` here, and no
 * issue is opened from this process — the workflow does that, so the dedupe stays in one
 * place (R5).
 */
export async function check(packagesDir: string, root: string, write: Write, client: RegistryClient = liveRegistry): Promise<CheckResult> {
  const declarations = readDeclarations(packagesDir);
  const shared = cached(client);
  const updates: CompetitorUpdate[] = [];
  const unfingerprinted: string[] = [];
  const errors: { npm: string; error: string }[] = [];

  for (const watched of watchList(declarations)) {
    try {
      // Sequential on purpose: a fan-out over every competitor's whole dependency closure is
      // a burst of requests against a public registry that nobody asked us to make.
      // eslint-disable-next-line reliability/no-await-in-loop -- deliberate: one competitor at a time
      const after = await takeFingerprint(watched, shared);
      const before = watched.seen;
      const surface = compare(before, after);
      if (!moved(before, after, surface)) {
        const held = before?.version ?? null;
        if (held === null) {
          unfingerprinted.push(watched.npm);
          write(`  ${label(watched).padEnd(COL)} ${after.version} — no fingerprint held; run --fingerprint\n`);
        } else {
          write(`  ${label(watched).padEnd(COL)} ${after.version} — up to date\n`);
        }
        continue;
      }
      const input = buildInput(watched, before, after, claimsFor(watched, declarations, root));
      write(
        `  ${label(watched).padEnd(COL)} ${String(before?.version)} → ${after.version}: +${input.surface.added.length}/-${input.surface.removed.length} exports, ${input.surface.filesChanged.length} changed / +${input.surface.filesAdded.length} / -${input.surface.filesRemoved.length} files, weight ${String(before?.weight)} → ${after.weight}\n`,
      );
      updates.push({
        name: watched.name,
        npm: watched.npm,
        from: before?.version ?? null,
        to: after.version,
        title: issueTitle(watched.name, after.version),
        report: renderIssue(input),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ npm: watched.npm, error: message });
      write(`  ${label(watched).padEnd(COL)} ✖ ${message}\n`);
    }
  }
  return { updates, unfingerprinted, errors };
}

const INDENT = 2;

/** Merge a fresh fingerprint into one entry, keeping the fields a human wrote. */
function record(entry: Entry, taken: Fingerprint, today: string): Seen {
  const existing = entry.seen;
  return {
    ...(existing ?? {}),
    registry: npmNameOf(entry),
    version: taken.version,
    shasum: taken.shasum,
    weight: taken.weight,
    self: taken.self,
    packages: taken.packages,
    files: taken.files,
    exports: taken.exports,
    measured: today,
    ...(existing?.cited === undefined ? {} : { cited: existing.cited }),
  };
}

/**
 * Write every competitor's current fingerprint into its `competitors.json`. A person runs
 * this and commits the result; the watch then has something to diff against. It is not run
 * by CI — a job that rewrites the baseline it is checking against can never report a change.
 */
export async function fingerprint(packagesDir: string, write: Write, client: RegistryClient = liveRegistry): Promise<number> {
  const declarations = readDeclarations(packagesDir);
  const shared = cached(client);
  const taken = new Map<string, Fingerprint>();
  let failures = 0;

  for (const watched of watchList(declarations)) {
    try {
      // eslint-disable-next-line reliability/no-await-in-loop -- deliberate: see `check`
      const fresh = await takeFingerprint(watched, shared);
      taken.set(`${watched.npm}|${watched.via ?? ''}`, fresh);
      write(`  ${label(watched).padEnd(COL)} ${fresh.version}  ${String(fresh.weight).padStart(BYTES_COL)} B across ${fresh.packages}\n`);
    } catch (error) {
      failures += 1;
      write(`  ${label(watched).padEnd(COL)} ✖ ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  const today = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
  for (const declaration of declarations) {
    const raw = JSON.parse(readFileSync(declaration.file, 'utf8')) as Record<string, unknown>;
    for (const [subpath, entries] of Object.entries(declaration.subpaths)) {
      const updated = entries.map((entry) => {
        const fresh = taken.get(keyOf(entry));
        return fresh === undefined ? entry : { ...entry, seen: record(entry, fresh, today) };
      });
      raw[subpath] = updated;
    }
    writeFileSync(declaration.file, `${JSON.stringify(raw, null, INDENT)}\n`);
  }
  return failures;
}

/** Exposed so the fingerprint of a surface can be compared without the whole file map. */
export const surfaceHash = (exports: string[]): string => sha256(exports.join('\n'));
