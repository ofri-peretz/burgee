/** A column header: the package's name, ours shaded like its cells. */
import { type ReactNode } from 'react';

import { type ColumnView } from './capability-view';

export function columnHead(column: ColumnView): ReactNode {
  return (
    <th key={column.key} scope="col" className={`p-3 text-start font-medium ${column.ours ? 'bg-fd-accent/40' : ''}`}>
      <code className="text-xs">{column.name}</code>
    </th>
  );
}
