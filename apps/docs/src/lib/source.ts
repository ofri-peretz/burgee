import { type InferPageType, loader } from 'fumadocs-core/source';
import { docs } from 'fumadocs-mdx:collections/server';
import { notFound } from 'next/navigation';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});

export type DocsPage = InferPageType<typeof source>;

/** Resolve a docs page or end the request with Next's 404. Never returns null. */
export function getPageOrNotFound(slug: string[] | undefined): DocsPage {
  const page = source.getPage(slug);
  if (!page) notFound();
  return page;
}
