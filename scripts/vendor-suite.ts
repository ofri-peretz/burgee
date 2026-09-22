/**
 * Vendors one incumbent's own test suite into `packages/compat-oracle/vendor/<pkg>/`,
 * and writes down where it came from.
 *
 * ## What vendoring actually is, measured
 *
 * **A repo clone at the release tag — never a tarball extract.** That is not a preference;
 * it is the only thing that works. Measured 2026-09-13:
 *
 *     npm pack ansi-escapes && tar tzf ansi-escapes-*.tgz | grep -c test   ->  0
 *
 * and the same zero for `strip-ansi` and for `which`. **No incumbent ships its tests to
 * npm.** A `files` array naming `dist` and a `.d.ts` is the norm in this ecosystem, so the
 * suite a compatibility claim is graded by exists in exactly one place: the repository, at
 * the tag that matches the published version. The eight directories already under
 * `vendor/` are precisely that, and until this file nothing in the repo said so.
 *
 * ## What it does
 *
 *   1. Resolves the published version (`npm view <pkg> version`), or takes `--version`.
 *   2. Shallow-clones the host's repo at the matching tag — `v<version>` unless the host
 *      declares another prefix — falling back to HEAD and recording `tag: null` rather
 *      than pretending, when a release was never tagged.
 *   3. Copies the test directory and its fixtures, rewriting only the specifiers that
 *      reach the library, and writes the vendored root `package.json` the suites read.
 *   4. Records the release, tag, commit and a hash per file in `.source.json`, and the
 *      human-readable origin in `PROVENANCE`.
 *
 * Steps 1–3 are `compat-oracle/src/vendor.ts`, which already existed and is what made
 * those eight directories. This file is its entry point and step 4.
 *
 * ## Usage
 *
 *     npx tsx scripts/vendor-suite.ts <pkg>                # latest release
 *     npx tsx scripts/vendor-suite.ts <pkg> --version 6.0.0
 *     npx tsx scripts/vendor-suite.ts <pkg> --into /tmp/v  # somewhere else, to diff
 *     npx tsx scripts/vendor-suite.ts --backfill           # PROVENANCE for what is here
 *
 * ## Reproducing a directory that is already here
 *
 * Everything a run writes is a function of the tag except one field: `vendored`, the day
 * the copy was taken. So a re-run of an unchanged release differs from the committed
 * directory in exactly two lines — `.source.json` and `PROVENANCE` — and `--vendored
 * <date>` pins that field so the comparison is a clean `diff -r`. Measured 2026-09-14:
 *
 *     npx tsx scripts/vendor-suite.ts chalk --version 6.0.0 --into /tmp/v --vendored 2026-09-08
 *     diff -r packages/compat-oracle/vendor/chalk /tmp/v/chalk     # no output
 *
 * All eleven files match, hashes included. Use the flag only to check reproduction; a real
 * vendor run must record the day it actually happened.
 *
 * `--backfill` writes a `PROVENANCE` for every directory that already has a `.source.json`
 * without re-cloning anything: the origin is read off the machine record, and `--verify`
 * confirms the tag still resolves to the recorded commit at the host before stamping it.
 * Where a record cannot establish an origin the file says `unknown` and why — a
 * `PROVENANCE` reading "origin unknown" is honest and a fabricated sha is not.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6, scripts/oracle-import-lock.test.ts)
import { HOSTS, type Host } from '../packages/compat-oracle/src/hosts.js';
// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6, scripts/oracle-import-lock.test.ts)
import { fieldsFromRecord, PROVENANCE_FILE, type ProvenanceFields, renderProvenance, UNKNOWN } from '../packages/compat-oracle/src/provenance.js';
// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6, scripts/oracle-import-lock.test.ts)
import { type CompatRecord, latestVersion, readRecord } from '../packages/compat-oracle/src/upstream.js';
// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6, scripts/oracle-import-lock.test.ts)
import { vendor } from '../packages/compat-oracle/src/vendor.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VENDOR_DIR = join(REPO_ROOT, 'packages', 'compat-oracle', 'vendor');

/**
 * R6 — this script must read the checkout it is writing into.
 *
 * The imports above are bare specifiers, so Node walks upward from the module's directory
 * until it finds a `node_modules/compat-oracle`. From a worktree with none of its own, that
 * walk **leaves the worktree** and lands in the parent checkout — and the run then writes into
 * its own `vendor/` while reading another tree's definition of what to vendor. The output
 * looks entirely normal.
 *
 * It bit two lane agents on 2026-09-17, independently, in one session; one had written two
 * wrong manifests before noticing. Both found it by accident. This is the defect class the
 * whole package exists to prevent, pointed inward — a measurement that reads a different thing
 * from the one it reports on — and it is the same shape as `unsatisfiedPins`, written after a
 * control graded 1 / 1 by resolving `rc` out of a stray `/Users/…/node_modules`.
 *
 * `REPO_ROOT` is derived from `import.meta.url` and cannot leave this tree. This checks the
 * registry did not either, and **refuses** rather than repairing: there is no correct way to
 * continue once the two disagree, and a wrong number that looks right is precisely the outcome
 * this package exists to prevent.
 *
 * The separator in the comparison is load-bearing — a bare `startsWith(root)` accepts a
 * sibling directory whose path merely shares a prefix, and a worktree sits inside the parent
 * checkout, so near-miss paths are the normal case here rather than a curiosity.
 */
export function checkResolvedTree(resolved: string, root: string = REPO_ROOT): void {
  const from = resolve(resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved);
  if (from === root || from.startsWith(`${root}${sep}`)) return;
  throw new Error(
    `vendor-suite: refusing to run. It would write into ${root} while reading its host registry from ${from}, ` +
      'which is a different checkout — a bare specifier resolved upward out of this worktree. ' +
      'Run `npm ci` here so this tree has its own node_modules, then try again.',
  );
}

// `createRequire` anchored at this file walks the same path the static imports above do —
// module directory upward — which is the walk that leaves the worktree. `import.meta.resolve`
// would be the obvious probe and is not available: `tsx` compiles this to CJS, so it would be
// a check that cannot fail for the reason the script fails.
checkResolvedTree(createRequire(import.meta.url).resolve('compat-oracle/hosts'));
/** Length of an ISO date, `YYYY-MM-DD`. */
const ISO_DATE = 10;
const today = (): string => new Date().toISOString().slice(0, ISO_DATE);

interface Options {
  pkg?: string;
  version?: string;
  into: string;
  backfill: boolean;
  verify: boolean;
  /** Pin the one non-deterministic field, so a reproduction check is a clean `diff -r`. */
  vendored?: string;
}

function applyFlag(options: Options, flag: string, queue: string[]): void {
  if (flag === '--backfill') {
    options.backfill = true;
    return;
  }
  if (flag === '--verify') {
    options.verify = true;
    return;
  }
  const value = queue.shift();
  if (value === undefined) throw new Error(`flag ${flag} needs a value`);
  if (flag === '--version') options.version = value;
  else if (flag === '--vendored') options.vendored = value;
  else if (flag === '--into') options.into = resolve(value);
  else throw new Error(`unknown flag ${flag}`);
}

export function parseArgs(argv: string[]): Options {
  const options: Options = { into: VENDOR_DIR, backfill: false, verify: false };
  const queue = [...argv];
  while (queue.length > 0) {
    const arg = queue.shift() ?? '';
    if (arg.startsWith('-')) applyFlag(options, arg, queue);
    else options.pkg = arg;
  }
  return options;
}

const VENDORED_FIELD = /^(\s*"vendored":\s*")[^"]*(")/m;

/**
 * Rewrite the recorded date in the raw JSON text rather than through the parsed record:
 * `readRecord` fills defaults and would re-order the keys, which would show up as a diff
 * in the very comparison this flag exists to make clean.
 */
function pinDate(dir: string, date: string): void {
  const at = join(dir, '.source.json');
  writeFileSync(at, readFileSync(at, 'utf8').replace(VENDORED_FIELD, `$1${date}$2`));
}

/**
 * The commit a tag points at, read from the host without cloning.
 *
 * `^{}` is load-bearing: every one of the eight suites here was tagged with an *annotated*
 * tag, whose own object sha is not the commit's — chalk's `refs/tags/v6.0.0` is
 * `a52d7e22` and the commit it names is `661317e6`. Comparing the undereferenced sha would
 * report all eight records as wrong.
 */
function commitAtTag(repo: string, tag: string): string | undefined {
  try {
    const out = execFileSync('git', ['ls-remote', repo, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = out.trim().split('\n').filter((l) => l !== '');
    const dereferenced = lines.find((l) => l.endsWith('^{}')) ?? lines[0];
    return dereferenced?.split('\t')[0];
  } catch {
    return undefined;
  }
}

/** `verified: …` for a record whose tag still resolves to the sha it claims. */
function verification(record: CompatRecord): string | undefined {
  if (record.tag === null) return undefined;
  const actual = commitAtTag(record.repo, record.tag);
  if (actual === undefined) return `${today()} — host unreachable, tag not checked`;
  if (actual !== record.commit) return `${today()} — DISAGREES: ${record.tag} resolves to ${actual} at the host`;
  return `${today()} — ${record.tag} resolves to this commit at the host`;
}

/** A directory with no usable record: say so in the file rather than invent one. */
const unknownOrigin = (name: string): ProvenanceFields => ({
  package: name,
  repo: UNKNOWN,
  version: UNKNOWN,
  tag: null,
  commit: UNKNOWN,
  vendored: UNKNOWN,
  files: 0,
  note: `origin unknown, recovered ${today()} — no .source.json beside these tests, so no tag or commit could be established. Re-vendor to replace this file with a measured one.`,
});

function fieldsFor(name: string, record: CompatRecord | undefined, verify: boolean): ProvenanceFields {
  if (record === undefined) return unknownOrigin(name);
  return fieldsFromRecord(name, record, verify ? verification(record) : undefined);
}

function writeProvenance(dir: string, name: string, record: CompatRecord | undefined, verify: boolean): string {
  const fields = fieldsFor(name, record, verify);
  writeFileSync(join(dir, PROVENANCE_FILE), renderProvenance(fields));
  return record === undefined ? `${name}: origin unknown, recorded as unknown` : `${name}: ${fields.version} @ ${fields.tag ?? 'HEAD'}`;
}

function backfill(into: string, verify: boolean): number {
  if (!existsSync(into)) {
    process.stderr.write(`no vendor directory at ${into}\n`);
    return 1;
  }
  const names = readdirSync(into, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const name of names) process.stdout.write(`${writeProvenance(join(into, name), name, readRecord(join(into, name)), verify)}\n`);
  process.stdout.write(`\n${names.length} ${PROVENANCE_FILE} file(s) written under ${into}\n`);
  return 0;
}

function one(host: Host, into: string, version: string, { verify, vendored }: Pick<Options, 'verify' | 'vendored'>): number {
  process.stdout.write(`vendoring ${host.name}@${version} from ${host.repo}\n`);
  const result = vendor(host, into, version);
  const dir = join(into, host.name);
  if (vendored !== undefined) pinDate(dir, vendored);
  const record = readRecord(dir);
  if (record === undefined) throw new Error(`vendor wrote no .source.json for ${host.name}`);
  writeProvenance(dir, host.name, record, verify);
  process.stdout.write(
    `  tag ${result.tag ?? '(none — HEAD)'} · commit ${result.commit} · ${result.files} test file(s)\n` +
      `  wrote ${join(dir, PROVENANCE_FILE)}\n`,
  );
  if (result.diff !== undefined && result.previous !== undefined) {
    const { files, tests, surface } = result.diff;
    process.stdout.write(
      `  vs ${result.previous.version}: files +${files.added.length}/-${files.removed.length}/~${files.changed.length} · ` +
        `tests +${tests.added.length}/-${tests.removed.length} · surface +${surface.added.length}/-${surface.removed.length}\n`,
    );
  }
  return 0;
}

function main(argv: string[]): number {
  const options = parseArgs(argv);
  if (options.backfill) return backfill(options.into, options.verify);
  if (options.pkg === undefined) {
    process.stderr.write(
      `usage: vendor-suite <pkg> [--version <v>] [--into <dir>] [--verify] [--vendored <date>]\n` +
        `       vendor-suite --backfill [--into <dir>] [--verify]\n\n` +
        `hosts: ${HOSTS.map((h) => h.name).join(', ')}\n`,
    );
    return 1;
  }
  const host = HOSTS.find((h) => h.name === options.pkg);
  if (host === undefined) {
    process.stderr.write(`no host named "${options.pkg}" in hosts.ts — add it there first\n`);
    return 1;
  }
  return one(host, options.into, options.version ?? latestVersion(host.name), options);
}

process.exitCode = main(process.argv.slice(2));
