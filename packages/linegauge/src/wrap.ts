import { ASCII_PRINTABLE, ROW_BOUNDARY, TAB_SIZE, applyLeadingResets, applyParameters, closingSequence, forEachSegment, hyperlink, matchEscape, openingSequence, segmenter, sgr, visibleWidth, type ActiveStyle } from './style.js';
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
