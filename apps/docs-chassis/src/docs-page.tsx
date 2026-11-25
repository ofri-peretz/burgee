/**
 * One docs page from the loader, and the metadata every crawler and agent reads off it —
 * canonical, the `.md` alternate, Open Graph — the same on every site.
 */
import { DocsBody, DocsDescription, DocsPage, DocsTitle, MarkdownCopyButton, ViewOptionsPopover } from 'fumadocs-ui/layouts/docs/page';
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
  const page = source.getPageOrNotFound(slug);
  const { body: MDX, toc, title, description } = page.data;
  const markdownUrl = `${page.url}.md`;
  return (
    <DocsPage toc={toc}>
      <DocsTitle>{title}</DocsTitle>
      <DocsDescription className="mb-0">{description}</DocsDescription>
      {pageActions(markdownUrl)}
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

/**
 * Under the description, the page for a reader who is not a browser: copy it as Markdown (the
 * `.md` twin every page already has), or open it in an assistant. Interlace treats agents as a
 * reader its pages are written for (`/llms-full.txt`, the agent skills), and this puts that
 * door on every page rather than only in `llms.txt`. fumadocs' own buttons, on its tokens.
 */
function pageActions(markdownUrl: string) {
  return (
    <div data-slot="page-actions" data-testid="page-actions" className="flex flex-row flex-wrap items-center gap-2 border-b pb-6">
      <MarkdownCopyButton markdownUrl={markdownUrl} />
      <ViewOptionsPopover markdownUrl={markdownUrl} />
    </div>
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
