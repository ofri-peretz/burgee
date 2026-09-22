import { markdownOf } from '#/lib/llms';
import { findPage, source } from '#/lib/source';

/**
 * The raw-Markdown twin of every docs page, for agents and anything else that would rather
 * read Markdown than hydrated HTML. The public URL is the page's own URL plus `.md` —
 * `/docs/compatibility.md`, and `/docs.md` for the index — mapped here by a `beforeFiles`
 * rewrite in `next.config.mjs`, because a route handler cannot share the
 * `docs/[[...slug]]` segment with the page. Each page advertises its twin with
 * `<link rel="alternate" type="text/markdown">`.
 *
 * The body is {@link markdownOf}, the same function each `/llms-full.txt` section comes
 * from, so the per-page file and the corpus cannot disagree. Every twin is prerendered, and
 * `dynamicParams = false` makes a slug the loader does not know a plain 404 rather than a
 * render attempt.
 *
 * The pattern is the one `ofriperetz.dev` uses for `/articles/<slug>.md`.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams(): { slug: string[] }[] {
  return source.generateParams();
}

export async function GET(_request: Request, context: RouteContext<'/md/[[...slug]]'>): Promise<Response> {
  const { slug } = await context.params;
  const page = findPage(slug);
  if (page === undefined) return new Response('Not found', { status: 404 });
  return new Response(await markdownOf(page), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}
