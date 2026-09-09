/**
 * Turning a declaration into the facts the issue needs — the derived half of R6.
 *
 * "The checklist is derived, not templated." Every line the issue proposes comes from
 * something already in the tree: the subpath's source file from its `exports` entry, its
 * test file by convention, and the exact line of `weight.test.ts` or the README where the
 * competitor's figure is written. **A fact that cannot be derived is omitted rather than
 * invented** — an issue naming a file that does not exist teaches people to skim issues.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { type Declaration, type Entry } from './competitors.js';
import { type Citation, type ClaimSite } from './issue.js';

/**
 * A repo-relative path in the shape the issue must carry it.
 *
 * `relative()` returns the platform's separator, so on a Windows runner every checklist item
 * and every citation would read `packages\\burgee\\src\\weight.test.ts` — which is not a path
 * GitHub links, not what the repo calls the file, and not what somebody can paste. The watch
 * runs on ubuntu today; that is a fact about the schedule, not a property of the code.
 */
const repoPath = (root: string, absolute: string): string => relative(root, absolute).split(sep).join('/');

interface Manifest {
  exports?: Record<string, { import?: string } | string>;
}

/**
 * A measured figure: a comma-grouped byte count, a number with a byte unit, or a version.
 * The same rule `scripts/competitors-lock.test.ts` uses to tell a *citation* from a mention —
 * "chalk and ora disagree about the same terminal" is prose; "chalk 16,727" is a claim with a
 * number in it, and only the second goes stale.
 */
const FIGURE = /\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*(?:B|KB|MB|bytes)\b|\d+\.\d+(?:\.\d+)?/;

/**
 * Not preceded by `/` and not part of a longer hyphenated name. `roundel/chalk` is our own
 * subpath, not a citation of chalk, and `commander-env` is one of our own intents, not a
 * figure about commander.
 */
// The name comes from a committed `competitors.json`, which the declaration lock already
// constrains to its KNOWN list — not from user input or the network.
// eslint-disable-next-line secure-coding/detect-non-literal-regexp -- committed, closed-set input
const NAME_AT = (name: string): RegExp => new RegExp(`(^|[^\\w/-])${name}(?![\\w-])`, 'g');

/**
 * How far a figure may sit from the competitor's name and still be *about* it.
 *
 * The line-level test is too loose on a file like `burgee/src/weight.test.ts`, where nearly
 * every comment line carries one of our own budget numbers and half of them mention
 * commander somewhere. Applied to commander it produced twelve citations, of which three
 * were claims about commander and the rest were our own budgets that happened to name it —
 * and a checklist of twelve near-identical items teaches people to skim the issue, which is
 * the same failure as naming a file that does not exist.
 *
 * Requiring the figure to sit next to the name is what separates "commander's 126 KB lib/"
 * from "Raised from 32,000 … for the V family (commander-env)".
 */
const NEAR = 32;

/**
 * A bare major immediately after the name — "commander 15", "chalk 6".
 *
 * `FIGURE` deliberately will not match a lone integer, because on a file full of byte
 * budgets that would match everything. Requiring the number to sit *immediately* after the
 * competitor's name is specific enough to be safe and catches the version references
 * `FIGURE` cannot: "the front-end is commander 15, ported method for method" is a claim
 * that goes stale the day commander 16 ships.
 */
// eslint-disable-next-line secure-coding/detect-non-literal-regexp -- same committed source as above
const VERSIONED = (name: string): RegExp => new RegExp(`\\b${name}\\s+v?\\d`);

/** Whether some figure on this line sits within `NEAR` characters of the competitor's name. */
function citesNear(line: string, name: string): boolean {
  for (const match of line.matchAll(NAME_AT(name))) {
    const at = (match.index ?? 0) + match[0].length;
    const window = line.slice(Math.max(0, at - name.length - NEAR), at + NEAR);
    if (FIGURE.test(window) || VERSIONED(name).test(window)) return true;
  }
  return false;
}

/** Where a package writes a published figure about this competitor, with the line number. */
export function citationsFor(dir: string, root: string, competitor: string): Citation[] {
  const found: Citation[] = [];
  for (const rel of ['src/weight.test.ts', 'README.md']) {
    const path = join(dir, rel);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      if (!citesNear(line, competitor)) continue;
      found.push({ file: repoPath(root, path), line: index + 1, text: line.replace(/^\s*(?:\/\/|\*)?\s*/, '') });
    }
  }
  return found;
}

/** `./dist/ora.js` → `src/ora.ts`: the source behind a published entry point. */
function sourceOf(dir: string, root: string, subpath: string): string[] {
  const manifestPath = join(dir, 'package.json');
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const entry = manifest.exports?.[subpath];
  const dist = typeof entry === 'string' ? entry : entry?.import;
  if (dist === undefined) return [];
  const src = dist.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts');
  const candidates = [src, src.replace(/\.ts$/, '.test.ts')];
  return candidates.filter((rel) => existsSync(join(dir, rel))).map((rel) => repoPath(root, join(dir, rel)));
}

/** Everything the issue can say about one declared claim, with nothing guessed. */
export function claimSite(declaration: Declaration, subpath: string, entry: Entry, root: string): ClaimSite {
  return {
    owner: declaration.owner,
    subpath,
    claim: entry.claim,
    targets: sourceOf(declaration.dir, root, subpath),
    citations: citationsFor(declaration.dir, root, entry.package),
  };
}
