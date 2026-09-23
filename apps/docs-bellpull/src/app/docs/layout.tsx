import { site } from '#/site';
import { source } from '#/source';
import { DocsShell } from 'docs-chassis/docs-shell';
import { type ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsShell site={site} source={source}>
      {children}
    </DocsShell>
  );
}
