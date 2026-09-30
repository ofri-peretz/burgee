/**
 * `roundel/chalk` (R6): chalk 6's public API — the chainable builder, the mutable `level`,
 * `Chalk`, `chalkStderr`, `supportsColor` — over the tokens' emitter and the policy's
 * level, graded by chalk's own suite vendored into `compat-oracle`.
 *
 * chalk's mutable `level` is honoured here and nowhere else: `chalk.level = 0` silences
 * this façade, not the tokens, which read the policy. The template literal
 * (`chalk\`{red x}\``) went with chalk 5 and is not resurrected. Not one escape is
 * written here: parameters are computed, `sgr()` in tokens emits them (R3).
 *
 * The SGR numbers below are chalk's tables (ansi-styles) as written; naming each would
 * double the file the R8 ceiling measures, so the lint's magic-number rule is off here.
 */
import { colorLevel, type ColorLevel } from './policy.js';
import { processRuntime } from './runtime.js';
import { painted, type Painter, painter, type SgrPair, UNPAINTED } from './tokens.js';

/** Colour support: none, 16 colours, 256 colours, truecolor. chalk's name for the policy's level. */
export type ColorSupportLevel = ColorLevel;
export interface ColorSupport {
  level: ColorSupportLevel;
  hasBasic: boolean;
  has256: boolean;
  has16m: boolean;
}
export type ColorInfo = ColorSupport | false;
export interface ChalkOptions {
  /** `undefined` asks for the level to be detected, as omitting it does. */
  readonly level?: ColorSupportLevel | undefined;
}

// ── The style tables, in chalk's order ──────────────────────────────────────────────────
const MODIFIERS = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  underlineDouble: ['4:2', 24],
  underlineCurly: ['4:3', 24],
  underlineDotted: ['4:4', 24],
  underlineDashed: ['4:5', 24],
  overline: [53, 55],
  inverse: [7, 27],
  hidden: [8, 28],
  strikethrough: [9, 29],
} satisfies Record<string, [string | number, number]>;

type Basic = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';
type Bright = `${Basic}Bright` | 'gray' | 'grey';
export type ModifierName = keyof typeof MODIFIERS;
export type ForegroundColorName = Basic | Bright;
export type BackgroundColorName = `bg${Capitalize<Basic | Bright>}`;
export type UnderlineColorName = `underline${Capitalize<Basic | Bright>}`;
export type ColorName = ForegroundColorName | BackgroundColorName;

const NAMES: readonly Basic[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const pair = (open: string | number, close: number): SgrPair => ({ open: String(open), close: String(close) });

/** The eight colours, their bright variants, and `gray`/`grey` for bright black — under one prefix. */
function family(prefix: string, open: (i: number, bright: boolean) => string | number, close: number): Record<string, SgrPair> {
  const t: Record<string, SgrPair> = {};
  const key = (name: string): string => (prefix === '' ? name : prefix + cap(name));
  for (const bright of [false, true]) {
    NAMES.forEach((name, i) => {
      t[key(name) + (bright ? 'Bright' : '')] = pair(open(i, bright), close);
      if (bright && i === 0) for (const alias of ['gray', 'grey']) t[key(alias)] = pair(open(0, true), close);
    });
  }
  return t;
}

const FOREGROUND = family('', (i, bright) => (bright ? 90 : 30) + i, 39);
const BACKGROUND = family('bg', (i, bright) => (bright ? 100 : 40) + i, 49);
// SGR 58 has no 16-colour form: the basic colours are palette indices.
const UNDERLINE = family('underline', (i, bright) => `58;5;${bright ? i + 8 : i}`, 59);
const STYLES: Record<string, SgrPair> = {
  ...Object.fromEntries(Object.entries(MODIFIERS).map(([k, [open, close]]) => [k, pair(open, close)])),
  ...FOREGROUND,
  ...BACKGROUND,
  ...UNDERLINE,
};

export const modifierNames = Object.keys(MODIFIERS) as ModifierName[];
export const foregroundColorNames = Object.keys(FOREGROUND) as ForegroundColorName[];
export const backgroundColorNames = Object.keys(BACKGROUND) as BackgroundColorName[];
export const underlineColorNames = Object.keys(UNDERLINE) as UnderlineColorName[];
export const colorNames: ColorName[] = [...foregroundColorNames, ...backgroundColorNames];

// chalk's deprecated type spellings, which chalk still exports, so such an import migrates as
// is. Its deprecated *arrays* (`colors`, `modifiers`, …) are not here: `./chalk`'s budget is
// chalk's own source size, and they cost 142 B of it (drop-in-type-surface-lock.test.ts).
export type Modifiers = ModifierName;
export type ForegroundColor = ForegroundColorName;
export type BackgroundColor = BackgroundColorName;
export type Color = ColorName;
export type Options = ChalkOptions;

// ── Colour models: rgb, hex and ansi256, downsampled to what the level can show ─────────
// ponytail: theme.ts has the same cube maths for hex tokens; R7 forbids this file reaching
// it, and chalk's 256 → 16 rounding is chalk's own, so the lines are duplicated.
type Rgb = [number, number, number];

const step = (v: number): number => Math.round((v / 255) * 5);

/** Where an equal-channel grey lands on the 24-step ramp: 16 black, 231 white, 232–255 between. */
const ramp = (v: number): number => (v < 8 ? 16 : v > 248 ? 231 : Math.round(((v - 8) / 247) * 24) + 232);

/** The 6×6×6 cube and the 24-step grey ramp, as ansi-styles computes them. */
const rgbToAnsi256 = (r: number, g: number, b: number): number =>
  r === g && g === b ? ramp(r) : 16 + 36 * step(r) + 6 * step(g) + step(b);

/** chalk's `ansi256ToAnsi`: the nearest of the 16 colours as an SGR 30–37 / 90–97 code. */
function ansi256ToAnsi(code: number): number {
  // 0–7 are 30–37 and 8–15 are 90–97, which is 82 + code.
  if (code < 16) return (code < 8 ? 30 : 82) + code;
  const c = code - 16;
  const grey = ((code - 232) * 10 + 8) / 255;
  const [r, g, b]: Rgb = code >= 232 ? [grey, grey, grey] : [Math.floor(c / 36) / 5, Math.floor((c % 36) / 6) / 5, (c % 6) / 5];
  const value = Math.max(r, g, b) * 2;
  return value === 0 ? 30 : (value === 2 ? 90 : 30) + ((Math.round(b) << 2) | (Math.round(g) << 1) | Math.round(r));
}

function hexToRgb(hex: string): Rgb {
  const m = /[\da-f]{6}|[\da-f]{3}/i.exec(hex)?.[0] ?? '0';
  const n = Number.parseInt(m.length === 3 ? [...m].map((c) => c + c).join('') : m, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

interface Family {
  /** The extended-colour selector: 38 foreground, 48 background, 58 underline. */
  ext: number;
  /** A 16-colour code (30–37 / 90–97) as this family opens it. */
  ansi: (code: number) => string;
  close: string;
}
type Model = 'rgb' | 'hex' | 'ansi256';
const FAMILIES: Record<string, Family> = {
  '': { ext: 38, ansi: String, close: '39' },
  bg: { ext: 48, ansi: (code) => String(code + 10), close: '49' },
  underline: { ext: 58, ansi: (code) => `58;5;${code < 90 ? code - 30 : code - 82}`, close: '59' },
};
const MODELS: Record<string, [Family, Model]> = {};
for (const [prefix, fam] of Object.entries(FAMILIES)) {
  for (const model of ['rgb', 'hex', 'ansi256'] as const) MODELS[prefix === '' ? model : prefix + cap(model)] = [fam, model];
}

/** The open parameters of one model colour at this level: truecolor, 256, or the nearest 16. */
function open(fam: Family, level: ColorLevel, model: Model, args: unknown[]): string {
  const rgb: Rgb | undefined = model === 'ansi256' ? undefined : model === 'hex' ? hexToRgb(String(args[0])) : (args.map(Number) as Rgb);
  // Truecolour needs no palette index, so it is not worked out (B5).
  if (level === 3 && rgb !== undefined) return `${fam.ext};2;${rgb.join(';')}`;
  const code = rgb === undefined ? Number(args[0]) : rgbToAnsi256(...rgb);
  return level >= 2 ? `${fam.ext};5;${code}` : fam.ansi(ansi256ToAnsi(code));
}

// ── The builder ─────────────────────────────────────────────────────────────────────────
interface Base {
  (...text: unknown[]): string;
  /** Mutable, as chalk's is; every builder in a chain reads and writes the instance it came from. */
  level: ColorSupportLevel;
  rgb(red: number, green: number, blue: number): ChalkInstance;
  hex(color: string): ChalkInstance;
  ansi256(index: number): ChalkInstance;
  bgRgb(red: number, green: number, blue: number): ChalkInstance;
  bgHex(color: string): ChalkInstance;
  bgAnsi256(index: number): ChalkInstance;
  underlineRgb(red: number, green: number, blue: number): ChalkInstance;
  underlineHex(color: string): ChalkInstance;
  underlineAnsi256(index: number): ChalkInstance;
}
export type ChalkInstance = Base & { readonly [K in ModifierName | ColorName | UnderlineColorName | 'visible']: ChalkInstance };

interface Root {
  level: ColorLevel;
}

function checkLevel(level: unknown): asserts level is ColorLevel {
  if (!Number.isSafeInteger(level) || (level as number) < 0 || (level as number) > 3) throw new Error('The `level` should be an integer from 0 to 3');
}

/** Where a builder keeps what its links need; a symbol, so no chalk property can shadow it. */
const STATE = Symbol('chalk');
interface State {
  root: Root;
  at: Painter;
  visible: boolean;
}
type Linked = ChalkInstance & { [STATE]: State };

/** The next link after `key`: a builder for a style or `visible`, a factory for a colour model. */
function link({ root, at, visible }: State, key: string): unknown {
  const style = STYLES[key];
  if (style !== undefined) return builder(root, painter(at, style), visible);
  if (key === 'visible') return builder(root, at, true);
  const [fam, name] = MODELS[key] as [Family, Model];
  return (...args: unknown[]) => builder(root, painter(at, { open: open(fam, root.level, name, args), close: fam.close }), visible);
}

/**
 * What every builder inherits: `level` on its root, and one getter per chalk property that
 * builds the next link and then keeps it on the builder it was asked of — chalk's own shape.
 * It was a Proxy until 2026-09-30, and a trap on every `.red` was a third of what a styled
 * string cost; a kept property is a plain read the second time (B5). Its prototype is
 * `Function.prototype`, so `bind`, `call` and `apply` are the real ones, and a link found once
 * is found again (`chalk.rgb === chalk.rgb`).
 */
const PROTO = Object.create(Function.prototype) as object;
Object.defineProperty(PROTO, 'level', {
  get(this: Linked) {
    return this[STATE].root.level;
  },
  set(this: Linked, value: unknown) {
    checkLevel(value);
    this[STATE].root.level = value;
  },
});
for (const key of [...Object.keys(STYLES), ...Object.keys(MODELS), 'visible']) {
  Object.defineProperty(PROTO, key, {
    get(this: Linked) {
      const value = link(this[STATE], key);
      Object.defineProperty(this, key, { value });
      return value;
    },
  });
}

/** One link of a chain: a function over the styles gathered so far, whose properties are the next links. */
function builder(root: Root, at: Painter, visible: boolean): ChalkInstance {
  const fn = (...text: unknown[]): string => {
    const s = text.length === 1 ? String(text[0]) : text.join(' ');
    return root.level === 0 || s === '' ? (visible ? '' : s) : painted(at, s);
  };
  const linked = Object.setPrototypeOf(fn, PROTO) as Linked;
  linked[STATE] = { root, at, visible };
  return linked;
}

const stdoutLevel = colorLevel(processRuntime());
const stderrLevel = colorLevel(processRuntime('stderr'));
const info = (level: ColorLevel): ColorInfo => (level === 0 ? false : { level, hasBasic: true, has256: level >= 2, has16m: level === 3 });

/**
 * The detected level is already one of the four, so checking it costs nothing and lets the
 * validation and the default be one expression rather than two readings of `options.level`.
 * A caller's own level is checked exactly as before — `new Chalk({ level: 9 })` throws.
 */
function create(options: ChalkOptions = {}, detected = stdoutLevel): ChalkInstance {
  const { level = detected } = options;
  checkLevel(level);
  return builder({ level }, UNPAINTED, false);
}

/** `new Chalk({ level })` — an instance with its own level, detected when the option is omitted. */
export interface Chalk extends ChalkInstance {}
export class Chalk {
  constructor(options?: ChalkOptions) {
    return create(options);
  }
}

export const supportsColor: ColorInfo = info(stdoutLevel);
export const supportsColorStderr: ColorInfo = info(stderrLevel);
export const chalkStderr: ChalkInstance = create({}, stderrLevel);

const chalk: ChalkInstance = create();
export default chalk;
