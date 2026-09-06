/** Mark + wordmark lockup; the nav title on every layout. */
import { BrandMark } from '#/components/brand-mark';

export function BrandLogo({ markSize = 22 }: { markSize?: number }) {
  return (
    <span data-slot="brand-logo" className="inline-flex items-center gap-2.5">
      <BrandMark size={markSize} />
      <span className="font-mono font-semibold lowercase tracking-tight">interlace</span>
      <span className="font-semibold text-fd-muted-foreground">cli</span>
    </span>
  );
}
