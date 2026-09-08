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
import { colorLevel, type ColorLevel, type Runtime } from './policy.js';
import { sgr, type SgrPair } from './tokens.js';

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

// ── Colour models: rgb, hex and ansi256, downsampled to what the level can show ─────────
// ponytail: theme.ts has the same cube maths for hex tokens; R7 forbids this file reaching
// it, and chalk's 256 → 16 rounding is chalk's own, so the lines are duplicated.
type Rgb = [number, number, number];

const step = (v: number): number => Math.round((v / 255) * 5);

/** The 6×6×6 cube and the 24-step grey ramp, as ansi-styles computes them. */
function rgbToAnsi256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  return 16 + 36 * step(r) + 6 * step(g) + step(b);
}

/** chalk's `ansi256ToAnsi`: the nearest of the 16 colours as an SGR 30–37 / 90–97 code. */
function ansi256ToAnsi(code: number): number {
  if (code < 8) return 30 + code;
  if (code < 16) return 90 + code - 8;
  let rgb: Rgb;
  if (code >= 232) {
    const grey = ((code - 232) * 10 + 8) / 255;
    rgb = [grey, grey, grey];
  } else {
    const c = code - 16;
    rgb = [Math.floor(c / 36) / 5, Math.floor((c % 36) / 6) / 5, (c % 6) / 5];
  }
  const [r, g, b] = rgb;
  const value = Math.max(r, g, b) * 2;
  if (value === 0) return 30;
  return (value === 2 ? 90 : 30) + ((Math.round(b) << 2) | (Math.round(g) << 1) | Math.round(r));
}

function hexToRgb(hex: string): Rgb {
  let s = /[\da-f]{6}|[\da-f]{3}/i.exec(hex)?.[0] ?? '0';
  if (s.length === 3) s = [...s].map((c) => c + c).join('');
  const n = Number.parseInt(s, 16);
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
  let rgb: Rgb | undefined;
  let code = Number(args[0]);
  if (model !== 'ansi256') {
    rgb = model === 'hex' ? hexToRgb(String(args[0])) : (args.map(Number) as Rgb);
    code = rgbToAnsi256(...rgb);
  }
  if (level === 3 && rgb !== undefined) return `${fam.ext};2;${rgb.join(';')}`;
  if (level >= 2) return `${fam.ext};5;${code}`;
  return fam.ansi(ansi256ToAnsi(code));
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
  if (!Number.isSafeInteger(level) || (level as number) < 0 || (level as number) > 3) {
    throw new Error('The `level` should be an integer from 0 to 3');
  }
}

/** The next link after `key`, or nothing when chalk has no such property. */
function link(root: Root, chain: readonly SgrPair[], visible: boolean, key: string): unknown {
  const style = STYLES[key];
  if (style !== undefined) return builder(root, [...chain, style], visible);
  if (key === 'visible') return builder(root, chain, true);
  const model = MODELS[key];
  if (model === undefined) return undefined;
  const [fam, name] = model;
  return (...args: unknown[]) => builder(root, [...chain, { open: open(fam, root.level, name, args), close: fam.close }], visible);
}

/**
 * One link of a chain: a function over the styles gathered so far, whose properties are
 * the next links. A Proxy over a function, so `bind`, `call` and `apply` are the real ones
 * and every link found once is found again (`chalk.rgb === chalk.rgb`).
 */
function builder(root: Root, chain: readonly SgrPair[], visible: boolean): ChalkInstance {
  const links = new Map<string, unknown>();
  const fn = (...text: unknown[]): string => {
    const s = text.length === 1 ? String(text[0]) : text.join(' ');
    if (root.level === 0 || s === '') return visible ? '' : s;
    return chain.length === 0 ? s : sgr(chain, s);
  };
  return new Proxy(fn, {
    get(target, key) {
      if (key === 'level') return root.level;
      if (typeof key === 'string') {
        if (!links.has(key)) links.set(key, link(root, chain, visible, key));
        const found = links.get(key);
        if (found !== undefined) return found;
      }
      return Reflect.get(target, key);
    },
    set(target, key, value) {
      if (key !== 'level') return Reflect.set(target, key, value);
      checkLevel(value);
      root.level = value;
      return true;
    },
  }) as ChalkInstance;
}

// ── Detection, once, at import ──────────────────────────────────────────────────────────
// R6 against R9: chalk's contract is "detect the terminal at import", so this file — alone
// in the package — reads the process, once, through the policy. The exception is recorded
// in burgee's process-reference lock. Guarded: `process` is not a given where a bundle runs.
const proc = (globalThis as { process?: { env: Runtime['env']; stdout?: { isTTY?: boolean }; stderr?: { isTTY?: boolean } } }).process;

/** The policy asks where the output is going; for `chalkStderr` the answer is stderr. */
const detect = (stream: 'stdout' | 'stderr'): ColorLevel => colorLevel({ env: proc?.env ?? {}, isTTY: { stdout: proc?.[stream]?.isTTY === true } });

const stdoutLevel = detect('stdout');
const stderrLevel = detect('stderr');
const info = (level: ColorLevel): ColorInfo => (level === 0 ? false : { level, hasBasic: true, has256: level >= 2, has16m: level === 3 });

function create(options: ChalkOptions = {}, detected = stdoutLevel): ChalkInstance {
  if (options.level !== undefined) checkLevel(options.level);
  return builder({ level: options.level ?? detected }, [], false);
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
