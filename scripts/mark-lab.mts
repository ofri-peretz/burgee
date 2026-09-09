/**
 * The mark lab: silhouettes as parameters, and contact sheets to choose from.
 *
 * Hand-typed bezier control points are why the sibling marks took so long and
 * landed where they did — every change was a guess, and only one version could
 * be looked at per attempt. Here a silhouette is a handful of named numbers, the
 * outline is fitted through the points they imply, and a sweep renders a grid of
 * variants so the choice is made by eye against alternatives rather than in the
 * abstract.
 *
 * Nothing here ships. `scripts/brand.mts` holds the marks that do; when a cell
 * on a sheet is the one, its numbers move there and this file is how the next
 * revision starts.
 *
 *   npm run mark-lab                 # every sheet
 *   npm run mark-lab -- beak tail    # sweep these two against each other
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));

const INK = '#0a0a0a';
const ROCK_LIFT = '#f4794a';
const JUNIPER_LIFT = '#0d9460';
const PAPER = '#efe9dd';

/** The mark space every silhouette is drawn in, matching `burgee/brand`. */
const SPAN = 100;
const HALF = 2;

type Point = readonly [number, number];

/** Round to 2dp, and to an integer when that is what the number already is. */
const EPSILON = 0.005;
function round(n: number): string {
  return Math.abs(n - Math.round(n)) < EPSILON ? String(Math.round(n)) : n.toFixed(2);
}

/**
 * A closed outline fitted through points, as cubic beziers.
 *
 * Catmull-Rom, converted to beziers: it passes THROUGH every point, which is
 * what makes a parameter mean something — `headR` is the head's radius, not a
 * number that pulls the curve vaguely headwards. `tension` at 0 is round; at 1
 * it is nearly straight between points.
 */
const TENSION_SCALE = 6;
function smoothClosed(points: readonly Point[], tension = 0): string {
  const n = points.length;
  const k = (1 - tension) / TENSION_SCALE;
  const at = (i: number): Point => points[(i + n) % n] as Point;
  const parts: string[] = [`M${round(at(0)[0])} ${round(at(0)[1])}`];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    parts.push(
      `C${round(c1[0])} ${round(c1[1])}, ${round(c2[0])} ${round(c2[1])},` +
        ` ${round(p2[0])} ${round(p2[1])}`,
    );
  }
  return `${parts.join(' ')} Z`;
}

/** Degrees to radians, with 0° pointing north so the arcs read like a compass. */
const STRAIGHT = 180;
const NORTH = 90;
function radians(deg: number): number {
  return ((deg - NORTH) * Math.PI) / STRAIGHT;
}

/** An arc of a circle, as points: `from` and `to` in degrees clockwise from north. */
interface Arc {
  x: number;
  y: number;
  r: number;
  from: number;
  to: number;
  steps: number;
}
function arc({ x, y, r, from, to, steps }: Arc): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = radians(from + ((to - from) * i) / (steps - 1));
    return [x + Math.cos(a) * r, y + Math.sin(a) * r] as Point;
  });
}

/** Every knob the caique has. Each one is a thing a person can point at. */
export interface Caique {
  /** Head: where it sits, and how big it is against the body. */
  headX: number;
  headY: number;
  headR: number;
  /** Body: the same, and the bird's whole mass. */
  bodyX: number;
  bodyY: number;
  bodyR: number;
  /** How deeply the throat cuts in between head and body. 0 is one blob. */
  neck: number;
  /** Beak: how far it reaches, how far below the mouth its tip drops, how deep it is. */
  beakReach: number;
  beakDrop: number;
  beakDepth: number;
  /** How far the tip curls below the lower edge — the line that says parrot. */
  beakHook: number;
  /** Tail: how far it runs from the body, at what angle below horizontal, how wide at the root. */
  tailLength: number;
  tailAngle: number;
  tailRoot: number;
  /** How pointed the tail tip is. 1 is a point; 0 is square. */
  tailTaper: number;
  /** Crest: how far the crown rises above a plain circle. */
  crest: number;
  /**
   * Plumage, as the bird actually wears it: a black cap, an apricot cheek under
   * it, a white breast, and a green wing over the back. Each patch is a circle
   * or an ellipse clipped to the silhouette, so it is drawn oversized on the
   * side where it should show no edge and the outline becomes that edge.
   */
  cheekX: number;
  cheekY: number;
  cheekR: number;
  bellyY: number;
  bellyR: number;
  wingX: number;
  wingY: number;
  wingLength: number;
  wingDepth: number;
  wingAngle: number;
  /** Curve tension for the whole outline. */
  tension: number;
}

/** The starting bird: the marks in `brand.mts`, read back as parameters. */
export const CAIQUE: Caique = {
  headX: 44,
  headY: 30,
  headR: 24,
  bodyX: 44,
  bodyY: 60,
  bodyR: 30,
  neck: 5,
  beakReach: 16,
  beakDrop: 8,
  beakDepth: 13,
  beakHook: 6,
  tailLength: 44,
  tailAngle: 38,
  tailRoot: 22,
  tailTaper: 0.72,
  crest: 4,
  cheekX: 26,
  cheekY: 44,
  cheekR: 15,
  bellyY: 78,
  bellyR: 26,
  wingX: 58,
  wingY: 56,
  wingLength: 30,
  wingDepth: 17,
  wingAngle: 28,
};

/** The crown starts this far anticlockwise of north — over the forehead. */
const FOREHEAD = 60;

/**
 * Which slice of each circle the outline follows, in degrees clockwise from
 * north, and how many points it is sampled at. The back stops short of the tail
 * by `LEAD` so the tail's own root corners carry the join.
 */
const SECTOR = {
  crown: { from: -FOREHEAD, to: 70, steps: 7 },
  back: { from: 20, to: 0, steps: 5 },
  belly: { from: 130, to: 215, steps: 7 },
  breast: { from: 215, to: 250, steps: 4 },
} as const;
const LEAD = 10;

/** The beak's own proportions: where its cutting edge sits, and where its ridge starts. */
const BEAK = { cutting: 0.55, dip: 0.3, ridgeOut: 0.18 } as const;
const DEG = Math.PI / STRAIGHT;

/**
 * The outline, as points: crown, back, tail, belly, breast, beak.
 *
 * Ordered clockwise from the forehead so the fit closes correctly, and built
 * from the two circles the bird actually is — everything else is where those
 * two are cut into or pulled out of.
 */
export function caiquePoints(p: Caique): Point[] {
  const tail = p.tailAngle * DEG;
  const root: Point = [p.bodyX + Math.cos(tail) * p.bodyR, p.bodyY + Math.sin(tail) * p.bodyR];
  const tip: Point = [root[0] + Math.cos(tail) * p.tailLength, root[1] + Math.sin(tail) * p.tailLength];
  // The tail's two edges, spread either side of its axis at the root and closing
  // to `tailTaper` of that at the tip.
  const across: Point = [-Math.sin(tail), Math.cos(tail)];
  const spread = p.tailRoot / HALF;
  const nib = spread * (1 - p.tailTaper);
  // The root's two corners sit ON the body circle, not offset from a point on
  // it: offsetting pushes them inside the body and nicks the back.
  const sweepAngle = spread / p.bodyR;
  const onBody = (a: number): Point => [
    p.bodyX + Math.cos(a) * p.bodyR,
    p.bodyY + Math.sin(a) * p.bodyR,
  ];
  const upper = onBody(tail - sweepAngle);
  const lower = onBody(tail + sweepAngle);
  const tipUpper: Point = [tip[0] - across[0] * nib, tip[1] - across[1] * nib];
  const tipLower: Point = [tip[0] + across[0] * nib, tip[1] + across[1] * nib];

  const crown = arc({ x: p.headX, y: p.headY - p.crest, r: p.headR, ...SECTOR.crown });
  const back = arc({ x: p.bodyX, y: p.bodyY, r: p.bodyR, ...SECTOR.back, to: p.tailAngle - LEAD });
  const belly = arc({ x: p.bodyX, y: p.bodyY, r: p.bodyR, ...SECTOR.belly });
  const breast = arc({ x: p.headX, y: p.headY, r: p.headR + p.neck / HALF, ...SECTOR.breast });

  // The beak: out from the face, down to the tip, back up its ridge.
  const mouth: Point = [p.headX - p.headR + p.neck, p.headY + p.beakDepth / HALF];
  const cutting: Point = [mouth[0] - p.beakReach * BEAK.cutting, mouth[1] + p.beakDrop * BEAK.dip];
  const beakTip: Point = [mouth[0] - p.beakReach, mouth[1] + p.beakDrop + p.beakHook];
  // The ridge starts OUT from the face, not inside it: a ridge on the head
  // gives the beak no top surface and it renders as a needle.
  const ridge: Point = [mouth[0] - p.beakReach * BEAK.ridgeOut, mouth[1] - p.beakDepth];

  return [
    ...crown,
    ...back,
    upper,
    tipUpper,
    tipLower,
    lower,
    ...belly,
    ...breast,
    mouth,
    cutting,
    beakTip,
    ridge,
  ];
}

export function caiquePath(p: Caique): string {
  return smoothClosed(caiquePoints(p), p.tension ?? 0);
}

/** The patches, in the order they lie on the bird: cheek, breast, wing. */
function plumage(p: Caique): string {
  return (
    `<circle cx="${p.cheekX}" cy="${p.cheekY}" r="${p.cheekR}" fill="${ROCK_LIFT}"/>` +
    `<circle cx="${p.bodyX - p.bodyR / HALF}" cy="${p.bellyY}" r="${p.bellyR}" fill="${PAPER}"/>` +
    `<ellipse cx="${p.wingX}" cy="${p.wingY}" rx="${p.wingLength}" ry="${p.wingDepth}"` +
    ` fill="${JUNIPER_LIFT}" transform="rotate(${p.wingAngle} ${p.wingX} ${p.wingY})"/>`
  );
}

/** One cell of a contact sheet: the mark, its label, and the value being swept. */
function cell(p: Caique, label: string, id: string): string {
  const path = caiquePath(p);
  return (
    `<g>` +
    `<rect width="${SPAN}" height="${SPAN}" fill="${SHEET_GROUND}" rx="6"/>` +
    `<clipPath id="${id}"><path d="${path}"/></clipPath>` +
    `<path d="${path}" fill="${INK}" fill-rule="evenodd"/>` +
    `<g clip-path="url(#${id})">${plumage(p)}</g>` +
    `<circle cx="${p.headX - EYE.back}" cy="${p.headY - EYE.up}" r="${EYE.r}" fill="${PAPER}"/>` +
    `<g transform="translate(${p.wingX - MARK.back} ${p.wingY - MARK.up}) scale(${MARK.scale})">` +
    `<g transform="rotate(-30 50 50)">` +
    `<rect x="15" y="24" width="52" height="24" rx="12" fill="${PAPER}"/>` +
    `<rect x="33" y="52" width="52" height="24" rx="12" fill="${INK}"/>` +
    `</g></g>` +
    `<text x="50" y="112" text-anchor="middle" font-family="ui-monospace, monospace"` +
    ` font-size="9" fill="${INK}">${label}</text>` +
    `</g>`
  );
}

const SHEET = { cell: 100, gap: 26, label: 22 } as const;
const SHEET_GROUND = '#ffffff';
/** The eye, and where the Interlace mark rides on the wing. */
const EYE = { back: 10, up: 8, r: 3.6 } as const;
const MARK = { back: 15, up: 15, scale: 0.3 } as const;

/** A grid of variants: one row per parameter, one column per value. */
function sheet(sweeps: ReadonlyArray<{ key: keyof Caique; values: readonly number[] }>): string {
  const columns = Math.max(...sweeps.map((s) => s.values.length));
  const width = columns * (SHEET.cell + SHEET.gap) + SHEET.gap;
  const rowHeight = SHEET.cell + SHEET.label + SHEET.gap;
  const height = sweeps.length * rowHeight + SHEET.gap;
  const rows = sweeps.map((sweep, r) =>
    sweep.values
      .map((value, c) => {
        const x = SHEET.gap + c * (SHEET.cell + SHEET.gap);
        const y = SHEET.gap + r * rowHeight;
        const tuned = { ...CAIQUE, [sweep.key]: value };
        const label = `${sweep.key} ${value}`;
        return `<g transform="translate(${x} ${y})">${cell(tuned, label, `c${r}-${c}`)}</g>`;
      })
      .join(''),
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"` +
    ` viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>` +
    `${rows.join('')}</svg>`
  );
}

/** What each sweep asks. Add a row here; do not add one at a call site. */
const SWEEPS = [
  { key: 'beakReach', values: [10, 14, 18, 22, 26] },
  { key: 'beakDrop', values: [0, 5, 10, 15, 20] },
  { key: 'beakHook', values: [0, 4, 8, 12, 16] },
  { key: 'beakDepth', values: [10, 14, 18, 22, 26] },
  { key: 'headR', values: [18, 21, 24, 27, 30] },
  { key: 'neck', values: [0, 4, 8, 12, 16] },
  { key: 'tailAngle', values: [20, 30, 40, 50, 60] },
  { key: 'tailLength', values: [26, 36, 46, 56, 66] },
  { key: 'tailTaper', values: [0.2, 0.4, 0.6, 0.8, 1] },
  { key: 'crest', values: [0, 3, 6, 9, 12] },
  { key: 'cheekR', values: [9, 12, 15, 18, 21] },
  { key: 'bellyR', values: [18, 22, 26, 30, 34] },
  { key: 'wingAngle', values: [10, 20, 30, 40, 50] },
  { key: 'wingLength', values: [22, 26, 30, 34, 38] },
] as const satisfies ReadonlyArray<{ key: keyof Caique; values: readonly number[] }>;

const wanted = process.argv.slice(2);
const chosen = wanted.length === 0 ? SWEEPS : SWEEPS.filter((s) => wanted.includes(s.key));

const out = join(repo, '.sdlc/brand/sheets/caique.svg');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sheet(chosen));
const variants = chosen.reduce((n, sweep) => n + sweep.values.length, 0);
console.log(`wrote ${out} — ${chosen.length} sweeps, ${variants} variants`);
