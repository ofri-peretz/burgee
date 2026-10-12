'use client';

/**
 * fumadocs' default search dialog (`fumadocs-ui/components/dialog/search-default`), re-created
 * as fumadocs documents for a custom client, with one addition: it tells `search-tracker.ts`
 * what the reader typed, what the search answered, and which result they opened. Same
 * `/api/search` route, same primitives, same look; the docs apps use no tags or locales, so
 * those props of the default are not carried.
 *
 * The answer count is read from the client's own reply to a query, not from the dialog's
 * `query.data` — that one still holds the previous query's results while the next is loading.
 */
import { useDocsSearch } from 'fumadocs-core/search/client';
import { fetchClient } from 'fumadocs-core/search/client/fetch';
import { SearchDialog, SearchDialogClose, SearchDialogContent, SearchDialogFooter, SearchDialogHeader, SearchDialogIcon, SearchDialogInput, SearchDialogList, SearchDialogOverlay, type SearchItemType } from 'fumadocs-ui/components/dialog/search';
import { type SharedProps } from 'fumadocs-ui/contexts/search';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { captureEvent } from './analytics';
import { createSearchTracker, trackedClient } from './search-tracker';

// eslint-disable-next-line react-features/require-optimization -- it is code-split: `docs-provider.tsx` loads this module through React.lazy, as fumadocs loads its own dialog
export function TrackedSearchDialog({ open, onOpenChange }: SharedProps) {
  const [tracker] = useState(() => createSearchTracker({ capture: captureEvent }));
  const client = useMemo(() => trackedClient(fetchClient(), tracker), [tracker]);
  const { search, setSearch, query } = useDocsSearch({ client });

  // Leaving the page with a query on screen still counts; `pagehide` is the last event a tab
  // reliably fires, on mobile as on desktop.
  useEffect(() => {
    const leave = () => tracker.flush();
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      tracker.flush();
    };
  }, [tracker]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) tracker.closed();
      onOpenChange(next);
    },
    [tracker, onOpenChange],
  );
  const handleSearchChange = useCallback(
    (value: string) => {
      tracker.typed(value);
      setSearch(value);
    },
    [tracker, setSearch],
  );
  const handleSelect = useCallback(
    (item: SearchItemType) => {
      if (item.type !== 'action') tracker.opened(item.url);
    },
    [tracker],
  );

  return (
    // eslint-disable-next-line conventions/require-data-testid -- a Radix dialog root renders no element of its own; the test id is on SearchDialogContent below
    <SearchDialog open={open} onOpenChange={handleOpenChange} search={search} onSearchChange={handleSearchChange} onSelect={handleSelect} isLoading={query.isLoading}>
      <SearchDialogOverlay />
      <SearchDialogContent data-testid="search-dialog" data-slot="search-dialog">
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput data-testid="search-input" data-slot="search-input" />
          <SearchDialogClose data-testid="search-close" data-slot="search-close" />
        </SearchDialogHeader>
        <SearchDialogList items={query.data === 'empty' ? null : query.data} />
      </SearchDialogContent>
      <SearchDialogFooter />
    </SearchDialog>
  );
}
