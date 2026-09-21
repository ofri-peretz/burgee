import { llmsFull } from '#/lib/llms';
import { allPages } from '#/lib/source';

// Same reasoning as `llms.txt/route.ts`: static at build time, read back after deploy.
export const dynamic = 'force-static';
export const revalidate = false;

export async function GET(): Promise<Response> {
  return new Response(await llmsFull(allPages()), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
