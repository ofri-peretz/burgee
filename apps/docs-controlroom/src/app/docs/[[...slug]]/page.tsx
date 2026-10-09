import { source } from '#/source';
import { DocsPageView, docsPageMetadata } from 'docs-chassis/docs-page';
import { type Metadata } from 'next';

function Page(props: PageProps<'/docs/[[...slug]]'>) {
  return <DocsPageView source={source} params={props.params} />;
}

function generateStaticParams(): { slug: string[] }[] {
  return source.generateParams();
}

async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  return docsPageMetadata(source, props.params);
}

export { generateMetadata, generateStaticParams };
export default Page;
