/** One theme as a list of cards under its name. */
import { type ReactNode } from 'react';

import { cardRow } from './capability-card-row';
import { type ThemeView } from './capability-view';

export function cardTheme(theme: ThemeView): ReactNode {
  return (
    <section key={theme.key} aria-label={theme.theme}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">{theme.theme}</p>
      <ul className="space-y-3">{theme.rows.map(cardRow)}</ul>
    </section>
  );
}
