import { BURGEE_FLAG_DATA_URI } from '#/components/burgee-flag';
import { ImageResponse } from 'next/og';

export const alt = 'burgee — everything a CLI needs that is not your CLI';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The flag's edge on the card. Sized against the 96px title beside it. */
const FLAG_SIZE = 260;

/** Social card: the locked burgee on the dark ground. The flag carries its own field. */
export default function Image() {
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
      <img src={BURGEE_FLAG_DATA_URI} width={FLAG_SIZE} height={FLAG_SIZE} alt="" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: '-0.03em' }}>burgee</div>
        <div style={{ fontSize: 34, color: '#a1a1aa', maxWidth: 640, lineHeight: 1.3 }}>
          Everything a CLI needs that isn&apos;t your CLI. Written once, served to humans and
          agents alike.
        </div>
      </div>
    </div>,
    size,
  );
}
