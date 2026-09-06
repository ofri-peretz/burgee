import { RootProvider } from 'fumadocs-ui/provider/next';
import { type Metadata } from 'next';
import { type ReactNode } from 'react';

import './global.css';

export const metadata: Metadata = {
  title: { default: 'Interlace CLI', template: '%s | Interlace CLI' },
  description:
    'The agent-native layer on top of commander and yargs: one schema, a JSON envelope on every command, an exit-code contract, and a manifest an AI agent reads in one call.',
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
