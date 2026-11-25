'use client';

/**
 * A command and what it printed, as a terminal: after Interlace's CodeWindow, which tells a
 * reader at a glance that the content is "something on a screen". The docs write these as
 * ```` ```text title="node first.mjs" ```` — a title that is a command, over its output — and
 * fumadocs drew them as files: a document icon beside the command, and a copy button that
 * copied the output. Here the caption is the prompt (`$ node first.mjs`), the icon a terminal,
 * and the button copies the command, the one thing on a terminal block a reader runs.
 *
 * A client component because fumadocs' `CodeBlock` takes its actions slot as a function, which
 * cannot cross from the server-rendered MDX.
 */
import { CodeBlock } from 'fumadocs-ui/components/codeblock';
import { type ComponentProps, type ReactNode, useCallback } from 'react';

import { CopyButton } from './copy-button';

export interface TerminalBlockProps {
  /** The command, from the fence's `title`. */
  readonly command: string;
  /** The highlighted output, as fumadocs' `Pre`. */
  readonly children: ReactNode;
}

const TERMINAL_ICON = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m4 17 6-6-6-6" />
    <path d="M12 19h8" />
  </svg>
);

export function TerminalBlock({ command, children }: TerminalBlockProps) {
  const actions = useCallback(
    (props: ComponentProps<'div'>) => (
      <div {...props}>
        <CopyButton text={command} id="terminal-block-copy" />
      </div>
    ),
    [command],
  );
  return (
    <CodeBlock
      data-slot="terminal-block"
      data-testid="terminal-block"
      icon={TERMINAL_ICON}
      allowCopy={false}
      title={
        <span className="font-mono">
          <span className="sr-only">Output of </span>
          <span aria-hidden="true" className="select-none">
            ${' '}
          </span>
          <span className="text-fd-foreground">{command}</span>
        </span>
      }
      Actions={actions}
    >
      {children}
    </CodeBlock>
  );
}
