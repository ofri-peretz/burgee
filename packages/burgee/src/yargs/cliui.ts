import { strip, width, wrap, type WrapOptions } from "linegauge";

/**
 * cliui 9 — the column layout yargs' usage renders through — with the wrap-ansi it depends
 * on, ported for `burgee/yargs`. Width and escape-stripping come from linegauge. The wrapping
 * arithmetic is byte-for-byte the upstream's: yargs' usage tests compare whole help
 * screens.
 */

/*
 * `width` and `strip` are linegauge's — measuring text and removing escapes is the layer
 * below this one, and this file had its own copies of both. They were not merely duplicated,
 * they were wrong: the ITU T.416 sub-parameter form `ESC[38:2::255:0:0m`, which chalk emits
 * for truecolor, left `:2::255:0:0m` behind and measured a 13-column string as 25. linegauge
 * fixed that in its own `strip`; burgee inherited nothing because it was not asking.
 *
 * The names stay, because `usage.ts` and `shim.ts` import them and the upstream port reads
 * the way cliui reads.
 */
export const stripAnsi = (str: string): string =>
  typeof str === "string" ? strip(str) : str;
export const stringWidth = (input: string): number =>
  typeof input === "string" ? width(input) : 0;

/*
 * The wrap is linegauge's too. This file carried a wrap-ansi port — ansi-styles' open→close
 * map, an escape-state machine over every character, hyperlink re-opening — to wrap a line
 * without breaking the styling across it. That is the same job `linegauge/wrap` exists for
 * and grades against wrap-ansi, so burgee kept a second implementation of a thing the layer
 * below already owned.
 *
 * Checked before swapping, because yargs' usage tests compare whole help screens: the two
 * agreed on all ten shapes probed — plain prose at several widths, an unbreakable word,
 * SGR-coloured text, single characters, CJK, an embedded newline, leading and trailing
 * spaces, empty, and a string exactly the column width.
 */
export function wrapAnsi(
  string: string,
  columns: number,
  options?: WrapOptions,
): string {
  return wrap(
    String(string).normalize().replace(/\r\n/g, "\n"),
    columns,
    options,
  );
}

export interface Column {
  text: string;
  width?: number | undefined;
  align?: "right" | "left" | "center";
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
    if (args.length === 0) this.div("");
    if (
      this.wrap &&
      this.shouldApplyLayoutDSL(...args) &&
      typeof args[0] === "string"
    )
      return this.applyLayoutDSL(args[0]);
    const cols = args.map((arg) =>
      typeof arg === "string" ? this.colFromString(arg) : arg,
    );
    this.rows.push(cols);
    return cols;
  }

  private shouldApplyLayoutDSL(...args: (Column | string)[]): boolean {
    return (
      args.length === 1 && typeof args[0] === "string" && /[\t\n]/.test(args[0])
    );
  }

  private applyLayoutDSL(str: string): ColumnArray {
    const rows = str.split("\n").map((row) => row.split("\t"));
    let leftColumnWidth = 0;
    rows.forEach((columns) => {
      if (
        columns.length > 1 &&
        stringWidth(columns[0] as string) > leftColumnWidth
      ) {
        leftColumnWidth = Math.min(
          Math.floor(this.width * 0.5),
          stringWidth(columns[0] as string),
        );
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
    return [
      0,
      (/\s*$/.exec(noAnsi) as RegExpExecArray)[0].length,
      0,
      (/^\s*/.exec(noAnsi) as RegExpExecArray)[0].length,
    ];
  }

  toString(): string {
    const lines: Line[] = [];
    this.rows.forEach((row) => {
      this.rowToString(row, lines);
    });
    return lines
      .filter((line) => !line.hidden)
      .map((line) => line.text)
      .join("\n");
  }

  rowToString(row: ColumnArray, lines: Line[]): Line[] {
    this.rasterize(row).forEach((rrow, r) => {
      let str = "";
      rrow.forEach((col, c) => {
        const column = row[c] as Column;
        const { width } = column;
        const wrapWidth = this.negatePadding(column);
        let ts = col;
        if (wrapWidth > stringWidth(col))
          ts += " ".repeat(wrapWidth - stringWidth(col));
        if (column.align && column.align !== "left" && this.wrap) {
          const fn = align[column.align];
          ts = fn(ts, wrapWidth);
          if (stringWidth(ts) < wrapWidth)
            ts += " ".repeat((width || 0) - stringWidth(ts) - 1);
        }
        const padding = column.padding || [0, 0, 0, 0];
        if (padding[left]) str += " ".repeat(padding[left] as number);
        str += addBorder(column, ts, "| ");
        str += ts;
        str += addBorder(column, ts, " |");
        if (padding[right]) str += " ".repeat(padding[right] as number);
        if (r === 0 && lines.length > 0)
          str = this.renderInline(str, lines.at(-1) as Line);
      });
      lines.push({ text: str.replace(/ +$/, ""), span: row.span });
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
    return (
      target.trimEnd() +
      " ".repeat(leadingWhitespace - targetTextWidth) +
      source.trimStart()
    );
  }

  private rasterize(row: ColumnArray): string[][] {
    const rrows: string[][] = [];
    const widths = this.columnWidths(row);
    let wrapped: string[];
    row.forEach((col, c) => {
      col.width = widths[c];
      if (this.wrap)
        wrapped = wrapAnsi(col.text, this.negatePadding(col), {
          hard: true,
        }).split("\n");
      else wrapped = col.text.split("\n");
      if (col.border) {
        wrapped.unshift(`.${"-".repeat(this.negatePadding(col) + 2)}.`);
        wrapped.push(`'${"-".repeat(this.negatePadding(col) + 2)}'`);
      }
      if (col.padding) {
        wrapped.unshift(...new Array<string>(col.padding[top] || 0).fill(""));
        wrapped.push(...new Array<string>(col.padding[bottom] || 0).fill(""));
      }
      wrapped.forEach((str, r) => {
        if (!rrows[r]) rrows.push([]);
        const rrow = rrows[r] as string[];
        for (let i = 0; i < c; i++) {
          if (rrow[i] === undefined) rrow.push("");
        }
        rrow.push(str);
      });
    });
    return rrows;
  }

  private negatePadding(col: Column): number {
    let wrapWidth = col.width || 0;
    if (col.padding)
      wrapWidth -= (col.padding[left] || 0) + (col.padding[right] || 0);
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
    return widths.map((w, i) =>
      w === undefined ? Math.max(unsetWidth, minWidth(row[i] as Column)) : w,
    );
  }
}

function addBorder(col: Column, ts: string, style: string): string {
  if (col.border) {
    if (/[.']-+[.']/.test(ts)) return "";
    if (ts.trim().length !== 0) return style;
    return "  ";
  }
  return "";
}

function minWidth(col: Column): number {
  const padding = col.padding || [];
  const min = 1 + (padding[left] || 0) + (padding[right] || 0);
  if (col.border) return min + 4;
  return min;
}

function getWindowWidth(): number {
  if (typeof process === "object" && process.stdout && process.stdout.columns)
    return process.stdout.columns;
  return 80;
}

function alignRight(str: string, width: number): string {
  str = str.trim();
  const strWidth = stringWidth(str);
  if (strWidth < width) return " ".repeat(width - strWidth) + str;
  return str;
}

function alignCenter(str: string, width: number): string {
  str = str.trim();
  const strWidth = stringWidth(str);
  if (strWidth >= width) return str;
  return " ".repeat((width - strWidth) >> 1) + str;
}

export function cliui(opts?: {
  width?: number | null | undefined;
  wrap?: boolean | undefined;
}): UI {
  return new UI({ width: opts?.width || getWindowWidth(), wrap: opts?.wrap });
}
