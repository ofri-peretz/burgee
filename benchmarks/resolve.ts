/**
 * Which copy of a package a measurement actually measured — the one thing every axis in
 * this suite has to get right before any of its numbers mean anything.
 *
 * This module exists because the suite got it wrong twice, in two different axes, in the
 * same way. The workspace root has **commander 8.3.0** hoisted as somebody's transitive
 * dependency while the version these benchmarks grade against is **15.0.0**, which lives
 * in `benchmarks/node_modules`. Node's upward walk finds whichever it reaches first.
 *
 * - **B4** fell through to the root on CI's first run and reported commander at 29,275
 *   bytes and a 2.0x ratio: a plausible number, a red gate, and a story about our
 *   front-end getting heavier.
 * - **B2** had no version handling at all. With `benchmarks/node_modules/commander` moved
 *   aside — the same CI cache state — it reported `burgee/commander ÷ commander` at
 *   **1.298** against **1.139** minutes earlier, a 14% shift, under its gate, written
 *   straight into the `cold-start-ratio` band with nothing in the record to say which
 *   commander it had raced.
 *
 * **A benchmark that measures the wrong thing does not look broken. It looks like a
 * regression** — or, worse for B2, like a perfectly ordinary number. So both axes resolve
 * every package through `resolvePackage` here, both write the resolved version and path
 * into every record, and a version outside the range `benchmarks/package.json` declares
 * stops the run.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCH_ROOT = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(BENCH_ROOT, '..');

/**
 * A resolved path with the checkout stripped. Two runs of the same commit on two machines
 * should differ in their milliseconds and in nothing else, so a results file records
 * `<repo>/node_modules/commander`, not somebody's home directory.
 */
export const relativeToRepo = (dir: string): string => resolve(dir).replace(REPO_ROOT, '<repo>');

/**
 * The ranges `benchmarks/package.json` declares, which is what every package measured
 * here is supposed to be. Read from the file rather than restated in this module, so
 * there is one place a version is pinned and no second copy to drift from it.
 */
export const DECLARED = ((): ReadonlyMap<string, string> => {
  const manifest = JSON.parse(readFileSync(join(BENCH_ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return new Map(Object.entries({ ...manifest.dependencies, ...manifest.devDependencies }));
})();

const CARET = /^\^\d+\.\d+\.\d+$/;
const EXACT = /^\d+\.\d+\.\d+$/;
const SEMVER_PARTS = 3;

/** major.minor.patch, or nothing if it is not that shape. */
function triple(text: string): [number, number, number] | undefined {
  const parts = text.split('.').map(Number);
  const [major, minor, patch] = parts;
  if (parts.length !== SEMVER_PARTS || major === undefined || minor === undefined || patch === undefined) return undefined;
  return parts.some((n) => Number.isNaN(n)) ? undefined : [major, minor, patch];
}

/**
 * The three range shapes `benchmarks/package.json` uses, and nothing else — an
 * unrecognised range throws rather than passing, because a version check that quietly
 * returns `true` for anything it does not understand is not a check.
 */
export function satisfies(version: string, range: string): boolean {
  if (range === '*') return true;
  if (EXACT.test(range)) return version === range;
  if (!CARET.test(range)) {
    throw new Error(`benchmarks/package.json declares "${range}", a range shape satisfies() does not know; teach it rather than skipping the check`);
  }
  const want = triple(range.slice(1));
  const got = triple(version);
  if (want === undefined || got === undefined) return false;
  if (got[0] !== want[0]) return false;
  return got[1] > want[1] || (got[1] === want[1] && got[2] >= want[2]);
}

export interface Resolved {
  dir: string;
  version: string;
}

/**
 * The package's own directory, found by walking `node_modules` upward from `from` exactly
 * as Node would — never `require.resolve`, which several of these packages refuse for
 * `package.json` through their `exports` map, and which would silently fall back to the
 * wrong tree.
 *
 * Unguarded on purpose: this is the walk that finds the wrong package. `resolvePackage`
 * is the one every axis is supposed to call.
 */
export function packageDir(name: string, from: string = BENCH_ROOT): Resolved {
  // Bounded by the path itself: one iteration per ancestor directory, so the walk cannot
  // outlive the filesystem even if `dirname` ever stopped converging.
  let cursor = from;
  for (const _ of from.split(sep)) {
    const candidate = join(cursor, 'node_modules', name);
    try {
      const manifest = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8')) as { version?: string };
      return { dir: candidate, version: manifest.version ?? 'unknown' };
    } catch {
      cursor = dirname(cursor);
    }
  }
  throw new Error(`${name} is not installed anywhere above ${from}`);
}

/**
 * The package an axis is supposed to be measuring, or a loud failure.
 *
 * `from` is the directory the measurement itself resolves from — `benchmarks/` for B4's
 * bundler, the cold-start fixture directory for B2's spawned processes — so the version
 * checked is the version that ran, not an approximation of it.
 */
export function resolvePackage(name: string, from: string = BENCH_ROOT): Resolved {
  const declared = DECLARED.get(name);
  if (declared === undefined) {
    throw new Error(`${name} is measured by this suite but benchmarks/package.json does not declare it, so the version measured would be whatever npm happened to hoist`);
  }
  const found = packageDir(name, from);
  if (satisfies(found.version, declared)) return found;
  const shadowed = `resolved ${name}@${found.version} from ${found.dir}, but benchmarks/package.json declares "${declared}"`;
  throw new Error(`${shadowed} — something above benchmarks/ is shadowing it; run \`npm ci\` so benchmarks/node_modules is populated. Measuring the wrong package is worse than measuring nothing.`);
}
