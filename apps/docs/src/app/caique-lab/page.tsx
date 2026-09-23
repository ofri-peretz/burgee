import { Caique3D } from '#/components/caique-3d';
import { NOINDEX } from '#/lib/site';

/** A design bench, not documentation: reachable by link, kept out of every index (`LAB_ROUTES`). */
export const metadata = NOINDEX;

/** The low-poly caique, on its own route while it is being shaped. */
export default function CaiqueLabPage() {
  return <Caique3D />;
}
