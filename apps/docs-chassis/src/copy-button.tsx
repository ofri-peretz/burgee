'use client';

/**
 * A button that copies one string: the install line on the home, the command over a terminal
 * block. The text it copies is always on the page already, so a refused clipboard costs the
 * reader nothing but a selection by hand.
 */
import { memo, useState } from 'react';

/** How long the button says "Copied" before it goes back, in milliseconds. */
const COPIED_MS = 1600;

export interface CopyButtonProps {
  /** The exact text that lands on the clipboard. */
  readonly text: string;
  /** What the button copies, for its accessible name: `Copy “<what>”`. */
  readonly what?: string;
  /** For tests and analytics: `data-testid` and `data-slot`. */
  readonly id: string;
}

function CopyButtonView({ text, what = text, id }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MS);
      })
      // Clipboard access refused (an insecure origin, a denied permission): the text is still
      // on the page to select by hand, so there is nothing to report.
      .catch(() => setCopied(false));
  };
  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : `Copy “${what}”`}
        data-testid={id}
        data-slot={id}
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
    </>
  );
}

/** Memoised: a page renders one per terminal block, and none changes once rendered. */
export const CopyButton = memo(CopyButtonView);
