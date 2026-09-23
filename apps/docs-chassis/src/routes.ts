/**
 * The handlers behind every app's machine-readable routes. Next needs a file at each route's
 * path, and each of those files states its own `dynamic = 'force-static'` (Next reads segment
 * config from the file itself, not through a re-export); the body is one line from here.
 *
 * All of them are prerendered at build: the corpus only changes when the build does, and a
 * static body is what `deploy-docs.yml`'s post-deploy check reads back off the CDN.
 */
import { createFromSource } from 'fumadocs-core/search/server';
import { type MetadataRoute } from 'next';

import { llmsFull, llmsIndex, type LlmsIndexOptions, markdownOf } from './llms';
import { type Site } from './site';
import { type DocsSource } from './source';

const TEXT = { 'content-type': 'text/plain; charset=utf-8' } as const;
const MARKDOWN = { 'content-type': 'text/markdown; charset=utf-8' } as const;

/** `GET /llms.txt` — the map. Extra options are the front door's intro and package map. */
export function llmsTxtRoute(site: Site, source: DocsSource, options: Omit<LlmsIndexOptions, 'site' | 'pages'> = {}): () => Response {
  return () => new Response(llmsIndex({ site, pages: source.allPages(), ...options }), { headers: TEXT });
}

/** `GET /llms-full.txt` — the whole corpus. */
export function llmsFullTxtRoute(site: Site, source: DocsSource): () => Promise<Response> {
  return async () => new Response(await llmsFull(site, source.allPages()), { headers: TEXT });
}

/**
 * The raw-Markdown twin of every docs page, at the page's own URL plus `.md` — `/docs.md` for
 * the index — mapped by a `beforeFiles` rewrite in `docs-chassis/next-config` onto
 * `src/app/md/[[...slug]]/route.ts`, because a route handler cannot share the
 * `docs/[[...slug]]` segment with the page. Same body as the page's `/llms-full.txt` section.
 */
export function markdownTwinRoute(site: Site, source: DocsSource): {
  readonly generateStaticParams: () => { slug: string[] }[];
  readonly GET: (request: Request, context: { params: Promise<{ slug?: string[] }> }) => Promise<Response>;
} {
  return {
    generateStaticParams: () => source.generateParams(),
    GET: async (_request, context) => {
      const { slug } = await context.params;
      const page = source.findPage(slug);
      if (page === undefined) return new Response('Not found', { status: 404 });
      return new Response(await markdownOf(site, page), { headers: MARKDOWN });
    },
  };
}

/**
 * `/sitemap.xml`: the home page, then every page the loader knows — so a new MDX file is in
 * the sitemap the build it lands and a deleted one is gone the same build.
 */
export function sitemapOf(site: Site, source: DocsSource): () => MetadataRoute.Sitemap {
  return () => [{ url: site.url }, ...source.allPages().map((page) => ({ url: `${site.url}${page.url}` }))];
}

/**
 * `/robots.txt`: everything crawlable except `disallow`, and the sitemap named so a crawler
 * does not have to guess. A disallow only stops a crawl, so a page listed here also carries
 * `noindex` itself.
 */
export function robotsOf(site: Site, disallow: readonly string[] = []): () => MetadataRoute.Robots {
  return () => ({ rules: { userAgent: '*', allow: '/', disallow: [...disallow] }, sitemap: `${site.url}/sitemap.xml`, host: site.url });
}

/** `GET /api/search` — fumadocs' Orama index over the same loader. */
export function searchRoute(source: DocsSource): ReturnType<typeof createFromSource>['GET'] {
  return createFromSource(source.loader, { language: 'english' }).GET;
}
