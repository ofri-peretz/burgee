/**
 * Wrapping text that carries ANSI, ported from wrap-ansi 10 — the third dependency the
 * render façades share, after the spinner corpus and the width function (R7, R10).
 *
 * The hard part is not the arithmetic, it is that a style opened on one row must not leak
 * into the next: a terminal that reflows, a pager, or an agent reading one line at a time
 * all see rows independently. So every row closes the styles it inherited and the next row
 * reopens them, which has a second use here — after wrapping, **each row is self-contained**,
 * and dropping leading rows needs no ANSI state tracking at all. `flagstaff/log-update`
 * relies on exactly that, which is why it carries no port of `slice-ansi`.
 *
 * Graded differentially against the real `wrap-ansi` in `wrap.test.ts`, the way `width.ts`
 * is graded against `string-width`: the incumbent is the specification.
 */
import { measure } from './width.js';

const ESC = '\u001B';
const BELL = '\u0007';
/** The single-byte C1 form of `ESC [`, which a terminal accepts and a suite will send. */
const C1_CSI = '\u009B';
const CSI = '[';
const OSC = ']';
const SGR_TERMINATOR = 'm';

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
const TAB_SIZE = 8;
/** `38;5;n` — the code, the mode, and one index. */
const COLOR_256_PARTS = 3;
/** `38;2;r;g;b` — the code, the mode, and three components. */
const COLOR_RGB_PARTS = 3;
/** `38:2::r:g:b` carries a colour space between the mode and the components. */
const COLON_RGB_WITH_SPACE = 6;

const ESCAPES = new Set([ESC, C1_CSI]);
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
const ANSI_ESCAPE = new RegExp(`${CSI_INTRODUCER}(?:${SGR_PARAMETERS}|${CSI_PARAMETERS})|${ESC}\\${OSC}(?:${LINK_PARAMETERS}|${OSC_PAYLOAD}${OSC_TERMINATOR})`, 'y');
const ESCAPE_INTRODUCER = new RegExp(`[${ESCAPE_CHARACTERS}]`, 'g');
const ROW_BOUNDARY = new RegExp(`[\\n${ESCAPE_CHARACTERS}]`, 'g');
/** Every printable ASCII character is its own cluster of width one — skip the segmenter. */
const ASCII_PRINTABLE = /^[ -~]*$/;

/**
 * Which SGR code closes which modifier. This is ECMA-48, not any library's table — bold
 * opens with 1 and closes with 22 wherever you read it — so it lives here rather than
 * being imported, which keeps `wrap()` free of `roundel/chalk` and takes 18 KB off every
 * subpath that wraps. The colour families close with 39, 49 and 59 and are handled by name
 * above, before this map is consulted.
 */
const MODIFIER_CLOSE = new Map<number, number>([
  [1, 22],
  [2, 22],
  [3, 23],
  [4, 24],
  [7, 27],
  [8, 28],
  [9, 29],
  [53, 55],
]);
const MODIFIER_CLOSE_CODES = new Set(MODIFIER_CLOSE.values());

const segmenter = new Intl.Segmenter();

const sgr = (code: number | string): string => `${ESC}${CSI}${code}${SGR_TERMINATOR}`;
const hyperlink = (url: string, parameters = ''): string => `${ESC}${OSC}8;${parameters};${url}${BELL}`;

/** The complete escape sequence starting at `index`, or nothing when none starts there. */
function matchEscape(string: string, index: number): RegExpExecArray | undefined {
  if (!ESCAPES.has(string[index] ?? '')) return undefined;
  ANSI_ESCAPE.lastIndex = index;
  return ANSI_ESCAPE.exec(string) ?? undefined;
}

/**
 * Walk a string as alternating runs of plain text and complete escape sequences. A
 * character that looks like an introducer but starts no valid sequence stays plain text.
 */
function forEachSegment(string: string, onPlainText: (text: string) => void, onEscape: (escape: string) => void = () => undefined): void {
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
function visibleWidth(string: string): number {
  let plainText = '';
  forEachSegment(string, (part) => {
    plainText += part;
  });
  return measure(plainText);
}

interface Token {
  value: string;
  width: number;
}

/**
 * Escape sequences, which are zero width and must never be split, and grapheme clusters.
 * A sequence written *inside* a cluster splits it — the supported boundary is between
 * clusters and sequences, not within one.
 */
function tokenize(string: string): Token[] {
  const tokens: Token[] = [];
  forEachSegment(
    string,
    (plainText) => {
      if (ASCII_PRINTABLE.test(plainText)) {
        for (const character of plainText) tokens.push({ value: character, width: 1 });
        return;
      }
      for (const { segment } of segmenter.segment(plainText)) tokens.push({ value: segment, width: measure(segment) });
    },
    (escape) => tokens.push({ value: escape, width: 0 }),
  );
  return tokens;
}

interface Word {
  value: string;
  plainText: string;
  width: number;
}

/** Split on spaces, ignoring spaces that appear inside a recognised sequence. */
function splitWords(string: string): Word[] {
  let current: Word = { value: '', plainText: '', width: 0 };
  const words: Word[] = [current];

  forEachSegment(
    string,
    (plainText) => {
      const parts = plainText.split(' ');
      current.value += parts[0] ?? '';
      current.plainText += parts[0] ?? '';
      for (let index = 1; index < parts.length; index += 1) {
        const part = parts[index] ?? '';
        current = { value: part, plainText: part, width: 0 };
        words.push(current);
      }
    },
    (escape) => {
      current.value += escape;
    },
  );

  // Measured once per word rather than per run, so a cluster an escape splits counts once.
  for (const word of words) word.width = measure(word.plainText);
  return words;
}

interface SgrToken {
  code: number;
  open: string;
  hasArguments: boolean;
}

interface ActiveStyle {
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

function sgrTokens(parameters: string): SgrToken[] {
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

function applyToken(token: SgrToken, active: ActiveStyle[]): void {
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

const applyParameters = (parameters: string, active: ActiveStyle[]): void => {
  for (const token of sgrTokens(parameters)) applyToken(token, active);
};

const applyResets = (parameters: string, active: ActiveStyle[]): void => {
  for (const { code } of sgrTokens(parameters)) applyResetCode(code, active);
};

/** A row that opens with its own resets should not have them undone by the reopening. */
function applyLeadingResets(string: string, startIndex: number, active: ActiveStyle[]): void {
  let index = startIndex;
  while (index < string.length) {
    const match = matchEscape(string, index);
    if (match === undefined) break;
    if (match.groups?.['sgr'] !== undefined) applyResets(match.groups['sgr'], active);
    index += match[0].length;
  }
}

const closingSequence = (active: ActiveStyle[]): string => [...active].reverse().map((style) => sgr(style.close)).join('');
const openingSequence = (active: ActiveStyle[]): string => active.map((style) => sgr(style.open)).join('');

/**
 * Break one long word across rows. Takes the visible width of the row it starts on and
 * returns the width of the row it ends on, so the caller never measures a row itself.
 */
function wrapWord(rows: string[], word: string, columns: number, rowWidth: number): number {
  const tokens = tokenize(word);
  let visible = rowWidth;

  for (const [index, token] of tokens.entries()) {
    // Sequences and combining marks are zero width, so they stay on the current row.
    if (token.width > 0 && visible > 0 && visible + token.width > columns) {
      rows.push('');
      visible = 0;
    }

    rows[rows.length - 1] += token.value;
    visible += token.width;

    if (visible === columns && index < tokens.length - 1) {
      rows.push('');
      visible = 0;
    }
  }

  // The last row copied over can be nothing but escape characters.
  const last = rows.at(-1) ?? '';
  if (!visible && last.length > 0 && rows.length > 1) rows[rows.length - 2] += rows.pop() ?? '';

  // Tokens are measured one at a time, so a cluster an escape splits counts once per part.
  // Only the finished row gives the true width, and it is at most one row to measure.
  return visibleWidth(rows.at(-1) ?? '');
}

/** Drop the spaces trailing the last visible character, keeping the sequences among them. */
function trimVisibleEnd(string: string): string {
  if (!string.includes(' ')) return string;

  const segments: { value: string; isEscape: boolean }[] = [];
  forEachSegment(
    string,
    (plainText) => segments.push({ value: plainText, isEscape: false }),
    (escape) => segments.push({ value: escape, isEscape: true }),
  );

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment === undefined || segment.isEscape) continue;

    // Scanned rather than matched: a trailing-space pattern backtracks quadratically.
    let end = segment.value.length;
    while (end > 0 && segment.value[end - 1] === ' ') end -= 1;
    segment.value = segment.value.slice(0, end);

    if (measure(segment.value) > 0) break;
  }

  return segments.map((segment) => segment.value).join('');
}

function expandTabs(line: string): string {
  if (!line.includes('\t')) return line;

  let visible = 0;
  let expanded = '';
  let sinceTab = '';

  forEachSegment(
    line,
    (plainText) => {
      const parts = plainText.split('\t');
      for (const [index, part] of parts.entries()) {
        expanded += part;
        sinceTab += part;
        if (index < parts.length - 1) {
          visible += measure(sinceTab);
          sinceTab = '';
          const spaces = TAB_SIZE - (visible % TAB_SIZE);
          expanded += ' '.repeat(spaces);
          visible += spaces;
        }
      }
    },
    (escape) => {
      expanded += escape;
    },
  );

  return expanded;
}

/**
 * Close the active styles and hyperlink before every row break and reopen them after, so
 * each row stands on its own. Only sequences and newlines matter, so the string is scanned
 * directly rather than segmented.
 */
function restoreStylesAcrossRows(preString: string): string {
  let out = '';
  let activeHyperlink: { parameters: string; uri: string } | undefined;
  const active: ActiveStyle[] = [];
  let index = 0;
  let copied = 0;

  while (index < preString.length) {
    ROW_BOUNDARY.lastIndex = index;
    const boundary = ROW_BOUNDARY.exec(preString);
    if (boundary === null) break;
    index = boundary.index;

    if (boundary[0] !== '\n') {
      const escape = matchEscape(preString, index);
      if (escape === undefined) {
        index += 1;
        continue;
      }
      const groups = escape.groups ?? {};
      if (groups['sgr'] !== undefined) applyParameters(groups['sgr'], active);
      else if (groups['uri'] !== undefined) activeHyperlink = groups['uri'].length === 0 ? undefined : { parameters: groups['parameters'] ?? '', uri: groups['uri'] };
      index += escape[0].length;
      continue;
    }

    // Everything up to the row break is copied verbatim, sequences included.
    out += preString.slice(copied, index);

    // An empty row never reopened anything, so there is nothing to close.
    if (index > copied) {
      if (activeHyperlink !== undefined) out += hyperlink('');
      out += closingSequence(active);
    }

    out += '\n';
    index += 1;
    copied = index;

    // An empty row has nothing to style, so the styles stay closed until the next row with
    // content; a trailing row break leaves no row at all.
    if (index < preString.length && preString[index] !== '\n') {
      const opening = [...active];
      applyLeadingResets(preString, index, opening);
      out += openingSequence(opening);
      if (activeHyperlink !== undefined) out += hyperlink(activeHyperlink.uri, activeHyperlink.parameters);
    }
  }

  return out + preString.slice(copied);
}

export interface WrapOptions {
  /** Trim leading and trailing whitespace from each row. Default true. */
  trim?: boolean;
  /** Break a word longer than `columns` rather than let it overflow. Default false. */
  hard?: boolean;
  /** Break on any character rather than at word boundaries. Default true. */
  wordWrap?: boolean;
}

/** Whether a word longer than the row should start on the next row instead of this one. */
function shouldStartLongWordOnNextRow(wordWidth: number, columns: number, rowLength: number): boolean {
  const remaining = columns - rowLength;
  const breaksStartingThisRow = 1 + Math.floor((wordWidth - remaining - 1) / columns);
  const breaksStartingNextRow = Math.floor((wordWidth - 1) / columns);
  return breaksStartingNextRow < breaksStartingThisRow;
}

/** One line of input — the caller has already split on newlines. */
function wrapLine(string: string, columns: number, options: WrapOptions): string {
  const trim = options.trim !== false;
  if (trim && string.trim() === '') return '';

  const words = splitWords(string);
  let rows = [''];
  // Tracked as rows are built: remeasuring per word makes wrapping quadratic in the line.
  let rowLength = 0;
  // A row that already starts with content can never become trimmable again.
  let trimmedRowIndex = -1;
  let isFirstWord = true;

  for (const word of words) {
    const rowIndex = rows.length - 1;

    if (trim && trimmedRowIndex !== rowIndex) {
      const row = rows[rowIndex] ?? '';
      const trimmedRow = row.trimStart();
      if (trimmedRow.length !== row.length) {
        rows[rowIndex] = trimmedRow;
        rowLength = visibleWidth(trimmedRow);
      }
      if (trimmedRow.length > 0) trimmedRowIndex = rowIndex;
    }

    if (isFirstWord) {
      isFirstWord = false;
    } else {
      if (rowLength >= columns && (options.wordWrap === false || !trim)) {
        rows.push('');
        rowLength = 0;
      }
      if (rowLength > 0 || !trim) {
        rows[rows.length - 1] += ' ';
        rowLength += 1;
      }
    }

    // 'hard': a row is never allowed to extend past `columns`.
    if (options.hard === true && options.wordWrap !== false && word.width > columns) {
      if (shouldStartLongWordOnNextRow(word.width, columns, rowLength)) {
        rows.push('');
        rowLength = 0;
      }
      rowLength = wrapWord(rows, word.value, columns, rowLength);
      continue;
    }

    if (rowLength + word.width > columns && rowLength > 0 && word.width > 0) {
      if (options.wordWrap === false && rowLength < columns) {
        rowLength = wrapWord(rows, word.value, columns, rowLength);
        continue;
      }
      rows.push('');
      rowLength = 0;
    }

    if (rowLength + word.width > columns && options.wordWrap === false) {
      rowLength = wrapWord(rows, word.value, columns, rowLength);
      continue;
    }

    rows[rows.length - 1] += word.value;
    rowLength += word.width;
  }

  if (trim) rows = rows.map((row) => trimVisibleEnd(row));
  return restoreStylesAcrossRows(rows.join('\n'));
}

/** Wrap `string` to `columns`, keeping its ANSI intact and each row self-contained. */
export function wrap(string: string, columns: number, options: WrapOptions = {}): string {
  return String(string)
    .normalize()
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => wrapLine(expandTabs(line), columns, options))
    .join('\n');
}
