/** One capability as a card, for a screen too narrow for the table. */
import { type ReactNode } from 'react';

import { cardCell } from './capability-card-cell';
import { inlineSegment } from './capability-inline';
import { type RowView } from './capability-view';

export function cardRow(row: RowView): ReactNode {
  return (
    <li key={row.key} className="rounded-xl border bg-fd-card p-3">
      <p className="font-medium">{row.capability.map(inlineSegment)}</p>
      <p className="mt-1 text-xs leading-snug text-fd-muted-foreground">{row.why.map(inlineSegment)}</p>
      <dl className="mt-3 grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">{row.cells.map(cardCell)}</dl>
    </li>
  );
}
