/**
 * `/llms.txt` is the site's map for agents, and a map that has quietly lost a road is
 * worse than no map: the reader has no way to tell. The route builds it from
 * `source.getPages()` so that cannot happen — but "so that cannot happen" is an argument,
 * and this is the check.
 *
 * It reads the *prerendered body* Next wrote under `.next/server/app/`, not the module
 * that produced it, so what is asserted is the bytes the CDN will actually serve. The
 * ground truth on the other side is the content directory itself, walked from disk. A new
 * MDX file that never reaches the projection — a filtered route, a hand-written list, a
 * loader misconfigured to a different `dir` — fails here before it is deployed.
 *
 * Proven red: filtering one page out of `llmsIndex()` and rebuilding fails this file with
 * "llms.txt is missing 1 page(s) that exist under content/docs: /docs/the-floor".
 *
 * `turbo run test` declares `dependsOn: ["build"]`, so the artifact is always there when
 * this runs through the repo's own suite.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(APP, 'content', 'docs');
const PRERENDERED = join(APP, '.next', 'server', 'app');

/** Every `.md` and `.mdx` under `content/docs`, as repo-relative paths. */
function mdxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) mdxFiles(abs, found);
    else if (/\.mdx?$/.test(entry.name)) found.push(abs);
  }
  return found;
}

/** The URL fumadocs' loader gives a file: `baseUrl` + its path, with `index` folded away. */
function urlOf(abs: string): string {
  const slug = relative(CONTENT, abs).replace(/\.mdx?$/, '').split(/[\\/]/).filter((s) => s !== 'index');
  return ['/docs', ...slug].join('/').replace('//', '/');
}

/** A prerendered route-handler body, or a failure that says which build step did not run. */
function body(route: string): string {
  const file = join(PRERENDERED, `${route}.body`);
  if (!existsSync(file)) throw new Error(`No prerendered ${route} at ${file}. Run \`npm run build -w docs\` first — \`turbo run test\` does this for you.`);
  return readFileSync(file, 'utf8');
}

const urls = mdxFiles(CONTENT).map(urlOf).sort();

/**
 * The `## Documentation` section alone. The package map above it links the package pages
 * too — on purpose, it answers a different question — so the page-index assertions read only
 * the section they are about, and the package-map assertions read only theirs.
 */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`llms.txt has no "## ${heading}" section`);
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

/**
 * The public packages, read from their manifests on disk: the ground truth the package map
 * is checked against, independent of `src/lib/packages.ts` that produced it.
 */
const PACKAGES = join(APP, '..', '..', 'packages');
const publicPackages = readdirSync(PACKAGES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(PACKAGES, entry.name, 'package.json')))
  .map((entry) => ({ dir: entry.name, manifest: JSON.parse(readFileSync(join(PACKAGES, entry.name, 'package.json'), 'utf8')) as { name: string; private?: boolean } }))
  .filter(({ manifest }) => manifest.private !== true);

describe('llms.txt is a projection of the docs, not a list somebody maintains', () => {
  it('has pages to project at all', () => {
    // Guards the assertions below against a silently empty content directory, which would
    // otherwise make every "contains" check vacuously true.
    expect(urls.length).toBeGreaterThan(0);
  });

  it('lists every page under content/docs', () => {
    const text = section(body('llms.txt'), 'Documentation');
    const missing = urls.filter((url) => !text.includes(`(https://burgee.interlace.tools${url})`));
    expect(missing, `llms.txt is missing ${missing.length} page(s) that exist under content/docs: ${missing.join(', ')}`).toEqual([]);
  });

  it('lists nothing that is not a page', () => {
    // The other direction: a stale hard-coded row survives the file being deleted.
    const listed = [...section(body('llms.txt'), 'Documentation').matchAll(/\(https:\/\/burgee\.interlace\.tools(\/docs[^)]*)\)/g)].map((m) => m[1]);
    expect(listed.toSorted()).toEqual(urls);
  });

  it('maps every public package to what it replaces and its page', () => {
    // The package map is the most quotable line on the site for "what is the alternative to
    // commander?", so a package missing from it is a question the site cannot answer.
    expect(publicPackages.length).toBeGreaterThan(0);
    const map = section(body('llms.txt'), 'Packages');
    const missing = publicPackages.filter(({ dir, manifest }) => !map.includes(`- [${manifest.name}](https://burgee.interlace.tools/docs/packages/${dir}) — replaces `));
    expect(missing.map(({ manifest }) => manifest.name), `llms.txt's package map is missing ${missing.length} public package(s)`).toEqual([]);
    expect(map).not.toMatch(/compat-oracle/);
  });

  it('carries the whole corpus in llms-full.txt, one section per page', () => {
    const text = body('llms-full.txt');
    const missing = urls.filter((url) => !text.includes(`Source: https://burgee.interlace.tools${url}`));
    expect(missing, `llms-full.txt is missing ${missing.length} page(s): ${missing.join(', ')}`).toEqual([]);
    // Frontmatter is the site's metadata, not the page's content — it must not be shipped
    // to a reader that cannot see the site.
    expect(text.startsWith('---')).toBe(false);
  });
});
