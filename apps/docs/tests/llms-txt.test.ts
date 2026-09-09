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

/** Every `.mdx` under `content/docs`, as repo-relative paths. */
function mdxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) mdxFiles(abs, found);
    else if (entry.name.endsWith('.mdx')) found.push(abs);
  }
  return found;
}

/** The URL fumadocs' loader gives a file: `baseUrl` + its path, with `index` folded away. */
function urlOf(abs: string): string {
  const slug = relative(CONTENT, abs).replace(/\.mdx$/, '').split(/[\\/]/).filter((s) => s !== 'index');
  return ['/docs', ...slug].join('/').replace('//', '/');
}

/** A prerendered route-handler body, or a failure that says which build step did not run. */
function body(route: string): string {
  const file = join(PRERENDERED, `${route}.body`);
  if (!existsSync(file)) throw new Error(`No prerendered ${route} at ${file}. Run \`npm run build -w docs\` first — \`turbo run test\` does this for you.`);
  return readFileSync(file, 'utf8');
}

const urls = mdxFiles(CONTENT).map(urlOf).sort();

describe('llms.txt is a projection of the docs, not a list somebody maintains', () => {
  it('has pages to project at all', () => {
    // Guards the assertions below against a silently empty content directory, which would
    // otherwise make every "contains" check vacuously true.
    expect(urls.length).toBeGreaterThan(0);
  });

  it('lists every page under content/docs', () => {
    const text = body('llms.txt');
    const missing = urls.filter((url) => !text.includes(`(https://cli.interlace.tools${url})`));
    expect(missing, `llms.txt is missing ${missing.length} page(s) that exist under content/docs: ${missing.join(', ')}`).toEqual([]);
  });

  it('lists nothing that is not a page', () => {
    // The other direction: a stale hard-coded row survives the file being deleted.
    const listed = [...body('llms.txt').matchAll(/\(https:\/\/cli\.interlace\.tools(\/docs[^)]*)\)/g)].map((m) => m[1]);
    expect(listed.toSorted()).toEqual(urls);
  });

  it('carries the whole corpus in llms-full.txt, one section per page', () => {
    const text = body('llms-full.txt');
    const missing = urls.filter((url) => !text.includes(`Source: https://cli.interlace.tools${url}`));
    expect(missing, `llms-full.txt is missing ${missing.length} page(s): ${missing.join(', ')}`).toEqual([]);
    // Frontmatter is the site's metadata, not the page's content — it must not be shipped
    // to a reader that cannot see the site.
    expect(text.startsWith('---')).toBe(false);
  });
});
