import { site } from '#/lib/site';
import { source } from '#/lib/source';
import { markdownTwinRoute } from 'docs-chassis/routes';

/**
 * The raw-Markdown twin of every docs page, at the page's own URL plus `.md` — see
 * `docs-chassis/routes`. Every twin is prerendered, and `dynamicParams = false` makes a slug
 * the loader does not know a plain 404 rather than a render attempt.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export const { generateStaticParams, GET } = markdownTwinRoute(site, source);
