/**
 * The burgee's field and charge — the flag itself, without a wrapping <svg>.
 *
 * Split from burgee-mark.tsx so each file defines one component: this is drawn
 * both by BurgeeMark on the site and by the OG route, which renders through
 * satori rather than the DOM.
 *
 * A burgee is the swallowtail flag a boat flies to say which club it belongs to:
 * a flag of identity, not of instruction. The field is a gradient run backwards
 * along the axis the two Interlace bars are stacked on, so the leading bar sits
 * over the following bar's colour and the reverse. The charge is the Interlace
 * mark itself, in the deep pair.
 *
 * The middle gradient stop is load-bearing, not decorative: deep rock on deep
 * juniper is 1.16:1, invisible. Dropping the field to near-black exactly where
 * the charge sits lifts the two bars to 3.50:1 and 3.02:1, clearing the 3:1
 * floor for a graphical object. packages/burgee/src/brand.test.ts measures it.
 *
 * Values here are a COPY of what `burgee/brand` generates, kept literal so this
 * stays a plain component with no build-time dependency on the generator.
 * `npm run brand:check` fails if the copy drifts — edit the declaration in
 * scripts/brand.mts and re-run `npm run brand`, never this file by hand.
 */

/** The deep pair, plus the near-black that carries the charge. */
export const BURGEE_COLORS = {
  rock: '#f4794a',
  juniper: '#0d9460',
  ink: '#0a0a0a',
  /** The outline, in the light ground's own colour. */
  paper: '#efe9dd',
  /** The sheen's light, and the shadow on the far edge. Not brand colours —
   * the light falling on one, and its absence. */
  light: '#ffffff',
  shadow: '#000000',
} as const;

/** The swallowtail. The notch at 66 50 is what makes it a burgee, not a pennant. */
export const BURGEE_FLAG_PATH = 'M10 20 L94 32 L66 50 L94 68 L10 80 Z';

/** The gradient axis: the bars' stacking direction, traversed backwards. */
const AXIS = { x1: 25, y1: 6.7, x2: 75, y2: 93.3 } as const;

/**
 * The same flag as a data URI.
 *
 * satori — which renders the OG card — cannot resolve `url(#gradient)`, so the
 * social card draws the flag through <img> rather than as SVG elements. Both
 * come from the one declaration, and `npm run brand:check` holds them together.
 */
export const BURGEE_FLAG_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJidXJnZWUiPgogIDxsaW5lYXJHcmFkaWVudCBpZD0iYnVyZ2VlLTEzMDYyZmIiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiB4MT0iMjUiIHkxPSI2LjciIHgyPSI3NSIgeTI9IjkzLjMiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iIzBhMGEwYSIvPjwvbGluZWFyR3JhZGllbnQ+PHBhdGggZD0iTTEwIDIwIEw5NCAzMiBMNjYgNTAgTDk0IDY4IEwxMCA4MCBaIiBmaWxsPSJub25lIiBzdHJva2U9IiNlZmU5ZGQiIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxwYXRoIGQ9Ik0xMCAyMCBMOTQgMzIgTDY2IDUwIEw5NCA2OCBMMTAgODAgWiIgZmlsbD0idXJsKCNidXJnZWUtMTMwNjJmYikiLz48Y2xpcFBhdGggaWQ9ImJ1cmdlZS0xMzA2MmZiLWMiPjxwYXRoIGQ9Ik0xMCAyMCBMOTQgMzIgTDY2IDUwIEw5NCA2OCBMMTAgODAgWiIvPjwvY2xpcFBhdGg+PGxpbmVhckdyYWRpZW50IGlkPSJidXJnZWUtMTMwNjJmYi1zIiBncmFkaWVudFVuaXRzPSJvYmplY3RCb3VuZGluZ0JveCIgeDE9IjAiIHkxPSIwIiB4Mj0iMSIgeTI9IjAiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iI2ZmZmZmZiIgc3RvcC1vcGFjaXR5PSIwIi8+PHN0b3Agb2Zmc2V0PSIwLjUwIiBzdG9wLWNvbG9yPSIjZmZmZmZmIiBzdG9wLW9wYWNpdHk9IjAuMTYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNmZmZmZmYiIHN0b3Atb3BhY2l0eT0iMCIvPjwvbGluZWFyR3JhZGllbnQ+PGcgY2xpcC1wYXRoPSJ1cmwoI2J1cmdlZS0xMzA2MmZiLWMpIj48ZyB0cmFuc2Zvcm09InNrZXdYKC0xNCkiPjxyZWN0IHg9IjgiIHk9Ii0yMCIgd2lkdGg9IjM0IiBoZWlnaHQ9IjE0MCIgZmlsbD0idXJsKCNidXJnZWUtMTMwNjJmYi1zKSIvPjwvZz48L2c+PGcgY2xpcC1wYXRoPSJ1cmwoI2J1cmdlZS0xMzA2MmZiLWMpIj48cGF0aCBkPSJNMTAgMjAgTDk0IDMyIEw2NiA1MCBMOTQgNjggTDEwIDgwIFoiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMjgiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWpvaW49InJvdW5kIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMC41NSAtMC41NSkiLz48cGF0aCBkPSJNMTAgMjAgTDk0IDMyIEw2NiA1MCBMOTQgNjggTDEwIDgwIFoiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMDAwMCIgc3Ryb2tlLW9wYWNpdHk9IjAuMTMiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWpvaW49InJvdW5kIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLjU1IDAuNTUpIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIyIDMwKSBzY2FsZSgwLjQwKSI+PGcgdHJhbnNmb3JtPSJyb3RhdGUoLTMwIDUwIDUwKSI+PHJlY3QgeD0iMTUiIHk9IjI0IiB3aWR0aD0iNTIiIGhlaWdodD0iMjQiIHJ4PSIxMiIgZmlsbD0iI2Y0Nzk0YSIvPjxyZWN0IHg9IjMzIiB5PSI1MiIgd2lkdGg9IjUyIiBoZWlnaHQ9IjI0IiByeD0iMTIiIGZpbGw9IiMwZDk0NjAiLz48L2c+PC9nPgo8L3N2Zz4=';

/**
 * The bevel's two passes: light offset toward the light source, shadow away.
 * Values are the generator's — `npm run brand -- --check` fails if they drift.
 */
const BEVEL = [{ stroke: BURGEE_COLORS.light }, { stroke: BURGEE_COLORS.shadow }] as const;

/** Outline, field, relief, charge. `id` scopes the defs so two flags can share a page. */
export function BurgeeFlag({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" {...AXIS}>
        <stop offset="0" stopColor={BURGEE_COLORS.ink} />
      </linearGradient>
      {/* The outline: what holds the silhouette on a ground as dark as the field. */}
      <path d={BURGEE_FLAG_PATH} fill="none" stroke={BURGEE_COLORS.paper} strokeWidth="4" strokeLinejoin="round" />
      <path d={BURGEE_FLAG_PATH} fill={`url(#${id})`} />
      <linearGradient id={`${id}-s`} gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={BURGEE_COLORS.light} stopOpacity="0" />
        <stop offset="0.50" stopColor={BURGEE_COLORS.light} stopOpacity="0.16" />
        <stop offset="1" stopColor={BURGEE_COLORS.light} stopOpacity="0" />
      </linearGradient>
      <clipPath id={`${id}-c`}>
        <path d={BURGEE_FLAG_PATH} />
      </clipPath>
      {/* Light across the field, then the edge that catches it. */}
      <g clipPath={`url(#${id}-c)`}>
        <g transform="skewX(-14)">
          <rect x="8" y="-20" width="34" height="140" fill={`url(#${id}-s)`} />
        </g>
        <g fill="none" strokeWidth="1.5" strokeLinejoin="round">
          <path d={BURGEE_FLAG_PATH} stroke={BEVEL[0].stroke} strokeOpacity="0.28" transform="translate(-0.55 -0.55)" />
          <path d={BURGEE_FLAG_PATH} stroke={BEVEL[1].stroke} strokeOpacity="0.13" transform="translate(0.55 0.55)" />
        </g>
      </g>
      <g transform="translate(22 30) scale(0.40)">
        <g transform="rotate(-30 50 50)">
          <rect x="15" y="24" width="52" height="24" rx="12" fill={BURGEE_COLORS.rock} />
          <rect x="33" y="52" width="52" height="24" rx="12" fill={BURGEE_COLORS.juniper} />
        </g>
      </g>
    </>
  );
}
