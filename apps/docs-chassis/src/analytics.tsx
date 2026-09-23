'use client';

/**
 * PostHog, once, for every docs app — the blog's proven provider (`ofriperetz.dev`,
 * `apps/blog/.interlace/components/analytics/posthog-provider.tsx`), not a new one.
 *
 * One PostHog project serves the blog and all nine docs sites, so every event carries
 * super-properties that say which site sent it: `site` is the app's row key in
 * `.github/vercel-apps.json` and `host` its canonical origin, both passed in from the row by
 * the root layout — never typed per app. `app` is the family's own name in the shared
 * project, beside the blog's `app: 'blog'`.
 *
 * Next's App Router fires no navigation event posthog-js can hook, so `$pageview` is captured
 * here, exactly once per route, and `capture_pageview` is off. Events go to `/ingest` on the
 * site's own origin — `next.config.mjs` (from `docs-chassis/next-config`) rewrites it to
 * PostHog — because ad blockers match on the `*.i.posthog.com` hostname and the direct route
 * silently loses a third of visitors.
 *
 * The project key is inlined at build time by `docs-chassis/next-config`, which falls back to
 * the committed public `phc_` key when `NEXT_PUBLIC_POSTHOG_KEY` is unset; a `phc_` key is
 * write-only and made to ship in a browser bundle. With no key at all the provider is a
 * no-op and the site still renders.
 */
import posthog from 'posthog-js';
import { PostHogProvider as Provider } from 'posthog-js/react';
import { type ReactNode, Suspense } from 'react';

import { PageviewTracker } from './pageview-tracker';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
/**
 * Truthy-or, not `??`: a Vercel env var declared as an empty string would otherwise set
 * `api_host` to "" and break ingest without a word — measured on the blog's project.
 */
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || '/ingest';
/** A relative `api_host` cannot tell posthog-js where the PostHog UI is; toolbar links need it. */
const POSTHOG_UI_HOST = 'https://us.posthog.com';

/** The family's name in the shared project, beside the blog's `blog`. */
const APP = 'burgee-docs';

/**
 * Browser noise that is not an application error: the ResizeObserver loop notice and the
 * opaque cross-origin "Script error.". Anchored on the first frame, so a real error that
 * merely mentions ResizeObserver still reports.
 */
const NOISY_EXCEPTIONS: readonly RegExp[] = [/^ResizeObserver loop/iu, /^Script error\.?$/iu];

function isNoisyException(properties?: Record<string, unknown>): boolean {
  const list = properties?.['$exception_list'];
  if (!Array.isArray(list) || list.length === 0) return false;
  const value = (list[0] as { value?: unknown } | undefined)?.value;
  return typeof value === 'string' && NOISY_EXCEPTIONS.some((re) => re.test(value));
}

/** Playwright, Puppeteer, Selenium and headless Chrome set `navigator.webdriver`; no visitor does. */
function isAutomatedBrowser(): boolean {
  try {
    return navigator.webdriver;
  } catch {
    return false;
  }
}

let initialized = false;

/** What every event from this site carries: which row it is, and that row's origin. */
export interface SiteProperties {
  /** The app's row key in `.github/vercel-apps.json`. */
  readonly site: string;
  /** The app's canonical origin — its row's `productionUrl`. */
  readonly host: string;
}

/** Noise is dropped; anything else — and anything that throws while deciding — is kept. */
function keep<E extends { event: string; properties?: unknown }>(event: E | null): E | null {
  if (event === null) return null;
  try {
    return event.event === '$exception' && isNoisyException(event.properties as Record<string, unknown> | undefined) ? null : event;
  } catch {
    // Dropping noise must never become a way to drop real events.
    return event;
  }
}

function ensureInit({ site, host }: SiteProperties): void {
  if (initialized || typeof window === 'undefined' || POSTHOG_KEY === undefined || POSTHOG_KEY === '') return;
  // CI and scripted browsers are not visitors.
  if (isAutomatedBrowser()) return;
  posthog.init(POSTHOG_KEY, {
    before_send: keep,
    api_host: POSTHOG_HOST,
    ui_host: POSTHOG_UI_HOST,
    person_profiles: 'identified_only',
    // `$pageview` is captured by PageviewTracker below, once per route.
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    capture_exceptions: true,
    capture_performance: true,
    capture_heatmaps: true,
    capture_dead_clicks: true,
  });
  posthog.register({ app: APP, site, host });
  initialized = true;
}

/** Wraps the app in PostHog and registers which site every event came from. */
export function Analytics({ properties, children }: { readonly properties: SiteProperties; readonly children: ReactNode }) {
  if (typeof window !== 'undefined') ensureInit(properties);
  if (POSTHOG_KEY === undefined || POSTHOG_KEY === '') return children;
  return (
    <Provider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </Provider>
  );
}
