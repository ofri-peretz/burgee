/**
 * Cards of links, after Interlace's FeatureGrid: the grid sizes to its own container rather than
 * the viewport (one track, two from `@xl`, three from `@4xl`), so the same grid reads in a narrow
 * column and on a wide screen. Functions rather than components, as `capability-card-row.tsx`.
 */
import Link from 'next/link';
import { type ReactNode } from 'react';

export function cardGrid(cards: ReactNode): ReactNode {
  return (
    <div className="@container">
      <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">{cards}</ul>
    </div>
  );
}

export interface LinkCard {
  readonly href: string;
  readonly title: string;
  readonly description?: string;
  /** For tests and analytics: `data-testid` and `data-slot` on the link. */
  readonly id: string;
  /** An absolute URL on another host: a plain anchor, and an arrow that says it leaves. */
  readonly external?: boolean;
}

const CARD =
  'group flex h-full flex-col gap-2 rounded-xl border bg-fd-card p-5 text-fd-card-foreground shadow-sm transition-colors hover:border-fd-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring';

/**
 * One card: the whole card is the link, the title says where it goes, the description says what
 * is there. Hover and focus move the border to the accent, so the one coloured thing in view is
 * the card the reader is on.
 */
export function linkCard({ href, title, description, id, external = false }: LinkCard): ReactNode {
  const body = (
    <>
      <span className="flex items-center justify-between gap-3 font-semibold">
        {title}
        <span aria-hidden="true" className="text-fd-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-fd-primary motion-reduce:transition-none motion-reduce:group-hover:translate-x-0">
          {external ? '↗' : '→'}
        </span>
      </span>
      {description === undefined ? null : <span className="line-clamp-3 text-sm text-fd-muted-foreground">{description}</span>}
    </>
  );
  return (
    <li key={href}>
      {external ? (
        <a href={href} data-testid={id} data-slot={id} className={CARD}>
          {body}
        </a>
      ) : (
        <Link href={href} data-testid={id} data-slot={id} className={CARD}>
          {body}
        </Link>
      )}
    </li>
  );
}
