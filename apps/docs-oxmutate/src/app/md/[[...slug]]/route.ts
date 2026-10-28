import { site } from '#/site';
import { source } from '#/source';
import { markdownTwinRoute } from 'docs-chassis/routes';

export const dynamic = 'force-static';
export const dynamicParams = false;

export const { generateStaticParams, GET } = markdownTwinRoute(site, source);
