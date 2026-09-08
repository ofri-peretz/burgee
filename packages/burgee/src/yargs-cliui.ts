/**
 * cliui 9 — the column layout yargs' usage renders through — with the string-width,
 * strip-ansi and wrap-ansi it depends on, ported for `burgee/yargs`. The wrapping
 * arithmetic is byte-for-byte the upstream's: yargs' usage tests compare whole help
 * screens.
 */
 

const ANSI_PATTERN =
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))';

export function stripAnsi(str: string): string {
  return typeof str === 'string' ? str.replace(new RegExp(ANSI_PATTERN, 'g'), '') : str;
}

const segmenter = new Intl.Segmenter();
const EMOJI = new RegExp('^\\p{RGI_Emoji}$', 'v');

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

export function stringWidth(input: string): number {
  if (typeof input !== 'string' || input.length === 0) return 0;
  const string = stripAnsi(input);
  if (string.length === 0) return 0;
  let width = 0;
  for (const { segment } of segmenter.segment(string)) {
    const code = segment.codePointAt(0) as number;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) continue;
    if ((code >= 0x200b && code <= 0x200f) || code === 0xfeff) continue;
    if (code >= 0x300 && code <= 0x36f) continue;
    if (EMOJI.test(segment)) {
      width += 2;
      continue;
    }
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

/** ansi-styles' open→close map, the part wrap-ansi reads. */
function closeCode(code: number): number | undefined {
  if (code === 1 || code === 2) return 22;
  if (code === 3) return 23;
  if (code === 4) return 24;
  if (code === 7) return 27;
  if (code === 8) return 28;
  if (code === 9) return 29;
  if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) return 39;
  if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) return 49;
  return undefined;
}

const ESC = '\u001B';
const ESCAPES = new Set([ESC, '\u009B']);
const END_CODE = 39;
const ANSI_ESCAPE_BELL = '\u0007';
const ANSI_CSI = '[';
const ANSI_OSC = ']';
const ANSI_SGR_TERMINATOR = 'm';
const ANSI_ESCAPE_LINK = `${ANSI_OSC}8;;`;

const wrapAnsiCode = (code: number | string): string => `${ESC}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
const wrapAnsiHyperlink = (uri: string): string => `${ESC}${ANSI_ESCAPE_LINK}${uri}${ANSI_ESCAPE_BELL}`;

const wordLengths = (string: string): number[] => string.split(' ').map((character) => stringWidth(character));

function wrapWord(rows: string[], word: string, columns: number): void {
  const characters = [...word];
  let isInsideEscape = false;
  let isInsideLinkEscape = false;
  let visible = stringWidth(stripAnsi(rows.at(-1) as string));
  for (const [index, character] of characters.entries()) {
    const characterLength = stringWidth(character);
    if (visible + characterLength <= columns) rows[rows.length - 1] += character;
    else {
      rows.push(character);
      visible = 0;
    }
    if (ESCAPES.has(character)) {
      isInsideEscape = true;
      isInsideLinkEscape = characters.slice(index + 1).join('').startsWith(ANSI_ESCAPE_LINK);
    }
    if (isInsideEscape) {
      if (isInsideLinkEscape) {
        if (character === ANSI_ESCAPE_BELL) {
          isInsideEscape = false;
          isInsideLinkEscape = false;
        }
      } else if (character === ANSI_SGR_TERMINATOR) isInsideEscape = false;
      continue;
    }
    visible += characterLength;
    if (visible === columns && index < characters.length - 1) {
      rows.push('');
      visible = 0;
    }
  }
  if (!visible && (rows.at(-1) as string).length > 0 && rows.length > 1) rows[rows.length - 2] += rows.pop() as string;
}

function stringVisibleTrimSpacesRight(string: string): string {
  const words = string.split(' ');
  let last = words.length;
  while (last > 0) {
    if (stringWidth(words[last - 1] as string) > 0) break;
    last--;
  }
  if (last === words.length) return string;
  return words.slice(0, last).join(' ') + words.slice(last).join('');
}

interface WrapOptions {
  hard?: boolean;
  wordWrap?: boolean;
  trim?: boolean;
}

function execWrap(string: string, columns: number, options: WrapOptions = {}): string {
  if (options.trim !== false && string.trim() === '') return '';
  let returnValue = '';
  let escapeCode: number | undefined;
  let escapeUrl: string | undefined;
  const lengths = wordLengths(string);
  let rows = [''];
  for (const [index, word] of string.split(' ').entries()) {
    if (options.trim !== false) rows[rows.length - 1] = (rows.at(-1) as string).trimStart();
    let rowLength = stringWidth(rows.at(-1) as string);
    if (index !== 0) {
      if (rowLength >= columns && (options.wordWrap === false || options.trim === false)) {
        rows.push('');
        rowLength = 0;
      }
      if (rowLength > 0 || options.trim === false) {
        rows[rows.length - 1] += ' ';
        rowLength++;
      }
    }
    const length = lengths[index] as number;
    if (options.hard && length > columns) {
      const remainingColumns = columns - rowLength;
      const breaksStartingThisLine = 1 + Math.floor((length - remainingColumns - 1) / columns);
      const breaksStartingNextLine = Math.floor((length - 1) / columns);
      if (breaksStartingNextLine < breaksStartingThisLine) rows.push('');
      wrapWord(rows, word, columns);
      continue;
    }
    if (rowLength + length > columns && rowLength > 0 && length > 0) {
      if (options.wordWrap === false && rowLength < columns) {
        wrapWord(rows, word, columns);
        continue;
      }
      rows.push('');
    }
    if (rowLength + length > columns && options.wordWrap === false) {
      wrapWord(rows, word, columns);
      continue;
    }
    rows[rows.length - 1] += word;
  }
  if (options.trim !== false) rows = rows.map(stringVisibleTrimSpacesRight);
  const pre = [...rows.join('\n')];
  for (const [index, character] of pre.entries()) {
    returnValue += character;
    if (ESCAPES.has(character)) {
      const found = new RegExp(`(?:\\${ANSI_CSI}(?<code>\\d+)m|\\${ANSI_ESCAPE_LINK}(?<uri>.*)${ANSI_ESCAPE_BELL})`).exec(pre.slice(index).join(''));
      const groups: Record<string, string | undefined> = found?.groups ?? {};
      if (groups.code !== undefined) {
        const code = Number.parseFloat(groups.code);
        escapeCode = code === END_CODE ? undefined : code;
      } else if (groups.uri !== undefined) escapeUrl = groups.uri.length === 0 ? undefined : groups.uri;
    }
    const code = closeCode(Number(escapeCode));
    if (pre[index + 1] === '\n') {
      if (escapeUrl) returnValue += wrapAnsiHyperlink('');
      if (escapeCode && code) returnValue += wrapAnsiCode(code);
    } else if (character === '\n') {
      if (escapeCode && code) returnValue += wrapAnsiCode(escapeCode);
      if (escapeUrl) returnValue += wrapAnsiHyperlink(escapeUrl);
    }
  }
  return returnValue;
}

export function wrapAnsi(string: string, columns: number, options?: WrapOptions): string {
  return String(string)
    .normalize()
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => execWrap(line, columns, options))
    .join('\n');
}

export interface Column {
  text: string;
  width?: number | undefined;
  align?: 'right' | 'left' | 'center';
  padding: number[];
  border?: boolean;
}

interface ColumnArray extends Array<Column> {
  span?: boolean;
}

interface Line {
  hidden?: boolean;
  text: string;
  span?: boolean | undefined;
}

const align = { right: alignRight, center: alignCenter };
const top = 0;
const right = 1;
const bottom = 2;
const left = 3;

export class UI {
  width: number;
  wrap: boolean;
  rows: ColumnArray[];

  constructor(opts: { width: number; wrap?: boolean | undefined }) {
    this.width = opts.width;
    this.wrap = opts.wrap ?? true;
    this.rows = [];
  }

  span(...args: (Column | string)[]): void {
    const cols = this.div(...args);
    cols.span = true;
  }

  resetOutput(): void {
    this.rows = [];
  }

  div(...args: (Column | string)[]): ColumnArray {
    if (args.length === 0) this.div('');
    if (this.wrap && this.shouldApplyLayoutDSL(...args) && typeof args[0] === 'string') return this.applyLayoutDSL(args[0]);
    const cols = args.map((arg) => (typeof arg === 'string' ? this.colFromString(arg) : arg));
    this.rows.push(cols);
    return cols;
  }

  private shouldApplyLayoutDSL(...args: (Column | string)[]): boolean {
    return args.length === 1 && typeof args[0] === 'string' && /[\t\n]/.test(args[0]);
  }

  private applyLayoutDSL(str: string): ColumnArray {
    const rows = str.split('\n').map((row) => row.split('\t'));
    let leftColumnWidth = 0;
    rows.forEach((columns) => {
      if (columns.length > 1 && stringWidth(columns[0] as string) > leftColumnWidth) {
        leftColumnWidth = Math.min(Math.floor(this.width * 0.5), stringWidth(columns[0] as string));
      }
    });
    rows.forEach((columns) => {
      this.div(
        ...columns.map((r, i) => ({
          text: r.trim(),
          padding: this.measurePadding(r),
          width: i === 0 && columns.length > 1 ? leftColumnWidth : undefined,
        })),
      );
    });
    return this.rows[this.rows.length - 1] as ColumnArray;
  }

  private colFromString(text: string): Column {
    return { text, padding: this.measurePadding(text) };
  }

  private measurePadding(str: string): number[] {
    const noAnsi = stripAnsi(str);
    return [0, (/\s*$/.exec(noAnsi) as RegExpExecArray)[0].length, 0, (/^\s*/.exec(noAnsi) as RegExpExecArray)[0].length];
  }

  toString(): string {
    const lines: Line[] = [];
    this.rows.forEach((row) => {
      this.rowToString(row, lines);
    });
    return lines
      .filter((line) => !line.hidden)
      .map((line) => line.text)
      .join('\n');
  }

  rowToString(row: ColumnArray, lines: Line[]): Line[] {
    this.rasterize(row).forEach((rrow, r) => {
      let str = '';
      rrow.forEach((col, c) => {
        const column = row[c] as Column;
        const { width } = column;
        const wrapWidth = this.negatePadding(column);
        let ts = col;
        if (wrapWidth > stringWidth(col)) ts += ' '.repeat(wrapWidth - stringWidth(col));
        if (column.align && column.align !== 'left' && this.wrap) {
          const fn = align[column.align];
          ts = fn(ts, wrapWidth);
          if (stringWidth(ts) < wrapWidth) ts += ' '.repeat((width || 0) - stringWidth(ts) - 1);
        }
        const padding = column.padding || [0, 0, 0, 0];
        if (padding[left]) str += ' '.repeat(padding[left] as number);
        str += addBorder(column, ts, '| ');
        str += ts;
        str += addBorder(column, ts, ' |');
        if (padding[right]) str += ' '.repeat(padding[right] as number);
        if (r === 0 && lines.length > 0) str = this.renderInline(str, lines.at(-1) as Line);
      });
      lines.push({ text: str.replace(/ +$/, ''), span: row.span });
    });
    return lines;
  }

  private renderInline(source: string, previousLine: Line): string {
    const match = /^ */.exec(source);
    const leadingWhitespace = match ? match[0].length : 0;
    const target = previousLine.text;
    const targetTextWidth = stringWidth(target.trimEnd());
    if (!previousLine.span) return source;
    if (!this.wrap) {
      previousLine.hidden = true;
      return target + source;
    }
    if (leadingWhitespace < targetTextWidth) return source;
    previousLine.hidden = true;
    return target.trimEnd() + ' '.repeat(leadingWhitespace - targetTextWidth) + source.trimStart();
  }

  private rasterize(row: ColumnArray): string[][] {
    const rrows: string[][] = [];
    const widths = this.columnWidths(row);
    let wrapped: string[];
    row.forEach((col, c) => {
      col.width = widths[c];
      if (this.wrap) wrapped = wrapAnsi(col.text, this.negatePadding(col), { hard: true }).split('\n');
      else wrapped = col.text.split('\n');
      if (col.border) {
        wrapped.unshift(`.${'-'.repeat(this.negatePadding(col) + 2)}.`);
        wrapped.push(`'${'-'.repeat(this.negatePadding(col) + 2)}'`);
      }
      if (col.padding) {
        wrapped.unshift(...new Array<string>(col.padding[top] || 0).fill(''));
        wrapped.push(...new Array<string>(col.padding[bottom] || 0).fill(''));
      }
      wrapped.forEach((str, r) => {
        if (!rrows[r]) rrows.push([]);
        const rrow = rrows[r] as string[];
        for (let i = 0; i < c; i++) {
          if (rrow[i] === undefined) rrow.push('');
        }
        rrow.push(str);
      });
    });
    return rrows;
  }

  private negatePadding(col: Column): number {
    let wrapWidth = col.width || 0;
    if (col.padding) wrapWidth -= (col.padding[left] || 0) + (col.padding[right] || 0);
    if (col.border) wrapWidth -= 4;
    return wrapWidth;
  }

  private columnWidths(row: ColumnArray): number[] {
    if (!this.wrap) return row.map((col) => col.width || stringWidth(col.text));
    let unset = row.length;
    let remainingWidth = this.width;
    const widths = row.map((col) => {
      if (col.width) {
        unset--;
        remainingWidth -= col.width;
        return col.width;
      }
      return undefined;
    });
    const unsetWidth = unset ? Math.floor(remainingWidth / unset) : 0;
    return widths.map((w, i) => (w === undefined ? Math.max(unsetWidth, minWidth(row[i] as Column)) : w));
  }
}

function addBorder(col: Column, ts: string, style: string): string {
  if (col.border) {
    if (/[.']-+[.']/.test(ts)) return '';
    if (ts.trim().length !== 0) return style;
    return '  ';
  }
  return '';
}

function minWidth(col: Column): number {
  const padding = col.padding || [];
  const min = 1 + (padding[left] || 0) + (padding[right] || 0);
  if (col.border) return min + 4;
  return min;
}

function getWindowWidth(): number {
  if (typeof process === 'object' && process.stdout && process.stdout.columns) return process.stdout.columns;
  return 80;
}

function alignRight(str: string, width: number): string {
  str = str.trim();
  const strWidth = stringWidth(str);
  if (strWidth < width) return ' '.repeat(width - strWidth) + str;
  return str;
}

function alignCenter(str: string, width: number): string {
  str = str.trim();
  const strWidth = stringWidth(str);
  if (strWidth >= width) return str;
  return ' '.repeat((width - strWidth) >> 1) + str;
}

export function cliui(opts?: { width?: number | null | undefined; wrap?: boolean | undefined }): UI {
  return new UI({ width: opts?.width || getWindowWidth(), wrap: opts?.wrap });
}
