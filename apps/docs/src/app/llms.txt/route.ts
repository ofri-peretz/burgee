import { LLMS_INTRO } from '#/lib/llms';
import { site } from '#/lib/site';
import { source } from '#/lib/source';
import { publicPackages } from 'docs-chassis/packages';
import { llmsTxtRoute } from 'docs-chassis/routes';

// Prerendered at build time: the corpus only changes when the build does, and a static
// body is what the post-deploy check in `deploy-docs.yml` reads back off the CDN.
export const dynamic = 'force-static';
export const revalidate = false;

export const GET = llmsTxtRoute(site, source, { intro: LLMS_INTRO, packages: publicPackages() });
