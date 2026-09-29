/** One capability as a table row: the capability and why it matters, then a mark per package. */
import { type ReactNode } from 'react';

import { inlineSegment } from './capability-inline';
import { tableCell } from './capability-table-cell';
import { type RowView } from './capability-view';

export function tableRow(row: RowView): ReactNode {
  return (
    <tr key={row.key} className="border-b align-top last:border-b-0">
      <th scope="row" className="w-2/5 p-3 text-start font-normal">
        <span className="block font-medium">{row.capability.map(inlineSegment)}</span>
        <span className="mt-1 block text-xs leading-snug text-fd-muted-foreground">{row.why.map(inlineSegment)}</span>
      </th>
      {row.cells.map(tableCell)}
    </tr>
  );
}
