'use client';

/**
 * One `$pageview` per App Router navigation. Next's App Router fires no navigation event
 * posthog-js can hook, so `capture_pageview` is off in `analytics.tsx` and this is the only
 * place a pageview is captured — exactly once per route.
 */
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { useEffect } from 'react';

/** Records one `$pageview` per App Router navigation, which posthog-js cannot see on its own. */
export function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const query = searchParams.toString();
    // eslint-disable-next-line browser-security/no-tracking-without-consent -- the owner's decision (D-131): one anonymous pageview per route, `person_profiles: 'identified_only'`, nothing identified and nothing personal sent; no consent banner on a static docs site, as on the blog this provider is copied from
    posthog.capture('$pageview', { $current_url: query === '' ? pathname : `${pathname}?${query}` });
  }, [pathname, searchParams]);
  return null;
}
