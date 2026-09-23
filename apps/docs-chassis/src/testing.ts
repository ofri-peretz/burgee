/**
 * The checks every docs app runs against its own build. An app's `tests/site.test.ts` is one
 * call — `docsSiteSuite(import.meta.url)` — and the suite finds the app's row by the workspace
 * name in its `package.json`, then reads what `next build` actually wrote under
 * `.next/server/app/`: the bytes the CDN will serve, not the modules that produced them. The
 * ground truth on the other side is `content/docs` on disk and the row's `productionUrl`, read
 * straight from `.github/vercel-apps.json` — independent of the `src/site.ts` under test.
 *
 * `turbo run test` depends on `build`, so the artifacts exist whenever this runs through the
 * repo's own suite. Each check names the build step that did not run when one is missing.
 *
 * Proven red on 2026-09-23, one mutation each, on `apps/docs-roundel`, rebuilt each time:
 * - `src/site.ts` resolving burgee's row (`defineSite('burgee', …)` with burgee's manifest) —
 *   8 failures: llms.txt, llms-full.txt, the sitemap and the canonical all on the wrong host
 *   (criterion 4's copy-paste, caught on the built artifacts);
 * - the app's root layout rendering fumadocs' provider without the chassis `RootLayout` —
 *   "index.html has no `Analytics` client reference" and no `site` property;
 * - `other: { 'x-build-sha' }` deleted from `rootMetadata` — "carries no <meta name=x-build-sha>".
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface Row {
  readonly package: string;
  readonly workspace: string;
  readonly productionUrl: string;
  readonly familyPages: boolean;
}

/** Every `.md` and `.mdx` under `dir`, as absolute paths. */
function mdxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) mdxFiles(abs, found);
    else if (/\.mdx?$/u.test(entry.name)) found.push(abs);
  }
  return found;
}

/** The URL fumadocs' loader gives a file: `/docs` + its path, with `index` folded away. */
function urlOf(content: string, abs: string): string {
  const slug = relative(content, abs).replace(/\.mdx?$/u, '').split(/[\\/]/u).filter((s) => s !== 'index');
  return ['/docs', ...slug].join('/').replace('//', '/');
}

/** One `## Heading` section of a Markdown document. */
export function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`no "## ${heading}" section`);
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

/** The `content` of `<meta name="x-build-sha">`, or null when the tag is not there. */
function stampedSha(page: string): string | null {
  return /<meta[^>]*name="x-build-sha"[^>]*content="([^"]*)"/u.exec(page)?.[1] ?? /<meta[^>]*content="([^"]*)"[^>]*name="x-build-sha"/u.exec(page)?.[1] ?? null;
}

/** An app under test: its directory, its row, its pages, and readers for its build output. */
export interface BuiltApp {
  readonly dir: string;
  readonly row: Row;
  readonly urls: readonly string[];
  /** A prerendered file under `.next/server/app/`, or a failure naming the step that did not run. */
  readonly built: (file: string) => string;
}

/** Resolve the app a test file belongs to, from its `import.meta.url`. */
export function builtApp(testFileUrl: string): BuiltApp {
  const dir = resolve(dirname(fileURLToPath(testFileUrl)), '..');
  const { name } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string };
  const table = JSON.parse(readFileSync(join(dir, '..', '..', '.github', 'vercel-apps.json'), 'utf8')) as { apps: Record<string, Row> };
  const row = Object.values(table.apps).find((r) => r.workspace === name);
  if (row === undefined) throw new Error(`${dir} is workspace '${name}', which no row of .github/vercel-apps.json names`);
  const content = join(dir, 'content', 'docs');
  const prerendered = join(dir, '.next', 'server', 'app');
  return {
    dir,
    row,
    urls: mdxFiles(content)
      .map((abs) => urlOf(content, abs))
      .toSorted(),
    built: (file) => {
      const abs = join(prerendered, file);
      if (!existsSync(abs)) throw new Error(`No prerendered ${file} at ${abs}. Run \`npm run build -w ${name}\` first — \`turbo run test\` does this for you.`);
      return readFileSync(abs, 'utf8');
    },
  };
}

/** The four route files an agent or crawler reads, each of which must stay prerendered. */
const STATIC_ROUTES = ['src/app/llms.txt/route.ts', 'src/app/llms-full.txt/route.ts', 'src/app/md/[[...slug]]/route.ts'] as const;

/** Every check a docs app owes, against its own build. */
export function docsSiteSuite(testFileUrl: string): void {
  const app = builtApp(testFileUrl);
  const site = app.row.productionUrl;

  describe(`${app.row.workspace}: every page says which commit it was built from`, () => {
    const expected = process.env.NEXT_PUBLIC_BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';
    it.each(['index.html', 'docs.html'])('stamps it into %s', (file) => {
      const sha = stampedSha(app.built(file));
      expect(sha, `${file} carries no <meta name="x-build-sha">, so the post-deploy check can only ever fail — and only after a deploy`).not.toBeNull();
      expect(sha).toBe(expected);
      expect(sha).not.toBe('');
    });
  });

  describe(`${app.row.workspace}: llms.txt is a projection of the docs, on its own host`, () => {
    it('has pages to project at all', () => {
      expect(app.urls.length).toBeGreaterThan(0);
    });

    it('lists every page under content/docs, on this app’s own host', () => {
      const text = section(app.built('llms.txt.body'), 'Documentation');
      const missing = app.urls.filter((url) => !text.includes(`(${site}${url})`));
      expect(missing, `llms.txt is missing ${missing.length} page(s) that exist under content/docs: ${missing.join(', ')}`).toEqual([]);
    });

    it('lists nothing that is not a page', () => {
      const listed = [...section(app.built('llms.txt.body'), 'Documentation').matchAll(/\]\(([^)]+)\)/gu)].map((m) => m[1] ?? '');
      expect(listed.toSorted()).toEqual(app.urls.map((url) => `${site}${url}`));
    });

    it.skipIf(app.row.familyPages)('links to the front door for compatibility and gallery, never to a copy', () => {
      const links = [...section(app.built('llms.txt.body'), 'Family').matchAll(/\]\((https:\/\/[^)]+)\)/gu)].map((m) => new URL(m[1] ?? ''));
      for (const page of ['/docs/compatibility', '/docs/gallery']) {
        const found = links.filter((url) => url.pathname === page);
        expect(found.length, `llms.txt does not link the family ${page} page`).toBe(1);
        expect(found[0]?.origin, `llms.txt links ${page} on its own host, which has no copy of it`).not.toBe(site);
      }
    });

    it('carries the whole corpus in llms-full.txt, one section per page', () => {
      const text = app.built('llms-full.txt.body');
      const missing = app.urls.filter((url) => !text.includes(`Source: ${site}${url}`));
      expect(missing, `llms-full.txt is missing ${missing.length} page(s): ${missing.join(', ')}`).toEqual([]);
      expect(text.startsWith('---')).toBe(false);
    });
  });

  describe(`${app.row.workspace}: the sitemap, robots.txt and .md twins are projections of the docs`, () => {
    it('lists the home page and exactly the pages under content/docs in sitemap.xml', () => {
      const locs = [...app.built('sitemap.xml.body').matchAll(/<loc>([^<]+)<\/loc>/gu)].map((m) => m[1]);
      expect(locs[0]).toBe(site);
      expect(locs.slice(1).toSorted()).toEqual(app.urls.map((url) => `${site}${url}`));
    });

    it('points robots.txt at its own sitemap', () => {
      expect(app.built('robots.txt.body')).toContain(`Sitemap: ${site}/sitemap.xml`);
    });

    it('prerenders a Markdown twin for every page', () => {
      const missing = app.urls.filter((url) => !existsSync(join(app.dir, '.next', 'server', 'app', `${url.replace(/^\/docs/u, 'md')}.body`)));
      expect(missing, `no .md twin for: ${missing.join(', ')}`).toEqual([]);
    });

    it('states its own host as the canonical origin', () => {
      const home = app.built('index.html');
      const canonical = /<link rel="canonical" href="([^"]+)"/u.exec(home)?.[1];
      expect(canonical?.replace(/\/$/u, ''), 'index.html has no canonical on this app’s host').toBe(site);
      expect(home, 'index.html carries no SoftwareSourceCode JSON-LD').toContain('"@type":"SoftwareSourceCode"');
    });
  });

  describe(`${app.row.workspace}: PostHog is on every page, through the same origin`, () => {
    it('the prerendered home page references the Analytics client component, which captures pageviews', () => {
      const html = app.built('index.html');
      const ref = /I\[\d+,\[((?:\\"[^"\\]+\\",?)+)\],\\"Analytics\\"\]/u.exec(html);
      expect(ref, 'index.html has no `Analytics` client reference — is <Analytics> still in docs-chassis RootLayout, and does this app’s layout still render it?').not.toBeNull();
      const chunks = [...(ref?.[1] ?? '').matchAll(/\\"([^"\\]+)\\"/gu)].map((m) => m[1] ?? '');
      const code = chunks.map((c) => readFileSync(join(app.dir, '.next', c.replace(/^\/_next\//u, '')), 'utf8')).join('\n');
      expect(code, `none of ${chunks.join(', ')} captures $pageview`).toContain('$pageview');
    });

    it('tells PostHog which site it is on, from the row', () => {
      const key = Object.entries(JSON.parse(readFileSync(join(app.dir, '..', '..', '.github', 'vercel-apps.json'), 'utf8')).apps as Record<string, Row>).find(([, r]) => r.workspace === app.row.workspace)?.[0];
      expect(app.built('index.html'), 'the Analytics element is not given this app’s row key').toContain(String.raw`\"site\":\"${key}\"`);
    });

    it('rewrites /ingest to PostHog on the same origin', () => {
      const manifest = JSON.parse(readFileSync(join(app.dir, '.next', 'routes-manifest.json'), 'utf8')) as { rewrites: { afterFiles?: { source: string; destination: string }[] } };
      const ingest = (manifest.rewrites.afterFiles ?? []).map((r) => `${r.source} -> ${r.destination}`);
      expect(ingest).toContain('/ingest/:path* -> https://us.i.posthog.com/:path*');
      expect(ingest).toContain('/ingest/static/:path* -> https://us-assets.i.posthog.com/static/:path*');
    });

    it.each(STATIC_ROUTES)('%s is force-static, so it is served from the CDN, not a function', (route) => {
      expect(readFileSync(join(app.dir, route), 'utf8')).toContain("export const dynamic = 'force-static';");
    });
  });
}
