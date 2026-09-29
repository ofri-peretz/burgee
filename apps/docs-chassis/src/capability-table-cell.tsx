/** A mark as a table cell; ours is shaded so the column being compared against stands out. */
import { type ReactNode } from 'react';

import { markBody } from './capability-mark';
import { type CellView } from './capability-view';

export function tableCell(cell: CellView): ReactNode {
  return (
    <td key={cell.key} className={`p-3 ${cell.ours ? 'bg-fd-accent/40' : ''}`}>
      {markBody(cell)}
    </td>
  );
}
