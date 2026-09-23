import { LAB_ROUTES, SITE } from '#/lib/site';
import { type MetadataRoute } from 'next';

/**
 * `/robots.txt`: everything is crawlable except the design benches, and the sitemap is
 * named so a crawler does not have to guess where it is. The lab pages also carry
 * `noindex` themselves, because a disallow only stops a crawl — a disallowed URL that is
 * linked from elsewhere can still be listed, without a snippet, unless the page says no.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...LAB_ROUTES] },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
