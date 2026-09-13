/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The style stack — the part of this package that every cutting operation shares.
 *
 * `wrap`, `slice` and `truncate` are one algorithm wearing three names: walk the string,
 * keep a stack of the SGR parameters a terminal currently has open, emit graphemes while
 * inside the range you were asked for, and at every cut emit the closer for whatever is
 * open and re-emit the openers on resume. The twelve incumbents write that three times
 * between them — `wrap-ansi`, `slice-ansi` and `cli-truncate` each carry their own copy —
 * and disagree at the edges, which is most of the reason this package exists.
 *
 * Extracted from `wrap.ts` when `slice` arrived, with wrap-ansi's own suite as the check:
 * this module is a move, and `wrap.test.ts` grades every case against the real `wrap-ansi`,
 * so a mistake in the extraction is a red suite rather than a subtle divergence.
 *
 * It is not a published subpath. `linegauge/wrap` and `linegauge/slice` each reach it, and
 * R8 keeps them from reaching each other.
 */
import { measure } from './width.js';

export const ESC = '\u001B';
export const BELL = '\u0007';
/** The single-byte C1 form of `ESC [`, which a terminal accepts and a suite will send. */
const C1_CSI = '\u009B';
export const CSI = '[';
export const OSC = ']';
export const SGR_TERMINATOR = 'm';

const SGR_RESET = 0;
const SGR_RESET_FOREGROUND = 39;
const SGR_RESET_BACKGROUND = 49;
const SGR_RESET_UNDERLINE_COLOR = 59;
const SGR_FOREGROUND_EXTENDED = 38;
const SGR_BACKGROUND_EXTENDED = 48;
const SGR_UNDERLINE_COLOR_EXTENDED = 58;
const SGR_COLOR_MODE_RGB = 2;
const SGR_COLOR_MODE_256 = 5;

const FOREGROUND_FIRST = 30;
const FOREGROUND_LAST = 37;
const FOREGROUND_BRIGHT_FIRST = 90;
const FOREGROUND_BRIGHT_LAST = 97;
const BACKGROUND_FIRST = 40;
const BACKGROUND_LAST = 47;
const BACKGROUND_BRIGHT_FIRST = 100;
const BACKGROUND_BRIGHT_LAST = 107;

/** How many columns a tab advances to the next stop. */
export const TAB_SIZE = 8;
/** `38;5;n` — the code, the mode, and one index. */
const COLOR_256_PARTS = 3;
/** `38;2;r;g;b` — the code, the mode, and three components. */
const COLOR_RGB_PARTS = 3;
/** `38:2::r:g:b` carries a colour space between the mode and the components. */
const COLON_RGB_WITH_SPACE = 6;

export const ESCAPES = new Set([ESC, C1_CSI]);
const ESCAPE_CHARACTERS = [...ESCAPES].join('');

const CSI_INTRODUCER = `(?:${ESC}\\${CSI}|${C1_CSI})`;
const CSI_PARAMETERS = '[0-?]*[ -/]*[@-~]';
const SGR_PARAMETERS = `(?<sgr>[0-9;:]*)${SGR_TERMINATOR}`;
const OSC_TERMINATOR = `(?:${BELL}|${ESC}\\\\)`;
const OSC_PAYLOAD = String.raw`[^\u0000-\u001F\u007F-\u009F]*`;
/** `OSC 8 ; params ; URI ST` — a hyperlink, whose URI is tracked so a row can reopen it. */
const LINK_PARAMETERS = String.raw`8;(?<parameters>[^;\u0000-\u001F\u007F-\u009F]*);(?<uri>${OSC_PAYLOAD})${OSC_TERMINATOR}`;

// Deliberately not a terminal emulator: semicolon-delimited SGR, colon-delimited extended
// colour and OSC 8 links are understood; every other complete CSI or OSC command is carried
// through as an opaque zero-width unit, and anything that only looks like an introducer
// stays plain text. `y` (sticky), so a match is anchored where the scan asked.
export const ANSI_ESCAPE = new RegExp(`${CSI_INTRODUCER}(?:${SGR_PARAMETERS}|${CSI_PARAMETERS})|${ESC}\\${OSC}(?:${LINK_PARAMETERS}|${OSC_PAYLOAD}${OSC_TERMINATOR})`, 'y');
const ESCAPE_INTRODUCER = new RegExp(`[${ESCAPE_CHARACTERS}]`, 'g');
export const ROW_BOUNDARY = new RegExp(`[\\n${ESCAPE_CHARACTERS}]`, 'g');
/** Every printable ASCII character is its own cluster of width one — skip the segmenter. */
export const ASCII_PRINTABLE = /^[ -~]*$/;

/**
 * Which SGR code closes which modifier. This is ECMA-48, not any library's table — bold
 * opens with 1 and closes with 22 wherever you read it — so it lives here rather than
 * being imported, which keeps `wrap()` free of `roundel/chalk` and takes 18 KB off every
 * subpath that wraps. The colour families close with 39, 49 and 59 and are handled by name
 * above, before this map is consulted.
 */
export const MODIFIER_CLOSE = new Map<number, number>([
  [1, 22],
  [2, 22],
  [3, 23],
  [4, 24],
  [7, 27],
  [8, 28],
  [9, 29],
  [53, 55],
]);
export const MODIFIER_CLOSE_CODES = new Set(MODIFIER_CLOSE.values());

export const segmenter = new Intl.Segmenter();

export const sgr = (code: number | string): string => `${ESC}${CSI}${code}${SGR_TERMINATOR}`;
export const hyperlink = (url: string, parameters = ''): string => `${ESC}${OSC}8;${parameters};${url}${BELL}`;

/** The complete escape sequence starting at `index`, or nothing when none starts there. */
export function matchEscape(string: string, index: number): RegExpExecArray | undefined {
  if (!ESCAPES.has(string[index] ?? '')) return undefined;
  ANSI_ESCAPE.lastIndex = index;
  return ANSI_ESCAPE.exec(string) ?? undefined;
}

/**
 * Walk a string as alternating runs of plain text and complete escape sequences. A
 * character that looks like an introducer but starts no valid sequence stays plain text.
 */
export function forEachSegment(string: string, onPlainText: (text: string) => void, onEscape: (escape: string) => void = () => undefined): void {
  let plainStart = 0;
  let index = 0;

  while (index < string.length) {
    ESCAPE_INTRODUCER.lastIndex = index;
    const introducer = ESCAPE_INTRODUCER.exec(string);
    if (introducer === null) break;

    const escape = matchEscape(string, introducer.index);
    if (escape === undefined) {
      index = introducer.index + 1;
      continue;
    }

    if (introducer.index > plainStart) onPlainText(string.slice(plainStart, introducer.index));
    onEscape(escape[0]);
    index = introducer.index + escape[0].length;
    plainStart = index;
  }

  if (plainStart < string.length) onPlainText(string.slice(plainStart));
}

/** The visible width of a string, escape sequences ignored. */
export function visibleWidth(string: string): number {
  let plainText = '';
  forEachSegment(string, (part) => {
    plainText += part;
  });
  return measure(plainText);
}

export interface SgrToken {
  code: number;
  open: string;
  hasArguments: boolean;
}

export interface ActiveStyle {
  /** One slot per thing a terminal tracks separately, so a second red replaces the first. */
  family: string;
  open: string;
  close: number;
}

const isDigits = (value: string): boolean => /^\d+$/.test(value);

/** `38:5:9` and `38:2::r:g:b` — the colon form, which carries its arguments in one parameter. */
function colonColorToken(parameter: string): SgrToken | undefined {
  const parts = parameter.split(':');
  const code = Number.parseInt(parts[0] ?? '', 10);
  const mode = Number.parseInt(parts[1] ?? '', 10);
  if (![SGR_FOREGROUND_EXTENDED, SGR_BACKGROUND_EXTENDED, SGR_UNDERLINE_COLOR_EXTENDED].includes(code)) return undefined;

  if (mode === SGR_COLOR_MODE_256 && parts.length === COLOR_256_PARTS && isDigits(parts[2] ?? '')) {
    return { code, open: parameter, hasArguments: true };
  }
  if (mode !== SGR_COLOR_MODE_RGB) return undefined;

  const withSpace = parts.length === COLON_RGB_WITH_SPACE;
  const components = withSpace ? parts.slice(3) : parts.slice(2);
  const colorSpace = withSpace ? parts[2] : undefined;
  if (components.length === COLOR_RGB_PARTS && components.every(isDigits) && (colorSpace === undefined || /^\d*$/.test(colorSpace))) {
    return { code, open: parameter, hasArguments: true };
  }
  return undefined;
}

/** One extended-colour parameter run, `38;5;n` or `38;2;r;g;b`, or nothing if malformed. */
function extendedColorToken(code: number, parameters: string[], index: number): { token: SgrToken; consumed: number } | undefined {
  const mode = Number.parseInt(parameters[index + 1] ?? '', 10);
  const first = Number.parseInt(parameters[index + 2] ?? '', 10);
  if (mode === SGR_COLOR_MODE_256 && Number.isFinite(first)) {
    return { token: { code, open: [code, mode, first].join(';'), hasArguments: true }, consumed: 2 };
  }
  const green = Number.parseInt(parameters[index + 3] ?? '', 10);
  const blue = Number.parseInt(parameters[index + 4] ?? '', 10);
  if (mode === SGR_COLOR_MODE_RGB && Number.isFinite(first) && Number.isFinite(green) && Number.isFinite(blue)) {
    return { token: { code, open: [code, mode, first, green, blue].join(';'), hasArguments: true }, consumed: 4 };
  }
  return undefined;
}

const isExtendedColor = (code: number): boolean => code === SGR_FOREGROUND_EXTENDED || code === SGR_BACKGROUND_EXTENDED || code === SGR_UNDERLINE_COLOR_EXTENDED;

export function sgrTokens(parameters: string): SgrToken[] {
  const parts = parameters.split(';');
  const tokens: SgrToken[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const parameter = parts[index] ?? '';
    if (parameter.includes(':')) {
      const token = colonColorToken(parameter);
      if (token !== undefined) tokens.push(token);
      continue;
    }

    const code = parameter === '' ? SGR_RESET : Number.parseInt(parameter, 10);
    if (!Number.isFinite(code)) continue;

    if (isExtendedColor(code)) {
      if (index + 1 >= parts.length) break;
      const extended = extendedColorToken(code, parts, index);
      if (extended === undefined) break;
      tokens.push(extended.token);
      index += extended.consumed;
      continue;
    }

    tokens.push({ code, open: String(code), hasArguments: false });
  }

  return tokens;
}

function removeFamily(active: ActiveStyle[], family: string): void {
  const at = active.findIndex((style) => style.family === family);
  if (at !== -1) active.splice(at, 1);
}

function colorStyle(token: SgrToken): ActiveStyle | undefined {
  const { code, open, hasArguments } = token;
  if ((code >= FOREGROUND_FIRST && code <= FOREGROUND_LAST) || (code >= FOREGROUND_BRIGHT_FIRST && code <= FOREGROUND_BRIGHT_LAST) || (code === SGR_FOREGROUND_EXTENDED && hasArguments)) {
    return { family: 'foreground', open, close: SGR_RESET_FOREGROUND };
  }
  if ((code >= BACKGROUND_FIRST && code <= BACKGROUND_LAST) || (code >= BACKGROUND_BRIGHT_FIRST && code <= BACKGROUND_BRIGHT_LAST) || (code === SGR_BACKGROUND_EXTENDED && hasArguments)) {
    return { family: 'background', open, close: SGR_RESET_BACKGROUND };
  }
  if (code === SGR_UNDERLINE_COLOR_EXTENDED && hasArguments) {
    return { family: 'underlineColor', open, close: SGR_RESET_UNDERLINE_COLOR };
  }
  return undefined;
}

/** True when the code closed something rather than opening it. */
function applyResetCode(code: number, active: ActiveStyle[]): boolean {
  if (code === SGR_RESET) {
    active.length = 0;
    return true;
  }
  if (code === SGR_RESET_FOREGROUND) {
    removeFamily(active, 'foreground');
    return true;
  }
  if (code === SGR_RESET_BACKGROUND) {
    removeFamily(active, 'background');
    return true;
  }
  if (code === SGR_RESET_UNDERLINE_COLOR) {
    removeFamily(active, 'underlineColor');
    return true;
  }
  if (MODIFIER_CLOSE_CODES.has(code)) {
    // One close code can end several modifiers — `22` ends both bold and dim.
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const style = active[index];
      if (style !== undefined && style.family.startsWith('modifier-') && style.close === code) active.splice(index, 1);
    }
    return true;
  }
  return false;
}

export function applyToken(token: SgrToken, active: ActiveStyle[]): void {
  if (applyResetCode(token.code, active)) return;

  const color = colorStyle(token);
  if (color !== undefined) {
    removeFamily(active, color.family);
    active.push(color);
    return;
  }

  const close = MODIFIER_CLOSE.get(token.code);
  if (close !== undefined && close !== SGR_RESET) {
    const family = `modifier-${token.code}`;
    removeFamily(active, family);
    active.push({ family, open: token.open, close });
  }
}

export const applyParameters = (parameters: string, active: ActiveStyle[]): void => {
  for (const token of sgrTokens(parameters)) applyToken(token, active);
};

const applyResets = (parameters: string, active: ActiveStyle[]): void => {
  for (const { code } of sgrTokens(parameters)) applyResetCode(code, active);
};

/** A row that opens with its own resets should not have them undone by the reopening. */
export function applyLeadingResets(string: string, startIndex: number, active: ActiveStyle[]): void {
  let index = startIndex;
  while (index < string.length) {
    const match = matchEscape(string, index);
    if (match === undefined) break;
    if (match.groups?.['sgr'] !== undefined) applyResets(match.groups['sgr'], active);
    index += match[0].length;
  }
}

export const closingSequence = (active: ActiveStyle[]): string => [...active].reverse().map((style) => sgr(style.close)).join('');
export const openingSequence = (active: ActiveStyle[]): string => active.map((style) => sgr(style.open)).join('');
