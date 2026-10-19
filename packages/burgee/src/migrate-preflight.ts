/**
 * migrate-preflight — what the move costs a project, read before `burgee migrate` writes anything.
 *
 * The field trial (`.sdlc/research/adoption-barriers-2026-10.md`, Part A) moved nine CLIs. Five
 * declared an `engines.node` below the family's floor and no report said so; @swc/cli lost a jest
 * suite to `Cannot use import statement outside a module`; and its install left an untracked
 * `node-compile-cache/` that migrate refused without naming. Each of those is a row here, computed
 * from what the project already wrote down, so a maintainer reads the cost before paying it.
 *
 * Pure: `migrate.ts` reads the files and hands them over, so every row is a function of its input
 * and the range reader needs no `semver` (rule 2). `migrate.ts` alone imports this module, and it
 * is reached only through `program.ts`'s dynamic `import('./migrate.js')`, so no entry pays for it.
 */

/** One finding: what was read, what it means for the move, and the line that fixes it. */
export interface PreflightRow {
  check: 'require-esm' | 'floor' | 'jest-cjs' | 'untracked';
  /** true: the move would leave a tree that cannot load, so nothing is written (R6). */
  blocking: boolean;
  /** What was read, as written: `engines.node ">=10" admits 10.0.0`. */
  found: string;
  message: string;
  /** The same `fix` line every burgee error carries: a command where there is one, else the change to make. */
  fix: string;
}

/** The fields of a project's `package.json` the preflight reads, each as untrusted as the file. */
export interface ProjectManifest {
  type?: unknown;
  engines?: { node?: unknown } | null;
  scripts?: { test?: unknown } | null;
  jest?: unknown;
}

export interface PreflightInput {
  manifest: ProjectManifest;
  /** Every dependency name the manifest declares. */
  declared: { has: (name: string) => boolean };
  /** The text of each root `jest.config.*` that exists. */
  jestConfigs: readonly string[];
  /** R1 — the drop-in of each incumbent the run considers, off-major ones included: `burgee/commander`. */
  targets: readonly string[];
  /** R5 — every package of the family, for jest's `transformIgnorePatterns`: a drop-in loads its own family dependencies too. */
  family: readonly string[];
  /** R7 — the `?? path` entries `--force` let through. */
  untracked: readonly string[];
}

/* ------------------------------------------------------------------ the range reader (R2) */

/** A half-open span of versions, `lo <= v < hi`, each version as one number (see `keyOf`). */
export interface Interval {
  lo: number;
  hi: number;
}

/** Room for each of minor and patch: Node's are two digits, and four leaves every real range readable. */
const PLACE = 10_000;
const key = (major: number, minor: number, patch: number): number => (major * PLACE + minor) * PLACE + patch;

/** `[major, minor, patch]` up to the first wildcard or missing part: `20.x` is `[20]`, `*` is `[]`. `undefined`: not a version. */
function partsOf(text: string): number[] | undefined {
  const match = /^v?(\d+|[xX*])(?:\.(\d+|[xX*])(?:\.(\d+|[xX*]))?)?(?:[-+][\w.-]*)?$/.exec(text);
  if (match === null) return undefined;
  // A wildcard and a missing part are both NaN, and everything from the first of them is dropped.
  const parts = match.slice(1).map(Number);
  const wild = parts.findIndex(Number.isNaN);
  return wild === -1 ? parts : parts.slice(0, wild);
}

/** The first version a partial names: `16.20` is 16.20.0. */
const lowOf = ([major = 0, minor = 0, patch = 0]: readonly number[]): number => key(major, minor, patch);

/** The first version after everything a partial names: `16` is 17.0.0, `16.20` is 16.21.0, `[]` is none. */
function nextOf(parts: readonly number[]): number {
  const [major = 0, minor = 0, patch = 0] = parts;
  return [Infinity, key(major + 1, 0, 0), key(major, minor + 1, 0), key(major, minor, patch + 1)][parts.length] as number;
}

/** One comparator: `>=16`, `^20.19.0`, `~20.18`, `20.x`. */
function comparator(text: string): Interval | undefined {
  const [, op, rest] = /^(<=|>=|<|>|=|\^|~)?(.*)$/.exec(text) as RegExpExecArray;
  const parts = partsOf(rest as string);
  if (parts === undefined) return undefined;
  const low = lowOf(parts);
  if (op === '>=') return { lo: low, hi: Infinity };
  if (op === '>') return { lo: nextOf(parts), hi: Infinity };
  if (op === '<') return { lo: 0, hi: low };
  if (op === '<=') return { lo: 0, hi: nextOf(parts) };
  // `^` holds the leftmost non-zero part: ^1.2.3 is <2.0.0, ^0.2.3 is <0.3.0, ^0.0.3 is <0.0.4.
  const nonZero = parts.findIndex((n) => n > 0);
  if (op === '^') return { lo: low, hi: nextOf(parts.slice(0, nonZero === -1 ? parts.length : nonZero + 1)) };
  if (op === '~') return { lo: low, hi: nextOf(parts.slice(0, 2)) };
  return { lo: low, hi: nextOf(parts) };
}

/** One `||` branch: a hyphen range, or comparators separated by spaces and intersected. */
function comparatorSet(text: string): Interval | undefined {
  const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(text);
  const each = hyphen === null ? text.replace(/(<=|>=|<|>|=|\^|~)\s+/g, '$1').split(/\s+/) : [`>=${hyphen[1]}`, `<=${hyphen[2]}`];
  const spans = each.map(comparator);
  if (spans.includes(undefined)) return undefined;
  return { lo: Math.max(...spans.map((s) => (s as Interval).lo)), hi: Math.min(...spans.map((s) => (s as Interval).hi)) };
}

/**
 * R2 — every version an `engines.node` range admits, as disjoint-enough spans; `undefined` for a
 * range this cannot read, which the caller reports as unread rather than guesses at.
 */
export function admitted(range: string): Interval[] | undefined {
  // An empty branch is every version, as npm reads it.
  const sets = range.split('||').map((set) => comparatorSet(set.trim() || '*'));
  if (sets.includes(undefined)) return undefined;
  return (sets as Interval[]).filter((s) => s.lo < s.hi);
}

/** `x.y.z` → the span from it to `to`, or to every later version. */
export function between(from: string, to?: string): Interval {
  return { lo: lowOf(partsOf(from) as number[]), hi: to === undefined ? Infinity : lowOf(partsOf(to) as number[]) };
}

/** The lowest version `range` admits inside any of `gaps`, as `x.y.z`; `undefined` when there is none or the range is unread. */
export function lowestIn(range: string, gaps: readonly Interval[]): string | undefined {
  const spans = admitted(range);
  if (spans === undefined) return undefined;
  const lowest = Math.min(...spans.flatMap((span) => gaps.map((gap) => ({ lo: Math.max(span.lo, gap.lo), hi: Math.min(span.hi, gap.hi) }))).map((s) => (s.lo < s.hi ? s.lo : Infinity)));
  return lowest === Infinity ? undefined : `${Math.floor(lowest / PLACE / PLACE)}.${Math.floor(lowest / PLACE) % PLACE}.${lowest % PLACE}`;
}

/* ------------------------------------------------------------------ the rows */

/** The family's floor, the same string `scripts/package-shape-lock.test.ts` holds every package to (`NODE_FLOOR`). */
export const FLOOR = '^20.19.0 || >=22.13.0';

/** R3 — the Node lines on which `require()` of an ES module throws `ERR_REQUIRE_ESM`. */
export const NO_REQUIRE_ESM: readonly Interval[] = [between('0.0.0', '20.19.0'), between('21.0.0', '22.12.0')];

/** R4 — below the family's lowest supported Node. */
export const BELOW_FLOOR: readonly Interval[] = [between('0.0.0', '20.19.0')];

/** `npm pkg set` edits `package.json` under every package manager, and the double quotes hold in every shell. */
const RAISE = `npm pkg set "engines.node=${FLOOR}"`;

/** How many porcelain entries a refusal or a row names before it says how many more. */
const SHOWN = 10;

/** Porcelain entries as `git status` printed them, {@link SHOWN} at most, then how many more. */
export function listed(entries: readonly string[]): string {
  const shown = entries.slice(0, SHOWN).join(', ');
  return entries.length > SHOWN ? `${shown} … and ${entries.length - SHOWN} more` : shown;
}

/** How `git status --porcelain` marks a path it does not track. */
const UNTRACKED = '?? ';

/** A `git status --porcelain` entry for a path git does not track. */
export const isUntracked = (entry: string): boolean => entry.startsWith(UNTRACKED);

/** The paths of `?? path` entries, space-separated. */
export const pathsOf = (entries: readonly string[]): string => entries.map((e) => e.slice(UNTRACKED.length)).join(' ');

/** R4 — what `found` says when the range's minimum is below the floor, or there is no range to read; `undefined` when neither. */
function belowFloor(range: string | undefined): string | undefined {
  if (range === undefined) return 'no engines.node';
  if (admitted(range) === undefined) return `engines.node "${range}" could not be read`;
  const lowest = lowestIn(range, BELOW_FLOOR);
  return lowest === undefined ? undefined : `engines.node "${range}" admits ${lowest}`;
}

/** R3, R4 and R5: the rows adopting `targets` raises, in that order. */
function adopting({ manifest, declared, jestConfigs, targets, family }: PreflightInput): PreflightRow[] {
  const rows: PreflightRow[] = [];
  const commonjs = manifest.type !== 'module';
  const node = manifest.engines?.node;
  const range = typeof node === 'string' ? node : undefined;
  const esm = commonjs && range !== undefined ? lowestIn(range, NO_REQUIRE_ESM) : undefined;
  if (esm !== undefined) {
    rows.push({
      check: 'require-esm',
      blocking: true,
      found: `engines.node "${range}" admits ${esm}`,
      message: `this package is CommonJS, and require('${targets[0]}') throws ERR_REQUIRE_ESM on Node ${esm}, which engines.node allows; raising the floor is a semver-major for this package`,
      fix: RAISE,
    });
  } else {
    const found = belowFloor(range);
    if (found !== undefined) rows.push({ check: 'floor', blocking: false, found, message: `the family needs Node ${FLOOR}; adopting raises this package's floor, a semver-major for it`, fix: RAISE });
  }
  const jest = declared.has('jest') || manifest.jest !== undefined || jestConfigs.length > 0;
  const loadsEsm = JSON.stringify([manifest.jest, jestConfigs]).includes('transformIgnorePatterns') || String(manifest.scripts?.test).includes('--experimental-vm-modules');
  if (commonjs && jest && !loadsEsm) {
    rows.push({
      check: 'jest-cjs',
      blocking: true,
      found: 'jest is declared, and package.json has no "type": "module"',
      message: `jest loads this CommonJS package through its own module loader, which cannot load the ES-module-only ${targets.join(', ')}`,
      fix: `set jest's transformIgnorePatterns to "node_modules/(?!(${family.join('|')})/)", or run jest under node --experimental-vm-modules, then re-run burgee migrate`,
    });
  }
  return rows;
}

/**
 * Every row for one run (R1): the cost of adopting the run's targets, then what `--force` let through.
 * A run with no targets is adopting nothing, so it is told nothing about adopting.
 */
export function preflightOf(input: PreflightInput): PreflightRow[] {
  const rows = input.targets.length === 0 ? [] : adopting(input);
  if (input.untracked.length > 0) {
    rows.push({
      check: 'untracked',
      blocking: false,
      found: `git status: ${listed(input.untracked)}`,
      message: '--force skipped the git-tree check, and these untracked paths are not part of the rewrite',
      fix: `add ${pathsOf(input.untracked)} to .gitignore`,
    });
  }
  return rows;
}
