/** The `(home)` group's layout for a package site: fumadocs' home layout with the shared nav. */
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { type ReactNode } from 'react';

import { baseOptions } from './nav';
import { type Site } from './site';

export function HomeShell({ site, children }: { readonly site: Site; readonly children: ReactNode }) {
  return <HomeLayout {...baseOptions(site)}>{children}</HomeLayout>;
}
