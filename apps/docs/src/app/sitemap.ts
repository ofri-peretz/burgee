import { site } from '#/lib/site';
import { source } from '#/lib/source';
import { sitemapOf } from 'docs-chassis/routes';

/** `/sitemap.xml`: the home page, then every page the loader knows. The lab routes are in no loader. */
export default sitemapOf(site, source);
