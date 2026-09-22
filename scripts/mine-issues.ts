/**
 * Pulls each incumbent's demand signal into `.sdlc/intents/<slug>/issues.md` — PLAN 4.1.
 *
 * ## The measurement that rewrote this step
 *
 * The plan asked for "the top 20 open issues by reactions". Measured across nine
 * incumbents on 2026-09-13, that is almost nothing: **chalk 0 open, ora 1, ansi-escapes 1,
 * dotenv 1.** These maintainers close aggressively, so an empty open tracker measures the
 * maintainer's habits and not the demand.
 *
 * The signal is in the **closed** issues, and a loud one closed is *stronger* evidence than
 * one still open: `dotenv#89`, "Importing dotenv in ES6", carries 165 reactions and is
 * closed. The incumbent has already decided. Nobody is going to ship it there, so it is an
 * opening rather than a race. The floor moved with it: `reactions:>=50` yielded **5**
 * issues across nine repos, `>=10` yields **86**.
 *
 * So: two `gh api search/issues` queries per incumbent — `is:issue is:open` and
 * `is:issue is:closed reactions:>=10`, both `sort=reactions order=desc`.
 *
 * ## Rules it runs under
 *
 * - **`gh` with the token already there** (PLAN decision D7). No new PAT, no unauthenticated
 *   call. `gh auth status` has to be green before this runs.
 * - **GitHub's search API allows 30 requests a minute.** One second between calls would ask
 *   for sixty, so the pause is 2.1s and a 403 backs off and retries rather than recording
 *   the outage as silence.
 * - **An empty file is a measurement, not a failure.** An incumbent with nothing gets a row
 *   saying `no demand signal (n open, n >=10 closed)`; a query that could not run at all
 *   gets `Not measured:` and the reason, because an outage must never read as "no demand".
 *
 * ## Usage
 *
 *     npx tsx scripts/mine-issues.ts              # all nine layers
 *     npx tsx scripts/mine-issues.ts seniority    # one, by package or intent slug
 *     npx tsx scripts/mine-issues.ts --delay 3000
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  citations,
  fromSearchItem,
  isIssue,
  type IssueState,
  type Layer,
  LAYERS,
  type MinedIssue,
  REACTION_FLOOR,
  renderIssuesPage,
  searchQuery,
  type SearchItem,
  type Section,
  TOP_N,
  // eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6, scripts/oracle-import-lock.test.ts)
} from '../packages/compat-oracle/src/demand.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const INTENTS = join(REPO_ROOT, '.sdlc', 'intents');
const PACKAGES = join(REPO_ROOT, 'packages');
/** Length of an ISO date, `YYYY-MM-DD`. */
const ISO_DATE = 10;
/** 30 searches a minute is one every two seconds; 2.1 leaves room for clock skew. */
const DEFAULT_DELAY_MS = 2100;
const RETRIES = 3;
const BACKOFF_MS = 30_000;
/** One 32-bit slot is all `Atomics.wait` needs to block on. */
const SLEEP_SLOT_BYTES = 4;
/** A tracker with a thousand issues answers in well under this; 8 MiB is ample. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
/** Width of the incumbent column in the progress lines. */
const NAME_COLUMN = 14;

/** The npm package behind a name we call an incumbent by, where the two differ. */
const NPM_NAME: Record<string, string> = {
  // We call the prompts library `clack`; `clack` on npm is an unrelated 0.1.0 placeholder.
  clack: '@clack/prompts',
};

const sleep = (ms: number): void => {
  // Deliberately blocking: the whole script is one serialised walk under a rate limit, and
  // an async pause here would buy nothing but a reason for two queries to overlap.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(SLEEP_SLOT_BYTES)), 0, 0, ms);
};

const OWNER_REPO = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/;

/**
 * `owner/name` from the package's own registry metadata, so the repo behind an incumbent is
 * read rather than kept in a table here that would rot. All twenty-five resolve; a name
 * that stops resolving becomes a `Not measured:` row instead of a silent omission.
 */
function repoOf(incumbent: string): string | undefined {
  const pkg = NPM_NAME[incumbent] ?? incumbent;
  try {
    const url = execFileSync('npm', ['view', pkg, 'repository.url'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const found = OWNER_REPO.exec(url.split('\n').at(-1) ?? '');
    return found === null ? undefined : `${found[1]}/${found[2]}`;
  } catch {
    return undefined;
  }
}

interface SearchResponse {
  total_count?: number;
  items?: SearchItem[];
}

/** One search, with the retry that keeps a rate-limit from being recorded as "no demand". */
function search(query: string): MinedIssue[] {
  let lastError = 'unknown';
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const out = execFileSync(
        'gh',
        ['api', '-X', 'GET', 'search/issues', '-f', `q=${query}`, '-f', 'sort=reactions', '-f', 'order=desc', '-f', `per_page=${TOP_N}`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_OUTPUT_BYTES },
      );
      const body = JSON.parse(out) as SearchResponse;
      return (body.items ?? []).filter(isIssue).map(fromSearchItem);
    } catch (error) {
      lastError = error instanceof Error ? error.message.split('\n')[0] ?? 'failed' : 'failed';
      sleep(BACKOFF_MS);
    }
  }
  throw new Error(`search failed after ${RETRIES} attempts: ${lastError}`);
}

function mine(incumbent: string, delay: number): Section {
  const repo = repoOf(incumbent);
  if (repo === undefined) return { incumbent, repo: null, open: [], closed: [], error: `no repository declared on npm for "${incumbent}"` };
  const section: Section = { incumbent, repo, open: [], closed: [] };
  try {
    for (const state of ['open', 'closed'] as IssueState[]) {
      const found = search(searchQuery(repo, state));
      if (state === 'open') section.open = found;
      else section.closed = found;
      sleep(delay);
    }
  } catch (error) {
    section.error = `${repo}: ${error instanceof Error ? error.message : String(error)}`;
  }
  return section;
}

/** Every text file under a package, for the `<incumbent>#<number>` citations in them. */
function sourcesOf(pkg: string, at = join(PACKAGES, pkg), found: string[] = []): string[] {
  if (!existsSync(at)) return found;
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const next = join(at, entry.name);
    if (entry.isDirectory()) sourcesOf(pkg, next, found);
    else if (/\.(m?ts|m?js|json|md)$/.test(entry.name)) found.push(readFileSync(next, 'utf8'));
  }
  return found;
}

function run(layer: Layer, delay: number): Section[] {
  const cited = citations(sourcesOf(layer.pkg));
  const sections = layer.incumbents.map((i) => mine(i, delay));
  const dir = join(INTENTS, layer.intent);
  mkdirSync(dir, { recursive: true });
  const meta = { measured: new Date().toISOString().slice(0, ISO_DATE), citationCount: cited.size };
  writeFileSync(join(dir, 'issues.md'), renderIssuesPage(layer, sections, meta, cited));
  for (const s of sections) {
    const note = s.error === undefined ? `${s.open.length} open · ${s.closed.length} closed >=${REACTION_FLOOR}` : `NOT MEASURED — ${s.error}`;
    process.stdout.write(`  ${s.incumbent.padEnd(NAME_COLUMN)} ${note}\n`);
  }
  return sections;
}

function main(argv: string[]): number {
  let delay = DEFAULT_DELAY_MS;
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--delay') delay = Number(argv[++i]);
    else names.push(argv[i] ?? '');
  }
  const layers = names.length === 0 ? LAYERS : LAYERS.filter((l) => names.includes(l.pkg) || names.includes(l.intent));
  if (layers.length === 0) {
    process.stderr.write(`no layer matched — known: ${LAYERS.map((l) => l.pkg).join(', ')}\n`);
    return 1;
  }
  let failed = 0;
  for (const layer of layers) {
    process.stdout.write(`${layer.pkg} (.sdlc/intents/${layer.intent}/issues.md)\n`);
    failed += run(layer, delay).filter((s) => s.error !== undefined).length;
  }
  if (failed > 0) process.stderr.write(`\n${failed} incumbent(s) could not be measured — see the "Not measured" rows\n`);
  return failed > 0 ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
