/** The `docs` segment's layout for a package site: the loader's page tree in the sidebar. */
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { type ReactNode } from 'react';

import { baseOptions } from './nav';
import { type Site } from './site';
import { type DocsSource } from './source';

export interface DocsShellProps {
  readonly site: Site;
  readonly source: DocsSource;
  readonly children: ReactNode;
}

export function DocsShell(props: DocsShellProps) {
  return (
    <DocsLayout tree={props.source.getPageTree()} {...baseOptions(props.site)}>
      {props.children}
    </DocsLayout>
  );
}
