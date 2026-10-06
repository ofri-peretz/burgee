import { slice as sliceAnsi, widest, width as stringWidth } from 'linegauge';
import { wrap as wrapAnsi } from 'linegauge/wrap';
/**
 * `flagstaff/boxen` — boxen 9.0.0 ported function for function, graded by boxen's own suite.
 *
 * **The drawing is the contract here, and that is the whole point.** boxen's suite snapshots
 * the exact characters every box comes out as. A user migrating off boxen cares about one
 * thing — does my box still look the same — so matching the drawing byte for byte *is* the
 * compatibility claim, not a way of avoiding one. The decision is recorded in
 * `.sdlc/intents/output-stack-compat/spec.md`.
 *
 * **boxen 9, not 8.** 9.0.0 rewrote most of the measuring: a control character inside the
 * text, a label or a border is written the way a terminal would draw it (a tab is a space, a
 * backspace overtypes, a cursor move is dropped), a border side may be wider than one column
 * or empty, a label may sit on the bottom bar (`footer`), `maxWidth` caps a box that grows,
 * and an option that is not a usable size means its default rather than a broken box. Two
 * of 8's answers changed and this file follows 9 on both: a hex colour is real hex now
 * (8 took `#GGG`), and `vertical` / `horizontal` are a fallback for the sides rather than an
 * override of them. Graded against 9.0.0 on 2026-10-06 (D-20261006-flagstaff-boxen-9).
 *
 * **Seven dependencies folded in.** boxen reaches `string-width`, `wrap-ansi`, `slice-ansi`,
 * `widest-line`, `cli-boxes`, `chalk` and `type-fest`. This file reaches `linegauge`,
 * `linegauge/wrap` and `roundel/chalk` — each graded level with the package it replaces.
 *
 * **It carries the cli-boxes table itself** rather than reading flagstaff's plugin registry.
 * boxen has no plugin concept, `_borderStyles` is part of its public surface, and a façade
 * that resolved border names through our registry would draw differently once somebody
 * registered a plugin — which is exactly the reinterpretation a façade must not do.
 */
import chalk from 'roundel/chalk';

import { processRuntime } from './runtime.js';

/**
 * The process, through the seam (Y9). `processRuntime()` hands back the live process
 * narrowed to `Runtime`, so `rt.stdout.columns` below is read when a box is drawn and not
 * a moment earlier — a box drawn after a resize still uses the new width.
 */
const rt = processRuntime();

const NEWLINE = '\n';
const PAD = ' ';
const NONE = 'none';
const FALLBACK_COLUMNS = 80;
/** The top and the bottom bar are a row each. */
const BAR_ROWS = 2;
/** The spaces `formatLabel` draws around a label. */
const LABEL_FRAME = 2;
/** `margin: 2` means two rows but six columns — boxen's own ratio, kept exactly. */
const SIDE_MARGIN_RATIO = 3;
const HALF = 2;
const ESC = '\u{1B}';
const BACKSPACE = '\u{8}';

type Alignment = 'left' | 'center' | 'right';

export interface BoxenBorderStyle {
  topLeft: string;
  top: string;
  topRight: string;
  left: string;
  right: string;
  bottomLeft: string;
  bottom: string;
  bottomRight: string;
  /** @deprecated boxen's own name for `left` and `right` together; a fallback for either. */
  vertical?: string;
  /** @deprecated boxen's own name for `top` and `bottom` together; a fallback for either. */
  horizontal?: string;
}

export interface Spacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** boxen's `Color`: one of chalk's sixteen foreground names, or a hex. */
export type Color = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray' | 'grey' | 'blackBright' | 'redBright' | 'greenBright' | 'yellowBright' | 'blueBright' | 'magentaBright' | 'cyanBright' | 'whiteBright' | (string & Record<never, never>);

export interface BoxenOptions {
  borderStyle?: string | BoxenBorderStyle;
  borderColor?: Color;
  backgroundColor?: Color;
  /** The border's background: a colour, `'inherit'` (the default) to take `backgroundColor`, or `undefined` for none. */
  borderBackgroundColor?: Color | 'inherit' | undefined;
  dimBorder?: boolean;
  title?: string;
  titleColor?: Color;
  titleAlignment?: Alignment;
  footer?: string;
  footerAlignment?: Alignment;
  textAlignment?: Alignment;
  /** @deprecated boxen's own name for `textAlignment`, still honoured. */
  align?: Alignment;
  padding?: number | Spacing;
  margin?: number | Spacing;
  width?: number | `${number}`;
  maxWidth?: number | `${number}`;
  height?: number | `${number}`;
  float?: Alignment;
  fullscreen?: boolean | ((columns: number, rows: number) => [number, number]);
}

/**
 * cli-boxes 4, as data. boxen re-exports this as `_borderStyles`, so it is part of the
 * surface a caller can reach and not an implementation detail to be hidden.
 */
const BOXES: Record<string, BoxenBorderStyle> = {
  single: { topLeft: '┌', top: '─', topRight: '┐', right: '│', bottomRight: '┘', bottom: '─', bottomLeft: '└', left: '│' },
  double: { topLeft: '╔', top: '═', topRight: '╗', right: '║', bottomRight: '╝', bottom: '═', bottomLeft: '╚', left: '║' },
  round: { topLeft: '╭', top: '─', topRight: '╮', right: '│', bottomRight: '╯', bottom: '─', bottomLeft: '╰', left: '│' },
  bold: { topLeft: '┏', top: '━', topRight: '┓', right: '┃', bottomRight: '┛', bottom: '━', bottomLeft: '┗', left: '┃' },
  singleDouble: { topLeft: '╓', top: '─', topRight: '╖', right: '║', bottomRight: '╜', bottom: '─', bottomLeft: '╙', left: '║' },
  doubleSingle: { topLeft: '╒', top: '═', topRight: '╕', right: '│', bottomRight: '╛', bottom: '═', bottomLeft: '╘', left: '│' },
  classic: { topLeft: '+', top: '-', topRight: '+', right: '|', bottomRight: '+', bottom: '-', bottomLeft: '+', left: '|' },
  arrow: { topLeft: '↘', top: '↓', topRight: '↙', right: '←', bottomRight: '↖', bottom: '↑', bottomLeft: '↗', left: '→' },
};

/** Every line break a terminal honours, so none can move the cursor inside the box. */
const LINE_BREAKS = /\r\n|[\n\v\f\r]/gu;

/**
 * A style escape (SGR) and an OSC 8 hyperlink are drawn with the text they wrap; every other
 * escape is dropped. boxen's two patterns, written with `u` where boxen writes `v` — neither
 * uses a set operation, so they match the same strings.
 */
const STYLING_ESCAPE = /^(?:\u{1B}\[[0-9:;]*m|\u{1B}\]8;[^\u{0}-\u{1F};\u{7F}]*;[^\u{0}-\u{1F}\u{7F}]*(?:\u{7}|\u{1B}\\))$/u;
const CONTROL_ESCAPE = /(\u{1B}\].*?(?:\u{7}|\u{1B}\\|$)|\u{1B}\[[\u{20}-\u{3F}]*[\u{40}-\u{7E}]|\u{1B}[^\u{7}\u{5B}\u{5D}]?)/gsu;

/**
 * Write the text the way a terminal would draw it inside a box: a tab is one space (the row
 * stays as wide as it is measured), a backspace overtypes the character before it — never a
 * line break, never half an escape — and an escape that is not a style or a hyperlink is not
 * drawn. The escapes are the odd entries of the split, so a whole OSC is handled before any
 * styling escape inside it.
 */
function writeControls(text: string): string {
  const characters: string[] = [];
  for (const [index, part] of text.split(CONTROL_ESCAPE).entries()) {
    if (index % HALF === 1) {
      if (STYLING_ESCAPE.test(part)) characters.push(part);
      continue;
    }
    for (const character of part.replaceAll('\t', PAD)) {
      if (character !== BACKSPACE) {
        characters.push(character);
        continue;
      }
      const previous = characters.findLastIndex((c) => !c.startsWith(ESC));
      if (previous !== -1 && characters[previous] !== NEWLINE) characters.splice(previous, 1);
    }
  }
  return characters.join('');
}

/** A label or a border side is one row: its line breaks are spaces, its controls written. */
const oneRow = (text: string): string => writeControls(text.replaceAll(LINE_BREAKS, PAD)).toWellFormed();

const columnsOf = (value: unknown): number => Number(value);

/** The terminal's width: stdout, then stderr, then `COLUMNS`, then 80 — read per box. */
const terminalColumns = (): number => rt.stdout?.columns || rt.stderr?.columns || columnsOf(rt.env['COLUMNS']) || FALLBACK_COLUMNS;

/** A terminal has no height when the output is not a terminal, and there is nothing to fill then. */
const terminalRows = (): number => rt.stdout?.rows || rt.stderr?.rows || columnsOf(rt.env['LINES']);

/** `padding: 2` is two rows and six columns; each side a finite non-negative whole number, or none. */
function getObject(detail: unknown): Required<Spacing> {
  const object: Record<string, unknown> =
    typeof detail === 'number'
      ? { top: detail, right: detail * SIDE_MARGIN_RATIO, bottom: detail, left: detail * SIDE_MARGIN_RATIO }
      : { top: 0, right: 0, bottom: 0, left: 0, ...(detail as Spacing | undefined) };
  const side = (name: keyof Spacing): number => {
    const value = Number(object[name]);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  };
  return { top: side('top'), right: side('right'), bottom: side('bottom'), left: side('left') };
}

const SIDES = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft', 'left', 'right', 'top', 'bottom'] as const;
type Chars = Record<(typeof SIDES)[number], string>;

/** Resolve a border style name or object to its eight characters, refusing anything else. */
function getBorderChars(borderStyle: string | BoxenBorderStyle): Chars {
  let characters: Record<string, unknown>;
  if (borderStyle === NONE) {
    characters = Object.fromEntries(SIDES.map((side) => [side, '']));
  } else if (typeof borderStyle === 'string') {
    // An own property, or an inherited name like `constructor` would pass as a style.
    if (!Object.hasOwn(BOXES, borderStyle)) throw new TypeError(`Invalid border style: ${borderStyle}`);
    characters = BOXES[borderStyle] as unknown as Record<string, unknown>;
  } else {
    // `vertical` and `horizontal` are the deprecated names of the sides, so a fallback for
    // them. Copied, because the object belongs to the caller.
    const given = borderStyle as Partial<BoxenBorderStyle> | null;
    characters = { ...given, left: given?.left ?? given?.vertical, right: given?.right ?? given?.vertical, top: given?.top ?? given?.horizontal, bottom: given?.bottom ?? given?.horizontal };
    for (const side of SIDES) {
      if (typeof characters[side] !== 'string') throw new TypeError(`Invalid border style: ${side}`);
    }
  }
  return Object.fromEntries(SIDES.map((side) => [side, oneRow(characters[side] as string)])) as Chars;
}

/** The width of the border is the width of the sides it draws; a side that draws nothing is a space. */
function getBorderWidth(borderStyle: string | BoxenBorderStyle): number {
  if (borderStyle === NONE) return 0;
  const { left, right } = getBorderChars(borderStyle);
  return stringWidth(left || PAD) + stringWidth(right || PAD);
}

const getBorderHeight = (borderStyle: string | BoxenBorderStyle): number => (borderStyle === NONE ? 0 : BAR_ROWS);

/** The corners of a bar can be wider than its sides, and a label is drawn between them. */
function getCornerWidths(borderStyle: string | BoxenBorderStyle): { top: number; bottom: number } {
  const { topLeft, topRight, bottomLeft, bottomRight } = getBorderChars(borderStyle);
  return { top: stringWidth(topLeft) + stringWidth(topRight), bottom: stringWidth(bottomLeft) + stringWidth(bottomRight) };
}

/** A size is a finite positive number, and the space inside the border — so not below `minimum`. */
function sanitizeSize(size: unknown, borderWidth: number, minimum = 1): number | undefined {
  const value = Number(size);
  return Number.isFinite(value) && value > 0 ? Math.max(minimum, value - borderWidth) : undefined;
}

const isValidSize = (size: unknown): boolean => sanitizeSize(size, 0) !== undefined;

/** Wrapping trims the whitespace at the edges of a line, so a line that fits is kept as it is. */
const wrapLine = (line: string, width: number): string => (stringWidth(line) > width ? wrapAnsi(line, width, { hard: true }) : line);

const widestLine = (text: string): number => widest(text.split(NEWLINE));

/** Pad each line to `width` for the alignment; a line wider than that is not padded. */
function alignText(text: string, alignment: Alignment, width: number): string {
  if (alignment === 'left') return text;
  return text
    .split(NEWLINE)
    .map((line) => {
      const padding = Math.max(0, width - stringWidth(line));
      return PAD.repeat(alignment === 'right' ? padding : Math.floor(padding / HALF)) + line;
    })
    .join(NEWLINE);
}

/** A label placed in a bar, by the bar's width rather than its length — a bar character can be wide. */
function makeLabel(text: string, horizontal: string, alignment: Alignment | undefined): string {
  const textWidth = stringWidth(text);
  if (alignment === 'left') return text + sliceAnsi(horizontal, textWidth);
  if (alignment === 'right') return sliceAnsi(horizontal, textWidth) + text;
  const width = Math.max(0, stringWidth(horizontal) - textWidth);
  if (width % HALF === 1) {
    // An odd remainder cannot split evenly: one column comes off the left, or the bar runs past its corner.
    const rest = sliceAnsi(horizontal, Math.floor(width / HALF) + textWidth);
    return sliceAnsi(rest, 1) + text + rest;
  }
  const rest = sliceAnsi(horizontal, width / HALF + textWidth);
  return rest + text + rest;
}

interface Resolved {
  borderStyle: string | BoxenBorderStyle;
  borderColor?: string | undefined;
  backgroundColor?: string | undefined;
  borderBackgroundColor?: string | undefined;
  dimBorder?: boolean | undefined;
  title?: string | undefined;
  titleColor?: string | undefined;
  titleAlignment: Alignment;
  footer?: string | undefined;
  footerAlignment: Alignment;
  textAlignment: Alignment;
  padding: Required<Spacing>;
  margin: Required<Spacing>;
  width: number | undefined;
  maxWidth: number | undefined;
  height: number | undefined;
  float?: Alignment | undefined;
  fullscreen?: BoxenOptions['fullscreen'];
}

type Sized = Resolved & { width: number };

/** Wrap and align the content, pad it, and crop or grow it to a fixed height. */
function makeContentText(text: string, { padding, width, textAlignment, height }: Sized): string {
  const max = width - padding.left - padding.right;
  // Wrapped first, so the alignment measures the rows that are drawn.
  const wrappedText = text
    .split(NEWLINE)
    .map((line) => wrapLine(line, max))
    .join(NEWLINE);
  // A character can be wider than the box: its row overflows, and the others are not aligned to it.
  const textWidth = Math.min(max, widestLine(wrappedText));
  const alignedText = alignText(wrappedText, textAlignment, textWidth);
  let offset = 0;
  if (textAlignment === 'right') offset = max - textWidth;
  else if (textAlignment === 'center') offset = Math.floor((max - textWidth) / HALF);

  const paddingLeft = PAD.repeat(padding.left);
  const paddingRight = PAD.repeat(padding.right);
  let lines = alignedText.split(NEWLINE).map((line) => {
    const newLine = paddingLeft + PAD.repeat(offset) + line + paddingRight;
    return newLine + PAD.repeat(Math.max(0, width - stringWidth(newLine)));
  });

  // The padding rows are part of the height, so only the text is cropped.
  const textRows = height === undefined ? undefined : Math.max(0, height - padding.top - padding.bottom);
  if (textRows !== undefined && lines.length > textRows) lines = lines.slice(0, textRows);
  const blank = (count: number): string[] => Array.from({ length: count }, () => PAD.repeat(width));
  lines = [...blank(padding.top), ...lines, ...blank(padding.bottom)];
  if (height !== undefined && lines.length < height) lines = [...lines, ...blank(height - lines.length)];
  return lines.join(NEWLINE);
}

/** Fill a bar with a side's character, repeated and cut to width; an empty side fills with spaces. */
function fillBar(character: string, width: number): string {
  const fill = character || PAD;
  const count = Math.ceil(Math.max(0, width) / Math.max(1, stringWidth(fill)));
  return sliceAnsi(fill.repeat(count), 0, Math.max(0, width));
}

/** boxen 9's hex test: three or six real hex digits. */
const isHex = (color: string): boolean => /^#(?:[\da-f]{3}){1,2}$/iu.test(color);

const COLOR_NAMES = new Set(['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray', 'grey', 'blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright']);

type ChalkFn = (s: string) => string;

/** chalk, by name — a string reaching a property, which only `isColorValid` has let through. */
const named = (name: string): ChalkFn => Reflect.get(chalk, name) as ChalkFn;

const isColorValid = (color: unknown): boolean => typeof color === 'string' && (COLOR_NAMES.has(color) || isHex(color));
const colorFunction = (color: string): ChalkFn => (isHex(color) ? chalk.hex(color) : named(color));
const bgColorFunction = (color: string): ChalkFn => (isHex(color) ? chalk.bgHex(color) : named(`bg${color.charAt(0).toUpperCase()}${color.slice(1)}`));

/** Draw the bars, the sides and the margins around content that is already the right size. */
function boxContent(content: string, contentWidth: number, options: Sized): string {
  const colorizeBorder = (border: string): string => {
    const colored = options.borderColor ? colorFunction(options.borderColor)(border) : border;
    let background = colored;
    if (options.borderBackgroundColor === 'inherit') {
      if (options.backgroundColor) background = bgColorFunction(options.backgroundColor)(colored);
    } else if (options.borderBackgroundColor !== undefined) {
      background = bgColorFunction(options.borderBackgroundColor)(colored);
    }
    return options.dimBorder ? chalk.dim(background) : background;
  };
  const colorizeContent = (text: string): string => (options.backgroundColor ? bgColorFunction(options.backgroundColor)(text) : text);
  // Styling already applied to the title takes precedence.
  const colorizeTitle = (title: string): string => (options.titleColor ? colorFunction(options.titleColor)(title) : title);

  const chars = getBorderChars(options.borderStyle);
  const columns = terminalColumns();
  let marginLeft = PAD.repeat(options.margin.left);
  if (options.float === 'center') {
    marginLeft = PAD.repeat(Math.max((columns - contentWidth - getBorderWidth(options.borderStyle)) / HALF, 0));
  } else if (options.float === 'right') {
    marginLeft = PAD.repeat(Math.max(columns - contentWidth - options.margin.right - getBorderWidth(options.borderStyle), 0));
  }

  // A style that draws a border draws a space for a side that is empty.
  const hasBorder = options.borderStyle !== NONE;
  const left = hasBorder ? chars.left || PAD : '';
  const right = hasBorder ? chars.right || PAD : '';
  const rowWidth = contentWidth + stringWidth(left) + stringWidth(right);
  // A bar spans a row: filled to the width between its corners, with the label placed in the fill.
  const bar = (character: string, cornerStart: string, cornerEnd: string, label: string, alignment: Alignment): string => {
    const width = Math.max(0, rowWidth - stringWidth(cornerStart) - stringWidth(cornerEnd));
    const fill = fillBar(character, width);
    const filled = label ? makeLabel(label, fill, alignment) : fill;
    // A wide character does not fill the last column of an odd width, and a label can end inside one.
    return sliceAnsi(filled + PAD.repeat(Math.max(0, width - stringWidth(filled))), 0, Math.max(0, width));
  };

  const rows: string[] = [];
  if (hasBorder || options.title) {
    const topBar = bar(chars.top, chars.topLeft, chars.topRight, options.title ? colorizeTitle(options.title) : '', options.titleAlignment);
    rows.push(marginLeft + colorizeBorder(chars.topLeft + topBar + chars.topRight));
  }
  // A box of no rows has no content to draw.
  for (const line of content === '' ? [] : content.split(NEWLINE)) {
    const padded = line + PAD.repeat(Math.max(0, contentWidth - stringWidth(line)));
    rows.push(marginLeft + colorizeBorder(left) + colorizeContent(padded) + colorizeBorder(right));
  }
  if (hasBorder || options.footer) {
    const bottomBar = bar(chars.bottom, chars.bottomLeft, chars.bottomRight, options.footer ?? '', options.footerAlignment);
    rows.push(marginLeft + colorizeBorder(chars.bottomLeft + bottomBar + chars.bottomRight));
  }
  // A margin is drawn as empty rows around the box.
  return NEWLINE.repeat(options.margin.top) + rows.join(NEWLINE) + NEWLINE.repeat(options.margin.bottom);
}

/** `fullscreen` maxes out whichever size was not given; every size becomes the space inside the border. */
function sanitizeOptions(options: Resolved): Resolved {
  if (options.fullscreen) {
    let dimensions: [number, number] = [terminalColumns(), terminalRows()];
    if (typeof options.fullscreen === 'function') dimensions = options.fullscreen(...dimensions);
    if (!isValidSize(options.width)) options.width = dimensions[0];
    if (!isValidSize(options.height)) options.height = dimensions[1];
  }
  const borderWidth = getBorderWidth(options.borderStyle);
  options.width = sanitizeSize(options.width, borderWidth);
  options.maxWidth = sanitizeSize(options.maxWidth, borderWidth);
  // A box can have no row for the text; it is still a box of the height that is given.
  options.height = sanitizeSize(options.height, getBorderHeight(options.borderStyle), 0);
  return options;
}

const formatLabel = (label: string, borderStyle: string | BoxenBorderStyle): string => (borderStyle === NONE ? label : ` ${label} `);

/** Slice a label to the space between the corners of its bar, and frame it with spaces. */
function fitLabel(label: string | undefined, width: number, borderStyle: string | BoxenBorderStyle, cornerWidth: number): string | undefined {
  if (!label) return label;
  const frame = borderStyle === NONE ? 0 : LABEL_FRAME;
  const fitted = sliceAnsi(oneRow(label), 0, Math.max(0, width + getBorderWidth(borderStyle) - cornerWidth - frame));
  return fitted && formatLabel(fitted, borderStyle);
}

/** Settle the box's width, the labels, and how much the margins may keep. */
function determineDimensions(text: string, input: Resolved): Sized {
  const options = sanitizeOptions(input);
  const isWidthOverride = options.width !== undefined;
  const columns = terminalColumns();
  const borderWidth = getBorderWidth(options.borderStyle);
  const cornerWidths = getCornerWidths(options.borderStyle);
  const corners = Math.max(cornerWidths.top, cornerWidths.bottom);
  const terminalWidth = columns - borderWidth;
  // The box grows with the content up to the terminal width and `maxWidth`.
  const maxContentWidth = Math.min(terminalWidth, options.maxWidth || terminalWidth);
  // A floated box is centred or pushed right rather than indented, so only a drawn margin takes columns.
  const marginWidth = (): number => {
    if (options.float === 'center') return 0;
    if (options.float === 'right') return options.margin.right;
    return options.margin.left + options.margin.right;
  };
  // A fixed width brings its own size, so only an indenting margin can push the box past the terminal.
  const availableWidth = isWidthOverride ? columns - borderWidth - (options.float === 'left' ? options.margin.left : 0) : terminalWidth - marginWidth();

  // Measured the way it is wrapped, or the box can end up a column wider than the text.
  const maxTextWidth = Math.max(1, maxContentWidth - options.padding.left - options.padding.right);
  const wrappedText = text
    .split(NEWLINE)
    .map((line) => wrapLine(line, maxTextWidth))
    .join(NEWLINE);
  let widestRow = Math.min(widestLine(wrappedText) + options.padding.left + options.padding.right, maxContentWidth);
  options.width ||= widestRow;

  // The margin shrinks, on one side or both, or the box is pushed past the terminal; the content keeps a column.
  if ((options.margin.left || options.margin.right) && Math.max(1, options.width) > availableWidth) {
    const spaceForMargins = columns - Math.max(1, options.width) - borderWidth;
    const multiplier = spaceForMargins / (options.margin.left + options.margin.right);
    options.margin.left = Math.max(0, Math.floor(options.margin.left * multiplier));
    options.margin.right = Math.max(0, Math.floor(options.margin.right * multiplier));
  }

  // The labels fit the space the margin leaves, so a shrunk margin still fits them.
  const labelWidth = isWidthOverride ? options.width : Math.min(columns - borderWidth - marginWidth(), maxContentWidth);
  options.title = fitLabel(options.title, labelWidth, options.borderStyle, cornerWidths.top);
  options.footer = fitLabel(options.footer, labelWidth, options.borderStyle, cornerWidths.bottom);

  // A label is drawn on a bar, but on a row of its own when there is no border.
  if (getBorderHeight(options.borderStyle) === 0 && options.height !== undefined) {
    options.height = Math.max(0, options.height - (options.title ? 1 : 0) - (options.footer ? 1 : 0));
  }

  if (!isWidthOverride) {
    // A label wider than the content decides the width, keeping the room its bar's corners need.
    for (const [label, cornerWidth] of [
      [options.title, cornerWidths.top],
      [options.footer, cornerWidths.bottom],
    ] as const) {
      if (label) widestRow = Math.max(widestRow, stringWidth(label) - borderWidth + cornerWidth);
    }
    options.width = Math.max(1, Math.min(widestRow, columns - borderWidth - marginWidth()));
  }

  // The box is at least as wide as the corners of its bars, and padding never overflows it.
  options.width = Math.max(options.width, corners - borderWidth, 1);
  if (options.padding.left + options.padding.right >= options.width) {
    options.padding.left = 0;
    options.padding.right = 0;
  }
  if (options.height !== undefined && options.padding.top + options.padding.bottom >= options.height) {
    options.padding.top = 0;
    options.padding.bottom = 0;
  }
  return options as Sized;
}

/** boxen re-exports cli-boxes under this name, so it is surface a caller can reach. */
export { BOXES as _borderStyles };

// boxen's own type names, so a typed program migrates by its import alone — `burgee migrate`
// checks every imported name against this module and would otherwise leave the import on boxen.
export type Options = BoxenOptions;
export type CustomBorderStyle = BoxenBorderStyle;
export type Boxes = typeof BOXES;

/**
 * Draw a box around `text`, exactly as boxen 9 draws it.
 *
 * An invalid colour throws rather than drawing something plausible, because boxen throws: a
 * colour name that is not one is a typo, and a box drawn in the wrong colour is a bug somebody
 * ships.
 *
 * `import boxen from 'boxen'` is the incumbent's surface. A named export here would break
 * every migration this file exists to serve, so the house rule yields to the host.
 */
export default function boxen(input: string, options: BoxenOptions = {}): string {
  // Line breaks are normalised so none can move the cursor, and a lone surrogate is written
  // as a replacement character, which is one column wide and measured as one.
  const text = writeControls(input.replaceAll(LINE_BREAKS, NEWLINE)).toWellFormed();
  const merged = { padding: 0, dimBorder: false, float: 'left', ...options } as BoxenOptions;
  // A nullish option, an explicit `undefined` included, means its default.
  const borderStyle = merged.borderStyle ?? 'single';
  const textAlignment = merged.textAlignment ?? merged.align ?? 'left';

  for (const name of ['borderColor', 'titleColor', 'backgroundColor'] as const) {
    const color = merged[name];
    if (color && !isColorValid(color)) throw new Error(`${color} is not a valid ${name}`);
  }
  // `inherit` unless the key is there at all — an explicit `undefined` means no border background.
  const borderBackgroundColor = 'borderBackgroundColor' in merged ? merged.borderBackgroundColor : 'inherit';
  if (borderBackgroundColor !== undefined && borderBackgroundColor !== 'inherit' && !isColorValid(borderBackgroundColor)) {
    throw new Error(`${borderBackgroundColor} is not a valid borderBackgroundColor`);
  }

  const resolved: Resolved = {
    ...merged,
    borderStyle,
    textAlignment,
    titleAlignment: merged.titleAlignment ?? 'left',
    footerAlignment: merged.footerAlignment ?? 'left',
    borderBackgroundColor,
    padding: getObject(merged.padding),
    margin: getObject(merged.margin),
    width: merged.width as number | undefined,
    maxWidth: merged.maxWidth as number | undefined,
    height: merged.height as number | undefined,
  };
  const dimensions = determineDimensions(text, resolved);
  const content = makeContentText(text, dimensions);
  // A character wider than the space left for it widens its row, so the border follows the widest row.
  return boxContent(content, Math.max(dimensions.width, widestLine(content)), dimensions);
}
