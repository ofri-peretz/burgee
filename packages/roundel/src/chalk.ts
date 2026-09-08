/**
 * `roundel/chalk` — chalk 6's public API, ported method for method and graded by chalk's
 * own suite through `compat-oracle` (R6, U11): the chainable styles, the `rgb`/`hex`/
 * `ansi256` models with their per-level downsampling, `Chalk`, `chalkStderr`, the mutable
 * `level`, `supportsColor`, the name lists. Its two vendored dependencies — ansi-styles
 * and supports-color — are ported with it, so a migration is one import.
 *
 * chalk's model — a process-detected, mutable `level` — is the one thing in the family
 * that reads the terminal for itself, and it is kept inside this façade only: chalk's
 * tests assert it, and everything else in roundel reads the policy (U2).
 */
import { release } from 'node:os';
import { isatty } from 'node:tty';

// ───── ansi-styles ─────

const ANSI_BACKGROUND_OFFSET = 10;
const ANSI_UNDERLINE_OFFSET = 20;
const ESC = '\u001B[';
const FG = 38;
const BRIGHT_FROM = 90;
const BASIC_FROM = 30;
const BRIGHT_PALETTE_FROM = 8;

const wrapAnsi16 = (offset = 0) => (code: number): string => `${ESC}${code + offset}m`;
const wrapAnsi256 = (offset = 0) => (code: number): string => `${ESC}${FG + offset};5;${code}m`;
const wrapAnsi16m = (offset = 0) => (red: number, green: number, blue: number): string => `${ESC}${FG + offset};2;${red};${green};${blue}m`;
/** `SGR 58` has no basic 16-colour form, so the basic colour code is mapped to its palette index instead. */
const wrapUnderlineAnsi = (code: number): string => `${ESC}58;5;${code < BRIGHT_FROM ? code - BASIC_FROM : code - BRIGHT_FROM + BRIGHT_PALETTE_FROM}m`;

type Pair = [number | string, number];

const MODIFIER: Record<string, Pair> = {
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
};
const COLOR: Record<string, Pair> = {
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  blackBright: [90, 39],
  gray: [90, 39],
  grey: [90, 39],
  redBright: [91, 39],
  greenBright: [92, 39],
  yellowBright: [93, 39],
  blueBright: [94, 39],
  magentaBright: [95, 39],
  cyanBright: [96, 39],
  whiteBright: [97, 39],
};
const BG_COLOR: Record<string, Pair> = {
  bgBlack: [40, 49],
  bgRed: [41, 49],
  bgGreen: [42, 49],
  bgYellow: [43, 49],
  bgBlue: [44, 49],
  bgMagenta: [45, 49],
  bgCyan: [46, 49],
  bgWhite: [47, 49],
  bgBlackBright: [100, 49],
  bgGray: [100, 49],
  bgGrey: [100, 49],
  bgRedBright: [101, 49],
  bgGreenBright: [102, 49],
  bgYellowBright: [103, 49],
  bgBlueBright: [104, 49],
  bgMagentaBright: [105, 49],
  bgCyanBright: [106, 49],
  bgWhiteBright: [107, 49],
};
const UNDERLINE_COLOR: Record<string, Pair> = {
  underlineBlack: ['58;5;0', 59],
  underlineRed: ['58;5;1', 59],
  underlineGreen: ['58;5;2', 59],
  underlineYellow: ['58;5;3', 59],
  underlineBlue: ['58;5;4', 59],
  underlineMagenta: ['58;5;5', 59],
  underlineCyan: ['58;5;6', 59],
  underlineWhite: ['58;5;7', 59],
  underlineBlackBright: ['58;5;8', 59],
  underlineGray: ['58;5;8', 59],
  underlineGrey: ['58;5;8', 59],
  underlineRedBright: ['58;5;9', 59],
  underlineGreenBright: ['58;5;10', 59],
  underlineYellowBright: ['58;5;11', 59],
  underlineBlueBright: ['58;5;12', 59],
  underlineMagentaBright: ['58;5;13', 59],
  underlineCyanBright: ['58;5;14', 59],
  underlineWhiteBright: ['58;5;15', 59],
};

export const modifierNames: string[] = Object.keys(MODIFIER);
export const foregroundColorNames: string[] = Object.keys(COLOR);
export const backgroundColorNames: string[] = Object.keys(BG_COLOR);
export const underlineColorNames: string[] = Object.keys(UNDERLINE_COLOR);
export const colorNames: string[] = [...foregroundColorNames, ...backgroundColorNames];

interface OpenClose {
  open: string;
  close: string;
}

interface Group extends Record<string, any> {
  close: string;
  ansi: (code: number) => string;
  ansi256: (code: number) => string;
  ansi16m: (r: number, g: number, b: number) => string;
}

interface AnsiStyles extends Record<string, any> {
  color: Group;
  bgColor: Group;
  underlineColor: Group;
  codes: Map<number, number>;
  rgbToAnsi256: (r: number, g: number, b: number) => number;
  hexToRgb: (hex: string | number) => [number, number, number];
  hexToAnsi256: (hex: string | number) => number;
  ansi256ToAnsi: (code: number) => number;
  rgbToAnsi: (r: number, g: number, b: number) => number;
  hexToAnsi: (hex: string | number) => number;
}

const GREY_LOW = 8;
const GREY_HIGH = 248;
const GREY_STEPS = 24;
const GREY_RANGE = 247;
const GREY_BASE = 232;
const CUBE_BASE = 16;
const CUBE_STEPS = 5;
const CUBE_R = 36;
const CUBE_G = 6;
const CHANNEL_MAX = 255;
const WHITE_256 = 231;
const BRIGHT_ANSI = 60;
const HEX_RADIX = 16;
const BYTE = 0xff;
const SHIFT_R = 16;
const SHIFT_G = 8;
const GREY_STEP = 10;
const SHORT_HEX = 3;
const PALETTE_16 = 16;
const BASIC_256 = 8;
const TWO = 2;

function rgbToAnsi256(red: number, green: number, blue: number): number {
  if (red === green && green === blue) {
    if (red < GREY_LOW) return CUBE_BASE;
    if (red > GREY_HIGH) return WHITE_256;
    return Math.round(((red - GREY_LOW) / GREY_RANGE) * GREY_STEPS) + GREY_BASE;
  }
  return CUBE_BASE + CUBE_R * Math.round((red / CHANNEL_MAX) * CUBE_STEPS) + CUBE_G * Math.round((green / CHANNEL_MAX) * CUBE_STEPS) + Math.round((blue / CHANNEL_MAX) * CUBE_STEPS);
}

function hexToRgb(hex: string | number): [number, number, number] {
  const matches = /[\da-f]{6}|[\da-f]{3}/i.exec(hex.toString(HEX_RADIX));
  if (!matches) return [0, 0, 0];
  let [colorString] = matches;
  if (colorString.length === SHORT_HEX) colorString = [...colorString].map((c) => c + c).join('');
  const integer = Number.parseInt(colorString, HEX_RADIX);
  return [(integer >> SHIFT_R) & BYTE, (integer >> SHIFT_G) & BYTE, integer & BYTE];
}

function ansi256ToAnsi(code: number): number {
  if (code < BASIC_256) return BASIC_FROM + code;
  if (code < PALETTE_16) return BRIGHT_FROM + (code - BASIC_256);
  let red: number;
  let green: number;
  let blue: number;
  if (code >= GREY_BASE) {
    red = ((code - GREY_BASE) * GREY_STEP + GREY_LOW) / CHANNEL_MAX;
    green = red;
    blue = red;
  } else {
    code -= CUBE_BASE;
    const remainder = code % CUBE_R;
    red = Math.floor(code / CUBE_R) / CUBE_STEPS;
    green = Math.floor(remainder / CUBE_G) / CUBE_STEPS;
    blue = (remainder % CUBE_G) / CUBE_STEPS;
  }
  const value = Math.max(red, green, blue) * TWO;
  if (value === 0) return BASIC_FROM;
  let result = BASIC_FROM + ((Math.round(blue) << TWO) | (Math.round(green) << 1) | Math.round(red));
  if (value === TWO) result += BRIGHT_ANSI;
  return result;
}

function assembleStyles(): AnsiStyles {
  const styles: Record<string, any> = {};
  const codes = new Map<number, number>();
  const groups: Record<string, Record<string, Pair>> = { modifier: MODIFIER, color: COLOR, bgColor: BG_COLOR, underlineColor: UNDERLINE_COLOR };
  for (const [groupName, group] of Object.entries(groups)) {
    const assembled: Record<string, any> = {};
    for (const [styleName, style] of Object.entries(group)) {
      const pair: OpenClose = { open: `${ESC}${style[0]}m`, close: `${ESC}${style[1]}m` };
      styles[styleName] = pair;
      assembled[styleName] = pair;
      codes.set(Number.parseInt(String(style[0]), 10), style[1]);
    }
    Object.defineProperty(styles, groupName, { value: assembled, enumerable: false });
  }
  Object.defineProperty(styles, 'codes', { value: codes, enumerable: false });
  styles['color'].close = `${ESC}39m`;
  styles['bgColor'].close = `${ESC}49m`;
  styles['underlineColor'].close = `${ESC}59m`;
  styles['color'].ansi = wrapAnsi16();
  styles['color'].ansi256 = wrapAnsi256();
  styles['color'].ansi16m = wrapAnsi16m();
  styles['bgColor'].ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  styles['bgColor'].ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  styles['bgColor'].ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
  styles['underlineColor'].ansi = wrapUnderlineAnsi;
  styles['underlineColor'].ansi256 = wrapAnsi256(ANSI_UNDERLINE_OFFSET);
  styles['underlineColor'].ansi16m = wrapAnsi16m(ANSI_UNDERLINE_OFFSET);
  Object.defineProperties(styles, {
    rgbToAnsi256: { value: rgbToAnsi256, enumerable: false },
    hexToRgb: { value: hexToRgb, enumerable: false },
    hexToAnsi256: { value: (hex: string | number) => rgbToAnsi256(...hexToRgb(hex)), enumerable: false },
    ansi256ToAnsi: { value: ansi256ToAnsi, enumerable: false },
    rgbToAnsi: { value: (r: number, g: number, b: number) => ansi256ToAnsi(rgbToAnsi256(r, g, b)), enumerable: false },
    hexToAnsi: { value: (hex: string | number) => ansi256ToAnsi(rgbToAnsi256(...hexToRgb(hex))), enumerable: false },
  });
  return styles as AnsiStyles;
}

export const ansiStyles: AnsiStyles = assembleStyles();

// ───── supports-color ─────

export interface ColorSupport {
  level: 1 | 2 | 3;
  hasBasic: boolean;
  has256: boolean;
  has16m: boolean;
}

export type ColorSupportLevel = 0 | 1 | 2 | 3;

const MAX_LEVEL = 3;
const LEVEL_256 = 2;
const WIN_10 = 10;
const WIN_256_BUILD = 10_586;
const WIN_16M_BUILD = 14_931;
const ITERM_TRUECOLOR = 3;
const DECIMAL = 10;

function hasFlag(flag: string, argv: string[] = process.argv): boolean {
  const prefix = flag.startsWith('-') ? '' : flag.length === 1 ? '-' : '--';
  const position = argv.indexOf(prefix + flag);
  const terminatorPosition = argv.indexOf('--');
  return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}

const env = process.env;

let flagForceColor: number | undefined;
if (hasFlag('no-color') || hasFlag('no-colors') || hasFlag('color=false') || hasFlag('color=never')) flagForceColor = 0;
else if (hasFlag('color') || hasFlag('colors') || hasFlag('color=true') || hasFlag('color=always')) flagForceColor = 1;

function hasNumericForceColor(): boolean {
  return /^\d+$/.test(env['FORCE_COLOR'] ?? '');
}

function envForceColor(): number | undefined {
  if (!('FORCE_COLOR' in env)) return undefined;
  const value = env['FORCE_COLOR'] ?? '';
  if (value === 'false') return 0;
  if (value === 'true' || value.length === 0) return 1;
  if (!hasNumericForceColor()) return undefined;
  return Math.min(Number.parseInt(value, DECIMAL), MAX_LEVEL);
}

function translateLevel(level: number): false | ColorSupport {
  if (level === 0) return false;
  return { level: level as 1 | 2 | 3, hasBasic: true, has256: level >= LEVEL_256, has16m: level >= MAX_LEVEL };
}

function ciLevel(min: number): number {
  if (['GITHUB_ACTIONS', 'GITEA_ACTIONS', 'CIRCLECI'].some((key) => key in env)) return MAX_LEVEL;
  if (['TRAVIS', 'APPVEYOR', 'GITLAB_CI', 'BUILDKITE', 'DRONE'].some((sign) => sign in env) || env['CI_NAME'] === 'codeship') return 1;
  return min;
}

function terminalLevel(min: number): number {
  const term = env['TERM'] ?? '';
  if ('TEAMCITY_VERSION' in env) return /^(?:9\.0*[1-9]\d*\.|\d{2,}\.)/.test(env['TEAMCITY_VERSION'] ?? '') ? 1 : 0;
  if (env['COLORTERM'] === 'truecolor') return MAX_LEVEL;
  if (term === 'xterm-kitty' || term === 'xterm-ghostty' || term === 'wezterm') return MAX_LEVEL;
  if ('TERM_PROGRAM' in env) {
    const version = Number.parseInt((env['TERM_PROGRAM_VERSION'] ?? '').split('.', 1)[0] ?? '', DECIMAL);
    if (env['TERM_PROGRAM'] === 'iTerm.app') return version >= ITERM_TRUECOLOR ? MAX_LEVEL : LEVEL_256;
    if (env['TERM_PROGRAM'] === 'Apple_Terminal') return LEVEL_256;
  }
  if (/-256(?:color)?$/i.test(term)) return LEVEL_256;
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(term)) return 1;
  if ('COLORTERM' in env) return 1;
  return min;
}

function windowsLevel(): number {
  const osRelease = release().split('.');
  if (Number(osRelease[0]) >= WIN_10 && Number(osRelease[2]) >= WIN_256_BUILD) return Number(osRelease[2]) >= WIN_16M_BUILD ? MAX_LEVEL : LEVEL_256;
  return 1;
}

function supportsColorLevel(haveStream: unknown, { streamIsTTY, sniffFlags = true }: { streamIsTTY?: boolean | undefined; sniffFlags?: boolean } = {}): number {
  const noFlagForceColor = envForceColor();
  if (noFlagForceColor !== undefined) flagForceColor = noFlagForceColor;
  const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
  if (forceColor === 0) return 0;
  if (sniffFlags) {
    if (hasFlag('color=16m') || hasFlag('color=full') || hasFlag('color=truecolor')) return MAX_LEVEL;
    if (hasFlag('color=256')) return LEVEL_256;
  }
  if (forceColor !== undefined && hasNumericForceColor()) return forceColor;
  if ('TF_BUILD' in env && 'AGENT_NAME' in env) return 1;
  if (haveStream && !streamIsTTY && forceColor === undefined) return 0;
  const min = forceColor || 0;
  if (env['TERM'] === 'dumb') return min;
  if (process.platform === 'win32') return windowsLevel();
  if ('CI' in env) return ciLevel(min);
  return terminalLevel(min);
}

export function createSupportsColor(stream: { isTTY?: boolean } | undefined, options: { sniffFlags?: boolean } = {}): false | ColorSupport {
  const level = supportsColorLevel(stream, { streamIsTTY: stream?.isTTY, ...options });
  return translateLevel(level);
}

const stdoutColor = createSupportsColor({ isTTY: isatty(1) });
const stderrColor = createSupportsColor({ isTTY: isatty(2) });


// ───── chalk ─────

function stringReplaceAll(string: string, substring: string, postfix: string): string {
  let index = string.indexOf(substring);
  if (index === -1) return string;
  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = '';
  do {
    returnValue += string.slice(endIndex, index) + substring + postfix;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

function stringEncaseCRLFWithFirstIndex(string: string, prefix: string, postfix: string, index: number): string {
  let endIndex = 0;
  let returnValue = '';
  do {
    const isGotCR = string[index - 1] === '\r';
    returnValue += string.slice(endIndex, isGotCR ? index - 1 : index) + prefix + (isGotCR ? '\r\n' : '\n') + postfix;
    endIndex = index + 1;
    index = string.indexOf('\n', endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

const GENERATOR = Symbol('GENERATOR');
const STYLER = Symbol('STYLER');
const IS_EMPTY = Symbol('IS_EMPTY');
const LEVEL = Symbol('LEVEL');

interface Styler {
  open: string;
  close: string;
  openAll: string;
  closeAll: string;
  parent: Styler | undefined;
}

export interface ChalkOptions {
  level?: ColorSupportLevel | undefined;
}

/** A chalk instance or a style in its chain: callable, chainable, with a `level`. */
export interface ChalkInstance {
  (...text: unknown[]): string;
  level: ColorSupportLevel;
  visible: ChalkInstance;
  rgb: (r: number, g: number, b: number) => ChalkInstance;
  bgRgb: (r: number, g: number, b: number) => ChalkInstance;
  underlineRgb: (r: number, g: number, b: number) => ChalkInstance;
  hex: (hex: string) => ChalkInstance;
  bgHex: (hex: string) => ChalkInstance;
  underlineHex: (hex: string) => ChalkInstance;
  ansi256: (code: number) => ChalkInstance;
  bgAnsi256: (code: number) => ChalkInstance;
  underlineAnsi256: (code: number) => ChalkInstance;
  [style: string]: any;
}

const styles: PropertyDescriptorMap = Object.create(null);

const assertValidLevel = (level: unknown): void => {
  if (!Number.isSafeInteger(level) || (level as number) < 0 || (level as number) > MAX_LEVEL) throw new Error('The `level` should be an integer from 0 to 3');
};

const levelDescriptor: PropertyDescriptor = {
  enumerable: true,
  get(this: any) {
    return this[LEVEL];
  },
  set(this: any, level: unknown) {
    assertValidLevel(level);
    this[LEVEL] = level;
  },
};

const applyOptions = (object: any, options: ChalkOptions = {}): void => {
  if (options.level !== undefined) assertValidLevel(options.level);
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object[LEVEL] = options.level === undefined ? colorLevel : options.level;
};

const chalkFactory = (options?: ChalkOptions): ChalkInstance => {
  const chalk = ((...strings: unknown[]) => strings.join(' ')) as any;
  applyOptions(chalk, options);
  Object.setPrototypeOf(chalk, createChalk.prototype);
  return chalk as ChalkInstance;
};

function createChalk(options?: ChalkOptions): ChalkInstance {
  return chalkFactory(options);
}

/** `new Chalk({ level })`: an isolated instance whose constructor returns the callable. */
export class Chalk {
  constructor(options?: ChalkOptions) {
    // chalk's contract: the constructor hands back the callable
    return chalkFactory(options) as unknown as Chalk;
  }
}

Object.setPrototypeOf(createChalk.prototype, Function.prototype);

for (const [styleName, style] of Object.entries(ansiStyles)) {
  styles[styleName] = {
    get(this: any) {
      const builder = createBuilder(this, createStyler((style as OpenClose).open, (style as OpenClose).close, this[STYLER]), this[IS_EMPTY]);
      Object.defineProperty(this, styleName, { value: builder });
      return builder;
    },
  };
}

styles['visible'] = {
  get(this: any) {
    const builder = createBuilder(this, this[STYLER], true);
    Object.defineProperty(this, 'visible', { value: builder });
    return builder;
  },
};

type Converter = (first: any, second?: any, third?: any) => string;

const createModelConverters = (model: string, type: 'color' | 'bgColor' | 'underlineColor'): Converter[] => {
  const style = ansiStyles[type];
  if (model === 'rgb') {
    const ansi: Converter = (red, green, blue) => style.ansi(ansiStyles.rgbToAnsi(red, green, blue));
    const ansi256: Converter = (red, green, blue) => style.ansi256(ansiStyles.rgbToAnsi256(red, green, blue));
    return [ansi, ansi, ansi256, style.ansi16m as Converter];
  }
  if (model === 'hex') {
    const ansi: Converter = (hex) => style.ansi(ansiStyles.hexToAnsi(hex));
    const ansi256: Converter = (hex) => style.ansi256(ansiStyles.hexToAnsi256(hex));
    return [ansi, ansi, ansi256, (hex) => style.ansi16m(...ansiStyles.hexToRgb(hex))];
  }
  const ansi: Converter = (code) => style.ansi(ansiStyles.ansi256ToAnsi(code));
  return [ansi, ansi, style.ansi256 as Converter, style.ansi256 as Converter];
};

for (const model of ['rgb', 'hex', 'ansi256']) {
  const capitalizedModel = (model[0] as string).toUpperCase() + model.slice(1);
  for (const [styleName, type] of [
    [model, 'color'],
    [`bg${capitalizedModel}`, 'bgColor'],
    [`underline${capitalizedModel}`, 'underlineColor'],
  ] as [string, 'color' | 'bgColor' | 'underlineColor'][]) {
    const { close } = ansiStyles[type];
    const converters = createModelConverters(model, type);
    styles[styleName] = {
      get(this: any) {
        const styleFunction = function (this: any, first: any, second?: any, third?: any): ChalkInstance {
          const open = (converters[this.level] as Converter)(first, second, third);
          return createBuilder(this, createStyler(open, close, this[STYLER]), this[IS_EMPTY]);
        };
        Object.defineProperty(this, styleName, { value: styleFunction });
        return styleFunction;
      },
    };
  }
}

const proto = Object.defineProperties(() => undefined, {
  ...styles,
  level: {
    enumerable: true,
    get(this: any) {
      return this[GENERATOR].level;
    },
    set(this: any, level: unknown) {
      this[GENERATOR].level = level;
    },
  },
});

const createStyler = (open: string, close: string, parent: Styler | undefined): Styler => {
  const openAll = parent === undefined ? open : parent.openAll + open;
  const closeAll = parent === undefined ? close : close + parent.closeAll;
  return { open, close, openAll, closeAll, parent };
};

const createBuilder = (self: any, styler: Styler | undefined, isEmpty: boolean): ChalkInstance => {
  const builder = ((...args: unknown[]) => {
    if (args.length === 1) return applyStyle(builder, `${args[0]}`);
    if (args.length === TWO) return applyStyle(builder, `${args[0]} ${args[1]}`);
    return applyStyle(builder, args.join(' '));
  }) as any;
  Object.setPrototypeOf(builder, proto);
  builder[GENERATOR] = self[GENERATOR] ?? self;
  builder[STYLER] = styler;
  builder[IS_EMPTY] = isEmpty;
  return builder as ChalkInstance;
};

const applyStyle = (self: any, string: string): string => {
  if (self[GENERATOR][LEVEL] <= 0 || !string) return self[IS_EMPTY] ? '' : string;
  let styler: Styler | undefined = self[STYLER];
  if (styler === undefined) return string;
  const { openAll, closeAll } = styler;
  if (string.includes('\u001B')) {
    while (styler !== undefined) {
      string = stringReplaceAll(string, styler.close, styler.open);
      styler = styler.parent;
    }
  }
  const lfIndex = string.indexOf('\n');
  if (lfIndex !== -1) string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
  return openAll + string + closeAll;
};

Object.defineProperties(createChalk.prototype, { ...styles, level: levelDescriptor });

const chalk: ChalkInstance = createChalk();
export const chalkStderr: ChalkInstance = createChalk({ level: stderrColor ? stderrColor.level : 0 });

export {
  stdoutColor as supportsColor,
  stderrColor as supportsColorStderr,
  modifierNames as modifiers,
  foregroundColorNames as foregroundColors,
  backgroundColorNames as backgroundColors,
  colorNames as colors,
};

export default chalk;
