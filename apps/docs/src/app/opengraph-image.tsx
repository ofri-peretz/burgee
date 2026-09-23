import { BURGEE_FLAG_DATA_URI } from '#/components/burgee-flag';
import { PITCH } from '#/lib/llms';
import { OG_SIZE, socialCard } from 'docs-chassis/og';
import { type ImageResponse } from 'next/og';

export const alt = 'burgee — everything a CLI needs that is not your CLI';
export const size = OG_SIZE;
export const contentType = 'image/png';

/** Social card: the locked burgee — the generated component's data URI — beside the pitch. */
export default function Image(): ImageResponse {
  return socialCard({ title: 'burgee', subtitle: PITCH, mark: BURGEE_FLAG_DATA_URI });
}
