import { SITE } from '#/lib/site';
import { allPages } from '#/lib/source';
import { type MetadataRoute } from 'next';

/**
 * `/sitemap.xml`: the home page, then every page the fumadocs loader knows — the same
 * `source.getPages()` the docs route renders and `/llms.txt` projects, so a new MDX file is
 * in the sitemap the build it lands, and a deleted one is gone the same build. A hand list
 * is how the blog's sitemap came to name two redirects and miss three pages.
 *
 * The lab routes are not here and not in any loader; `robots.ts` disallows them as well.
 * `tests/seo.test.ts` checks the prerendered file against `content/docs` on disk.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE }, ...allPages().map((page) => ({ url: `${SITE}${page.url}` }))];
}
