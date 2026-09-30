/** A mark as a term and its definition in a card: the package's name, then its mark. */
import { type ReactNode } from 'react';

import { markBody } from './capability-mark';
import { type CellView } from './capability-view';

export function cardCell(cell: CellView): ReactNode {
  return (
    <div key={cell.key} className="contents">
      <dt className={cell.ours ? 'font-medium' : ''}>
        <code className="text-xs">{cell.who}</code>
      </dt>
      <dd>{markBody(cell)}</dd>
    </div>
  );
}
