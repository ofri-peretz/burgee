/**
 * The burgee — the product mark, derived from the Interlace mark rather than
 * invented beside it.
 *
 * A burgee is the small swallowtail flag a boat flies to say which club or fleet
 * it belongs to: a flag of identity, not of instruction. The field is divided on
 * the SAME -30 degree diagonal that rotates the two Interlace bars (see
 * brand-mark.tsx, geometry LOCKED), and carries the same two theme-paired
 * tokens: orange leading upper-left, green following lower-right, separated by a
 * gap the ground shows through — the interlace, at flag scale.
 *
 * viewBox 0 0 100 100 so it drops into the same slots as BrandMark.
 * Decorative; adjacent text names the product.
 */
import { type ComponentProps } from 'react';

const FLAG = 'M10 20 L94 32 L66 50 L94 68 L10 80 Z';

export function BurgeeMark({ size = 22, ...props }: ComponentProps<'svg'> & { size?: number }) {
  return (
    <svg
      data-slot="burgee-mark"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0"
      {...props}
    >
      <clipPath id="burgee-field">
        <path d={FLAG} />
      </clipPath>
      <g clipPath="url(#burgee-field)">
        <g transform="rotate(-30 50 50)">
          <rect x="-60" y="-60" width="220" height="104" fill="var(--brand-mark-bar-o)" />
          <rect x="-60" y="52" width="220" height="160" fill="var(--brand-mark-bar-g)" />
        </g>
      </g>
    </svg>
  );
}
