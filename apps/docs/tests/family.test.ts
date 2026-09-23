/**
 * What only the front door owes, on top of the checks every docs app runs
 * (`tests/site.test.ts`, from `docs-chassis/testing`): the family's package map in `/llms.txt`,
 * the design benches kept out of robots.txt, and a 301 from every URL a package used to have
 * here to the host it now has.
 *
 * Read from the prerendered artifacts under `.next/`, like the shared suite, with the ground
 * truth on the other side read from disk: the packages' manifests and `.github/vercel-apps.json`.
 *
 * Proven red: dropping `packages` from the `llms.txt` route fails "maps every public package";
 * returning `[]` from `familyRedirects()` fails "sends every page that moved to its new host".
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { builtApp, section } from 'docs-chassis/testing';
import { describe, expect, it } from 'vitest';

const app = builtApp(import.meta.url);
const REPO = join(app.dir, '..', '..');

interface Row {
  readonly package: string;
  readonly dir: string;
  readonly productionUrl: string;
  readonly familyPages: boolean;
}

const rows = Object.values((JSON.parse(readFileSync(join(REPO, '.github', 'vercel-apps.json'), 'utf8')) as { apps: Record<string, Row> }).apps);

/** The public packages, read from their manifests on disk — independent of `docs-chassis/packages`. */
const publicPackages = readdirSync(join(REPO, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(REPO, 'packages', entry.name, 'package.json')))
  .map((entry) => JSON.parse(readFileSync(join(REPO, 'packages', entry.name, 'package.json'), 'utf8')) as { name: string; private?: boolean })
  .filter((manifest) => manifest.private !== true);

describe('the front door maps the family', () => {
  it('maps every public package to what it replaces and the page it lives on', () => {
    // The package map is the most quotable line on the site for "what is the alternative to
    // commander?", so a package missing from it is a question the site cannot answer — and a
    // package pointed at the front door when it has a host of its own is a stale answer.
    expect(publicPackages.length).toBeGreaterThan(0);
    const map = section(app.built('llms.txt.body'), 'Packages');
    const where = (name: string): string => {
      const own = rows.find((row) => row.package === name && !row.familyPages);
      return own === undefined ? `${app.row.productionUrl}/docs/packages/${name}` : `${own.productionUrl}/docs`;
    };
    const missing = publicPackages.filter(({ name }) => !map.includes(`- [${name}](${where(name)}) — replaces `));
    expect(missing.map(({ name }) => name), `llms.txt's package map is missing or misplaces ${missing.length} public package(s)`).toEqual([]);
    expect(map).not.toMatch(/compat-oracle/u);
  });

  it('keeps the design benches out of robots.txt', () => {
    const text = app.built('robots.txt.body');
    for (const lab of ['/brand-lab', '/caique-lab', '/caique-sheet']) expect(text).toContain(`Disallow: ${lab}`);
  });
});

describe('no inbound link to a page that moved breaks', () => {
  const manifest = JSON.parse(readFileSync(join(app.dir, '.next', 'routes-manifest.json'), 'utf8')) as { redirects: { source: string; destination: string; statusCode?: number }[] };
  const redirects = new Map(manifest.redirects.map((r) => [r.source, r]));

  /** Every URL this host used to serve for a package that now has its own. */
  const moved: [from: string, to: string][] = rows
    .filter((row) => !row.familyPages)
    .flatMap((row) => {
      const comingFrom = join(REPO, row.dir, 'content', 'docs', 'coming-from');
      const slugs = existsSync(comingFrom) ? readdirSync(comingFrom).filter((f) => /\.mdx?$/u.test(f)).map((f) => f.replace(/\.mdx?$/u, '')) : [];
      return [[`/docs/packages/${row.package}`, `${row.productionUrl}/docs`] as [string, string], ...slugs.map((slug): [string, string] => [`/docs/coming-from/${slug}`, `${row.productionUrl}/docs/coming-from/${slug}`])];
    });

  it('has pages that moved at all', () => {
    expect(moved.length).toBeGreaterThan(0);
  });

  it.each(moved)('sends every page that moved to its new host: %s', (from, to) => {
    const found = redirects.get(from);
    expect(found, `${from} has no redirect — every link to it now 404s`).toBeDefined();
    expect(found?.destination).toBe(to);
    expect(found?.statusCode).toBe(301);
    expect(redirects.get(`${from}.md`)?.destination, `${from}.md has no redirect`).toBe(`${to}.md`);
  });

  it('serves none of them itself', () => {
    const served = [...readdirSync(join(app.dir, 'content', 'docs', 'packages'))].filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/u, ''));
    const doubled = served.filter((name) => rows.some((row) => row.package === name && !row.familyPages));
    expect(doubled, 'the front door still carries a page for a package with its own host — two copies of one README').toEqual([]);
  });
});
