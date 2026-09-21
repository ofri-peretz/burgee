import { llmsIndex } from '#/lib/llms';
import { allPages } from '#/lib/source';

// Prerendered at build time: the corpus only changes when the build does, and a static
// body is what the post-deploy check in `deploy-docs.yml` reads back off the CDN.
export const dynamic = 'force-static';
export const revalidate = false;

export function GET(): Response {
  return new Response(llmsIndex(allPages()), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
