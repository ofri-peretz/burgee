/**
 * burgee/brand — a brand declares itself once; every identity surface is that
 * declaration read by a different reader.
 *
 * The same thesis as the rest of the package, applied to identity instead of
 * argv. You declare a field and a mark; out come the flag, the favicon, the OG
 * card and the article cover, every one a projection of that declaration, so
 * none of them can drift from the others.
 *
 * THE FLAG. A burgee is the swallowtail flag a boat flies to say which club it
 * belongs to — a flag of identity, not of instruction. This one is composed the
 * way real club burgees are: a field, and one charge upon it. The field is a
 * gradient run BACKWARDS along the axis the two Interlace bars are stacked on,
 * so the leading bar sits over the following bar's colour and the reverse. The
 * charge is the Interlace mark itself.
 *
 * WHY THE MIDPOINT STOP IS LOAD-BEARING. Deep rock on deep juniper measures
 * 1.16:1 — invisible. The middle stop drops the field to near-black exactly
 * where the charge sits, lifting the two bars to 3.50:1 and 3.02:1, both
 * clearing the 3:1 floor WCAG sets for a graphical object. Remove that stop and
 * the mark disappears. It is contrast, not decoration.
 *
 * NOT in the core entry point. `import { defineCommand } from "burgee"` must
 * stay one import of one file with no build step; this is a separate subpath and
 * costs that path nothing.
 *
 * DETERMINISM. No timestamps, no randomness, coordinates rounded to 2dp. The one
 * id in the output — a gradient cannot be anonymous — is derived from the
 * declaration itself, so the same brand always produces the same bytes and two
 * different brands can share a page without colliding.
 */

/** A point in the mark space. */
export type Point = readonly [number, number];

/** The mark space every path is expressed in. Square, so it drops into any slot. */
const MARK = { SPAN: 100, CENTRE: 50 } as const;

/** Coordinates are emitted to 2dp; closer than this to an integer, emit the integer. */
const INTEGER_EPSILON = 0.005;

/**
 * The flag, in the nautical parts of a burgee: the hoist is the edge against the
 * mast, the fly is the free edge, and the notch is the bite out of it that makes
 * a burgee a swallowtail rather than a pennant. LOCKED.
 */
const HOIST = { x: 10, top: 20, bottom: 80 } as const;
const FLY = { x: 94, top: 32, bottom: 68 } as const;
const NOTCH = { x: 66, y: 50 } as const;

export const BURGEE_FLAG: readonly Point[] = [
  [HOIST.x, HOIST.top],
  [FLY.x, FLY.top],
  [NOTCH.x, NOTCH.y],
  [FLY.x, FLY.bottom],
  [HOIST.x, HOIST.bottom],
];

/**
 * The Interlace bars, as the charge. Geometry LOCKED — the small variant from
 * the brand spec (bars thickened 20→24, shortened 58→52), because the charge is
 * never rendered large. Orange leads upper-left, green follows lower-right, and
 * the −30° never changes; those three are the whole character of the mark.
 */
const BAR = { width: 52, height: 24, radius: 12 } as const;
const LEAD_BAR = { x: 15, y: 24 } as const;
const FOLLOW_BAR = { x: 33, y: 52 } as const;
const INTERLACE_ROTATION_DEGREES = 30;
export const BURGEE_ANGLE = -INTERLACE_ROTATION_DEGREES;

/** The charge occupies this fraction of the flag, and sits here within it. */
export const CHARGE = { scale: 0.4, x: 42, y: 50 } as const;

/**
 * The gradient axis: the direction the two bars are stacked on, traversed
 * backwards — hoist-top to fly-bottom, in mark-space coordinates.
 */
export const FIELD_AXIS = { x1: 25, y1: 6.7, x2: 75, y2: 93.3 } as const;

/** One gradient stop: how far along the axis, and what colour. */
export interface FieldStop {
  offset: number;
  color: string;
}

/** One band of the outline. */
export interface Bordure {
  color: string;
  /** Visible thickness, in mark-space units. */
  width: number;
}

export interface BurgeeColors {
  /** Leading bar, hoist side. */
  lead: string;
  /** Following bar, fly side. */
  follow: string;
}

export interface BurgeeBrand {
  /** Accessible name for the flag. Without one the flag is decorative. */
  name?: string;
  /**
   * The charge, as a two-colour bar pair. Ignored when {@link BurgeeBrand.charge}
   * is given — that is the escape hatch for a CLI bringing its own glyph.
   */
  mark: BurgeeColors;
  /**
   * Your own charge instead of the bars: SVG markup drawn in a 0 0 100 100 box,
   * which burgee places and scales for you. Everything else — the swallowtail,
   * the reversed field, the sizes — still comes from this one declaration.
   *
   * The markup is emitted verbatim, so it is yours to trust: this runs at build
   * time on a file you wrote, not on anything a user supplies at runtime.
   */
  charge?: string;
  /**
   * Your own silhouette instead of the swallowtail: SVG path data in the same
   * `0 0 100 100` box, filled with the field and carrying the charge exactly as
   * the flag does. For a sibling brand whose name is not a flag — a roundel is
   * rings, a parrot is a parrot — the shape is the whole point, and drawing it
   * here keeps every other projection (favicon, lockup, OG, cover) intact.
   *
   * Filled `evenodd`, so a subpath drawn inside another cuts a hole through it:
   * that is how a ring gets its centre and an eye gets its white. Subpaths that
   * are meant to read as one solid body must not overlap.
   *
   * Emitted verbatim, like {@link BurgeeBrand.charge}: a build-time value you
   * wrote, never anything a user supplies at runtime.
   */
  shape?: string;
  /**
   * A sheen: a soft highlight laid across the field, `0` to `1`, where the
   * number is how bright its brightest point is. Depth, not decoration — a flat
   * gradient reads as printed ink, and one light source makes the same shape
   * read as an object with a front.
   *
   * It is drawn INSIDE the silhouette (clipped to it), so it never softens the
   * outline the mark is recognised by, and it sits under the charge, so it never
   * touches the contrast the charge was measured at.
   *
   * The same layer is what moves in {@link Burgee.alive}.
   */
  sheen?: number;
  /**
   * A bevel: how strongly the mark's own edge catches the light, `0` to `1`.
   *
   * The whole of the third dimension a logo can afford. Two copies of the
   * silhouette stroked and clipped to itself — light offset up toward the light
   * source, dark offset away — so the edge lifts and the face stays flat. No
   * extrusion, no renderer, and nothing that stops it being a 16px favicon: the
   * bevel is sub-pixel there and simply disappears, which is the correct
   * behaviour rather than a compromise.
   */
  bevel?: number;
  /**
   * Markings: SVG markup in the same `0 0 100 100` box as {@link BurgeeBrand.shape},
   * drawn over the field and under the charge.
   *
   * One path can hold one fill, and some marks are not one colour — a roundel is
   * concentric rings, a caique has a black cap over an orange throat over a white
   * belly. Those are markings ON the body, not the body, and they are declared
   * here rather than by stacking whole brands on top of each other.
   *
   * Emitted verbatim, like {@link BurgeeBrand.charge}: a build-time value you
   * wrote, never anything a user supplies at runtime.
   */
  markings?: string;
  /**
   * The field, as gradient stops along {@link FIELD_AXIS}. One stop is a flat
   * field. Keep a dark stop under the charge or the mark will not read.
   */
  field: readonly FieldStop[];
  /**
   * The outline, outermost band first.
   *
   * One band is enough when you control the ground. Two is what you want when
   * you do not: no single flat colour clears 3:1 against both a near-black and a
   * white page, so a dark outer band and a light inner band are given, and
   * whichever one the ground does not match is the one carrying the silhouette.
   * That is one asset that holds its outline anywhere — which a favicon, having
   * no stylesheet to read a theme from, actually needs.
   *
   * `width` is the visible thickness of each band in mark-space units.
   */
  bordure?: Bordure | readonly Bordure[];
}

/** The midpoint a field falls through when none is given. Near-black. */
export const DEFAULT_GROUND = '#0a0a0a';

const MIDPOINT = 0.5;

/**
 * The field two colours imply.
 *
 * Reversed on purpose: the leading colour goes at the FAR end, so the leading
 * half of the charge sits against the following colour and the reverse. Through
 * a dark midpoint, because the charge sits at the centre and two saturated
 * colours of similar weight cannot be told apart — the reason this is a default
 * rather than something each caller re-derives.
 */
export function opposedField(colors: BurgeeColors, ground: string = DEFAULT_GROUND): FieldStop[] {
  return [
    { offset: 0, color: colors.follow },
    { offset: MIDPOINT, color: ground },
    { offset: 1, color: colors.lead },
  ];
}

/** Round to 2dp, and to an integer when that is what the number already is. */
function round(n: number): string {
  return Math.abs(n - Math.round(n)) < INTEGER_EPSILON ? String(Math.round(n)) : n.toFixed(2);
}

function toPath(points: readonly Point[]): string {
  return `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L')} Z`;
}

/** The flag silhouette, as SVG path data. */
export function burgeeFlagPath(): string {
  return toPath(BURGEE_FLAG);
}

/**
 * Escape for both element text and attribute values. Quotes included: a brand
 * name reaches `aria-label="…"`, where a bare `"` closes the attribute.
 */
function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HASH_SEED = 5381;
const HASH_SHIFT = 5;
const HASH_RADIX = 36;

/**
 * A stable id for the field gradient, derived from the declaration.
 *
 * A gradient is the one thing in SVG that cannot be anonymous. Deriving the id
 * from the brand keeps output byte-identical across runs, and keeps two
 * different brands from colliding when they share a page. Two instances of the
 * SAME brand do share an id, which is harmless — the definitions are identical —
 * and a React caller can pass its own `useId()` value instead.
 */
export function fieldId(brand: BurgeeBrand): string {
  // A shape is appended only when there is one, so adding the option did not
  // renumber every brand that does not use it — an id change is a diff in every
  // asset that carries it.
  const base = [brand.field, brand.mark, brand.bordure, brand.charge];
  const extra = [brand.shape, brand.sheen, brand.bevel, brand.markings].filter(
    (v) => v !== undefined,
  );
  const source = JSON.stringify(extra.length === 0 ? base : [...base, ...extra]);
  let h = HASH_SEED;
  for (let i = 0; i < source.length; i++) {
    h = ((h << HASH_SHIFT) + h + (source.codePointAt(i) ?? 0)) >>> 0;
  }
  return `burgee-${h.toString(HASH_RADIX)}`;
}

function gradient(brand: BurgeeBrand, id: string): string {
  const stops = brand.field
    .map((s) => `<stop offset="${round(s.offset)}" stop-color="${s.color}"/>`)
    .join('');
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"` +
    ` x1="${FIELD_AXIS.x1}" y1="${FIELD_AXIS.y1}" x2="${FIELD_AXIS.x2}" y2="${FIELD_AXIS.y2}">` +
    `${stops}</linearGradient>`
  );
}

/**
 * Where the charge sits, as an SVG transform. Exported because consumers that
 * hand-write the flag (a React component, say) must place it identically, and
 * recomputing it at the call site is how the two drift apart.
 */
export function chargeTransform(scale: number = CHARGE.scale): string {
  const tx = round(CHARGE.x - MARK.CENTRE * scale);
  const ty = round(CHARGE.y - MARK.CENTRE * scale);
  return `translate(${tx} ${ty}) scale(${round(scale)})`;
}

/** The angle the charge is rotated by, as an SVG transform. */
export function chargeRotation(): string {
  return `rotate(${BURGEE_ANGLE} ${MARK.CENTRE} ${MARK.CENTRE})`;
}

/** Place any charge markup where the charge belongs, at the charge's scale. */
export function placeCharge(markup: string, scale: number = CHARGE.scale): string {
  return `<g transform="${chargeTransform(scale)}">${markup}</g>`;
}

/** The two Interlace bars, rotated and placed as the charge. */
export function chargeGroup(colors: BurgeeColors, scale: number = CHARGE.scale): string {
  const bar = (at: { x: number; y: number }, fill: string): string =>
    `<rect x="${at.x}" y="${at.y}" width="${BAR.width}" height="${BAR.height}"` +
    ` rx="${BAR.radius}" fill="${fill}"/>`;
  return (
    `<g transform="${chargeTransform(scale)}">` +
    `<g transform="${chargeRotation()}">` +
    `${bar(LEAD_BAR, colors.lead)}${bar(FOLLOW_BAR, colors.follow)}</g></g>`
  );
}

/**
 * The outline, as one stroked copy of the flag per band.
 *
 * SVG centres a stroke on its path, so half of each falls outside. Drawing the
 * bands widest-first and then filling on top leaves each one visible at its
 * declared thickness, concentric, with no gaps to line up by hand.
 */
function bordureBands(brand: BurgeeBrand): string {
  if (brand.bordure === undefined) return '';
  const bands = Array.isArray(brand.bordure)
    ? [...(brand.bordure as readonly Bordure[])]
    : [brand.bordure as Bordure];
  if (bands.length === 0) return '';
  // Outermost band's stroke has to span every band inside it as well.
  let total = bands.reduce((sum, band) => sum + band.width, 0);
  const path = silhouette(brand);
  const drawn: string[] = [];
  for (const band of bands) {
    drawn.push(
      `<path d="${path}" fill="none" stroke="${band.color}"` +
        ` stroke-width="${round(total * 2)}" stroke-linejoin="round"/>`,
    );
    total -= band.width;
  }
  return drawn.join('');
}

/**
 * The sheen's geometry: a band of this width, and where it travels when it is
 * alive. `still` is where the band rests — upper-left, because that is where the
 * light comes from in every other Interlace surface.
 */
const SHEEN_START = -50;
/** Degrees the band leans off vertical. Same sign as the charge's rotation. */
const SHEEN_LEAN = -14;
const SHEEN = {
  width: 34,
  still: 8,
  from: SHEEN_START,
  to: 140,
  seconds: 7,
  /** The band leans, the way light falls across a solid rather than down it. */
  lean: SHEEN_LEAN,
} as const;

/** The sheen's only colour: light. Its opacity is the whole of its declaration. */
const SHEEN_LIGHT = '#ffffff';

/** The middle of the band is the bright part; both edges fall to nothing. */
const SHEEN_PEAK = 0.5;

/** Whatever the field fills — the flag unless a shape was declared. */
function silhouette(brand: BurgeeBrand): string {
  return brand.shape ?? burgeeFlagPath();
}

/**
 * The sheen, as a gradient band clipped to the silhouette.
 *
 * A clip rather than a second copy of the shape: the band has to be able to sit
 * partly outside the mark (that is what makes it read as light crossing it), and
 * only the clip keeps the outline exactly as sharp as it was.
 */
function sheenStop(offset: number, opacity: number): string {
  return (
    `<stop offset="${round(offset)}" stop-color="${SHEEN_LIGHT}"` +
    ` stop-opacity="${round(opacity)}"/>`
  );
}

/** The silhouette as a clip, shared by everything that has to stay inside it. */
function clip(brand: BurgeeBrand, id: string): string {
  if (brand.sheen === undefined && brand.bevel === undefined && brand.markings === undefined) {
    return '';
  }
  return `<clipPath id="${id}-c"><path d="${silhouette(brand)}"/></clipPath>`;
}

function sheenBand(brand: BurgeeBrand, id: string, moving: boolean): string {
  if (brand.sheen === undefined) return '';
  return (
    // Across the band, not down it: a vertical axis would leave the band's own
    // left and right edges at full strength, which reads as a painted stripe.
    `<linearGradient id="${id}-s" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">` +
    `${sheenStop(0, 0)}${sheenStop(SHEEN_PEAK, brand.sheen)}${sheenStop(1, 0)}</linearGradient>` +
    `<g clip-path="url(#${id}-c)"><g transform="skewX(${SHEEN.lean})">` +
    `<rect x="${moving ? SHEEN.from : SHEEN.still}" y="-20" width="${SHEEN.width}" height="140"` +
    `${moving ? ` class="${id}-sweep"` : ''} fill="url(#${id}-s)"/></g></g>`
  );
}

/**
 * The keyframes that move the band, and the media query that stops it.
 *
 * Motion in a logo is a nice-to-have and vestibular discomfort is not, so the
 * reduced-motion branch is not an afterthought here: it parks the band exactly
 * where the still projections rest it, which is why both come from `SHEEN`.
 */
function sheenStyle(id: string): string {
  return (
    `<style>` +
    `@keyframes ${id}-sweep{from{transform:translateX(0)}` +
    `to{transform:translateX(${SHEEN.to - SHEEN.from}px)}}` +
    `.${id}-sweep{animation:${id}-sweep ${SHEEN.seconds}s ease-in-out infinite}` +
    `@media (prefers-reduced-motion:reduce){.${id}-sweep{animation:none;` +
    `transform:translateX(${SHEEN.still - SHEEN.from}px)}}` +
    `</style>`
  );
}

/**
 * The bevel: how far the two edge passes are offset, and how thick they are.
 * The light one goes up and left because that is where the sheen's band rests
 * and where every other Interlace surface puts its light source.
 */
const BEVEL = { offset: 0.55, width: 1.5, dark: 0.45 } as const;

const BEVEL_DARK = '#000000';

/**
 * Two stroked copies of the silhouette, clipped to it.
 *
 * Clipped, so only the inner half of each stroke survives: that inner half IS
 * the bevel, and the outer half would just fatten the mark. The dark pass is
 * weaker than the light one — an edge in shadow loses less contrast against a
 * dark face than a lit edge gains.
 */
function bevelEdges(brand: BurgeeBrand, id: string): string {
  if (brand.bevel === undefined) return '';
  const shape = silhouette(brand);
  const edge = (dx: number, dy: number, color: string, opacity: number): string =>
    `<path d="${shape}" fill="none" stroke="${color}" stroke-opacity="${round(opacity)}"` +
    ` stroke-width="${BEVEL.width}" stroke-linejoin="round"` +
    ` transform="translate(${round(dx)} ${round(dy)})"/>`;
  const lit = edge(-BEVEL.offset, -BEVEL.offset, SHEEN_LIGHT, brand.bevel);
  const shaded = edge(BEVEL.offset, BEVEL.offset, BEVEL_DARK, brand.bevel * BEVEL.dark);
  return `<g clip-path="url(#${id}-c)">${lit}${shaded}</g>`;
}

/** Field, charge and optional bordure — everything inside the viewBox. */
export function burgeeBody(
  brand: BurgeeBrand,
  id: string = fieldId(brand),
  moving = false,
): string {
  const charge =
    brand.charge === undefined ? chargeGroup(brand.mark) : placeCharge(brand.charge);
  // The swallowtail is one closed subpath, so a fill rule would be noise on it;
  // a custom shape is where counters and holes become possible, and where the
  // rule has to be stated.
  const field =
    brand.shape === undefined
      ? `<path d="${burgeeFlagPath()}" fill="url(#${id})"/>`
      : `<path d="${brand.shape}" fill="url(#${id})" fill-rule="evenodd"/>`;
  // Sheen over the field, under the charge: the mark keeps the contrast it was
  // measured at, whatever the light is doing behind it.
  // Markings sit inside the silhouette by construction, so they are clipped to
  // it too: a marking that spills is a drawing mistake, not a design decision.
  const markings =
    brand.markings === undefined ? '' : `<g clip-path="url(#${id}-c)">${brand.markings}</g>`;
  return (
    `${gradient(brand, id)}${bordureBands(brand)}${field}${clip(brand, id)}` +
    `${markings}${sheenBand(brand, id, moving)}${bevelEdges(brand, id)}${charge}`
  );
}

const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Display type at this size wants tightening, not default spacing. */
const TRACKING_TIGHTEN = 0.03;

/** Card layout, as fractions of the flag's height. Change these, not the call sites. */
const LAYOUT = {
  GAP: 0.28,
  TITLE: 0.42,
  SUBTITLE: 0.13,
  /** Advance width of one monospace character, as a fraction of its size. */
  ADVANCE: 0.62,
  TITLE_CENTRE: 0.36,
  SUBTITLE_LEAD: 1.6,
  LINE_HEIGHT: 1.4,
  /** Fraction of the card width the subtitle may occupy before it wraps. */
  TEXT_COLUMN: 0.46,
  TRACKING: -TRACKING_TIGHTEN,
} as const;

/** What each surface is sized for, and why that size. */
const SIZES = {
  /** Every crawler crops to this. */
  OG: { width: 1200, height: 630, mark: 260 },
  /** The dev.to article ratio. */
  COVER: { width: 1000, height: 420, mark: 180 },
  /** Nav-bar lockup, wide and short. */
  LOCKUP: { width: 480, height: 120, mark: 84 },
  /** Favicon master. Rasterisers downsample from here. */
  FAVICON: 512,
} as const;

/**
 * Card grounds. The flag carries its own field, so these only set the paper it
 * and its text sit on — but the choice is not free: the field's darkest stop is
 * near-black, so a near-black card dissolves the middle of the flag and leaves
 * two floating triangles. Both grounds below are held clear of it, the dark one
 * biased toward juniper and the light one toward sandstone, so the silhouette
 * always closes.
 */
const GROUND = {
  dark: { background: '#12201b', foreground: '#f0f3f6', muted: '#9aada5' },
  light: { background: '#efe9dd', foreground: '#0a0a0a', muted: '#5c6058' },
} as const;

export interface CardOptions {
  width?: number;
  height?: number;
  /** Large line. Defaults to the brand name. */
  title?: string;
  /** Small line under it; wraps. */
  subtitle?: string;
  theme?: 'light' | 'dark';
  background?: string;
  foreground?: string;
  muted?: string;
}

interface CardSize {
  width: number;
  height: number;
  mark: number;
}

/** Everything one brand declaration projects into. */
export interface Burgee {
  /** The flag alone, square, at any size. */
  flag(size?: number): string;
  /**
   * The same mark with its sheen sweeping across it, for a page that can afford
   * motion — a site header, a docs hero. Identical to {@link Burgee.flag} when
   * no `sheen` is declared, and parked still under `prefers-reduced-motion`.
   *
   * Not the favicon and not the README: a tab icon that shimmers is a tab icon
   * that distracts.
   */
  alive(size?: number): string;
  /** Favicon master. One file serves both themes — the flag carries its own field. */
  favicon(size?: number): string;
  /** Social card, 1200×630. */
  og(options?: CardOptions): string;
  /** Article cover, 1000×420. */
  cover(options?: CardOptions): string;
  /** Flag and wordmark, laid out horizontally. */
  lockup(options?: CardOptions): string;
  /** The gradient id this brand emits, for callers that need to match it. */
  fieldId(): string;
}

/** The flag placed and scaled inside a larger canvas. */
function flagGroup(brand: BurgeeBrand, x: number, y: number, size: number): string {
  const scale = size / MARK.SPAN;
  return (
    `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale)})">` +
    `${burgeeBody(brand)}</g>`
  );
}

/**
 * Greedy wrap at a character budget. Monospace, so a character count IS a width
 * — the reason the cards are set in mono rather than a proportional face.
 */
function wrap(text: string, columns: number): string[] {
  if (text === '') return [];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (candidate.length > columns && line !== '') {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

const advance = (chars: number, size: number): number => chars * size * LAYOUT.ADVANCE;

interface TextLine {
  x: number;
  y: number;
  size: number;
  fill: string;
  bold: boolean;
  text: string;
}

function textElement({ x, y, size, fill, bold, text }: TextLine): string {
  const weight = bold ? ` font-weight="700" letter-spacing="${round(size * LAYOUT.TRACKING)}"` : '';
  return (
    `<text x="${round(x)}" y="${round(y)}" font-family="${FONT}" font-size="${round(size)}"` +
    `${weight} fill="${fill}">${escape(text)}</text>`
  );
}

/** Flag, then a gap, then the text block — the whole group centred on the card. */
function renderCard(brand: BurgeeBrand, options: CardOptions, size: CardSize): string {
  const theme = options.theme ?? 'dark';
  const ground = GROUND[theme];
  const background = options.background ?? ground.background;
  const foreground = options.foreground ?? ground.foreground;
  const muted = options.muted ?? ground.muted;
  const width = options.width ?? size.width;
  const height = options.height ?? size.height;
  const title = options.title ?? brand.name ?? '';
  const subtitle = options.subtitle ?? '';

  const gap = size.mark * LAYOUT.GAP;
  const titleSize = size.mark * LAYOUT.TITLE;
  const subSize = size.mark * LAYOUT.SUBTITLE;
  const lineHeight = subSize * LAYOUT.LINE_HEIGHT;

  // Wrap first: the subtitle is usually the widest thing on the card, so it
  // decides how far left the flag has to start for the group to sit centred.
  const columns = Math.floor((width * LAYOUT.TEXT_COLUMN) / (subSize * LAYOUT.ADVANCE));
  const lines = wrap(subtitle, columns);
  const textWidth = Math.max(
    advance(title.length, titleSize),
    ...lines.map((line) => advance(line.length, subSize)),
  );

  const left = (width - (size.mark + gap + textWidth)) / 2;
  const centreY = height / 2;
  const textX = left + size.mark + gap;

  const blockHeight =
    titleSize +
    (lines.length === 0 ? 0 : subSize * LAYOUT.SUBTITLE_LEAD + (lines.length - 1) * lineHeight);
  const titleY =
    lines.length === 0
      ? centreY + titleSize * LAYOUT.TITLE_CENTRE
      : centreY - blockHeight / 2 + titleSize;

  const label = escape([title, subtitle].filter(Boolean).join(' — ') || brand.name || 'burgee');
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"` +
      ` viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">`,
    `<rect width="${width}" height="${height}" fill="${background}"/>`,
    flagGroup(brand, left, centreY - size.mark / 2, size.mark),
  ];
  if (title) {
    parts.push(
      textElement({
        x: textX,
        y: titleY,
        size: titleSize,
        fill: foreground,
        bold: true,
        text: title,
      }),
    );
  }
  lines.forEach((line, i) => {
    parts.push(
      textElement({
        x: textX,
        y: titleY + subSize * LAYOUT.SUBTITLE_LEAD + i * lineHeight,
        size: subSize,
        fill: muted,
        bold: false,
        text: line,
      }),
    );
  });
  parts.push('</svg>');
  return parts.join('\n');
}

function renderFlag(brand: BurgeeBrand, size: number, moving = false): string {
  const label = brand.name ? ` role="img" aria-label="${escape(brand.name)}"` : ' aria-hidden="true"';
  const id = fieldId(brand);
  const alive = moving && brand.sheen !== undefined;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK.SPAN} ${MARK.SPAN}"` +
      ` width="${size}" height="${size}"${label}>`,
    ...(alive ? [`  ${sheenStyle(id)}`] : []),
    `  ${burgeeBody(brand, id, alive)}`,
    '</svg>',
  ].join('\n');
}

/**
 * Declare a brand. Everything on the returned object is a projection of it.
 *
 * ```js
 * const brand = defineBurgee({
 *   name: 'burgee',
 *   mark: { lead: '#a84c17', follow: '#0a6b47' },
 *   field: [
 *     { offset: 0, color: '#0a6b47' },
 *     { offset: 0.5, color: '#0a0a0a' },
 *     { offset: 1, color: '#a84c17' },
 *   ],
 * });
 * writeFileSync('icon.svg', brand.favicon());
 * ```
 */
export function defineBurgee(brand: BurgeeBrand): Burgee {
  return {
    flag: (size = MARK.SPAN) => renderFlag(brand, size),
    alive: (size = MARK.SPAN) => renderFlag(brand, size, true),
    favicon: (size = SIZES.FAVICON) => renderFlag(brand, size),
    og: (options = {}) => renderCard(brand, options, SIZES.OG),
    cover: (options = {}) => renderCard(brand, options, SIZES.COVER),
    lockup: (options = {}) => renderCard(brand, options, SIZES.LOCKUP),
    fieldId: () => fieldId(brand),
  };
}
