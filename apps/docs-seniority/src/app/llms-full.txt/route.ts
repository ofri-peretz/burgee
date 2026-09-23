import { site } from '#/site';
import { source } from '#/source';
import { llmsFullTxtRoute } from 'docs-chassis/routes';

export const dynamic = 'force-static';
export const revalidate = false;

export const GET = llmsFullTxtRoute(site, source);
