import { PITCH } from '#/lib/llms';
import { site } from '#/lib/site';
import { RootLayout, rootMetadata } from 'docs-chassis/root-layout';
import { type ReactNode } from 'react';

/**
 * Site-wide defaults from the chassis — `metadataBase` on the row's host, the `x-build-sha`
 * stamp `deploy-docs.yml` reads back — with the canonical {@link PITCH} as the description,
 * never a local variant.
 */
const metadata = rootMetadata(site, PITCH);

export default function Layout({ children }: { children: ReactNode }) {
  return <RootLayout site={site}>{children}</RootLayout>;
}

export { metadata };
