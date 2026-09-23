import { CaiqueSheet } from '#/components/caique-sheet';
import { NOINDEX } from '#/lib/site';

/** A design bench, not documentation: reachable by link, kept out of every index (`LAB_ROUTES`). */
export const metadata = NOINDEX;

/** Rows, top to bottom: headR · bodyScale.y · beakTilt · tailH. Values low → high, left → right. */
export default function CaiqueSheetPage() {
  return <CaiqueSheet />;
}
