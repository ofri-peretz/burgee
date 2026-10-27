import { site } from '#/site';
import { RootLayout, rootMetadata } from 'docs-chassis/root-layout';
import { type ReactNode } from 'react';

const metadata = rootMetadata(site);

export default function Layout({ children }: { children: ReactNode }) {
  return <RootLayout site={site}>{children}</RootLayout>;
}

export { metadata };
