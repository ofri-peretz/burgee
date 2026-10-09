import { site } from '#/site';
import { markFromIcon, OG_SIZE, socialCard } from 'docs-chassis/og';
import { type ImageResponse } from 'next/og';

export const alt = `${site.name} — ${site.description}`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image(): ImageResponse {
  return socialCard({ title: site.name, subtitle: site.description, mark: markFromIcon() });
}
