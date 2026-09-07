import { BurgeeFlag } from '#/components/burgee-flag';
/**
 * The burgee, in a square viewBox — the product mark as every slot on the site
 * consumes it. The flag itself lives in burgee-flag.tsx.
 *
 * Because the flag carries its own field it needs no theme pairing: one mark
 * serves light and dark grounds, and one favicon file serves both.
 */
import { type ComponentProps, useId } from 'react';

export function BurgeeMark({ size = 22, ...props }: ComponentProps<'svg'> & { size?: number }) {
  // One gradient id per instance: the generator emits a single stable id, which
  // would collide if the nav flag and the hero flag shared a page.
  const id = `burgee-${useId().replaceAll(':', '')}`;
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
      <BurgeeFlag id={id} />
    </svg>
  );
}
