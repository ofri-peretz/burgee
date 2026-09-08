/**
 * Flag + wordmark; the nav title on every layout.
 *
 * burgee is marketed as burgee. Interlace is the portfolio it belongs to and the
 * lineage the flag is drawn from, but it does not appear in the lockup.
 */
import { BurgeeMark } from '#/components/burgee-mark';

export function BrandLogo({ markSize = 24 }: { markSize?: number }) {
  return (
    <span data-slot="brand-logo" className="inline-flex items-center gap-2.5">
      <BurgeeMark size={markSize} />
      <span className="font-mono font-semibold lowercase tracking-tight">burgee</span>
    </span>
  );
}
