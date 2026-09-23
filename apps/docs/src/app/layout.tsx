import { Analytics } from '@vercel/analytics/next';
import { SITE } from '#/lib/site';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { type Metadata } from 'next';
import { type ReactNode } from 'react';

import './global.css';

/**
 * The commit this bundle was built from, stamped into every page as
 * `<meta name="x-build-sha">`. `deploy-docs.yml` reads it back off the deployed URL after
 * the upload: a deploy that reports success while the CDN still serves the previous build
 * is the failure mode that a green workflow cannot otherwise see. `NEXT_PUBLIC_BUILD_SHA`
 * is set by that workflow; `VERCEL_GIT_COMMIT_SHA` covers a build started from Vercel's
 * own UI; `dev` is every local run.
 */
const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

const DESCRIPTION =
  "Everything a CLI needs that isn't your CLI: help, structured output, a typed schema, an MCP server, completions, types and docs, every one projected from a single declaration.";

/**
 * Site-wide defaults. `metadataBase` is what turns every relative URL a page states —
 * canonical, the `.md` alternate, Open Graph `url`, the `opengraph-image` file convention —
 * into an absolute one on the canonical host rather than whichever preview URL served the
 * build. The Open Graph and Twitter blocks are the fallback card for any page that states
 * none of its own; the image itself comes from `opengraph-image.tsx`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  other: { 'x-build-sha': BUILD_SHA },
  title: { default: 'burgee', template: '%s | burgee' },
  description: DESCRIPTION,
  applicationName: 'burgee',
  openGraph: { type: 'website', siteName: 'burgee', locale: 'en_US', url: '/', title: 'burgee', description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: 'burgee', description: DESCRIPTION },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
        {/*
          Vercel Web Analytics (roadmap 2.3): page views, so Phase 4 can see which
          `/docs/packages/*` pages are read before any of them earns its own app. It injects
          `/_vercel/insights/script.js` after hydration, and that path only answers once Web
          Analytics is enabled on the Vercel project — until then it is a quiet 404. The
          agent-facing routes (`/llms.txt`, `/llms-full.txt`, the `.md` twins) are
          prerendered and served from the CDN with no HTML and no function invocation, so
          neither this component nor `track()` from `@vercel/analytics/server` can see
          them; their hits are in the project's request logs and Observability instead.
        */}
        <Analytics />
      </body>
    </html>
  );
}
