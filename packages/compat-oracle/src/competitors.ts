/**
 * The competitor declarations, read as data — `upstream-watch` R1 and R4.
 *
 * A package names what it is measured against in `packages/<pkg>/competitors.json`, per
 * subpath, with the claim it makes (`compat`, `weight`, `surface`) and the last fingerprint
 * we took. This module turns those files into the list the watch walks, and it is the only
 * place that knows a declared name is not always an npm name.
 *
 * Intent constraint 5: the list is data a package owns, not a central table. Nothing here
 * enumerates competitors; it enumerates *packages* and reads what each one declares, so a
 * deleted package takes its watch with it and leaves no orphan row.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type Claim = 'compat' | 'weight' | 'surface';

export interface Seen {
  /** The npm package actually fetched, which is not always the name we call it by. */
  registry?: string;
  version: string | null;
  /** sha1 of the tarball the numbers below were computed from. */
  shasum?: string;
  /** Bytes across the resolved tree, each package counted whole — the published figure. */
  weight: number | null;
  /** Bytes the package itself ships, before its dependencies. */
  self?: number;
  /** How many packages the tree resolved to. */
  packages?: number;
  /** sha256 per shipped file, so a republished release with moved bytes is visible. */
  files?: Record<string, string>;
  /** Every name on the public surface, from the `.d.ts` where there is one. */
  exports?: string[];
  measured: string;
  /** Where in our tree this competitor's figure is written down. */
  cited?: string[];
}

export interface Entry {
  package: string;
  claim: Claim;
  /** The npm package name, when it differs from `package`. */
  registry?: string;
  /**
   * The competitor whose *resolved tree* this figure comes from.
   *
   * flagstaff itemises ora's dependency bill — `cli-spinners 27,841 · signal-exit 21,983 ·
   * chalk 16,727` — and those are not claims about each package's latest release. They are
   * each package's contribution **inside ora's tree**, where chalk resolves to 5.6.2 and not
   * to the 6.0.0 on `dist-tags.latest`. Measuring them against latest would report a
   * difference every time upstream shipped a major nobody in that tree installs, and would
   * overwrite a correct number with an unrelated one.
   *
   * With `via`, the figure is read out of the parent's resolved tree, so it reproduces
   * exactly and it moves when — and only when — the parent's resolution moves.
   */
  via?: string;
  seen: Seen | null;
}

export interface Declaration {
  /** The workspace package doing the declaring. */
  owner: string;
  dir: string;
  file: string;
  subpaths: Record<string, Entry[]>;
}

/**
 * Declared names whose npm package is a different string.
 *
 * There is exactly one today and it is the reason this map exists rather than an assumption:
 * we call the prompts library **clack**, its repo is `bombshell-dev/clack`, and `clack` on
 * npm is an unrelated placeholder at 0.1.0. A watch that resolved the declared name would
 * have downloaded that package, fingerprinted it, and reported a perfectly plausible number
 * for the wrong library — the same defect as a benchmark resolving a hoisted package.
 *
 * `assertResolvable()` makes an unmapped surprise an error rather than a silent wrong fetch.
 */
export const NPM_NAME: Record<string, string> = {
  clack: '@clack/prompts',
};

/** The npm package a declared competitor resolves to. */
export const npmNameOf = (entry: Pick<Entry, 'package' | 'registry'>): string =>
  entry.registry ?? NPM_NAME[entry.package] ?? entry.package;

const isEntry = (value: unknown): value is Entry =>
  typeof value === 'object' && value !== null && typeof (value as Entry).package === 'string';

/** Every package under `packages/` that declares competitors, in directory order. */
export function readDeclarations(packagesDir: string): Declaration[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(packagesDir, e.name, 'competitors.json')))
    .map((e) => {
      const dir = join(packagesDir, e.name);
      const file = join(dir, 'competitors.json');
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      const subpaths: Record<string, Entry[]> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (!key.startsWith('./') || !Array.isArray(value)) continue;
        subpaths[key] = value.filter(isEntry);
      }
      return { owner: e.name, dir, file, subpaths };
    })
    .sort((a, b) => a.owner.localeCompare(b.owner));
}

/** One competitor, with every place in the family that claims something against it. */
export interface Watched {
  /** The name we call it by, which is the key in `competitors.json`. */
  name: string;
  /** The npm package the watch fetches. */
  npm: string;
  /** The parent whose resolved tree this figure is read from, when it is not standalone. */
  via?: string;
  /** `{ owner, subpath, claim }` for each claim made against it. */
  claims: { owner: string; subpath: string; claim: Claim; cited: string[] }[];
  /** The strongest claim anyone makes: compat beats weight beats surface. */
  strongest: Claim;
  /** The fingerprint held for it, from the first declaration that has one. */
  seen: Seen | null;
}

const RANK: Record<Claim, number> = { surface: 0, weight: 1, compat: 2 };

/**
 * Every declared competitor across the family, deduplicated by npm package.
 *
 * chalk is claimed against by roundel (`compat`) and by flagstaff (`weight`, inside ora's
 * dependency bill). That is one package to fetch and one issue to open when it moves, with
 * both claims named in it — not two watches that each tell half the story.
 */
/**
 * Keyed by (package, via): cli-spinners inside ora's bill and cli-spinners as a corpus
 * `flagstaff/import` offers are two different claims about two different resolutions, and
 * collapsing them would make one of the two numbers wrong.
 */
const watchKey = (entry: Entry): string => `${npmNameOf(entry)}|${entry.via ?? ''}`;

const newWatch = (entry: Entry): Watched => ({
  name: entry.package,
  npm: npmNameOf(entry),
  ...(entry.via === undefined ? {} : { via: entry.via }),
  claims: [],
  strongest: entry.claim,
  seen: null,
});

function absorb(into: Map<string, Watched>, declaration: Declaration, subpath: string, entry: Entry): void {
  const key = watchKey(entry);
  const watched = into.get(key) ?? newWatch(entry);
  watched.claims.push({ owner: declaration.owner, subpath, claim: entry.claim, cited: entry.seen?.cited ?? [] });
  if (RANK[entry.claim] > RANK[watched.strongest]) watched.strongest = entry.claim;
  // The first recorded fingerprint wins; a second declaration of the same package is the
  // same upstream release, so a second copy would only be a chance to disagree.
  watched.seen ??= entry.seen;
  into.set(key, watched);
}

export function watchList(declarations: Declaration[]): Watched[] {
  const byNpm = new Map<string, Watched>();
  for (const declaration of declarations) {
    for (const [subpath, entries] of Object.entries(declaration.subpaths)) {
      for (const entry of entries) absorb(byNpm, declaration, subpath, entry);
    }
  }
  return [...byNpm.values()].sort((a, b) => a.npm.localeCompare(b.npm) || (a.via ?? '').localeCompare(b.via ?? ''));
}

/**
 * Every declared competitor must resolve to a name somebody decided on.
 *
 * A scoped npm package cannot be guessed from a bare name, so a declared name that is not
 * its own npm package and is not in `NPM_NAME` is a fetch we would get wrong. Failing here
 * is the difference between "the watch is incomplete" and "the watch reported a number for
 * a package nobody meant".
 */
export function assertResolvable(watched: Watched[], known: Set<string>): void {
  const unresolved = watched.filter((w) => !known.has(w.npm)).map((w) => `${w.name} → ${w.npm}`);
  if (unresolved.length > 0) {
    throw new Error(`competitor(s) with no confirmed npm package: ${unresolved.join(', ')}`);
  }
}
