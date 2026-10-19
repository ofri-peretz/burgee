#!/usr/bin/env node

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * release-window.mts — the release cadence (`.sdlc/intents/release-cadence/`).
 *
 * In the 30 days to 2026-10-18 burgee's `latest` was at least 7 days old on 0 days, three
 * minors landed on 2026-10-12, and a 7-day `minimumReleaseAge` refused `burgee@^1.6.0`. Two of
 * those minors changed behaviour the incumbent itself shipped as a major. Two rules answer it:
 *
 * 1. **The window.** No non-fix release of a package within 7 days of its previous non-fix
 *    release. A fix is never delayed: a `patch` changeset, or one whose summary opens with
 *    `Security:`, always releases on the next Version PR. A non-fix changeset for a package
 *    whose window is closed is *held*: set aside while `changeset version` runs, so the Version
 *    PR carries everything else and auto-merges, and the held changeset stays on `main` until a
 *    later run (every push, and a daily schedule) finds the window open. A changeset that mixes
 *    held and releasable packages is split. Holding the whole Version PR instead would delay any
 *    fix that shares it; `.sdlc/intents/release-cadence/release-window.qnt` shows that trace.
 * 2. **The lock.** A changeset whose summary matches a behaviour the incumbent shipped under a
 *    major (`.sdlc/bands/incumbent-majors.json`) cannot be `minor` or `patch` for the package
 *    that drops that incumbent in.
 *
 * A package's previous non-fix release is the newest `x.y.0` on npm — unless `main` already
 * holds a newer `x.y.0` that npm does not, which is a release in flight, and the window counts
 * as closed. Reading npm alone would let a second minor through while the first is publishing.
 *
 * Plain Node (type stripping, builtins only), as `release-order.mts`.
 *
 *   node scripts/release-window.mts plan [--out FILE]   # what may release now; GITHUB_OUTPUT `releasable`
 *   node scripts/release-window.mts version             # changeset version, with the held changesets set aside
 *   node scripts/release-window.mts publishable --out F # stdin: release.yml's plan; F: the rows the window lets publish
 *   node scripts/release-window.mts lock                # the changeset lock over .changeset/*.md
 *   node scripts/release-window.mts measure [--from ISO] [--to ISO] [--age DAYS]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

export const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

export type Bump = 'major' | 'minor' | 'patch' | 'none';

export interface Changeset {
  /** The file name under `.changeset/`. */
  file: string;
  releases: { name: string; type: Bump }[];
  summary: string;
}

const BUMPS: readonly string[] = ['major', 'minor', 'patch', 'none'];
const FENCE = '---';

/** `"name"`, `'name'` or `name`, as written either side of the colon. */
const unquote = (text: string): string => {
  const bare = text.trim();
  return bare.length > 1 && (bare[0] === '"' || bare[0] === "'") && bare.endsWith(bare[0]) ? bare.slice(1, -1) : bare;
};

/** One `"name": bump` line. Split at the last colon, so a scoped name keeps its own. */
function releaseLine(file: string, line: string): { name: string; type: Bump } {
  const at = line.lastIndexOf(':');
  const type = unquote(line.slice(at + 1));
  if (at <= 0 || !BUMPS.includes(type)) throw new Error(`${file}: cannot read the release line ${JSON.stringify(line)}`);
  return { name: unquote(line.slice(0, at)), type: type as Bump };
}

/** A `.changeset/*.md` file: front matter of `"name": bump` lines, then the summary. Read as lines, no pattern. */
export function parseChangeset(file: string, text: string): Changeset {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const close = lines.indexOf(FENCE, 1);
  if (lines[0] !== FENCE || close === -1) throw new Error(`${file}: no front matter`);
  // `changeset --empty` writes no release lines at all: `---\n---\n`.
  const releases = lines
    .slice(1, close)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => releaseLine(file, line));
  return { file, releases, summary: lines.slice(close + 1).join('\n').trim() };
}

/** The file changesets writes, front matter first: what `version` puts back for the held half of a split. */
export function formatChangeset(changeset: Changeset): string {
  return `---\n${changeset.releases.map((r) => `"${r.name}": ${r.type}`).join('\n')}\n---\n\n${changeset.summary}\n`;
}

/** `Security:` opening the summary marks a security change, which releases at once whatever its bump. */
export function securityTagged(summary: string): boolean {
  return /^\s*security\s*:/i.test(summary);
}

/** A fix is never held: a `patch` (or `none`) bump, or any bump of a security change. */
export function isFix(changeset: Changeset, release: { type: Bump }): boolean {
  return release.type === 'patch' || release.type === 'none' || securityTagged(changeset.summary);
}

/** `[major, minor, patch]` of a plain `x.y.z`; `undefined` for a prerelease or anything else. */
export function parts(version: string): [number, number, number] | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m === null ? undefined : [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compare(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)] as [[number, number, number], [number, number, number]];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** A non-fix release is an `x.y.0`: a minor or a major. Every other plain version is a fix. */
export const isNonFixVersion = (version: string): boolean => parts(version)?.[2] === 0;

/** The registry's `time` field for one package: version → ISO date, plus `created` / `modified`. */
export type Times = Readonly<Record<string, string>>;

/**
 * When the package's previous non-fix release went out: the newest `x.y.0` on npm, or `Infinity`
 * when `main`'s manifest holds a newer `x.y.0` npm does not have yet (a release in flight).
 * `undefined` when there is none: the package has never shipped a non-fix release.
 *
 * `before`, for `publishable`: only versions older than this one, since the version being
 * published is by then the manifest's own.
 */
export function previousNonFix(times: Times, manifest?: string, before?: string): number | undefined {
  const released = Object.entries(times)
    .filter(([v, at]) => isNonFixVersion(v) && !Number.isNaN(Date.parse(at)) && (before === undefined || compare(v, before) < 0))
    .sort(([a], [b]) => compare(b, a));
  const newest = released[0];
  if (newest === undefined) return undefined;
  // A manifest on an `x.y` newer than the newest non-fix release npm has is that release in flight.
  const local = parts(manifest ?? '');
  if (local !== undefined && compare(`${local[0]}.${local[1]}.0`, newest[0]) > 0) return Number.POSITIVE_INFINITY;
  return Date.parse(newest[1]);
}

/** The moment a non-fix release of the package may go out: now, if it never had one. */
export function opensAt(previous: number | undefined): number {
  return previous === undefined ? Number.NEGATIVE_INFINITY : previous + WINDOW_DAYS * DAY_MS;
}

export interface PackageState {
  times: Times;
  /** The version `main`'s manifest holds; `undefined` for a package not in this workspace. */
  manifest?: string | undefined;
}

export interface Held {
  file: string;
  name: string;
  type: Bump;
  /** ISO 8601, or `in flight` when a non-fix release of the package is between merge and npm. */
  opens: string;
}

export interface WindowPlan {
  /** Whether `changeset version` has anything to release now. */
  releasable: boolean;
  /** Each changeset as it goes into this Version PR: whole, split, or held entirely. */
  changesets: { file: string; release: Changeset['releases']; hold: Changeset['releases'] }[];
  held: Held[];
}

/**
 * Which changeset entries release now and which wait. A package is closed when a non-fix entry
 * names it and its window has not opened; every non-fix entry for a closed package is held.
 * A package whose times could not be read (`undefined`) counts as closed: holding a minor a day
 * costs a day, and releasing one inside the window is the thing this exists to prevent. Fixes
 * are released whatever the registry says.
 */
/** Why a package's window is shut now, or `undefined` when it is open. */
function shut(known: PackageState | undefined, now: number): string | undefined {
  if (known === undefined) return 'unknown: the registry did not answer';
  const at = opensAt(previousNonFix(known.times, known.manifest));
  if (at <= now) return undefined;
  return at === Number.POSITIVE_INFINITY ? 'in flight' : new Date(at).toISOString();
}

export function planWindow(changesets: readonly Changeset[], state: ReadonlyMap<string, PackageState | undefined>, now: number): WindowPlan {
  // Every named package's window, though only a non-fix entry ever reads it.
  const names = new Set(changesets.flatMap((cs) => cs.releases.map((r) => r.name)));
  const closed = new Map([...names].flatMap((name) => {
    const why = shut(state.get(name), now);
    return why === undefined ? [] : [[name, why] as const];
  }));
  const out: WindowPlan = { releasable: false, changesets: [], held: [] };
  for (const cs of changesets) {
    const hold = cs.releases.filter((r) => !isFix(cs, r) && closed.has(r.name));
    const release = cs.releases.filter((r) => !hold.includes(r));
    out.changesets.push({ file: cs.file, release, hold });
    for (const r of hold) out.held.push({ file: cs.file, name: r.name, type: r.type, opens: closed.get(r.name) as string });
    if (release.length > 0) out.releasable = true;
  }
  return out;
}

/* ------------------------------------------------------------------ the lock */

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
  packages: string[] | '*';
  source: string;
}

export interface LockViolation {
  file: string;
  name: string;
  type: Bump;
  row: IncumbentMajorRow;
}

/** The summary as the table's phrases are compared with: lower case, no backticks. */
const plain = (text: string): string => text.toLowerCase().replaceAll('`', '');

/** The summary's sentences: split after a full stop, a question or an exclamation mark that ends a word, and at blank lines. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    const ends = ((ch === '.' || ch === '!' || ch === '?') && (next === undefined || next === ' ' || next === '\n')) || (ch === '\n' && next === '\n');
    if (ends) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

/** Does this summary describe the row's behaviour? */
export function describes(summary: string, row: IncumbentMajorRow): boolean {
  const text = plain(summary);
  const parts = sentences(text);
  return row.match.some((phrase) => (typeof phrase === 'string' ? text.includes(phrase) : parts.some((s) => phrase.every((p) => s.includes(p)))));
}

const below = (type: Bump): boolean => type === 'minor' || type === 'patch';
const covers = (row: IncumbentMajorRow, name: string): boolean => row.packages === '*' || row.packages.includes(name);

/** Every entry below `major` whose summary matches a row that names its package. */
export function lockViolations(changesets: readonly Changeset[], rows: readonly IncumbentMajorRow[]): LockViolation[] {
  return changesets.flatMap((cs) =>
    rows
      .filter((row) => describes(cs.summary, row))
      .flatMap((row) => cs.releases.filter((r) => below(r.type) && covers(row, r.name)).map((r) => ({ file: cs.file, name: r.name, type: r.type, row }))),
  );
}

/* ------------------------------------------------------------------ measure */

/**
 * The days within [from, to) on which `latest` — the newest plain release published by then —
 * was at least `age` days old. Part C's measure (`adoption-barriers-2026-10.md`), exact rather
 * than sampled: each gap between two publishes contributes the part of it more than `age` days
 * after the first.
 */
export function daysOldEnough(times: Times, from: number, to: number, age: number): number {
  const publishes = Object.entries(times)
    .filter(([v]) => parts(v) !== undefined)
    .map(([, at]) => Date.parse(at))
    .filter((at) => !Number.isNaN(at))
    .sort((a, b) => a - b);
  let total = 0;
  publishes.forEach((at, i) => {
    const next = publishes[i + 1] ?? Number.POSITIVE_INFINITY;
    const start = Math.max(at + age * DAY_MS, from);
    const end = Math.min(next, to);
    if (end > start) total += end - start;
  });
  return total / DAY_MS;
}

/* ------------------------------------------------------------------ I/O */

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/** Every changeset under `dir` (`.changeset`), README excluded. */
export function readChangesets(dir: string): Changeset[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .toSorted()
    .map((f) => parseChangeset(f, fs.readFileSync(path.join(dir, f), 'utf8')));
}

/** name → directory, version and privacy of every workspace package under `root/packages`. */
export function manifests(root: string): Map<string, { dir: string; version: string; private: boolean }> {
  const out = new Map<string, { dir: string; version: string; private: boolean }>();
  const base = path.join(root, 'packages');
  for (const dir of fs.readdirSync(base).toSorted()) {
    const file = path.join(base, dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as { name?: string; version?: string; private?: boolean };
    if (manifest.name !== undefined && manifest.version !== undefined) out.set(manifest.name, { dir, version: manifest.version, private: manifest.private === true });
  }
  return out;
}

/** The registry's `time` for `name`: `{}` for a package npm has never seen, `undefined` when it did not answer. */
const REGISTRY_TIMEOUT_MS = 15_000;
const NOT_FOUND = 404;

export async function registryTimes(name: string): Promise<Times | undefined> {
  try {
    // The whole name, encoded: `@scope/pkg` is `%40scope%2Fpkg`, as `migrate.ts` asks for it.
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
    if (response.status === NOT_FOUND) return {};
    if (!response.ok) return undefined;
    return ((await response.json()) as { time?: Times }).time ?? {};
  } catch {
    return undefined;
  }
}

async function stateFor(names: readonly string[], io: Pick<Io, 'root' | 'times'>): Promise<Map<string, PackageState | undefined>> {
  const local = manifests(io.root);
  const entries = await Promise.all(names.map(async (name) => [name, await io.times(name)] as const));
  return new Map(entries.map(([name, times]) => [name, times === undefined ? undefined : { times, manifest: local.get(name)?.version }]));
}

/** `release.yml`'s plan row: what `publishable` filters. */
interface PlanRow {
  dir: string;
  name: string;
  version: string;
  deps: { name: string; version: string }[];
}

/** One version's section of a package's CHANGELOG.md, `## x.y.z` to the next `## `. */
export function changelogSection(text: string, version: string): string {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (at === -1) return '';
  const end = lines.findIndex((l, i) => i > at && l.startsWith('## '));
  return lines.slice(at + 1, end === -1 ? undefined : end).join('\n');
}

/**
 * The backstop in `release.yml`: a non-fix version whose window is closed does not publish now,
 * whoever merged it, unless its changelog section carries a `Security:` entry. A package that
 * depends on a deferred one at the deferred version waits with it. Deferred rows publish on a
 * later run (every push to main, and the daily schedule) once the window opens.
 */
/** A changelog section with a `Security:` entry: a list item that says so. */
const securityEntry = (section: string): boolean => section.split('\n').some((line) => line.trimStart().startsWith('-') && line.includes('Security:'));

/** Why this non-fix version may not publish yet, or `undefined` when it may. */
function windowShut(row: PlanRow, times: Times | undefined, now: number): string | undefined {
  if (times === undefined) return 'the registry did not answer';
  const at = opensAt(previousNonFix(times, undefined, row.version));
  return at > now ? `its previous non-fix release was under ${WINDOW_DAYS} days ago; the window opens ${new Date(at).toISOString()}` : undefined;
}

export function publishable(rows: readonly PlanRow[], times: ReadonlyMap<string, Times | undefined>, changelog: (row: PlanRow) => string, now: number): { rows: PlanRow[]; deferred: { name: string; version: string; why: string }[] } {
  const deferred: { name: string; version: string; why: string }[] = [];
  const kept: PlanRow[] = [];
  for (const row of rows) {
    const dep = row.deps.find((d) => deferred.some((x) => x.name === d.name && x.version === d.version));
    const gated = dep === undefined && isNonFixVersion(row.version) && !securityEntry(changelog(row));
    const why = dep === undefined ? undefined : `it depends on ${dep.name}@${dep.version}, which waits`;
    const shutBy = gated ? windowShut(row, times.get(row.name), now) : why;
    if (shutBy === undefined) kept.push(row);
    else deferred.push({ name: row.name, version: row.version, why: shutBy });
  }
  return { rows: kept, deferred };
}

function flag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

/** What `main` reaches outside itself: injected by the tests, the real thing otherwise. */
export interface Io {
  root: string;
  times: (name: string) => Promise<Times | undefined>;
  now: number;
  /** Workflow commands and results; `::error` / `::notice` lines go here, where the runner reads them. */
  write: (text: string) => void;
  /** `release.yml`'s plan, for `publishable`. */
  stdin: () => string;
  env: Readonly<Record<string, string | undefined>>;
  version: () => number;
}

const realIo = (): Io => ({
  root: ROOT,
  times: registryTimes,
  now: Date.now(),
  write: (text) => process.stdout.write(text),
  stdin: () => fs.readFileSync(0, 'utf8'),
  env: process.env,
  version: runVersion,
});

const USAGE = 'usage: release-window.mts plan [--out FILE] | version | publishable --out FILE | lock | measure [--from ISO] [--to ISO] [--age DAYS]\n';
const USAGE_EXIT = 2;
/** `measure`'s default span: Part C's 30 days. */
const MEASURE_DAYS = 30;
const DAYS_DIGITS = 2;
const SHARE_DIGITS = 3;

const append = (file: string | undefined, text: string): void => {
  if (file !== undefined) fs.appendFileSync(file, text);
};

function lockCommand(io: Io): number {
  const rows = (JSON.parse(fs.readFileSync(path.join(io.root, '.sdlc/bands/incumbent-majors.json'), 'utf8')) as { rows: IncumbentMajorRow[] }).rows;
  const changesets = readChangesets(path.join(io.root, '.changeset'));
  const violations = lockViolations(changesets, rows);
  for (const v of violations) {
    io.write(
      `::error file=.changeset/${v.file}::${v.name} is a ${v.type}, but this changeset describes "${v.row.behaviour}", which ${v.row.incumbent} shipped as a major (${v.row.incumbent}@${v.row.version}; ${v.row.source}). Make it "${v.name}": major, or reword the summary if it does not change that behaviour.\n`,
    );
  }
  if (violations.length === 0) io.write(`changeset lock: ${changesets.length} changeset(s), none below major for a behaviour an incumbent shipped as a major\n`);
  return violations.length === 0 ? 0 : 1;
}

/** The plan the `plan` step wrote, when `version` runs beside it; otherwise one made now. */
async function planFor(changesets: readonly Changeset[], io: Io, fromFile = ''): Promise<WindowPlan> {
  if (fs.existsSync(fromFile)) return JSON.parse(fs.readFileSync(fromFile, 'utf8')) as WindowPlan;
  return planWindow(changesets, await stateFor([...new Set(changesets.flatMap((c) => c.releases.map((r) => r.name)))], io), io.now);
}

async function planCommand(args: readonly string[], io: Io): Promise<number> {
  const plan = await planFor(readChangesets(path.join(io.root, '.changeset')), io);
  const out = flag(args, '--out');
  if (out !== undefined) fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
  append(io.env.GITHUB_OUTPUT, `releasable=${plan.releasable}\nheld=${plan.held.length}\n`);
  const lines = [
    `### Release window (${WINDOW_DAYS} days between non-fix releases of a package)`,
    '',
    plan.held.length === 0 ? 'Nothing held: every pending changeset releases on this Version PR.' : 'Held on `main` until the window opens; a fix in the same changeset releases now:',
    ...plan.held.map((h) => `- \`${h.name}\` ${h.type} from \`.changeset/${h.file}\`: opens ${h.opens}`),
  ];
  append(io.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  io.write(`${JSON.stringify(plan, null, 2)}\n`);
  return 0;
}

async function versionCommand(io: Io): Promise<number> {
  const dir = path.join(io.root, '.changeset');
  const changesets = readChangesets(dir);
  return version(dir, changesets, await planFor(changesets, io, io.env.RELEASE_WINDOW_PLAN), io.version);
}

async function publishableCommand(args: readonly string[], io: Io): Promise<number> {
  const out = flag(args, '--out');
  if (out === undefined) {
    io.write(USAGE);
    return USAGE_EXIT;
  }
  const rows = JSON.parse(io.stdin()) as PlanRow[];
  const names = [...new Set(rows.filter((r) => isNonFixVersion(r.version)).map((r) => r.name))];
  const times = new Map(await Promise.all(names.map(async (n) => [n, await io.times(n)] as const)));
  const changelog = (row: PlanRow): string => {
    const file = path.join(io.root, 'packages', row.dir, 'CHANGELOG.md');
    return fs.existsSync(file) ? changelogSection(fs.readFileSync(file, 'utf8'), row.version) : '';
  };
  const result = publishable(rows, times, changelog, io.now);
  for (const d of result.deferred) io.write(`::notice::Not publishing ${d.name}@${d.version} yet: ${d.why}. A later run publishes it (release-cadence).\n`);
  fs.writeFileSync(out, JSON.stringify(result.rows));
  return 0;
}

async function measureCommand(args: readonly string[], io: Io): Promise<number> {
  const to = Date.parse(flag(args, '--to') ?? new Date(io.now).toISOString());
  const from = Date.parse(flag(args, '--from') ?? new Date(to - MEASURE_DAYS * DAY_MS).toISOString());
  const age = Number(flag(args, '--age') ?? WINDOW_DAYS);
  const names = [...manifests(io.root)].filter(([, m]) => !m.private).map(([name]) => name);
  const span = (to - from) / DAY_MS;
  const packages = await Promise.all(
    names.map(async (name) => {
      const times = await io.times(name);
      if (times === undefined) return { name, days: null, share: null };
      const days = daysOldEnough(times, from, to, age);
      return { name, days: Number(days.toFixed(DAYS_DIGITS)), share: Number((days / span).toFixed(SHARE_DIGITS)) };
    }),
  );
  io.write(`${JSON.stringify({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), age, span, packages }, null, 2)}\n`);
  return 0;
}

export async function main(args: readonly string[], io: Io = realIo()): Promise<number> {
  switch (args[0]) {
    case 'lock':
      return lockCommand(io);
    case 'plan':
      return planCommand(args, io);
    case 'version':
      return versionCommand(io);
    case 'publishable':
      return publishableCommand(args, io);
    case 'measure':
      return measureCommand(args, io);
    default:
      io.write(USAGE);
      return USAGE_EXIT;
  }
}

/**
 * `changeset version` with the held changesets set aside, then put back: a wholly held file
 * leaves `.changeset/` while it runs; a split one is rewritten to its releasable half, and its
 * held half is written back afterwards. What changesets/action then commits to the Version PR
 * branch is the release of everything else, plus the split files reduced to their held half, so
 * the held entries stay on `main` for the next run.
 */
export function version(dir: string, changesets: readonly Changeset[], plan: WindowPlan, run: () => number = runVersion): number {
  const restore: (() => void)[] = [];
  try {
    for (const entry of plan.changesets) {
      const cs = changesets.find((c) => c.file === entry.file);
      if (entry.hold.length === 0 || cs === undefined) continue;
      const file = path.join(dir, entry.file);
      const original = fs.readFileSync(file, 'utf8');
      const heldHalf = formatChangeset({ ...cs, releases: entry.hold });
      if (entry.release.length === 0) {
        fs.rmSync(file);
        restore.push(() => fs.writeFileSync(file, original));
      } else {
        fs.writeFileSync(file, formatChangeset({ ...cs, releases: entry.release }));
        restore.push(() => fs.writeFileSync(file, heldHalf));
      }
    }
    return run();
  } finally {
    for (const put of restore) put();
  }
}

type Spawn = (command: string, args: string[], options: { cwd: string; stdio: 'inherit' }) => { status: number | null };

/** `npm run changeset:version` at the repository root; a run killed by a signal is a failure. */
export function runVersion(spawn: Spawn = spawnSync): number {
  return spawn('npm', ['run', 'changeset:version'], { cwd: ROOT, stdio: 'inherit' }).status ?? 1;
}

const isMain = path.resolve(process.argv[1] ?? '') === url.fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await main(process.argv.slice(2));
