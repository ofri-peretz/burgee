/**
 * The social card, drawn by next/og through satori: the package's mark beside its name and one
 * line, on the dark ground. satori cannot resolve `url(#gradient)`, so the mark is drawn as an
 * image from a data URI rather than as SVG elements.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The mark's edge on the card, sized against the 96px title beside it. */
const MARK_SIZE = 260;

/**
 * The app's own favicon — `src/app/icon.svg`, which `scripts/brand.mts` generates from the
 * package's declared mark — as a data URI. Read at build time, from the app directory
 * `next build` runs in; the card is prerendered, so no request ever reads it.
 */
export function markFromIcon(): string {
  return `data:image/svg+xml;base64,${readFileSync(join(process.cwd(), 'src', 'app', 'icon.svg')).toString('base64')}`;
}

export function socialCard({ title, subtitle, mark }: { readonly title: string; readonly subtitle: string; readonly mark: string }): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 56,
        background: '#0b0b0c',
        color: '#fafafa',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      {/* satori renders <img>; next/image has no place in an OG route. */}
      <img src={mark} width={MARK_SIZE} height={MARK_SIZE} alt="" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: '-0.03em' }}>{title}</div>
        <div style={{ fontSize: 34, color: '#a1a1aa', maxWidth: 640, lineHeight: 1.3 }}>{subtitle}</div>
      </div>
    </div>,
    OG_SIZE,
  );
}
