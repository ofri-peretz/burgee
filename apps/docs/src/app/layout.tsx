import { RootProvider } from 'fumadocs-ui/provider/next';
import { type Metadata } from 'next';
import { type ReactNode } from 'react';

import './global.css';

export const metadata: Metadata = {
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
