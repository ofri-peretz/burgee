import { getPageOrNotFound, source } from '#/lib/source';
import { getMDXComponents } from '#/mdx-components';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { type Metadata } from 'next';

async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const { body: MDX, toc, title, description } = getPageOrNotFound(params.slug).data;

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

async function generateStaticParams() {
  return source.generateParams();
}

/**
 * The site's social card, `src/app/opengraph-image.tsx`, named explicitly: a page that states
 * its own `openGraph` replaces the inherited block whole, image included, so without this
 * every docs page would share with no picture.
 */
const SOCIAL_CARD = '/opengraph-image';

/**
 * Title and description from the page's frontmatter, plus the two links a reader other than
 * a browser needs. `canonical` names the one URL this content lives at, so a crawler that
 * reached it with a query string or a trailing slash does not count a second page.
 * `alternates.types` renders `<link rel="alternate" type="text/markdown">` pointing at the
 * page's `.md` twin (`src/app/md/[[...slug]]/route.ts`) — the copy an agent should fetch
 * instead of this HTML. Both are relative: the root layout's `metadataBase` makes them
 * absolute.
 */
async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = getPageOrNotFound(params.slug);
  const { title, description } = page.data;
  return {
    title,
    description,
    alternates: { canonical: page.url, types: { 'text/markdown': `${page.url}.md` } },
    openGraph: { type: 'article', title, description, url: page.url, images: SOCIAL_CARD },
    twitter: { card: 'summary_large_image', title, description, images: SOCIAL_CARD },
  };
}

export { generateMetadata, generateStaticParams };
export default Page;
