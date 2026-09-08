/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Intent `first-adopter` — the dependents ranking script.
 *
 * Turns "someone might adopt the layer" into a named list: the top dependents of
 * commander and yargs, ranked by weekly downloads, so the wave 2 outreach opens ten
 * PRs against real CLIs instead of guessing. Three public sources, no keys:
 *
 *   1. ecosyste.ms lists a package's dependents with a monthly download figure. Its own
 *      `sort=downloads` view is capped at 100 rows and ranks stale numbers, so the script
 *      scans the whole feed — 79k rows for commander, 37k for yargs, 1,000 per page — and
 *      shortlists the top `--limit` by that figure. Measured 2026-09-08: the feed also
 *      omits most of the well-known users outright (jest-cli, svgo, webpack-cli,
 *      concurrently, nx, lerna, nyc, karma: 19 of 22 probed names absent), so
 *   2. ecosyste.ms's registry-wide listing sorted by downloads — which does paginate
 *      correctly — is swept for the top `--top` packages on npm, and every one of them is
 *      checked too. Ten pages reach ~4M downloads/month, so the head of each table is
 *      complete down to roughly 1M/week; below that, only what the feed lists.
 *   3. registry.npmjs.org `<name>/latest` confirms the dependency is direct at the
 *      latest release and gives the range and the repository. The feed counts
 *      devDependencies too, so this is the step that decides.
 *   4. api.npmjs.org gives last-week downloads (batched, 128 unscoped names per call).
 *
 * Score = log10(weekly downloads) × host weight. yargs weighs 1.5 to commander's 1.0:
 * yargs users carry the 211-issue backlog (.sdlc/research/competitor-open-issues.md),
 * so a yargs CLI has more to gain from the swap at the same download count.
 *
 * Usage:
 *   tsx scripts/rank-dependents.ts               # writes .sdlc/research/dependents.md
 *   tsx scripts/rank-dependents.ts --json        # also writes .sdlc/research/dependents.json
 *   tsx scripts/rank-dependents.ts --limit 200   # feed candidates per host (default 500)
 *   tsx scripts/rank-dependents.ts --top 5000    # npm packages swept overall (default 10000)
 *
 * If ecosyste.ms is down the run says so in the report and falls back to the hand-verified
 * list in .sdlc/research/dependents.seed.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_MD = path.join(REPO_ROOT, '.sdlc/research/dependents.md');
const OUT_JSON = path.join(REPO_ROOT, '.sdlc/research/dependents.json');
const SEED = path.join(REPO_ROOT, '.sdlc/research/dependents.seed.json');

const ECOSYSTEMS = 'https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages';
const REGISTRY = 'https://registry.npmjs.org';
const DOWNLOADS = 'https://api.npmjs.org/downloads/point/last-week';

const DEFAULT_LIMIT = 500;
const DEFAULT_SWEEP = 10_000;
const TOP = 50;
/** Registry lookups in flight at once. registry.npmjs.org is a CDN; eight is polite. */
const CONCURRENCY = 8;
/** The largest page ecosyste.ms serves; ~24MB of package metadata each. */
const PAGE_SIZE = 1000;
/** A million dependents. The loop needs a bound; the feed ends long before it. */
const MAX_PAGES = 1000;
/** api.npmjs.org caps a bulk downloads query at 128 names. */
const DOWNLOADS_BATCH = 128;
const PAGE_DELAY_MS = 250;
/** Measured 2026-09-08: single-name calls to api.npmjs.org 300ms apart still drew five 429s. */
const DOWNLOADS_DELAY_MS = 500;
const RETRY_DELAY_MS = 5000;
/** Three tries: the first, then 5s and 10s later. Seen 2026-09-08: one dropped connection took a whole 8-name chunk. */
const MAX_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 30_000;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
const DATE_LENGTH = 10;
const PREVIEW = 5;

export type Host = 'commander' | 'yargs';
export const HOSTS: readonly Host[] = ['commander', 'yargs'];
export const HOST_WEIGHT: Record<Host, number> = { commander: 1, yargs: 1.5 };

export interface Dependent {
  name: string;
  host: Host;
  weeklyDownloads: number;
  range: string;
  repository: string | null;
  score: number;
}

export interface Undetermined {
  name: string;
  reason: string;
}

export interface Report {
  generatedAt: string;
  commands: string[];
  source: 'ecosyste.ms' | 'seed';
  notes: string[];
  /** Dependents the ecosyste.ms feed listed per host (0 when the seed was used). */
  scanned: Record<Host, number>;
  candidates: Record<Host, number>;
  /** The registry-wide sweep: how many packages, and the monthly figure of the last one. */
  sweep: { count: number; floorMonthly: number };
  top: Record<Host, Dependent[]>;
  notDirect: string[];
  undetermined: Undetermined[];
}

// ── Pure functions (tested) ──────────────────────────────────────────────────

/** log10 of the weekly count, weighted by host. +1 so a package at zero scores zero. */
export function score(weeklyDownloads: number, host: Host): number {
  return Math.log10(Math.max(weeklyDownloads, 0) + 1) * HOST_WEIGHT[host];
}

/** Which hosts `dependencies` names directly, with the declared range. */
export function directHosts(dependencies: unknown): Array<[Host, string]> {
  if (typeof dependencies !== 'object' || dependencies === null) return [];
  const deps = dependencies as Record<string, unknown>;
  return HOSTS.filter((h) => typeof deps[h] === 'string').map((h) => [h, deps[h] as string]);
}

/** Normalise the registry's `repository` field to a browsable https URL, or null. */
export function repositoryUrl(repository: unknown): string | null {
  const raw = typeof repository === 'string' ? repository : (repository as { url?: unknown } | null)?.url;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // `#main` and friends: a branch fragment some packages append after `.git`.
  let url = raw.replace(/^git\+/, '').replace(/#.*$/, '').replace(/\.git$/, '');
  // git@github.com:owner/repo and git://github.com/owner/repo
  url = url.replace(/^git@([^:]+):/, 'https://$1/').replace(/^git:\/\//, 'https://');
  url = url.replace(/^ssh:\/\/git@/, 'https://');
  // GitHub shorthand: owner/repo (no scheme, one slash)
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`;
  return url.startsWith('https://') ? url : null;
}

export interface Candidate {
  name: string;
  /** ecosyste.ms's monthly figure: a pre-filter only, the weekly npm count is what ranks. */
  monthlyDownloads: number;
}

/** One ecosyste.ms page (packages or dependents: same row shape) as candidates. */
export function toCandidates(rows: readonly unknown[]): Candidate[] {
  const out: Candidate[] = [];
  for (const row of rows as Array<{ name?: unknown; downloads?: unknown }>) {
    if (typeof row.name === 'string') out.push({ name: row.name, monthlyDownloads: typeof row.downloads === 'number' ? row.downloads : 0 });
  }
  return out;
}

/** The `limit` most-downloaded candidate names, by the feed's own figure. */
export function shortlist(candidates: readonly Candidate[], limit: number): string[] {
  return [...candidates]
    .sort((a, b) => b.monthlyDownloads - a.monthlyDownloads || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((c) => c.name);
}

/** Split `items` into consecutive chunks of at most `size`. */
export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The top `n` rows for `host`, by score, ties broken by name for a stable file. */
export function rank(rows: readonly Dependent[], host: Host, n = TOP): Dependent[] {
  return rows
    .filter((r) => r.host === host)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, n);
}

/** Parse `<flag> N` from argv; the fallback when absent or not a positive integer. */
export function parseCount(argv: readonly string[], flag: string, fallback: number): number {
  const i = argv.indexOf(flag);
  const n = i === -1 ? Number.NaN : Number(argv[i + 1]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function renderMarkdown(report: Report): string {
  const lines: string[] = [];
  lines.push('# Top dependents of commander and yargs');
  lines.push('');
  lines.push(`Generated ${report.generatedAt} by \`scripts/rank-dependents.ts\` (intent \`first-adopter\`).`);
  lines.push('');
  lines.push('```sh');
  for (const c of report.commands) lines.push(c);
  lines.push('```');
  lines.push('');
  const pool =
    report.source === 'seed'
      ? 'the hand-verified seed list'
      : `the ecosyste.ms dependents feed (${report.scanned.commander.toLocaleString('en-US')} commander and ${report.scanned.yargs.toLocaleString('en-US')} yargs rows scanned, shortlisted by its monthly download figure)`;
  const sweep =
    report.sweep.count === 0
      ? ''
      : ` The feed omits many well-known users outright, so the ${report.sweep.count.toLocaleString('en-US')} most-downloaded packages on npm (floor: ${report.sweep.floorMonthly.toLocaleString('en-US')} downloads/month) were checked as well: the head of each table is complete down to roughly that rate, and below it only what the feed lists.`;
  lines.push(
    `Candidates: ${report.candidates.commander} for commander, ${report.candidates.yargs} for yargs, from ${pool}.${sweep} Each candidate was confirmed against \`registry.npmjs.org/<name>/latest\`: only a package that lists the host under \`dependencies\` at its latest release is kept. Weekly downloads are \`api.npmjs.org/downloads/point/last-week\`.`,
  );
  lines.push('');
  lines.push(
    `Score = log10(weekly downloads) × host weight (commander ${HOST_WEIGHT.commander}, yargs ${HOST_WEIGHT.yargs}). yargs users carry the larger open backlog (see \`competitor-open-issues.md\`), so they weigh more at equal downloads.`,
  );
  lines.push('');
  for (const note of report.notes) {
    lines.push(`> ${note}`);
    lines.push('');
  }
  for (const host of HOSTS) {
    lines.push(`## ${host} — top ${report.top[host].length}`);
    lines.push('');
    lines.push('| # | Package | Weekly downloads | Host | Range | Repository | Score |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    report.top[host].forEach((r, i) => {
      const repo = r.repository ? `<${r.repository}>` : '—';
      lines.push(
        `| ${i + 1} | \`${r.name}\` | ${r.weeklyDownloads.toLocaleString('en-US')} | ${r.host} | \`${r.range}\` | ${repo} | ${r.score.toFixed(2)} |`,
      );
    });
    lines.push('');
  }
  lines.push('## Could not determine');
  lines.push('');
  lines.push(
    `${report.notDirect.length} candidate(s) listed by the source do not name commander or yargs under \`dependencies\` at their latest release (devDependencies, peer, or dropped) and were excluded. ${report.undetermined.length} could not be checked:`,
  );
  lines.push('');
  if (report.undetermined.length === 0) lines.push('- none');
  for (const u of report.undetermined) lines.push(`- \`${u.name}\`: ${u.reason}`);
  lines.push('');
  return lines.join('\n');
}

// ── Fetching ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function get(url: string): Promise<Response> {
  return await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: 'application/json' } });
}
const transient = (res: Response) => res.status === HTTP_TOO_MANY_REQUESTS || res.status >= HTTP_SERVER_ERROR;

/**
 * GET JSON with a timeout. A 404 resolves to null. A 429, a 5xx or a dropped connection is
 * tried again, twice, with a growing pause; any other status gives up at once.
 */
async function fetchJson(url: string): Promise<unknown> {
  let reason = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // ponytail: a fixed three tries with a linear pause; a queue would be gold-plating.
    if (attempt > 1) await sleep(RETRY_DELAY_MS * (attempt - 1));
    let res: Response;
    try {
      res = await get(url);
    } catch (e) {
      reason = message(e);
      continue;
    }
    if (res.ok) return await res.json();
    if (res.status === HTTP_NOT_FOUND) return null;
    reason = `HTTP ${res.status}`;
    if (!transient(res)) break;
  }
  throw new Error(`${url} → ${reason}`);
}

/** Every row of an ecosyste.ms listing, page by page, until the feed ends or `stopAt` rows. */
async function scanListing(label: string, url: string, stopAt: number): Promise<Candidate[]> {
  const all: Candidate[] = [];
  for (let page = 1; page <= MAX_PAGES && all.length < stopAt; page += 1) {
    const body = await fetchJson(`${url}per_page=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(body)) break;
    all.push(...toCandidates(body));
    console.warn(`  ${label}: page ${page}, ${all.length} rows`);
    if (body.length < PAGE_SIZE) break;
    // ponytail: sequential, one page in flight, a pause between — ~130 pages, ~8 minutes.
    // Four workers would cut it to two; do that if the feeds double.
    await sleep(PAGE_DELAY_MS);
  }
  return all.slice(0, stopAt);
}

async function scanDependents(host: Host): Promise<Candidate[]> {
  return await scanListing(host, `${ECOSYSTEMS}/${host}/dependent_packages?`, Number.POSITIVE_INFINITY);
}

async function sweepTopPackages(n: number): Promise<Candidate[]> {
  return await scanListing('npm top', `${ECOSYSTEMS}?sort=downloads&order=desc&`, n);
}

interface Latest {
  dependencies: unknown;
  repository: unknown;
}

async function fetchLatest(name: string): Promise<Latest | null> {
  const body = (await fetchJson(`${REGISTRY}/${name}/latest`)) as Latest | null;
  return body;
}

type DownloadsBody = Record<string, { downloads?: number } | null> | { downloads?: number } | null;

/**
 * Weekly downloads by name. Unscoped names go 128 to a request; the bulk endpoint
 * rejects scoped names, so each of those is its own call. A request that fails leaves
 * its names at null and adds one note; the rest of the run continues.
 */
async function fetchWeeklyDownloads(names: readonly string[], notes: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const scoped = names.filter((n) => n.startsWith('@')).map((n) => [n]);
  const requests = [...batches(names.filter((n) => !n.startsWith('@')), DOWNLOADS_BATCH), ...scoped];
  let failed = 0;
  for (const group of requests) {
    let body: DownloadsBody = null;
    try {
      body = (await fetchJson(`${DOWNLOADS}/${group.join(',')}`)) as DownloadsBody;
    } catch (e) {
      failed += 1;
      console.warn(`  ⚠️ ${message(e)}`);
    }
    for (const n of group) {
      // One name — scoped, or the tail of the batching — comes back unkeyed.
      const entry = group.length === 1 ? (body as { downloads?: number } | null) : (body as Record<string, { downloads?: number } | null> | null)?.[n];
      out.set(n, typeof entry?.downloads === 'number' ? entry.downloads : null);
    }
    // ponytail: a pause between calls is what keeps api.npmjs.org from answering 429.
    await sleep(DOWNLOADS_DELAY_MS);
  }
  if (failed > 0) notes.push(`api.npmjs.org failed ${failed} request(s) even after a retry; packages without a count are listed below.`);
  return out;
}

interface Pool {
  source: Report['source'];
  scanned: Record<Host, number>;
  candidates: Record<Host, string[]>;
  sweep: Report['sweep'];
  /** Every name to check: the shortlists plus the sweep, deduplicated. */
  names: string[];
}

/** The feed shortlists plus the registry-wide sweep, or the seed list (with a note) when ecosyste.ms is down. */
async function loadCandidates(limit: number, top: number, notes: string[]): Promise<Pool> {
  try {
    const commander = await scanDependents('commander');
    const yargs = await scanDependents('yargs');
    const swept = await sweepTopPackages(top);
    const candidates = { commander: shortlist(commander, limit), yargs: shortlist(yargs, limit) };
    return {
      source: 'ecosyste.ms',
      scanned: { commander: commander.length, yargs: yargs.length },
      candidates,
      sweep: { count: swept.length, floorMonthly: swept.at(-1)?.monthlyDownloads ?? 0 },
      names: [...new Set([...candidates.commander, ...candidates.yargs, ...swept.map((c) => c.name)])],
    };
  } catch (e) {
    const seed = JSON.parse(fs.readFileSync(SEED, 'utf8')) as Record<Host, string[]>;
    const candidates = { commander: seed.commander, yargs: seed.yargs };
    notes.push(
      `ecosyste.ms was unavailable (${message(e)}); this run used the hand-verified seed list in \`dependents.seed.json\` (${candidates.commander.length} + ${candidates.yargs.length} names).`,
    );
    console.warn(`  ⚠️ ${notes.at(-1)}`);
    return {
      source: 'seed',
      scanned: { commander: 0, yargs: 0 },
      candidates,
      sweep: { count: 0, floorMonthly: 0 },
      names: [...new Set([...candidates.commander, ...candidates.yargs])],
    };
  }
}

type Confirmed = Omit<Dependent, 'weeklyDownloads' | 'score'>;

interface Probe {
  name: string;
  latest: Latest | null;
  error?: string;
}

async function probe(name: string): Promise<Probe> {
  try {
    return { name, latest: await fetchLatest(name) };
  } catch (e) {
    return { name, latest: null, error: message(e) };
  }
}

interface Verdicts {
  confirmed: Confirmed[];
  notDirect: string[];
  undetermined: Undetermined[];
}

/** File one probe under the verdict it earned. */
function record({ name, latest, error }: Probe, v: Verdicts): void {
  if (error !== undefined) {
    v.undetermined.push({ name, reason: error });
    return;
  }
  if (latest === null) {
    v.undetermined.push({ name, reason: 'no latest release on registry.npmjs.org (unpublished or deprecated)' });
    return;
  }
  const hosts = directHosts(latest.dependencies);
  if (hosts.length === 0) v.notDirect.push(name);
  for (const [host, range] of hosts) v.confirmed.push({ name, host, range, repository: repositoryUrl(latest.repository) });
}

/** Keep the candidates whose latest release names a host under `dependencies`. */
async function confirmDirect(names: readonly string[]): Promise<Verdicts> {
  const v: Verdicts = { confirmed: [], notDirect: [], undetermined: [] };
  let done = 0;
  for (const chunk of batches(names, CONCURRENCY)) {
    // ponytail: the list passed 2k (it is ~11k), so eight lookups go together; still no queue.
    for (const p of await Promise.all(chunk.map(probe))) record(p, v);
    done += chunk.length;
    if (done % PAGE_SIZE === 0) console.warn(`  registry: ${done}/${names.length} checked, ${v.confirmed.length} direct so far`);
  }
  v.notDirect.sort();
  return v;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limit = parseCount(argv, '--limit', DEFAULT_LIMIT);
  const top = parseCount(argv, '--top', DEFAULT_SWEEP);
  const writeJson = argv.includes('--json');
  const generatedAt = new Date().toISOString().slice(0, DATE_LENGTH);
  const notes: string[] = [];

  console.warn(`\n📦 Ranking dependents (limit ${limit} per host, top ${top} npm packages)\n`);

  const { source, scanned, candidates, sweep, names } = await loadCandidates(limit, top, notes);
  console.warn(`  ${names.length} unique candidates; confirming against the registry`);

  const { confirmed, notDirect, undetermined } = await confirmDirect(names);
  console.warn(`  ${confirmed.length} direct dependencies, ${notDirect.length} not direct, ${undetermined.length} undetermined`);

  const downloads = await fetchWeeklyDownloads([...new Set(confirmed.map((c) => c.name))], notes);

  const rows: Dependent[] = [];
  for (const c of confirmed) {
    const weeklyDownloads = downloads.get(c.name);
    if (typeof weeklyDownloads === 'number') rows.push({ ...c, weeklyDownloads, score: score(weeklyDownloads, c.host) });
    else undetermined.push({ name: c.name, reason: 'no weekly download count from api.npmjs.org' });
  }

  const report: Report = {
    generatedAt,
    commands: [`npm run rank:dependents -- --limit ${limit} --top ${top}${writeJson ? ' --json' : ''}`],
    source,
    notes,
    scanned,
    candidates: { commander: candidates.commander.length, yargs: candidates.yargs.length },
    sweep,
    top: { commander: rank(rows, 'commander'), yargs: rank(rows, 'yargs') },
    notDirect,
    undetermined,
  };

  fs.writeFileSync(OUT_MD, renderMarkdown(report));
  console.warn(`  📝 ${path.relative(REPO_ROOT, OUT_MD)}`);
  if (writeJson) {
    fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
    console.warn(`  📝 ${path.relative(REPO_ROOT, OUT_JSON)}`);
  }
  for (const host of HOSTS) {
    console.warn(`\n  ${host} top 5:`);
    for (const r of report.top[host].slice(0, PREVIEW)) {
      console.warn(`    ${r.name}  ${r.weeklyDownloads.toLocaleString('en-US')}/wk  ${r.range}`);
    }
  }
  console.warn('');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
