/**
 * The specification pass — `spec-release-watch` R1 to R5 and R7.
 *
 * `--upstream` watches the hosts we are compatible with and `--competitors` the packages we
 * are measured against. Neither can see a *specification* publish: a new `openapi-typescript`
 * is an npm release, a new OpenAPI is a GitHub one. This is the third pass on the same daily
 * job: a package names the specifications it reads in `packages/<pkg>/specs.json`, and this
 * module asks GitHub for each repo's releases (or tags), and reports every version newer than
 * the one recorded in the entry's `seen`.
 *
 * Intent constraint: the list is data the package owns, so a format added to `apicontract`
 * adds its watch in the same PR, and a deleted package takes its watch with it.
 *
 * Two modes, deliberately separated, as in `watch.ts`:
 *
 *   - `check()` is **read-only** and is what CI runs. The workflow opens the issues.
 *   - `record()` **writes** `seen` back into `specs.json`. A person runs it and commits the
 *     diff; a job that rewrote the baseline it is checking against could never report a change.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Kind = 'spec' | 'test-suite';
export type Source = 'releases' | 'tags';

export interface SpecSeen {
  version: string;
  /** The ISO date the version was recorded, not the date it was released. */
  at: string;
}

export interface Spec {
  /** What a person calls it: `OpenAPI`, `MCP`. It leads the issue title. */
  name: string;
  /** `owner/name` on github.com. */
  repo: string;
  kind?: Kind;
  source: Source;
  /**
   * A regular expression a release's tag must match to count. Its first group, when it has
   * one, is the version; without a group the whole match is. It is how `ce@v1.0.2` becomes
   * `1.0.2` and how a repo's unrelated tags are left out.
   */
  tagPattern?: string;
  /** The versions `apicontract`'s adapters accept, as written for a person: `3.0`, `draft-07`. */
  reads: string[];
  /**
   * What reads the format: the keys of `builtinAdapters` in `apicontract/src/inputs.ts`, or a
   * file name in `src/` for a reader that is not an input adapter. Empty for a format nothing
   * reads yet. It is how an issue names the file to look at (R4) and how R6 finds the entry.
   */
  adapters?: string[];
  seen?: SpecSeen;
}

export interface SpecFile {
  /** The workspace package that owns the list. */
  owner: string;
  file: string;
  specs: Spec[];
}

const REPO = /^[\w.-]+\/[\w.-]+$/;
const KINDS: readonly string[] = ['spec', 'test-suite'];
const SOURCES: readonly string[] = ['releases', 'tags'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

type Fields = Record<string, unknown>;

/** A `tagPattern`, compiled. It is a committed field of a package's own specs.json, never input. */
function compile(pattern: string): RegExp {
  // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- the pattern is read from a committed specs.json and checked when it is read
  return new RegExp(pattern, 'u');
}

const show = (value: unknown): string => JSON.stringify(value);

const nameProblem = (e: Fields): string | null =>
  typeof e.name === 'string' && e.name !== '' ? null : 'it has no `name`. fix: name the specification as a person calls it, e.g. "OpenAPI"';

const repoProblem = (e: Fields): string | null =>
  typeof e.repo === 'string' && REPO.test(e.repo) ? null : `\`repo\` ${show(e.repo)} is not owner/name. fix: write it as on github.com, e.g. "OAI/OpenAPI-Specification"`;

const sourceProblem = (e: Fields): string | null =>
  typeof e.source === 'string' && SOURCES.includes(e.source) ? null : `\`source\` ${show(e.source)} is not 'releases' or 'tags'. fix: use 'releases' when the repo publishes GitHub releases, else 'tags'`;

const kindProblem = (e: Fields): string | null =>
  e.kind === undefined || (typeof e.kind === 'string' && KINDS.includes(e.kind)) ? null : `\`kind\` ${show(e.kind)} is not 'spec' or 'test-suite'. fix: omit it for a specification`;

const readsProblem = (e: Fields): string | null =>
  isStrings(e.reads) ? null : '`reads` is not a list of strings. fix: list the versions the adapters accept, or [] when nothing reads the format yet';

const adaptersProblem = (e: Fields): string | null =>
  e.adapters === undefined || isStrings(e.adapters) ? null : '`adapters` is not a list of strings. fix: list the adapter names from apicontract/src/inputs.ts';

function patternProblem(e: Fields): string | null {
  if (e.tagPattern === undefined) return null;
  if (typeof e.tagPattern !== 'string') return '`tagPattern` is not a string. fix: write a regular expression whose first group is the version';
  try {
    compile(e.tagPattern);
    return null;
  } catch {
    return `\`tagPattern\` ${show(e.tagPattern)} is not a regular expression. fix: correct it; its first group is the version`;
  }
}

const seenProblem = (e: Fields): string | null => {
  const seen = e.seen;
  if (seen === undefined || (isRecord(seen) && typeof seen.version === 'string' && typeof seen.at === 'string')) return null;
  return '`seen` is not { version, at }. fix: delete it and run `compat-oracle --specs --record`';
};

const CHECKS = [nameProblem, repoProblem, sourceProblem, kindProblem, readsProblem, adaptersProblem, patternProblem, seenProblem];

/** One entry of a `specs.json`, or the reason it is not one. The reason ends in a `fix:` line. */
function problemWith(entry: unknown): string | null {
  if (!isRecord(entry)) return 'it is not an object. fix: write each entry as { name, repo, source, reads }';
  for (const check of CHECKS) {
    const problem = check(entry);
    if (problem !== null) return problem;
  }
  return null;
}

/** Validate a parsed `specs.json`. Throws, naming the file and the entry, with a `fix:` line. */
export function parseSpecs(raw: unknown, where: string): Spec[] {
  if (!Array.isArray(raw)) throw new Error(`${where}: it is not an array. fix: make the file a JSON array of { name, repo, source, reads } entries`);
  raw.forEach((entry, index) => {
    const problem = problemWith(entry);
    if (problem !== null) throw new Error(`${where}: entry ${index + 1}: ${problem}`);
  });
  return raw as Spec[];
}

/** Every package under `packages/` that declares specifications, in directory order. */
export function readSpecFiles(packagesDir: string): SpecFile[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(packagesDir, e.name, 'specs.json')))
    .map((e) => {
      const file = join(packagesDir, e.name, 'specs.json');
      return { owner: e.name, file, specs: parseSpecs(JSON.parse(readFileSync(file).toString()) as unknown, `packages/${e.name}/specs.json`) };
    })
    .sort((a, b) => a.owner.localeCompare(b.owner));
}

// ── versions, by each specification's own scheme ────────────────────────────────────────────

/**
 * `semver` (`3.1.0`, `v1.0-rc1`), `date` (MCP's `2025-11-25`) or `month` (GraphQL's
 * `September2025`). Versions of different schemes are never compared: that would order an
 * ISO date against a minor number.
 */
export type Scheme = 'semver' | 'date' | 'month';

export interface Version {
  scheme: Scheme;
  parts: number[];
  /** A release candidate's or draft's suffix, which sorts before the release it leads to. */
  pre: string | null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:-([0-9A-Za-z.-]+))?$/;
const SEMVER = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/;
const MONTH = /^([A-Za-z]+)(\d{4})$/;

export function parseVersion(text: string): Version | null {
  const date = DATE.exec(text);
  if (date !== null) return { scheme: 'date', parts: [Number(date[1]), Number(date[2]), Number(date[3])], pre: date[4] ?? null };
  const semver = SEMVER.exec(text);
  if (semver !== null) return { scheme: 'semver', parts: [Number(semver[1]), Number(semver[2] ?? 0), Number(semver[3] ?? 0)], pre: semver[4] ?? null };
  const month = MONTH.exec(text);
  if (month === null) return null;
  const index = MONTHS.indexOf((month[1] as string).toLowerCase());
  return index === -1 ? null : { scheme: 'month', parts: [Number(month[2]), index], pre: null };
}

/** `rc2` against `rc10`: runs of digits compare as numbers, anything else as text. */
const tokens = (text: string): string[] => [...text.matchAll(/\d+|\D+/g)].map((m) => m[0]);

function comparePre(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const x = left[i];
    const y = right[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const [nx, ny] = [Number(x), Number(y)];
    const order = Number.isNaN(nx) || Number.isNaN(ny) ? x.localeCompare(y) : nx - ny;
    if (order !== 0) return order;
  }
  return 0;
}

/** Negative when `a` is older. Only meaningful for two versions of one scheme. */
export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < a.parts.length; i += 1) {
    const order = (a.parts[i] as number) - (b.parts[i] as number);
    if (order !== 0) return order;
  }
  if (a.pre === b.pre) return 0;
  // A release is newer than its own candidates, so `3.1.0` after `3.1.0-rc1` is still news.
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return comparePre(a.pre, b.pre);
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// ── GitHub ──────────────────────────────────────────────────────────────────────────────────

/** One published version of a specification. */
export interface Published {
  /** As the pattern extracted it: `3.1.0`, not `v3.1.0`. This is what `seen` holds. */
  version: string;
  parsed: Version;
  prerelease: boolean;
  url: string;
}

/** What the watch needs of `fetch`; the real one satisfies it, and a test hands in a fixture. */
export type Get = (url: string, init: { headers: Record<string, string> }) => Promise<Pick<Response, 'ok' | 'status' | 'json' | 'headers'>>;

const liveGet: Get = (url, init) => fetch(url, init);

const HEADERS = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'burgee-compat-oracle' };

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY = 429;

/** Why a repo could not be read. Every one says it is unchecked, and ends in a `fix:`. */
function failure(spec: Spec, status: number, remaining: string | null, token: boolean): string {
  if (status === HTTP_FORBIDDEN || status === HTTP_TOO_MANY) {
    const limited = remaining === '0' ? ', rate limit exhausted' : '';
    const fix = token ? 'wait for the limit to reset, or check the token can read public repositories' : 'set GITHUB_TOKEN so the request is authenticated';
    return `GitHub refused ${spec.repo} (HTTP ${status}${limited}); it is unchecked, not up to date. fix: ${fix}`;
  }
  if (status === HTTP_NOT_FOUND) return `${spec.repo} was not found (HTTP 404); it is unchecked, not up to date. fix: the repository was renamed, moved or made private; correct \`repo\` in specs.json`;
  return `GitHub answered HTTP ${status} for ${spec.repo}; it is unchecked, not up to date. fix: re-run the job, and if it persists check \`repo\` in specs.json`;
}

/** The tag a version was published under, and the page that shows it. */
interface Raw {
  tag: string;
  prerelease: boolean;
  url: string;
}

const rawOf = (spec: Spec, item: unknown): Raw | null => {
  if (!isRecord(item)) return null;
  if (spec.source === 'releases') {
    if (typeof item.tag_name !== 'string' || item.draft === true) return null;
    const url = typeof item.html_url === 'string' ? item.html_url : `https://github.com/${spec.repo}/releases/tag/${item.tag_name}`;
    return { tag: item.tag_name, prerelease: item.prerelease === true, url };
  }
  if (typeof item.name !== 'string') return null;
  return { tag: item.name, prerelease: false, url: `https://github.com/${spec.repo}/releases/tag/${item.name}` };
};

/** `v3.1.0` is `3.1.0`; a `v` that is not followed by a digit belongs to the name. */
const bare = (text: string): string => text.replace(/^v(?=\d)/, '');

/** The version in a tag: the pattern's first group, else the whole tag without a leading `v`. */
function versionOf(spec: Spec, tag: string): string | null {
  if (spec.tagPattern === undefined) return bare(tag);
  const match = compile(spec.tagPattern).exec(tag);
  return match === null ? null : bare(match[1] ?? match[0]);
}

/** One item of the list, or null when it is not a version of this spec: junk, a draft, another tag. */
function publishedOf(spec: Spec, item: unknown): Published | null {
  const raw = rawOf(spec, item);
  if (raw === null) return null;
  const version = versionOf(spec, raw.tag);
  if (version === null) return null;
  const parsed = parseVersion(version);
  if (parsed === null) return null;
  // R3: GitHub's own flag, or a suffix on the version (`-rc1`, `-draft`, `-beta.2`, `-next-major`).
  // A suffix is how every one of these specs spells a candidate, so it is not listed by name.
  return { version, parsed, prerelease: raw.prerelease || parsed.pre !== null, url: raw.url };
}

/** The list GitHub answered with. Throws, with a `fix:` line, for anything but a list. */
async function request(spec: Spec, token: string | undefined, get: Get): Promise<unknown[]> {
  const path = spec.source === 'releases' ? 'releases?per_page=20' : 'tags?per_page=50';
  const headers: Record<string, string> = token === undefined || token === '' ? { ...HEADERS } : { ...HEADERS, Authorization: `Bearer ${token}` };
  let response;
  try {
    response = await get(`https://api.github.com/repos/${spec.repo}/${path}`, { headers });
  } catch (error) {
    throw new Error(`could not reach GitHub for ${spec.repo}: ${message(error)}; it is unchecked, not up to date. fix: re-run the job`);
  }
  if (!response.ok) {
    throw new Error(`${failure(spec, response.status, response.headers.get('x-ratelimit-remaining'), headers.Authorization !== undefined)}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error(`GitHub answered ${spec.repo} with something that is not a list; it is unchecked, not up to date. fix: re-run the job`);
  return body;
}

/**
 * Every version the repo has published, newest first. Throws, with a `fix:` line, when the repo
 * cannot be read or has nothing that looks like a version: R7 says that is a hole in the watch,
 * so it must never come back as an empty list that reads as "up to date".
 */
export async function fetchPublished(spec: Spec, token: string | undefined, get: Get = liveGet): Promise<Published[]> {
  const body = await request(spec, token, get);
  const published = body.flatMap((item) => publishedOf(spec, item) ?? []);
  if (published.length === 0) {
    throw new Error(`no version-shaped ${spec.source} among the ${body.length} ${spec.repo} returned; it is unchecked, not up to date. fix: set \`tagPattern\` in specs.json so its first group is the version`);
  }
  return published;
}

/** The versions in the scheme `seen` is in, or in the newest-listed one when nothing is recorded. */
const inScheme = (published: Published[], scheme: Scheme | undefined): Published[] => {
  const wanted = scheme ?? (published[0] as Published).parsed.scheme;
  return published.filter((p) => p.parsed.scheme === wanted);
};

const ascending = (a: Published, b: Published): number => compareVersions(a.parsed, b.parsed);

// ── the pass ────────────────────────────────────────────────────────────────────────────────

export interface SpecUpdate {
  name: string;
  repo: string;
  kind: Kind;
  from: string;
  to: string;
  prerelease: boolean;
  url: string;
  title: string;
  report: string;
}

export interface SpecsResult {
  updates: SpecUpdate[];
  /** Entries with no `seen` yet — recorded by `--record`, never reported (R5). */
  unrecorded: { name: string; newest: string }[];
  /** Repos that could not be read (R7): not up to date, not known. */
  unchecked: { name: string; repo: string; error: string }[];
}

/** R4's title. It is the dedupe key the workflow searches for, so it is one string, built once. */
export const titleOf = (spec: Spec, version: string): string =>
  `${spec.kind === 'test-suite' ? 'suite' : 'spec'}: ${spec.name} ${version} released (we read ${spec.reads.length === 0 ? 'nothing yet' : spec.reads.join(', ')})`;

/**
 * The file that reads a format: `openapi.ts`, and `input-<name>.ts` for every other adapter. An
 * entry that is already a file name (`extract-standard.ts`, for a format that is extracted rather
 * than read as an input) is used as written.
 */
export const adapterFile = (adapter: string): string => {
  if (adapter.endsWith('.ts')) return adapter;
  return adapter === 'openapi' ? 'openapi.ts' : `input-${adapter}.ts`;
};

function reportOf(file: SpecFile, spec: Spec, entry: Published, from: string): string {
  const adapters = (spec.adapters ?? []).map((a) => `\`packages/${file.owner}/src/${adapterFile(a)}\``);
  const lines = [
    `## ${spec.name} ${entry.version}${entry.prerelease ? ' (pre-release)' : ''}`,
    '',
    `- Release: ${entry.url}`,
    `- Recorded before this: ${from}`,
    `- We read: ${spec.reads.length === 0 ? 'nothing yet' : spec.reads.join(', ')}`,
  ];
  if (spec.kind === 'test-suite') {
    lines.push('- A grader vendors this suite: a new release moves a published score. Re-vendor, re-grade, and say what moved.');
  } else if (adapters.length > 0) {
    lines.push(`- Adapter: ${adapters.join(', ')}`);
    lines.push('- Read the release notes for constructs the adapter does not accept yet; that is a design decision, not a version bump.');
  } else {
    lines.push('- No adapter reads this format yet; `.sdlc/decisions/D-20261122-open-formats.md` lists it as planned.');
  }
  if (entry.prerelease) lines.push('- A pre-release: read it early, but it is not a release, and nothing should be changed to match it yet.');
  return `${lines.join('\n')}\n`;
}

export type Write = (text: string) => void;

const COL = 30;

/** Fetch each repo once however many entries name it. */
function memo(token: string | undefined, get: Get): (spec: Spec) => Promise<Published[]> {
  const held = new Map<string, Promise<Published[]>>();
  return (spec) => {
    const key = JSON.stringify([spec.repo, spec.source, spec.tagPattern]);
    const known = held.get(key) ?? fetchPublished(spec, token, get);
    held.set(key, known);
    return known;
  };
}

export interface Options {
  /** `GITHUB_TOKEN`, when set; the request is authenticated with it. */
  token?: string | undefined;
  /** `fetch`, or a fixture standing in for it. */
  get?: Get;
}

const tokenOf = (options: Options): string | undefined => (options.token === undefined ? process.env.GITHUB_TOKEN : options.token);

/** The versions newer than `seen`, oldest first, or the reason this entry cannot be compared. */
function newerThanSeen(spec: Spec, published: Published[]): { seen: Version | null; comparable: Published[] } {
  const seen = spec.seen === undefined ? null : parseVersion(spec.seen.version);
  if (spec.seen !== undefined && seen === null) {
    throw new Error(`\`seen.version\` ${show(spec.seen.version)} is not a version; it is unchecked, not up to date. fix: delete \`seen\` and run \`compat-oracle --specs --record\``);
  }
  const comparable = inScheme(published, seen?.scheme).sort(ascending);
  if (comparable.length === 0) {
    throw new Error(`none of ${spec.repo}'s versions is in the scheme of seen ${(spec.seen as SpecSeen).version}; it is unchecked, not up to date. fix: delete \`seen\` and run \`compat-oracle --specs --record\``);
  }
  return { seen, comparable };
}

/** One entry's verdict, added to `result` and written to `write`. */
function judge(file: SpecFile, spec: Spec, published: Published[], sink: { result: SpecsResult; write: Write }): void {
  const { result, write } = sink;
  const label = spec.name.padEnd(COL);
  const { seen, comparable } = newerThanSeen(spec, published);
  const newest = comparable.at(-1) as Published;
  if (seen === null) {
    result.unrecorded.push({ name: spec.name, newest: newest.version });
    write(`  ${label} ${newest.version} — nothing recorded yet; run --specs --record and commit specs.json\n`);
    return;
  }
  const from = (spec.seen as SpecSeen).version;
  const fresh = comparable.filter((p) => compareVersions(p.parsed, seen) > 0);
  if (fresh.length === 0) write(`  ${label} ${newest.version} — up to date\n`);
  for (const entry of fresh) {
    write(`  ${label} ${from} → ${entry.version}${entry.prerelease ? ' (pre-release)' : ''}\n`);
    result.updates.push({
      name: spec.name,
      repo: spec.repo,
      kind: spec.kind ?? 'spec',
      from,
      to: entry.version,
      prerelease: entry.prerelease,
      url: entry.url,
      title: titleOf(spec, entry.version),
      report: reportOf(file, spec, entry, from),
    });
  }
}

/**
 * Read-only: fetch, compare, report. One update per version newer than `seen` (R2), ascending,
 * with pre-releases among them marked (R3). An entry with no `seen` is named and left alone (R5).
 */
export async function check(packagesDir: string, write: Write, options: Options = {}): Promise<SpecsResult> {
  const result: SpecsResult = { updates: [], unrecorded: [], unchecked: [] };
  const fetched = memo(tokenOf(options), options.get ?? liveGet);
  for (const file of readSpecFiles(packagesDir)) {
    for (const spec of file.specs) {
      try {
        // Sequential on purpose: seventeen repos, one request each, against a rate-limited API.
        // eslint-disable-next-line reliability/no-await-in-loop -- deliberate: one repo at a time
        judge(file, spec, await fetched(spec), { result, write });
      } catch (error) {
        result.unchecked.push({ name: spec.name, repo: spec.repo, error: message(error) });
        write(`  ${spec.name.padEnd(COL)} ✖ unchecked: ${message(error)}\n`);
      }
    }
  }
  return result;
}

const INDENT = 2;
const ISO_DATE_LENGTH = 'YYYY-MM-DD'.length;

export interface RecordOptions extends Options {
  /** The date to write into `seen.at`; today when omitted. */
  today?: string;
}

/** The entry with its newest version recorded, or as it was when it already holds the newest. */
function recorded(spec: Spec, published: Published[], today: string, write: Write): Spec {
  const label = spec.name.padEnd(COL);
  const held = spec.seen === undefined ? null : parseVersion(spec.seen.version);
  const newest = inScheme(published, held?.scheme).sort(ascending).at(-1);
  if (newest === undefined) throw new Error(`none of ${spec.repo}'s versions is in the scheme of seen ${(spec.seen as SpecSeen).version}. fix: delete \`seen\` and record again`);
  if (held !== null && compareVersions(newest.parsed, held) <= 0) {
    write(`  ${label} ${(spec.seen as SpecSeen).version} — already the newest\n`);
    return spec;
  }
  write(`  ${label} ${newest.version}  recorded\n`);
  return { ...spec, seen: { version: newest.version, at: today } };
}

/**
 * Write the newest version of every spec into its `specs.json` as `seen` (R5), leaving the file's
 * other fields alone, and open nothing. A spec that cannot be read keeps what it had and is
 * counted; the others are still recorded. Returns how many could not be.
 */
export async function record(packagesDir: string, write: Write, options: RecordOptions = {}): Promise<number> {
  const fetched = memo(tokenOf(options), options.get ?? liveGet);
  const today = options.today ?? new Date().toISOString().slice(0, ISO_DATE_LENGTH);
  let failures = 0;
  for (const file of readSpecFiles(packagesDir)) {
    const specs: Spec[] = [];
    for (const spec of file.specs) {
      try {
        // eslint-disable-next-line reliability/no-await-in-loop -- deliberate: see `check`
        specs.push(recorded(spec, await fetched(spec), today, write));
      } catch (error) {
        failures += 1;
        write(`  ${spec.name.padEnd(COL)} ✖ unchecked: ${message(error)}\n`);
        specs.push(spec);
      }
    }
    writeFileSync(file.file, `${JSON.stringify(specs, null, INDENT)}\n`);
  }
  return failures;
}
