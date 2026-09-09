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

export const metadata: Metadata = {
  other: { 'x-build-sha': BUILD_SHA },
  title: { default: 'burgee', template: '%s | burgee' },
  description:
    "Everything a CLI needs that isn't your CLI: help, structured output, a typed schema, an MCP server, completions, types and docs, every one projected from a single declaration.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
