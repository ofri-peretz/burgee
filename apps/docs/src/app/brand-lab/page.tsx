import { BrandStage } from '#/components/brand-stage';
import { NOINDEX } from '#/lib/site';

/** A design bench, not documentation: reachable by link, kept out of every index (`LAB_ROUTES`). */
export const metadata = NOINDEX;

/** The 3D stage, on its own route until it earns a place on the home page. */
export default function BrandLabPage() {
  return <BrandStage />;
}
