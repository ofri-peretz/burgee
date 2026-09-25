/**
 * The public packages, as the family states them: name, what it is, what it replaces, and
 * where its page is — its own host when it has an app, a section of the front door when the
 * table lists it under `excluded`.
 *
 * Read from `packages/<dir>/package.json` at build time, never listed by hand. The npm
 * description is the sentence a registry search already shows, so it is the one line the
 * package map repeats; a second, site-only summary would start disagreeing with it the first
 * release after it was written. `scripts/sync-package-docs.ts` makes the same choice for the
 * package pages themselves.
 *
 * "What it replaces" is not a separate field either. Every description names its incumbents
 * in one of three phrasings, and {@link replacesOf} reads them out. A description that names
 * none fails the build rather than producing a row with a blank — the map exists to answer
 * "what is the burgee alternative to X?", and a row that cannot answer it is the stale row
 * this module exists to prevent.
 *
 * `apps/docs/turbo.json` lists `packages/*\/package.json` as a build input, so a changed
 * description is never served from turbo's cache.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { appForPackage, packageDocsUrl } from './config';

/** One public package, as the llms.txt package map and the family index print it. */
export interface PublicPackage {
  readonly name: string;
  readonly description: string;
  readonly replaces: string;
  readonly url: string;
  /** Its "Coming from X" guides, one per incumbent it has written one for. */
  readonly guides: readonly Guide[];
}

/** One migration guide on a package's own site: `content/docs/coming-from/<slug>.mdx`. */
export interface Guide {
  readonly title: string;
  readonly description: string;
  readonly url: string;
}

type Manifest = { name?: string; description?: string; private?: boolean };

/**
 * `packages/`, from the app directory. `next build` and vitest both run with `apps/<app>` as
 * the working directory — turbo starts every task in its package — and a path resolved from
 * `import.meta.url` would point into `.next/server` once bundled. Scripts pass their own.
 */
const PACKAGES_DIR = resolve(process.cwd(), '..', '..', 'packages');

/** A quoted or bare `key: value` line from a frontmatter block. */
const field = (block: string, key: string): string => {
  const line = block.split(/\r?\n/u).find((l) => l.startsWith(`${key}:`));
  const raw = line === undefined ? '' : line.slice(key.length + 1).trim();
  return raw.startsWith('"') && raw.endsWith('"') ? (JSON.parse(raw) as string) : raw;
};

/**
 * A package's migration guides, read off its app's `coming-from/` pages in the order its
 * `meta.json` lists them — the same files that app renders, so the front door's map cannot
 * name a guide that is not published. A package with no app of its own has none.
 */
export function guidesOf(name: string, packagesDir: string = PACKAGES_DIR): Guide[] {
  const app = appForPackage(name);
  if (app === undefined || app.familyPages) return [];
  const dir = join(packagesDir, '..', app.dir, 'content', 'docs', 'coming-from');
  if (!existsSync(dir)) return [];
  const meta = join(dir, 'meta.json');
  const order = existsSync(meta) ? ((JSON.parse(readFileSync(meta, 'utf8')) as { pages?: string[] }).pages ?? []) : [];
  const slugs = readdirSync(dir).filter((f) => f.endsWith('.mdx')).map((f) => f.slice(0, -'.mdx'.length));
  const ranked = slugs.toSorted((a, b) => (order.indexOf(a) + 1 || Infinity) - (order.indexOf(b) + 1 || Infinity) || a.localeCompare(b));
  return ranked.map((slug) => {
    const block = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(readFileSync(join(dir, `${slug}.mdx`), 'utf8'))?.[1] ?? '';
    return { title: field(block, 'title'), description: field(block, 'description'), url: `${app.productionUrl}/docs/coming-from/${slug}` };
  });
}

/**
 * The three ways a description names its incumbents, most common first:
 * "Drop-in paths for execa, cross-spawn and which.", "drop-in compatible with commander and
 * yargs.", "a chalk migration path", and paratext's "Covers the OSC half of ansi-escapes, …".
 */
const REPLACES = [/drop-in (?:paths? for|compatible with) ([^.;]+)/i, /\ban? ([\w-]+) migration path\b/i, /\bcovers (?:the [\w-]+ half of )?([^.;]+)/i] as const;

/** The incumbents a description names, or a build failure that says which package is silent. */
export function replacesOf(name: string, description: string): string {
  for (const pattern of REPLACES) {
    const found = pattern.exec(description)?.[1]?.trim();
    if (found !== undefined && found !== '') return found;
  }
  throw new Error(`packages/${name}/package.json: the description names no incumbent ("Drop-in paths for …"), so the llms.txt package map cannot say what ${name} replaces.`);
}

/** Every public workspace package, burgee first — it is the framework; the rest are what it is built from. */
export function publicPackages(dir: string = PACKAGES_DIR): PublicPackage[] {
  if (!existsSync(dir)) throw new Error(`No packages directory at ${dir}; the docs build must run from apps/<app> inside the monorepo.`);
  const found: PublicPackage[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const manifestPath = join(dir, entry.name, 'package.json');
    if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
    if (manifest.private === true || manifest.name === undefined) continue;
    const description = manifest.description ?? '';
    found.push({ name: manifest.name, description, replaces: replacesOf(manifest.name, description), url: packageDocsUrl(manifest.name), guides: guidesOf(manifest.name, dir) });
  }
  return found.toSorted((a, b) => Number(b.name === 'burgee') - Number(a.name === 'burgee') || a.name.localeCompare(b.name));
}
