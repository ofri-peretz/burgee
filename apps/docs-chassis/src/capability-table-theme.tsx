/** One theme as a table body: its name across the full width, then its rows. */
import { type ReactNode } from 'react';

import { tableRow } from './capability-table-row';
import { type ThemeView } from './capability-view';

export function tableTheme(theme: ThemeView): ReactNode {
  return (
    <tbody key={theme.key}>
      <tr className="border-b bg-fd-muted/50">
        <th scope="colgroup" colSpan={theme.span} className="px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
          {theme.theme}
        </th>
      </tr>
      {theme.rows.map(tableRow)}
    </tbody>
  );
}
