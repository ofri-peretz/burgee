/**
 * The numbers on a package site's home, after Interlace's StatGroup and its rule that "a number
 * beats an adjective, and a source beats both". Each one is read from a file the repository
 * already holds and checks, and carries the path it came from, so the home links every number
 * to its receipt:
 *
 * - runtime dependencies: the `dependencies` of `packages/<pkg>/package.json`;
 * - packed size: the tarball's recorded size in `.sdlc/bands/artifact-size-baseline.json`, the
 *   ratchet `check:artifacts` holds the package to;
 * - incumbent tests passed: the compat-oracle baselines `capabilities.json` cites as grades,
 *   summed (`scripts/capabilities-lock.test.ts` holds that every cited grade exists).
 *
 * A number with no file behind it is left out rather than shown as zero, and a single number
 * is not a band: the home shows them only when there are at least {@link MIN_STATS}.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { blobUrl, capabilitiesPath, readGrade } from './capabilities';

/** The repository root, from the app directory `next build` runs in. */
const ROOT = resolve(process.cwd(), '..', '..');

/** The pack-size ratchet, repo-relative. */
export const SIZE_BASELINE = '.sdlc/bands/artifact-size-baseline.json';

/** Bytes in the kilobyte npm prints (`npm pack` reports kB as 1000 bytes). */
const KB = 1000;

/** How many incumbents a label names before it counts them instead. */
const NAMED_HOSTS = 2;

export interface Stat {
  /** For tests: `home-stat-<id>`. */
  readonly id: string;
  readonly value: string;
  readonly label: string;
  /** The repo-relative file the number is read from. */
  readonly source: string;
  /** The file on GitHub. */
  readonly href: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

function dependencies(pkg: string, root: string): Stat | undefined {
  const source = `packages/${pkg}/package.json`;
  if (!existsSync(join(root, source))) return undefined;
  const count = Object.keys(readJson<{ dependencies?: object }>(join(root, source)).dependencies ?? {}).length;
  return { id: 'dependencies', value: String(count), label: count === 1 ? 'runtime dependency' : 'runtime dependencies', source, href: blobUrl(source) };
}

function packedSize(pkg: string, root: string): Stat | undefined {
  if (!existsSync(join(root, SIZE_BASELINE))) return undefined;
  const row: unknown = readJson<Record<string, unknown>>(join(root, SIZE_BASELINE))[pkg];
  const bytes = row !== null && typeof row === 'object' && !Array.isArray(row) ? (row as { size?: unknown }).size : undefined;
  if (typeof bytes !== 'number') return undefined;
  return { id: 'size', value: `${(bytes / KB).toFixed(1)} kB`, label: 'packed for npm, the ceiling CI holds it to', source: SIZE_BASELINE, href: blobUrl(SIZE_BASELINE) };
}

function incumbentTests(pkg: string, root: string): Stat | undefined {
  const file = capabilitiesPath(pkg, root);
  if (!existsSync(file)) return undefined;
  const grades = [...new Set([...readFileSync(file, 'utf8').matchAll(/"grade":\s*"([^"]+)"/gu)].map((m) => m[1] ?? ''))].filter((g) => g !== '').toSorted();
  if (grades.length === 0) return undefined;
  const totals = grades.map((g) => readGrade(g, root)).reduce((sum, g) => ({ passed: sum.passed + g.passed, reference: sum.reference + g.reference }), { passed: 0, reference: 0 });
  const hosts = grades.map((g) => basename(g, '.json'));
  const whose = hosts.length <= NAMED_HOSTS ? hosts.map((h) => `${h}’s`).join(' and ') : `${hosts.length} incumbents’`;
  const source = 'packages/compat-oracle/baseline/';
  return { id: 'incumbent-tests', value: `${totals.passed} / ${totals.reference}`, label: `of ${whose} own tests pass`, source, href: `${blobUrl(source).replace('/blob/', '/tree/')}` };
}

/** Fewer numbers than this and the home leaves the band out. */
export const MIN_STATS = 2;

/** The numbers a package's home shows, in reading order; any that has no file is left out. */
export function homeStats(pkg: string, root: string = ROOT): Stat[] {
  const stats = [incumbentTests(pkg, root), dependencies(pkg, root), packedSize(pkg, root)].filter((s) => s !== undefined);
  return stats.length < MIN_STATS ? [] : stats;
}
