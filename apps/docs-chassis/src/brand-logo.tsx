/**
 * Mark + wordmark; the nav title on every layout. Each package is marketed as itself — the
 * family and Interlace are lineage, not part of the lockup.
 *
 * `mark` defaults to the app's own favicon, which `scripts/brand.mts` generates into
 * `src/app/icon.svg` from the package's declared mark, so no app carries a hand-copied SVG.
 */
import { type ReactNode } from 'react';

import { type Site } from './site';

/** The nav mark's edge, in CSS pixels. */
export const NAV_MARK_SIZE = 24;

export function BrandLogo({ site, mark }: { readonly site: Site; readonly mark?: ReactNode }) {
  return (
    <span data-slot="brand-logo" className="inline-flex items-center gap-2.5">
      {mark ?? <img src="/icon.svg" alt="" width={NAV_MARK_SIZE} height={NAV_MARK_SIZE} className="shrink-0" />}
      <span className="font-mono font-semibold lowercase tracking-tight">{site.name}</span>
    </span>
  );
}
