/**
 * One band of a package site's home below the hero, after Interlace's page grammar: a page is a
 * stack of sections, each opened by a small header (eyebrow, h2, a one-line tagline). A function
 * of its parts rather than a component with props, as `capability-card-row.tsx` is, so the home
 * stays one server render with no component boundary per band.
 *
 * Styled on fumadocs' tokens (`fd-*`), so each site's theme, light and dark, applies with
 * nothing to override.
 */
import { type ReactNode } from 'react';

export interface HomeSectionHeader {
  /** Ties the section to its heading, and names it for tests: `home-<id>`. */
  readonly id: string;
  /** A short label above the heading. */
  readonly eyebrow: string;
  readonly title: string;
  /** One sentence: why a reader would open this section. */
  readonly tagline?: ReactNode;
}

export function homeSection({ id, eyebrow, title, tagline }: HomeSectionHeader, children: ReactNode): ReactNode {
  const headingId = `home-${id}-title`;
  return (
    <section aria-labelledby={headingId} data-slot={`home-${id}`} data-testid={`home-${id}`} className="flex flex-col gap-6">
      <header className="flex max-w-2xl flex-col gap-2">
        <p className="font-mono text-xs font-medium tracking-widest text-fd-muted-foreground uppercase">{eyebrow}</p>
        <h2 id={headingId} className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {title}
        </h2>
        {tagline === undefined ? null : <p className="text-pretty text-fd-muted-foreground">{tagline}</p>}
      </header>
      {children}
    </section>
  );
}
