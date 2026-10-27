import { site } from '#/site';
import { source } from '#/source';
import { llmsTxtRoute } from 'docs-chassis/routes';

export const dynamic = 'force-static';
export const revalidate = false;

export const GET = llmsTxtRoute(site, source);
