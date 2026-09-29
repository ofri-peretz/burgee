/**
 * One mark's contents: the symbol, its word for a screen reader — a lone ✓ is announced as
 * "check mark", which is not the claim "yes" — the word "partial" where it is, what is missing
 * or why, and the link to the evidence around all of it.
 */
import { type ReactNode } from 'react';

import { inlineSegment } from './capability-inline';
import { type CellView } from './capability-view';

export function markBody(cell: CellView): ReactNode {
  const body = (
    <>
      <span aria-hidden="true" className={`font-semibold ${cell.tone}`}>
        {cell.symbol}
      </span>
      <span className="sr-only">{`${cell.who}: ${cell.label}`}</span>
      {cell.partial ? <span className={`ms-1 text-xs font-medium ${cell.tone}`}>partial</span> : null}
      {cell.detail.length === 0 ? null : <span className="mt-0.5 block text-xs leading-snug text-fd-muted-foreground">{cell.detail.map(inlineSegment)}</span>}
    </>
  );
  if (cell.href === undefined) return <span className="block">{body}</span>;
  return (
    <a href={cell.href} data-testid="capability-evidence" data-slot="capability-evidence" className="block rounded-sm no-underline hover:underline focus-visible:outline-2 focus-visible:outline-fd-ring" title={`Evidence for ${cell.who}: ${cell.label}`}>
      {body}
    </a>
  );
}
