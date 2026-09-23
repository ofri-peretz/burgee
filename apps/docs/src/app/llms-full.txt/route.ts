import { site } from '#/lib/site';
import { source } from '#/lib/source';
import { llmsFullTxtRoute } from 'docs-chassis/routes';

// Same reasoning as `llms.txt/route.ts`: static at build time, read back after deploy.
export const dynamic = 'force-static';
export const revalidate = false;

export const GET = llmsFullTxtRoute(site, source);
