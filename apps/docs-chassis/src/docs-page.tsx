/**
 * One docs page from the loader, and the metadata every crawler and agent reads off it —
 * canonical, the `.md` alternate, Open Graph — the same on every site.
 */
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { type Metadata } from 'next';

import { getMDXComponents } from './mdx';
import { type DocsSource } from './source';

/**
 * The site's social card, `src/app/opengraph-image.tsx`, named explicitly: a page that states
 * its own `openGraph` replaces the inherited block whole, image included.
 */
const SOCIAL_CARD = '/opengraph-image';

type Params = Promise<{ slug?: string[] }>;

/** Title, description, body and table of contents of the page at `params.slug`. */
export async function DocsPageView({ source, params }: { readonly source: DocsSource; readonly params: Params }) {
  const { slug } = await params;
  const { body: MDX, toc, title, description } = source.getPageOrNotFound(slug).data;
  return (
    <DocsPage toc={toc}>
      <DocsTitle>{title}</DocsTitle>
      <DocsDescription>{description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

/**
 * Title and description from the page's frontmatter, plus the two links a reader other than
 * a browser needs: `canonical`, the one URL this content lives at, and
 * `<link rel="alternate" type="text/markdown">` pointing at the page's `.md` twin. Both are
 * relative; the root layout's `metadataBase` makes them absolute on the app's own host.
 */
export async function docsPageMetadata(source: DocsSource, params: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPageOrNotFound(slug);
  const { title, description } = page.data;
  return {
    title,
    description,
    alternates: { canonical: page.url, types: { 'text/markdown': `${page.url}.md` } },
    openGraph: { type: 'article', title, description, url: page.url, images: SOCIAL_CARD },
    twitter: { card: 'summary_large_image', title, description, images: SOCIAL_CARD },
  };
}
