/**
 * Just enough semver to resolve a dependency range to a published version.
 *
 * `upstream-watch` constraint 4 forbids a new runtime dependency, and the weight number
 * depends on resolving a competitor's own dependency ranges the way npm would — so the
 * subset npm packages actually use in their `dependencies` is implemented here rather than
 * pulled in. That subset is small and boring: `^`, `~`, comparators, `x` wildcards, hyphen
 * and `||` unions. It is deliberately *not* a general semver library.
 *
 * Prereleases are never selected. A watch that started reporting on `2.0.0-beta.3` would
 * open issues about releases nobody installs, and `npm install` would not pick them either.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(text: string): Version | null {
  const m = VERSION.exec(text.trim());
  if (m === null) return null;
  const [, major, minor, patch, prerelease] = m;
  if (major === undefined || minor === undefined || patch === undefined) return null;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), prerelease: prerelease ?? null };
}

export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** How much of the range was written: `^1` and `^1.0.0` bound differently. */
const MAJOR_ONLY = 1;
const THROUGH_MINOR = 2;
const FULL = 3;
type Precision = typeof MAJOR_ONLY | typeof THROUGH_MINOR | typeof FULL;

interface Comparator {
  operator: string;
  version: Version;
  precision: Precision;
}

const COMPARATOR = /^(\^|~|>=|<=|>|<|=)?\s*v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?/;

const wildcard = (part: string | undefined): boolean => part === undefined || part === 'x' || part === 'X' || part === '*';

const numberOr = (part: string | undefined, fallback: number): number => (wildcard(part) ? fallback : Number(part));

/** `^1` bounds by major alone, `^1.2` through the minor, `^1.2.3` on all three. */
function precisionOf(minor: string | undefined, patch: string | undefined): Precision {
  if (wildcard(minor)) return MAJOR_ONLY;
  if (wildcard(patch)) return THROUGH_MINOR;
  return FULL;
}

function parseComparator(text: string): Comparator | null {
  const m = COMPARATOR.exec(text.trim());
  if (m === null) return null;
  const [, operator, major, minor, patch] = m;
  if (major === undefined) return null;
  const precision: Precision = precisionOf(minor, patch);
  return {
    operator: operator ?? '=',
    version: { major: Number(major), minor: numberOr(minor, 0), patch: numberOr(patch, 0), prerelease: null },
    precision,
  };
}

/**
 * `^` allows up to the next change of the left-most non-zero digit:
 * `^1.2.3` is `>=1.2.3 <2.0.0`, `^0.2.3` is `>=0.2.3 <0.3.0`, and `^0.0.3` is
 * `>=0.0.3 <0.0.4` — a caret on a `0.0.x` package pins the patch exactly.
 */
function satisfiesCaret(v: Version, c: Comparator): boolean {
  if (compareVersions(v, c.version) < 0) return false;
  if (c.version.major > 0 || c.precision === MAJOR_ONLY) return v.major === c.version.major;
  if (c.version.minor > 0 || c.precision === THROUGH_MINOR) return v.major === 0 && v.minor === c.version.minor;
  // `^0.0.3`: nothing above the patch it names.
  return v.major === 0 && v.minor === 0 && v.patch === c.version.patch;
}

function satisfiesTilde(v: Version, c: Comparator): boolean {
  if (compareVersions(v, c.version) < 0) return false;
  if (c.precision === MAJOR_ONLY) return v.major === c.version.major;
  return v.major === c.version.major && v.minor === c.version.minor;
}

/** An operator-less comparator is a prefix match: `1.2` means "any 1.2.x". */
function satisfiesExact(v: Version, c: Comparator): boolean {
  if (c.precision === MAJOR_ONLY) return v.major === c.version.major;
  if (c.precision === THROUGH_MINOR) return v.major === c.version.major && v.minor === c.version.minor;
  return compareVersions(v, c.version) === 0;
}

const ORDERED: Record<string, (order: number) => boolean> = {
  '>=': (order) => order >= 0,
  '>': (order) => order > 0,
  '<=': (order) => order <= 0,
  '<': (order) => order < 0,
};

function satisfiesComparator(v: Version, c: Comparator): boolean {
  if (c.operator === '^') return satisfiesCaret(v, c);
  if (c.operator === '~') return satisfiesTilde(v, c);
  const ordered = ORDERED[c.operator];
  if (ordered !== undefined) return ordered(compareVersions(v, c.version));
  return satisfiesExact(v, c);
}

const ANY = new Set(['', '*', 'x', 'X', 'latest']);

/** `1.2.3 - 2.0.0` is a range npm writes; rewritten to the comparators it means. */
const expandHyphen = (range: string): string => range.replace(/^(\S+)\s+-\s+(\S+)$/u, '>=$1 <=$2');

/** Every comparator in one `||` branch must hold; an unparseable one fails the branch. */
function satisfiesUnion(union: string, v: Version): boolean {
  const written = expandHyphen(union.trim())
    .split(/\s+/)
    .filter((c) => c !== '');
  if (written.length === 0) return true;
  const parsed = written.map((c) => parseComparator(c));
  // A range we cannot parse — a git url, a `file:` path, an npm alias — satisfies nothing,
  // so the caller falls back to `latest` rather than silently picking a version the range
  // never asked for.
  if (parsed.some((c) => c === null)) return false;
  return parsed.every((c) => c !== null && satisfiesComparator(v, c));
}

/** Whether a published version satisfies a dependency range. */
export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version);
  if (v === null || v.prerelease !== null) return false;
  const trimmed = range.trim();
  if (ANY.has(trimmed)) return true;
  return trimmed.split('||').some((union) => satisfiesUnion(union, v));
}

/** The highest published version satisfying `range`, or null when none does. */
export function maxSatisfying(versions: string[], range: string): string | null {
  const matching = versions.filter((v) => satisfies(v, range));
  if (matching.length === 0) return null;
  return matching.reduce((best, v) => {
    const a = parseVersion(v);
    const b = parseVersion(best);
    if (a === null) return best;
    if (b === null) return v;
    return compareVersions(a, b) > 0 ? v : best;
  });
}

/** The bump between two releases, for deciding what a change is worth reporting as. */
export function bumpKind(from: string, to: string): 'major' | 'minor' | 'patch' | 'none' {
  const a = parseVersion(from);
  const b = parseVersion(to);
  if (a === null || b === null) return 'none';
  if (a.major !== b.major) return 'major';
  if (a.minor !== b.minor) return 'minor';
  if (a.patch !== b.patch) return 'patch';
  return 'none';
}
