/**
 * One "coming from <incumbent>" link on a package site's home page. A function of the page
 * rather than a component with props, so the home page can hand it straight to `.map`.
 */
import Link from 'next/link';
import { type ReactNode } from 'react';

import { type DocsPage } from './source';

export function incumbentLink(page: DocsPage): ReactNode {
  const id = `home-${page.slugs.join('-')}`;
  return (
    <Link key={page.url} href={page.url} data-testid={id} data-slot={id} className="rounded-md border px-4 py-2 font-medium">
      {page.data.title}
    </Link>
  );
}
