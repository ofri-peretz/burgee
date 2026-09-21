/**
 * `burgee migrate` — the mechanical path from commander or yargs to burgee.
 *
 * Every migration that actually happened shipped the codemod before the wave, not after
 * it (`.sdlc/research/migration-drivers.md`): `jest-codemods`, `pnpm import`,
 * `biome migrate eslint`. burgee already has the strongest possible version of the claim —
 * change one import and commander's own 1,360 tests still pass — and what it did not have
 * was the four-minute path from *could* to *did*.
 *
 * **Specifiers, not syntax trees (D-050).** The rewrite surface is a quoted string in five
 * known positions, so this needs no parser and therefore no runtime dependency (rule 2).
 * It is also two orders of magnitude cheaper than parse-edit-print, which is what makes
 * A10's budget — 1,000 files under 500 ms — a number rather than an adjective. The fast
 * choice and the zero-dependency choice are the same choice here.
 *
 * The cost of the narrow scan is paid visibly: a position this scan cannot classify is
 * **refused by file and line** and the whole file is left as it was (A4, A5, D-051). A
 * codemod that half-works fails later as a runtime error in someone else's CLI, and the
 * first thing they will blame is burgee.
 *
 * Nothing here is reachable from `import 'burgee'`: `cli.ts` loads it with a dynamic
 * import on the `migrate` path only, and `weight.test.ts` denies `migrate.js` to the root
 * entry by name so that cannot drift.
 */
import { readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ambientRuntime, run } from 'bellpull';

import { GRADED, type Graded } from './compat.js';
import { ExitCode } from './exit-code.js';

/**
 * A2 — the whole mapping, as data.
 *
 * Whole specifiers only. `burgee/commander` is not a key, which is what makes a second run
 * over an already-migrated tree a no-op and lets the command declare `effects: 'idempotent'`.
 */
export const MAPPING: Readonly<Record<string, string>> = {
  commander: 'burgee/commander',
  yargs: 'burgee/yargs',
  'yargs/yargs': 'burgee/yargs',
  'yargs/helpers': 'burgee/yargs/helpers',
};

/** The packages a project depends on that this command is about (A1). */
export const HOSTS = ['commander', 'yargs'] as const;

/** Why a file was left untouched. Both are named positions, never a guess (A4). */
export type RefusalReason = 'deep-import' | 'non-literal-specifier';

export interface Refusal {
  /** Relative to the directory being migrated, with forward slashes on every platform. */
  file: string;
  line: number;
  /** The specifier as written, or `''` for a dynamic specifier that is not a literal. */
  specifier: string;
  reason: RefusalReason;
}

/** One rewritten specifier, for the per-mapping rollup the report prints. */
export interface Mapped {
  from: string;
  to: string;
  imports: number;
  files: number;
}

export interface Detection {
  /** Hosts named in `package.json`'s dependencies — declared. */
  declared: string[];
  /** Hosts a source file actually imports — used. These two disagree more often than not. */
  imported: string[];
}

export interface MigrationReport {
  files: number;
  imports: number;
  mapped: Mapped[];
  refused: Refusal[];
  detected: Detection;
  dependencies: { before: string[]; removable: string[]; after: number };
  graded: (Graded & { host: string })[];
  dryRun: boolean;
  /** N7 — an idempotent command says whether it changed anything; silence is what an agent misreads. */
  changed: boolean;
  /** A8 — `RUNTIME` when anything was refused, so an agent branches on the code. */
  exitCode: number;
}

/* ------------------------------------------------------------------ the scan */

interface Site {
  specifier: string;
  /** Offsets of the specifier's text, excluding the quotes. */
  start: number;
  end: number;
  line: number;
}

interface Scan {
  sites: Site[];
  /** `import(x)` / `require(x)` where `x` is not a string literal — refused, never guessed. */
  nonLiteral: number[];
}

const WORD = /[A-Za-z0-9_$]/;

/** After these, a `/` divides; after anything else it opens a regular expression. */
const DIVIDES = new Set([')', ']', '}']);

function startsRegex(previous: string): boolean {
  if (previous === '') return true;
  if (DIVIDES.has(previous)) return false;
  return !WORD.test(previous.charAt(previous.length - 1));
}

/** Index just past the end of a `'…'` or `"…"`, honouring backslash escapes. */
function endOfString(source: string, open: number): number {
  const quote = source.charAt(open);
  for (let i = open + 1; i < source.length; i += 1) {
    const c = source.charAt(i);
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === quote || c === '\n') return i + 1;
  }
  return source.length;
}

/** Index just past the end of a template literal, counting `${…}` nesting so a `}` inside it is not the end. */
function endOfTemplate(source: string, open: number): number {
  let depth = 0;
  for (let i = open + 1; i < source.length; i += 1) {
    const c = source.charAt(i);
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '$' && source.charAt(i + 1) === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (c === '}' && depth > 0) {
      depth -= 1;
      continue;
    }
    if (c === '`' && depth === 0) return i + 1;
  }
  return source.length;
}

/** Index just past the end of a regular-expression literal, skipping character classes. */
function endOfRegex(source: string, open: number): number {
  let inClass = false;
  for (let i = open + 1; i < source.length; i += 1) {
    const c = source.charAt(i);
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '[' || c === ']') {
      inClass = c === '[';
      continue;
    }
    if (c === '\n') return i;
    if (c === '/' && !inClass) return i + 1;
  }
  return source.length;
}

/** Newlines between two offsets, so a refusal can name a line without a second pass. */
function newlines(source: string, from: number, to: number): number {
  let count = 0;
  for (let i = from; i < to; i += 1) if (source.charAt(i) === '\n') count += 1;
  return count;
}

/**
 * A3 — the five positions, and only those: `import … from 'x'`, `import 'x'`,
 * `export … from 'x'`, `import('x')` and `require('x')`.
 *
 * Decided from the two tokens in front of the quote rather than from a pattern over the
 * line, which is what keeps `{ from: 'commander' }`, `const x = 'commander'` and
 * `log('commander')` out of it — the second named mutation in `migrate.test.ts`.
 */
function isSpecifier(previous: string, before: string): boolean {
  if (previous === 'from' || previous === 'import') return true;
  return previous === '(' && (before === 'import' || before === 'require');
}

/** Whitespace, `;` and both comment forms — everything the classifier never looks at. Returns `at` when there is none. */
function endOfTrivia(source: string, at: number): number {
  const c = source.charAt(at);
  if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ';') return at + 1;
  if (c !== '/') return at;
  const next = source.charAt(at + 1);
  if (next === '/') {
    const end = source.indexOf('\n', at);
    return end === -1 ? source.length : end;
  }
  if (next !== '*') return at;
  const end = source.indexOf('*/', at + 2);
  return end === -1 ? source.length : end + 2;
}

/** A literal to step over whole — string, template or regular expression — or `-1` when `at` starts none. */
function endOfLiteral(source: string, at: number, previous: string): number {
  const c = source.charAt(at);
  if (c === "'" || c === '"') return endOfString(source, at);
  if (c === '`') return endOfTemplate(source, at);
  if (c === '/' && startsRegex(previous)) return endOfRegex(source, at);
  return -1;
}

/** Index just past the identifier or number starting at `at`, or `at` when neither starts there. */
function endOfWord(source: string, at: number): number {
  let i = at;
  while (i < source.length && WORD.test(source.charAt(i))) i += 1;
  return i;
}

/** What a quoted literal is recorded as; anything else quoted is `lit`, which is never a specifier. */
const QUOTED = 'str';

/** The two code tokens behind the cursor, plus A4's open-call state. Two is all the classifier looks at. */
interface Tokens {
  previous: string;
  before: string;
  /** The two behind us were `import (` or `require (`, and what follows decides A4. */
  pending: boolean;
  /** Lines where a call was opened and what followed was not a string literal. */
  nonLiteral: number[];
}

/**
 * Record one code token.
 *
 * A4's refusal is decided here rather than at each call site: if a call was opened and the
 * thing inside it is not a string literal, the specifier is not one this scan can read, and
 * the file it is in will be left alone.
 */
function push(tokens: Tokens, text: string, line: number): void {
  if (tokens.pending && text !== QUOTED && text !== ')') tokens.nonLiteral.push(line);
  tokens.pending = text === '(' && (tokens.previous === 'import' || tokens.previous === 'require');
  tokens.before = tokens.previous;
  tokens.previous = text;
}

/**
 * One linear pass over the text: comments, strings, templates and regular expressions are
 * skipped as the shapes they are, and every quoted literal is classified by the two code
 * tokens in front of it.
 *
 * It is a scan, not a parse. What it cannot classify it refuses (A4); what it can, it knows
 * exactly, because a module specifier is a string literal in one of five positions and
 * nothing else in the grammar looks like that.
 */
export function scan(source: string): Scan {
  const sites: Site[] = [];
  const tokens: Tokens = { previous: '', before: '', pending: false, nonLiteral: [] };
  let line = 1;
  let i = 0;

  while (i < source.length) {
    const trivia = endOfTrivia(source, i);
    if (trivia !== i) {
      line += newlines(source, i, trivia);
      i = trivia;
      continue;
    }
    const literal = endOfLiteral(source, i, tokens.previous);
    if (literal !== -1) {
      const c = source.charAt(i);
      const quoted = c === "'" || c === '"';
      if (quoted && isSpecifier(tokens.previous, tokens.before)) sites.push({ specifier: source.slice(i + 1, literal - 1), start: i + 1, end: literal - 1, line });
      push(tokens, quoted ? QUOTED : 'lit', line);
      line += newlines(source, i, literal);
      i = literal;
      continue;
    }
    const word = endOfWord(source, i);
    if (word !== i) {
      push(tokens, source.slice(i, word), line);
      i = word;
      continue;
    }
    push(tokens, source.charAt(i), line);
    i += 1;
  }
  return { sites, nonLiteral: tokens.nonLiteral };
}

/* ------------------------------------------------------- the rewrite of one file */

export interface Rewrite {
  source: string;
  mapped: { from: string; to: string }[];
  refused: Omit<Refusal, 'file'>[];
  /** Whether this file references a host at all. A file that does not is not "untouched", it is unrelated. */
  relevant: boolean;
}

/**
 * The host names as bytes, so the pre-filter below can run against a file that has not been
 * decoded yet. Both are pure ASCII, so a UTF-8 file contains the name iff its bytes do.
 */
const NEEDLE_BYTES = HOSTS.map((host) => Buffer.from(host));

/**
 * A file that names neither host anywhere cannot contain a specifier for one — and in a real
 * repository that is almost every file.
 *
 * `includes` is a `memmem`; `scan` is a character loop. It is not what makes the command
 * fast (the whole scan phase is 25 ms of a ~400 ms run over 1,000 files) — it is what keeps
 * the work proportional to the files that could matter rather than to the repository, and
 * on a `Buffer` it also skips decoding 3 MB of UTF-8 that nothing was going to read.
 */
export function mentionsAHost(source: string | Buffer): boolean {
  return typeof source === 'string' ? HOSTS.some((host) => source.includes(host)) : NEEDLE_BYTES.some((bytes) => source.includes(bytes));
}

/** A specifier that reaches inside a host the façade does not promise: `commander/lib/command.js` (A4). */
function isDeep(specifier: string): boolean {
  if (MAPPING[specifier] !== undefined) return false;
  return HOSTS.some((host) => specifier.startsWith(`${host}/`));
}

/**
 * A2/A5 — map every host specifier in one file, or map none of them.
 *
 * The edits are applied from the end backwards so earlier offsets stay valid, and the
 * source is returned unchanged the moment there is a refusal in it: the unit of success is
 * the file, so the worst case is *nothing changed here, and here is why* (D-051).
 */
export function rewriteSource(source: string): Rewrite {
  if (!mentionsAHost(source)) return { source, mapped: [], refused: [], relevant: false };
  const { sites, nonLiteral } = scan(source);
  const hits = sites.filter((s) => MAPPING[s.specifier] !== undefined || isDeep(s.specifier));
  if (hits.length === 0) return { source, mapped: [], refused: [], relevant: false };

  const refused: Omit<Refusal, 'file'>[] = [
    ...hits.filter((s) => isDeep(s.specifier)).map((s) => ({ line: s.line, specifier: s.specifier, reason: 'deep-import' as const })),
    ...nonLiteral.map((line) => ({ line, specifier: '', reason: 'non-literal-specifier' as const })),
  ].sort((a, b) => a.line - b.line);
  if (refused.length > 0) return { source, mapped: [], refused, relevant: true };

  let out = source;
  const mapped: { from: string; to: string }[] = [];
  for (const site of [...hits].sort((a, b) => b.start - a.start)) {
    const to = MAPPING[site.specifier] as string;
    out = `${out.slice(0, site.start)}${to}${out.slice(site.end)}`;
    mapped.push({ from: site.specifier, to });
  }
  return { source: out, mapped: mapped.reverse(), refused: [], relevant: true };
}

/* ------------------------------------------------------------------ the project */

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
/** Generated and vendored trees. Migrating `node_modules` would rewrite somebody else's package. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', '.next', '.output', '.cache', '.vercel']);

/** Every source file under `dir`, relative and slash-separated so a report reads the same everywhere. */
export function sourceFiles(dir: string, at = '', found: string[] = []): string[] {
  for (const entry of readdirSync(join(dir, at), { withFileTypes: true })) {
    const path = at === '' ? entry.name : `${at}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) sourceFiles(dir, path, found);
    } else if (SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) found.push(path);
  }
  return found;
}

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Hosts `package.json` declares — one of A1's two independent sources. */
async function declaredHosts(dir: string): Promise<string[]> {
  try {
    const raw = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as Manifest;
    const declared = { ...raw.dependencies, ...raw.devDependencies };
    return HOSTS.filter((host) => declared[host] !== undefined);
  } catch {
    return [];
  }
}

/**
 * `git status --porcelain`, or `undefined` where there is no repository to ask (A6).
 *
 * Through `bellpull` rather than `node:child_process`, because spawning is bellpull's job
 * and `scripts/inline-implementation-lock.test.ts` says so — it caught the first draft of
 * this file, which reached for `execFileSync` out of habit. burgee already depends on the
 * package, and `migrate.js` is loaded lazily, so nothing that does not run `migrate` pays
 * for the edge.
 *
 * Not a repository, no `git` on `PATH`, an unreadable directory: all the same answer, which
 * is *there is nothing here that could be dirty*. A6 protects a reviewable diff, and where
 * there is no repository there is no diff to protect — refusing instead would make the
 * command unusable on a tarball for a safety that was never available.
 */
export async function workingTree(dir: string): Promise<string[] | undefined> {
  const result = await run('git', ['-C', dir, 'status', '--porcelain'], { runtime: ambientRuntime(), stdio: 'pipe' });
  if (!result.ok) return undefined;
  return result.stdout.split('\n').filter((line) => line !== '');
}

/** A6 — a dirty tree has no reviewable diff to add to, so the command declines rather than writes. */
export class DirtyTreeError extends Error {
  readonly fix = 'commit or stash your changes, or pass --force';
  constructor(readonly entries: string[]) {
    super(`the git tree has ${entries.length} uncommitted change${entries.length === 1 ? '' : 's'}`);
    this.name = 'DirtyTreeError';
  }
}

export interface MigrateOptions {
  dir: string;
  dryRun?: boolean;
  force?: boolean;
  /** Injected by the tests; the real `git status --porcelain` otherwise. */
  status?: (dir: string) => string[] | undefined | Promise<string[] | undefined>;
}

/** A file the pre-filter rejected: never decoded, never scanned, never written. */
const EMPTY: Rewrite = { source: '', mapped: [], refused: [], relevant: false };

/**
 * One batch: read them all, scan them all, write the ones that changed — three phases, not
 * one pipeline per file.
 *
 * The phases are the measurement, not a preference. Read-scan-write per file puts the CPU
 * pass between two I/O completions, so the scan serialises the batch's reads behind it; the
 * same 1,000-file tree measured 350–570 ms that way and 390–500 ms phased, against a floor
 * of about 150 ms of pure filesystem plus 25 ms of scan. (Fully synchronous I/O, for the
 * record, is **3.1–5.2 seconds** — an order of magnitude, which is why the concurrency is
 * here at all.)
 */
async function migrateBatch(dir: string, batch: string[], write: boolean): Promise<Rewrite[]> {
  // Read as bytes and decode only what the pre-filter admits: on the bench tree a third of
  // the files never become a string at all, which is 405 ms against 427 for the same work.
  const sources = await Promise.all(batch.map(async (file) => await readFile(join(dir, file))));
  const results = sources.map((bytes) => (mentionsAHost(bytes) ? rewriteSource(bytes.toString('utf8')) : EMPTY));
  if (write) await Promise.all(results.map(async (r, i) => (r.mapped.length === 0 ? undefined : await writeFile(join(dir, batch[i] as string), r.source))));
  return results;
}

/** The per-mapping rollup, in the order `MAPPING` declares — so two runs print the same table. */
function rollup(all: { from: string; to: string; file: string }[]): Mapped[] {
  return Object.entries(MAPPING)
    .map(([from, to]) => {
      const hits = all.filter((m) => m.from === from);
      return { from, to, imports: hits.length, files: new Set(hits.map((m) => m.file)).size };
    })
    .filter((row) => row.imports > 0);
}

/**
 * A7 — the compat figures come from `compat.ts`, which `compat-baseline-lock.test.ts`
 * holds equal to `compat-oracle/baseline/<host>.json`. A number typed into a report
 * template is a number that goes stale silently, and this repository has published four
 * of those and caught them all late.
 */
function gradedFor(hosts: string[]): (Graded & { host: string })[] {
  return hosts.filter((host) => GRADED[host] !== undefined).map((host) => ({ host, ...(GRADED[host] as Graded) }));
}

/**
 * How many files are in flight at once — bounded by the open-file limit rather than by a
 * thread pool, as the design says (A10).
 *
 * Measured, because the first number chosen was wrong. Over the 1,000-file bench tree the
 * read phase costs 418 ms at 32, 107 ms at 64 and 83 ms unbounded; the write phase 135 ms at
 * 64 and 69 ms unbounded. 256 is where the curve has flattened and is still an order of
 * magnitude under the lowest `ulimit -n` anyone runs (1,024), so the bound is real rather
 * than decorative. The scan itself is 25 ms of the whole run — this is a filesystem budget,
 * which is exactly what "no AST" bought.
 */
const BATCH = 256;

/**
 * Migrate one project: detect, rewrite, report (A1, A7, A8).
 *
 * Non-interactive by design (D-052). The second audience is an agent migrating a
 * repository unattended, and a prompt is a wall; safety is `--dry-run` and the refusal on
 * a dirty tree, not a question.
 */
export async function migrate(options: MigrateOptions): Promise<MigrationReport> {
  const { dir, dryRun = false, force = false } = options;
  const entries = await (options.status ?? workingTree)(dir);
  if (!dryRun && !force && entries !== undefined && entries.length > 0) throw new DirtyTreeError(entries);

  const files = sourceFiles(dir);
  const results: { file: string; result: Rewrite }[] = [];
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    // eslint-disable-next-line reliability/no-await-in-loop -- the await IS the bound (A10). Each batch is 256 files in flight at once; awaiting one before opening the next is what keeps the command inside the open-file limit on a repository of any size, and `Promise.all` over every file in a monorepo is EMFILE.
    const done = await migrateBatch(dir, batch, !dryRun);
    results.push(...done.map((result, k) => ({ file: batch[k] as string, result })));
  }

  const all = results.flatMap(({ file, result }) => result.mapped.map((m) => ({ ...m, file })));
  const refused: Refusal[] = results.flatMap(({ file, result }) => result.refused.map((r) => ({ file, ...r })));
  const imported = [...new Set(results.flatMap(({ result }) => (result.relevant ? result.mapped.map((m) => m.from) : [])))];
  const declared = await declaredHosts(dir);
  // A dependency is removable only when nothing still imports it — a file that was refused
  // still imports commander, so the maintainer's `npm rm` would break their own build.
  const stillUsed = new Set(refused.map((r) => r.specifier.split('/')[0] ?? ''));
  const removable = declared.filter((host) => !stillUsed.has(host));
  const touched = [...new Set(all.map((m) => m.file))];

  return {
    files: touched.length,
    imports: all.length,
    mapped: rollup(all),
    refused,
    detected: { declared, imported: [...new Set(imported.map((s) => s.split('/')[0] ?? s))].sort() },
    dependencies: { before: declared, removable, after: declared.length - removable.length },
    graded: gradedFor([...new Set([...declared, ...imported.map((s) => s.split('/')[0] ?? s)])].sort()),
    dryRun,
    changed: !dryRun && touched.length > 0,
    exitCode: refused.length > 0 ? ExitCode.RUNTIME : ExitCode.OK,
  };
}
