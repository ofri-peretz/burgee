import { ImageResponse } from 'next/og';

export const alt = 'Interlace CLI — the agent-native layer on top of commander and yargs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social card: the locked mark on the dark ground, with the dark-theme bar fills. */
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
      <svg viewBox="0 0 100 100" width="260" height="260">
        <g transform="rotate(-30 50 50)">
          <rect x="10" y="18" width="62" height="28" rx="14" fill="#f4794a" />
          <rect x="28" y="54" width="62" height="28" rx="14" fill="#0d9460" />
        </g>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: '-0.03em' }}>interlace cli</div>
        <div style={{ fontSize: 34, color: '#a1a1aa', maxWidth: 640, lineHeight: 1.3 }}>
          The agent-native layer on top of commander and yargs.
        </div>
      </div>
    </div>,
    size,
  );
}
