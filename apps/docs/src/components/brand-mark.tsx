/**
 * The Interlace mark and lockup, as shipped by every *.interlace.tools site.
 *
 * Geometry is LOCKED (see brand-assets/interlace-icon.svg and
 * packages/ui/src/patterns/brand-logo.tsx in the interlace repo): viewBox
 * 0 0 100 100, two rx-14 bars 62×28 rotated −30° about the centre, orange
 * leading upper-left, green following lower-right. Fills read the two
 * theme-paired tokens defined in global.css so the mark follows the theme.
 * The mark is decorative; the adjacent text names the brand.
 */
import { type ComponentProps } from 'react';

export function BrandMark({ size = 22, ...props }: ComponentProps<'svg'> & { size?: number }) {
  return (
    <svg
      data-slot="brand-mark"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0"
      {...props}
    >
      <g transform="rotate(-30 50 50)">
        <rect x="10" y="18" width="62" height="28" rx="14" fill="var(--brand-mark-bar-o)" />
        <rect x="28" y="54" width="62" height="28" rx="14" fill="var(--brand-mark-bar-g)" />
      </g>
    </svg>
  );
}
