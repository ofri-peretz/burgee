import { type InferPageType, loader } from 'fumadocs-core/source';
import { docs } from 'fumadocs-mdx:collections/server';
import { notFound } from 'next/navigation';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});

/**
 * The page type, stated rather than inferred, and the reason is worth the four lines.
 *
 * `InferPageType<typeof source>` resolves `data` to the bare `PageData` — no `body`, no
 * `toc`, no `getText` — even though `docs.toFumadocsSource()` is correctly typed as
 * `DocCollectionEntry` (which is `DocData & DocMethods & Frontmatter`). The inference is
 * lost inside `loader`'s generics, in both its positional and options-object forms; both
 * were tried.
 *
 * This had been failing for some time and nothing ran it: `apps/docs`'s build is a turbo
 * task, and turbo was serving a cache hit. The only reason it surfaced is that a lockfile
 * change missed the cache — a gate reporting success having verified nothing.
 *
 * So the collection entry is named directly. It is the same type `toFumadocsSource` carries;
 * this only stops it being dropped on the way through the loader.
 */
type DocEntry = (typeof docs)['docs'][number];
export type DocsPage = Omit<InferPageType<typeof source>, 'data'> & { data: DocEntry };

/** Every docs page, typed the way {@link DocsPage} explains. */
export const allPages = (): DocsPage[] => source.getPages() as DocsPage[];

/** Resolve a docs page or end the request with Next's 404. Never returns null. */
export function getPageOrNotFound(slug: string[] | undefined): DocsPage {
  const page = source.getPage(slug);
  if (!page) notFound();
  return page as DocsPage;
}

/** Resolve a docs page or `undefined` — for route handlers, which answer their own 404. */
export function findPage(slug: string[] | undefined): DocsPage | undefined {
  return source.getPage(slug) as DocsPage | undefined;
}
