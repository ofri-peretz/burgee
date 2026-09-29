/**
 * The matrix as the page draws it: every string, link, tone and key worked out here, once, so
 * the JSX files beside this one only lay it out. Two layouts read it — a table from `md` up and
 * a card per capability below — and they read the same cells, so they cannot disagree.
 */
import {
  type Capabilities,
  type Cell,
  cellDetail,
  LABEL,
  oursDetail,
  oursUrl,
  readCapabilities,
  type Row,
  type Status,
  sourceUrl,
  SYMBOL,
  themesOf,
} from './capabilities';

/** A run of text, or a `code` span as the data writes it between backticks. */
export interface Segment {
  readonly key: string;
  readonly text: string;
  readonly code: boolean;
}

/** One mark: whose it is, what it says, and where its evidence is. */
export interface CellView {
  readonly key: string;
  readonly who: string;
  readonly ours: boolean;
  readonly symbol: string;
  readonly label: string;
  readonly partial: boolean;
  readonly tone: string;
  readonly href: string | undefined;
  readonly detail: readonly Segment[];
}

export interface RowView {
  readonly key: string;
  readonly capability: readonly Segment[];
  readonly why: readonly Segment[];
  readonly cells: readonly CellView[];
}

export interface ThemeView {
  readonly key: string;
  readonly theme: string;
  readonly span: number;
  readonly rows: readonly RowView[];
}

export interface ColumnView {
  readonly key: string;
  readonly name: string;
  readonly ours: boolean;
}

export interface MatrixView {
  readonly pkg: string;
  readonly caption: string;
  readonly columns: readonly ColumnView[];
  readonly themes: readonly ThemeView[];
}

/** The mark's colour: the status, never the package. Paired for dark mode. */
export const TONE: Readonly<Record<Status, string>> = {
  yes: 'text-green-700 dark:text-green-400',
  partial: 'text-amber-700 dark:text-amber-400',
  no: 'text-red-700 dark:text-red-400',
  'n/a': 'text-fd-muted-foreground',
};

/** `a \`b\` c` → three segments, the middle one code. */
export function segments(text: string): Segment[] {
  let at = 0;
  return text
    .split(/(`[^`]+`)/u)
    .filter((part) => part !== '')
    .map((part) => {
      const code = part.length > 1 && part.startsWith('`') && part.endsWith('`');
      const segment = { key: String(at), text: code ? part.slice(1, -1) : part, code };
      at += part.length;
      return segment;
    });
}

/** What one mark is made from, before it is drawn. */
interface MarkInput {
  readonly who: string;
  readonly ours: boolean;
  readonly status: Status;
  readonly href: string | undefined;
  readonly detail: string;
}

function mark({ who, ours, status, href, detail }: MarkInput): CellView {
  return { key: who, who, ours, symbol: SYMBOL[status], label: LABEL[status], partial: status === 'partial', tone: TONE[status], href, detail: segments(detail) };
}

function rowView(caps: Capabilities, row: Row): RowView {
  const ours = mark({ who: caps.package, ours: true, status: row.ours.status, href: oursUrl(row.ours), detail: oursDetail(row.ours) });
  const theirs = caps.incumbents.flatMap((name) => {
    const cell: Cell | undefined = row.incumbents[name];
    return cell === undefined ? [] : [mark({ who: name, ours: false, status: cell.status, href: sourceUrl(cell.source), detail: cellDetail(cell) })];
  });
  return { key: row.capability, capability: segments(row.capability), why: segments(row.why), cells: [ours, ...theirs] };
}

/** Everything `<CapabilityMatrix pkg theme>` draws, read from `packages/<pkg>/capabilities.json`. */
export function matrixView(pkg: string, theme?: string): MatrixView {
  const caps = readCapabilities(pkg);
  const columns = [caps.package, ...caps.incumbents];
  return {
    pkg: caps.package,
    caption: `${caps.package} against ${caps.incumbents.join(', ')}`,
    columns: columns.map((name, i) => ({ key: name, name, ours: i === 0 })),
    themes: themesOf(caps, theme).map((t) => ({ key: t.theme, theme: t.theme, span: columns.length + 1, rows: t.rows.map((row) => rowView(caps, row)) })),
  };
}
