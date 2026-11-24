'use client';

/**
 * The install line on a package site's home: the command a reader came to copy, in the server
 * HTML as plain text, with a copy button that only adds to it. Interlace's CodeWindow, cut down
 * to the one line a home page needs (content first: no script, the command is still there).
 */
import { useState } from 'react';

/** How long the button says "Copied" before it goes back, in milliseconds. */
const COPIED_MS = 1600;

export function InstallCommand({ name }: { readonly name: string }) {
  const command = `npm install ${name}`;
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard
      .writeText(command)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MS);
      })
      // Clipboard access refused (an insecure origin, a denied permission): the command is
      // still on the page to select by hand, so there is nothing to report.
      .catch(() => setCopied(false));
  };
  return (
    <div
      data-slot="home-install"
      className="flex w-full max-w-md items-center gap-2 rounded-lg border bg-fd-card py-1.5 pr-1.5 pl-4 text-left font-mono text-sm shadow-sm"
    >
      <span aria-hidden="true" className="select-none text-fd-muted-foreground">
        $
      </span>
      <code data-testid="home-install-command" data-slot="home-install-command" className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : `Copy “${command}”`}
        data-testid="home-install-copy"
        data-slot="home-install-copy"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {copied ? (
            <path d="M20 6 9 17l-5-5" />
          ) : (
            <>
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </>
          )}
        </svg>
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Copied to the clipboard' : ''}
      </span>
    </div>
  );
}
