/**
 * The crawler-facing projections — `/sitemap.xml`, `/robots.txt` and each page's `.md` twin —
 * checked the way `llms-txt.test.ts` checks `/llms.txt`: against the prerendered bytes under
 * `.next/server/app/`, with `content/docs` on disk as the ground truth. `sitemap.ts` builds
 * from the loader, not a list; this is what proves the loader and the directory agree.
 *
 * `turbo run test` depends on `build`, so the artifacts exist whenever this runs through the
 * repo's own suite.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(APP, 'content', 'docs');
const PRERENDERED = join(APP, '.next', 'server', 'app');
const SITE = 'https://burgee.interlace.tools';

/** Every `.md` and `.mdx` under `content/docs`, as absolute paths. */
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

/** A prerendered body, or a failure that says which build step did not run. */
function body(file: string): string {
  const abs = join(PRERENDERED, file);
  if (!existsSync(abs)) throw new Error(`No prerendered ${file} at ${abs}. Run \`npm run build -w docs\` first — \`turbo run test\` does this for you.`);
  return readFileSync(abs, 'utf8');
}

const urls = mdxFiles(CONTENT).map(urlOf).sort();

describe('the sitemap, robots.txt and .md twins are projections of the docs', () => {
  it('lists the home page and exactly the pages under content/docs in sitemap.xml', () => {
    expect(urls.length).toBeGreaterThan(0);
    const locs = [...body('sitemap.xml.body').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs[0]).toBe(SITE);
    expect(locs.slice(1).toSorted()).toEqual(urls.map((url) => `${SITE}${url}`));
  });

  it('points robots.txt at the sitemap and keeps the lab routes out', () => {
    const text = body('robots.txt.body');
    expect(text).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    for (const lab of ['/brand-lab', '/caique-lab', '/caique-sheet']) expect(text).toContain(`Disallow: ${lab}`);
  });

  it('prerenders a Markdown twin for every page', () => {
    // `/docs/<slug>.md` is rewritten to `/md/<slug>`; the index twin is `/md` itself.
    const missing = urls.filter((url) => !existsSync(join(PRERENDERED, `${url.replace(/^\/docs/, 'md')}.body`)));
    expect(missing, `no .md twin for: ${missing.join(', ')}`).toEqual([]);
  });
});
