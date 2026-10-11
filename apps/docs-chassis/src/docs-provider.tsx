'use client';

/**
 * fumadocs' `RootProvider`, with the search dialog swapped for the tracked one. A client
 * module of its own because a component is not a value a server component can hand across the
 * boundary as a prop; lazy, as fumadocs loads its own default dialog, so the dialog's code is
 * not on a page until search is used.
 */
import { RootProvider } from 'fumadocs-ui/provider/next';
import { lazy, type ReactNode } from 'react';

const SEARCH = { SearchDialog: lazy(async () => ({ default: (await import('./search-dialog')).TrackedSearchDialog })) };

export function DocsProvider({ children }: { readonly children: ReactNode }) {
  return <RootProvider search={SEARCH}>{children}</RootProvider>;
}
