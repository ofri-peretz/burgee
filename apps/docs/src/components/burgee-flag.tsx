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
export const BURGEE_COLORS = { rock: '#a84c17', juniper: '#0a6b47', ink: '#0a0a0a' } as const;

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
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJidXJnZWUiPgogIDxsaW5lYXJHcmFkaWVudCBpZD0iYnVyZ2VlLTcwMDlsMCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiIHgxPSIyNSIgeTE9IjYuNyIgeDI9Ijc1IiB5Mj0iOTMuMyI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMGE2YjQ3Ii8+PHN0b3Agb2Zmc2V0PSIwLjUwIiBzdG9wLWNvbG9yPSIjMGEwYTBhIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjYTg0YzE3Ii8+PC9saW5lYXJHcmFkaWVudD48cGF0aCBkPSJNMTAgMjAgTDk0IDMyIEw2NiA1MCBMOTQgNjggTDEwIDgwIFoiIGZpbGw9InVybCgjYnVyZ2VlLTcwMDlsMCkiLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMiAzMCkgc2NhbGUoMC40MCkiPjxnIHRyYW5zZm9ybT0icm90YXRlKC0zMCA1MCA1MCkiPjxyZWN0IHg9IjE1IiB5PSIyNCIgd2lkdGg9IjUyIiBoZWlnaHQ9IjI0IiByeD0iMTIiIGZpbGw9IiNhODRjMTciLz48cmVjdCB4PSIzMyIgeT0iNTIiIHdpZHRoPSI1MiIgaGVpZ2h0PSIyNCIgcng9IjEyIiBmaWxsPSIjMGE2YjQ3Ii8+PC9nPjwvZz4KPC9zdmc+';

/** Field, then charge. `id` scopes the gradient so two flags can share a page. */
export function BurgeeFlag({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" {...AXIS}>
        <stop offset="0" stopColor={BURGEE_COLORS.juniper} />
        <stop offset="0.50" stopColor={BURGEE_COLORS.ink} />
        <stop offset="1" stopColor={BURGEE_COLORS.rock} />
      </linearGradient>
      <path d={BURGEE_FLAG_PATH} fill={`url(#${id})`} />
      <g transform="translate(22 30) scale(0.40)">
        <g transform="rotate(-30 50 50)">
          <rect x="15" y="24" width="52" height="24" rx="12" fill={BURGEE_COLORS.rock} />
          <rect x="33" y="52" width="52" height="24" rx="12" fill={BURGEE_COLORS.juniper} />
        </g>
      </g>
    </>
  );
}
