/**
 * The fumadocs loader every app serves its docs from, and the page type the routes share.
 *
 * An app cannot hand its collection to the chassis by name — `fumadocs-mdx:collections/server`
 * is a virtual module resolved through the app's own `tsconfig.json` — so the app imports
 * its collection and passes it to {@link createSource}. Everything else about the loader is
 * the same in every app: `/docs` as the base URL, a 404 for an unknown slug.
 */
import { type Root } from 'fumadocs-core/page-tree';
import { loader, type MetaData, type PageData, type Source } from 'fumadocs-core/source';
import { type TOCItemType } from 'fumadocs-core/toc';
import { type MDXContent } from 'mdx/types';
import { notFound } from 'next/navigation';

/**
 * What a page carries, stated rather than inferred. `InferPageType` of a loader resolves
 * `data` to the bare `PageData` — no `body`, no `toc`, no `getText` — because the entry type
 * is lost inside `loader`'s generics (both its positional and options forms were tried in
 * `apps/docs`, where this was first found). Naming the shape the collection entries already
 * have keeps it.
 */
export interface DocData extends PageData {
  readonly title: string;
  readonly description?: string;
  readonly body: MDXContent;
  readonly toc: TOCItemType[];
  getText: (type: 'raw' | 'processed') => Promise<string>;
}

/** One docs page, as every route and projection reads it. */
export interface DocsPage {
  readonly url: string;
  readonly slugs: readonly string[];
  readonly data: DocData;
}

/** A fumadocs-mdx `docs` collection: anything that can become a loader source. */
export interface DocsCollection {
  toFumadocsSource: () => Source<{ pageData: DocData; metaData: MetaData }>;
}

/** The loader over one collection, typed by what the collection carries. */
const docsLoader = (collection: DocsCollection) => loader({ baseUrl: '/docs', source: collection.toFumadocsSource() });

/** The loader, and the four ways the routes ask it for pages. */
export interface DocsSource {
  /** Every page, in the order the loader lists them. */
  readonly allPages: () => DocsPage[];
  /** A page or Next's 404 — for pages, which never render a null. */
  readonly getPageOrNotFound: (slug: readonly string[] | undefined) => DocsPage;
  /** A page or `undefined` — for route handlers, which answer their own 404. */
  readonly findPage: (slug: readonly string[] | undefined) => DocsPage | undefined;
  readonly getPageTree: () => Root;
  readonly generateParams: () => { slug: string[] }[];
  /** The raw loader, for fumadocs APIs that take one (the search route). */
  readonly loader: ReturnType<typeof docsLoader>;
}

/** Build an app's loader from its collection. */
export function createSource(collection: DocsCollection): DocsSource {
  const source = docsLoader(collection);
  const findPage = (slug: readonly string[] | undefined): DocsPage | undefined => source.getPage(slug === undefined ? undefined : [...slug]);
  return {
    allPages: () => source.getPages(),
    getPageOrNotFound: (slug) => findPage(slug) ?? notFound(),
    findPage,
    getPageTree: () => source.getPageTree(),
    generateParams: () => source.generateParams(),
    loader: source,
  };
}
