import { getPageOrNotFound, source } from '#/lib/source';
import { getMDXComponents } from '#/mdx-components';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';

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

async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const { title, description } = getPageOrNotFound(params.slug).data;
  return { title, description };
}

export { generateMetadata, generateStaticParams };
export default Page;
