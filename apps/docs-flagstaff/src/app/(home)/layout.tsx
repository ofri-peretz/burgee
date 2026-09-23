import { site } from '#/site';
import { HomeShell } from 'docs-chassis/home-shell';
import { type ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return <HomeShell site={site}>{children}</HomeShell>;
}
