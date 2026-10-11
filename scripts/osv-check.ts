/**
 * OSV gate — measure the lockfile the way OpenSSF Scorecard's `Vulnerabilities` check does.
 *
 * Scorecard does not run `npm audit`. It runs OSV (osv-scanner) against `package-lock.json`,
 * so a package `npm audit` never reports — an advisory GitHub has not reviewed, a dev-only
 * path, an optional platform binary — still costs the score. Measured on another repo:
 * `npm audit` missed 28 of the 29 vulnerabilities OSV found. This script asks OSV the same
 * question Scorecard asks, so the number it prints is the number the badge shows.
 *
 *   1. read `package-lock.json` and collect every installed `(name, version)` under
 *      `packages` (workspace pointers excluded — their real entries are listed at the target);
 *   2. ask `https://api.osv.dev/v1/querybatch`, ecosystem `npm`;
 *   3. print each vulnerable `name@version`, its advisory ids, and the dependency path that
 *      pulls it in — derived from the lockfile itself, so no install is needed;
 *   4. exit 1 if anything is vulnerable.
 *
 * **Waivers are `osv-scanner.toml`, not a list in here.** It is the file osv-scanner reads and
 * the one Scorecard's own remediation text points at ("create an `osv-scanner.toml` file next
 * to the dependency manifest"), so a waiver means the same thing to this script as to the
 * badge. Each `[[IgnoredVulns]]` entry needs an `ignoreUntil` and a `reason`; a waived
 * advisory is still printed, an expired waiver counts again, and a waiver that matches
 * nothing fails the run so it is removed the day the fix lands.
 *
 * `npm run check:osv`. Network: one POST per 1000 packages, plus one GET per advisory id to
 * drop withdrawn advisories (OSV's batch endpoint returns ids only).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const VULN_URL = 'https://api.osv.dev/v1/vulns/';
/** OSV's documented ceiling for one `querybatch` request. */
const BATCH_SIZE = 1000;
const NM = 'node_modules/';

export interface Entry {
  name?: string;
  version?: string;
  link?: boolean;
  resolved?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface Lock {
  packages: Record<string, Entry>;
}

export interface Installed {
  /** The lockfile key, e.g. `node_modules/a/node_modules/b`. */
  path: string;
  name: string;
  version: string;
}

/** The package name a lockfile key installs: everything after the last `node_modules/`. */
export function nameAt(path: string, entry: Entry): string {
  const cut = path.lastIndexOf(NM);
  return cut === -1 ? (entry.name ?? path) : path.slice(cut + NM.length);
}

/**
 * Every third-party package the lockfile installs. The root (`""`) and the workspace
 * directories are this repo's own code, and a `link: true` entry is a pointer to one of them;
 * what OSV can match are the registry packages under `node_modules/`.
 */
export function installed(lock: Lock): Installed[] {
  return Object.entries(lock.packages)
    .filter(([path, entry]) => path.includes(NM) && entry.link !== true && entry.version !== undefined)
    .map(([path, entry]) => ({ path, name: nameAt(path, entry), version: entry.version as string }));
}

/** Node's own lookup: try `<dir>/node_modules/<name>`, strip one `/node_modules/<segment>`, repeat to the root. */
function resolveFrom(paths: ReadonlySet<string>, from: string, name: string): string | undefined {
  for (let dir = from; ; ) {
    const candidate = dir === '' ? `${NM}${name}` : `${dir}/${NM}${name}`;
    if (paths.has(candidate)) return candidate;
    if (dir === '') return undefined;
    const cut = dir.lastIndexOf(`/${NM}`);
    dir = cut === -1 ? '' : dir.slice(0, cut);
  }
}

const declared = (e: Entry): string[] => [
  ...Object.keys(e.dependencies ?? {}),
  ...Object.keys(e.devDependencies ?? {}),
  ...Object.keys(e.optionalDependencies ?? {}),
  ...Object.keys(e.peerDependencies ?? {}),
];

/**
 * The shortest chain from this repo's own code (the root or a workspace) to `target`, as
 * `<workspace> > <dep> > … > <target name>`. Breadth-first over the lockfile's resolved
 * edges; a `link: true` entry is followed to the workspace it points at.
 */
export function pathTo(lock: Lock, target: string): string[] | undefined {
  const parent = parents(lock, target);
  if (!parent.has(target)) return undefined;
  const chain: string[] = [];
  for (let at: string | null | undefined = target; at !== null && at !== undefined; at = parent.get(at)) {
    // A workspace pointer and its target name the same package once.
    if (lock.packages[at].link !== true) chain.unshift(label(lock, at));
  }
  return chain;
}

/** Breadth-first from the root and every workspace, stopping at `target`: each reached entry's predecessor. */
function parents(lock: Lock, target: string): Map<string, string | null> {
  const paths = new Set(Object.keys(lock.packages));
  const starts = Object.keys(lock.packages).filter((p) => !p.includes(NM));
  const parent = new Map<string, string | null>(starts.map((s) => [s, null]));
  const queue = [...starts];
  for (let at = queue.shift(); at !== undefined && at !== target; at = queue.shift()) {
    for (const n of edges(lock, paths, at)) {
      if (parent.has(n)) continue;
      parent.set(n, at);
      queue.push(n);
    }
  }
  return parent;
}

/** The entries `at` resolves its dependencies to; a workspace pointer leads to its workspace. */
function edges(lock: Lock, paths: ReadonlySet<string>, at: string): string[] {
  const entry = lock.packages[at];
  if (entry.link === true) return entry.resolved !== undefined && paths.has(entry.resolved) ? [entry.resolved] : [];
  return declared(entry).flatMap((n) => resolveFrom(paths, at, n) ?? []);
}

function label(lock: Lock, at: string): string {
  if (at.includes(NM)) return nameAt(at, lock.packages[at]);
  return at === '' ? '<root>' : at;
}

/** Per request. OSV answers a 1000-package batch in about a second. */
const TIMEOUT_MS = 30_000;

interface BatchResult {
  results: { vulns?: { id: string; modified: string }[] }[];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Advisory ids per installed package, in input order. */
async function queryOsv(pkgs: readonly Installed[]): Promise<string[][]> {
  const slices: Installed[][] = [];
  for (let i = 0; i < pkgs.length; i += BATCH_SIZE) slices.push(pkgs.slice(i, i + BATCH_SIZE));
  const answers = await Promise.all(
    slices.map(async (slice) => {
      const body = { queries: slice.map((p) => ({ package: { name: p.name, ecosystem: 'npm' }, version: p.version })) };
      const { results } = await postJson<BatchResult>(BATCH_URL, body);
      if (results.length !== slice.length) throw new Error(`OSV answered ${results.length} of ${slice.length} queries`);
      return results.map((r) => (r.vulns ?? []).map((v) => v.id));
    }),
  );
  return answers.flat();
}

interface Advisory {
  id: string;
  summary?: string;
  withdrawn?: string;
  affected?: { package?: { name: string; ecosystem: string }; ranges?: { events: Record<string, string>[] }[] }[];
}

async function advisory(id: string): Promise<Advisory> {
  const res = await fetch(`${VULN_URL}${id}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${VULN_URL}${id}: HTTP ${res.status}`);
  return (await res.json()) as Advisory;
}

/** The `fixed` versions an advisory names for `name`, or `none` (with the last affected one) when OSV lists no fix. */
function fixedIn(a: Advisory, name: string): string {
  const events = (a.affected ?? [])
    .filter((x) => x.package?.ecosystem === 'npm' && x.package.name === name)
    .flatMap((x) => x.ranges ?? [])
    .flatMap((r) => r.events);
  const fixed = [...new Set(events.flatMap((e) => (e.fixed === undefined ? [] : [e.fixed])))];
  if (fixed.length > 0) return fixed.join(', ');
  const last = events.flatMap((e) => (e.last_affected === undefined ? [] : [e.last_affected]));
  return last.length > 0 ? `none (last affected ${last.join(', ')})` : 'none';
}

export interface Waiver {
  id: string;
  /** `YYYY-MM-DD`. */
  ignoreUntil?: string;
  reason?: string;
}

const WAIVER_LINE = /^(id|ignoreUntil|reason)\s*=\s*(?:"([^"]*)"|(\d{4}-\d{2}-\d{2})(?:T[\d:.Z+-]*)?)$/;

/**
 * The `[[IgnoredVulns]]` entries of an `osv-scanner.toml`. Only that table and its three
 * scalar keys are read — `id` and `reason` as strings, `ignoreUntil` as a date — which is all
 * the file may hold here; any other line is an error rather than a key silently skipped.
 */
export function parseWaivers(toml: string): Waiver[] {
  const waivers: Waiver[] = [];
  for (const [n, raw] of toml.split('\n').entries()) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line === '[[IgnoredVulns]]') {
      waivers.push({ id: '' });
      continue;
    }
    const m = WAIVER_LINE.exec(line);
    const current = waivers.at(-1);
    if (m === null || current === undefined) throw new Error(`osv-scanner.toml:${n + 1}: unsupported line: ${line}`);
    const value = m[2] ?? m[3];
    if (m[1] === 'id') current.id = value;
    else if (m[1] === 'ignoreUntil') current.ignoreUntil = value;
    else current.reason = value;
  }
  const incomplete = waivers.find((w) => w.id === '' || w.ignoreUntil === undefined || w.reason === undefined);
  if (incomplete !== undefined) throw new Error(`osv-scanner.toml: every [[IgnoredVulns]] needs id, ignoreUntil and reason: ${JSON.stringify(incomplete)}`);
  return waivers;
}

/** The waiver for `id` still in force on `today` (`YYYY-MM-DD`), if any. */
export function waived(waivers: readonly Waiver[], id: string, today: string): Waiver | undefined {
  return waivers.find((w) => w.id === id && (w.ignoreUntil ?? '') >= today);
}

interface Hit extends Installed {
  ids: string[];
}

/** Prints one vulnerable package; returns the advisory ids no waiver covers. */
function report(lock: Lock, h: Hit, advisories: ReadonlyMap<string, Advisory>, waiverFor: (id: string) => Waiver | undefined): string[] {
  const unwaived = h.ids.filter((id) => waiverFor(id) === undefined);
  console.log(`\n${unwaived.length === 0 ? '⚠' : '✖'} ${h.name}@${h.version}  (${h.path})`);
  console.log(`  via: ${(pathTo(lock, h.path) ?? ['<unreachable>']).join(' > ')}`);
  for (const id of h.ids) {
    const a = advisories.get(id) as Advisory;
    console.log(`  ${id}  fixed: ${fixedIn(a, h.name)}  ${a.summary ?? ''}`);
    const w = waiverFor(id);
    if (w !== undefined) console.log(`    waived until ${w.ignoreUntil} (osv-scanner.toml): ${w.reason}`);
  }
  return unwaived;
}

/** Waivers that match nothing any more; prints those and the expired ones. */
function auditWaivers(waivers: readonly Waiver[], found: ReadonlySet<string>, today: string): Waiver[] {
  const stale = waivers.filter((w) => !found.has(w.id));
  for (const w of stale) console.log(`\n✖ osv-scanner.toml waives ${w.id}, which nothing in the lockfile is affected by any more — remove the entry`);
  for (const w of waivers.filter((x) => found.has(x.id) && (x.ignoreUntil ?? '') < today)) {
    console.log(`\n✖ the waiver for ${w.id} expired on ${w.ignoreUntil} — fix it, or renew it with a reason`);
  }
  return stale;
}

async function main(): Promise<number> {
  const lockPath = resolve(process.argv[2] ?? join(ROOT, 'package-lock.json'));
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as Lock;
  const waiverPath = join(dirname(lockPath), 'osv-scanner.toml');
  const waivers = existsSync(waiverPath) ? parseWaivers(readFileSync(waiverPath, 'utf8')) : [];
  const [today] = new Date().toISOString().split('T');

  const pkgs = installed(lock);
  const ids = await queryOsv(pkgs);
  const fetched = await Promise.all([...new Set(ids.flat())].map(advisory));
  const advisories = new Map(fetched.map((a) => [a.id, a]));

  const hits = pkgs
    .map((p, i) => ({ ...p, ids: ids[i].filter((id) => advisories.get(id)?.withdrawn === undefined) }))
    .filter((p) => p.ids.length > 0);
  console.log(`osv-check: ${pkgs.length} installed packages in ${lockPath}`);
  const failing = new Set(hits.flatMap((h) => report(lock, h, advisories, (id) => waived(waivers, id, today))));
  const found = new Set(hits.flatMap((h) => h.ids));
  const stale = auditWaivers(waivers, found, today);

  console.log(`\nosv-check: ${failing.size} unwaived advisories, ${found.size - failing.size} waived, ${stale.length} stale waivers`);
  return failing.size === 0 && stale.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error);
      process.exit(2);
    },
  );
}
