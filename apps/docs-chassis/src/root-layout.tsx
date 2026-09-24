/**
 * The root `<html>` every docs app renders inside, and the metadata defaults it states.
 *
 * Parameterised by the app's {@link Site}, so the host in `metadataBase` and the name in the
 * title template come from the app's row — an app states neither itself.
 */
import { RootProvider } from 'fumadocs-ui/provider/next';
import { type Metadata } from 'next';
import { type ReactNode } from 'react';

import { Analytics } from './analytics';
import { type Site } from './site';

import './global.css';

/**
 * The commit this bundle was built from, stamped into every page as
 * `<meta name="x-build-sha">`. `deploy-docs.yml` reads it back off the deployed URL after the
 * upload: a deploy that reports success while the CDN still serves the previous build is the
 * failure a green workflow cannot otherwise see. `NEXT_PUBLIC_BUILD_SHA` is set by that
 * workflow; `VERCEL_GIT_COMMIT_SHA` covers a build started from Vercel's own UI; `dev` is
 * every local run.
 */
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

/**
 * Site-wide defaults. `metadataBase` is what turns every relative URL a page states —
 * canonical, the `.md` alternate, Open Graph `url`, the `opengraph-image` file — into an
 * absolute one on the app's own host rather than whichever preview URL served the build.
 */
export function rootMetadata(site: Site, description: string = site.description): Metadata {
  return {
    metadataBase: new URL(site.url),
    other: { 'x-build-sha': BUILD_SHA },
    title: { default: site.name, template: `%s | ${site.name}` },
    description,
    applicationName: site.name,
    openGraph: { type: 'website', siteName: site.name, locale: 'en_US', url: '/', title: site.name, description },
    twitter: { card: 'summary_large_image', title: site.name, description },
  };
}

/**
 * fumadocs' provider inside PostHog, which is told which site it is on — the row's key and
 * host, so every event in the shared project says where it came from.
 */
export function RootLayout({ site, children }: { readonly site: Site; readonly children: ReactNode }) {
  const properties = { site: site.key, host: site.url };
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Analytics properties={properties}>
          <RootProvider>{children}</RootProvider>
        </Analytics>
      </body>
    </html>
  );
}
