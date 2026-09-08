/**
 * Help, rendered from the manifest and nothing else (H1). One layout for every node,
 * so a subcommand's help has everything the root's has (yargs #1500, #1331, #1025).
 *
 * Section order is fixed (R2): usage, description, arguments, options, global options,
 * commands (grouped, yargs #684), examples, environment, epilogue. Empty sections are
 * omitted. Width comes from the caller — the runtime, in practice (H3) — default 100.
 */
import type { ArgumentSpec, CommandNode, Example, Manifest, OptionSpec } from './manifest.js';

export interface HelpOptions {
  /** Columns available; 100 when unknown, never `process.stdout` directly (H3). */
  width?: number;
  /** Show type hints such as `[string]`; off by default (H6). */
  verbose?: boolean;
}

interface Row {
  term: string;
  text: string;
}

interface Section {
  title: string;
  rows: Row[];
}

const DEFAULT_WIDTH = 100;
const INDENT = '  ';
const GUTTER = 2;
/** The term column never takes more than this share of the width (R3). */
const TERM_SHARE = 0.4;

/** Always present, always last among options (H4). */
const GLOBAL: Row[] = [
  { term: '--json', text: 'machine-readable output' },
  { term: '--help', text: 'show this help' },
];

function deprecation(d: boolean | string | undefined): string {
  if (d === undefined || d === false) return '';
  return d === true ? ' (deprecated)' : ` (deprecated: use ${d})`;
}

/** Trailing annotations in a stable order (R4). */
function annotate(text: string, spec: OptionSpec, verbose: boolean): string {
  const parts = [text];
  if (spec.required === true) parts.push('(required)');
  if (spec.default !== undefined) parts.push(`(default: ${String(spec.default)})`);
  if (spec.choices !== undefined) parts.push(`(one of: ${spec.choices.join(', ')})`);
  if (spec.env !== undefined) parts.push(`[env: ${spec.env}]`);
  if (verbose) parts.push(`[${spec.type}]`);
  return `${parts.filter((p) => p !== '').join(' ')}${deprecation(spec.deprecated)}`.trim();
}

function optionTerm(name: string, spec: OptionSpec): string {
  const short = spec.short === undefined ? '' : `-${spec.short}, `;
  const value = spec.type === 'string' ? ` <${spec.placeholder ?? 'value'}>` : '';
  return `${short}--${name}${value}`;
}

function optionRows(options: Record<string, OptionSpec>, verbose: boolean): Row[] {
  return Object.entries(options)
    .filter(([, spec]) => spec.hidden !== true)
    .map(([name, spec]) => ({ term: optionTerm(name, spec), text: annotate(spec.description ?? '', spec, verbose) }));
}

const argumentTerm = (a: ArgumentSpec): string => {
  const name = a.variadic === true ? `${a.name}...` : a.name;
  return a.required === false ? `[${name}]` : `<${name}>`;
};

function argumentRows(args: ArgumentSpec[]): Row[] {
  return args.map((a) => ({
    term: argumentTerm(a),
    text: [a.description ?? '', a.default === undefined ? '' : `(default: ${a.default})`].filter((p) => p !== '').join(' '),
  }));
}

/** Commands one level below `node`, visible, in declaration order, grouped by heading (yargs #684). */
function commandSections(manifest: Manifest, node: CommandNode): Section[] {
  const children = manifest.commands.filter(
    (c) => c.hidden !== true && c.path.length === node.path.length + 1 && node.path.every((seg, i) => c.path[i] === seg),
  );
  const groups = new Map<string, Row[]>();
  for (const c of children) {
    const heading = c.group ?? 'Commands:';
    const rows = groups.get(heading) ?? [];
    rows.push({ term: c.path[c.path.length - 1] ?? '', text: `${c.summary ?? c.description ?? ''}${deprecation(c.deprecated)}`.trim() });
    groups.set(heading, rows);
  }
  return [...groups].map(([title, rows]) => ({ title, rows }));
}

function environmentRows(options: Record<string, OptionSpec>): Row[] {
  return Object.entries(options)
    .filter(([, spec]) => spec.env !== undefined && spec.hidden !== true)
    .map(([name, spec]) => ({ term: spec.env ?? '', text: `--${name}` }));
}

function usageLine(node: CommandNode, root: string[], hasChildren: boolean): string {
  const shown = node.path.slice(root.length).join(' ') || node.path.join(' ');
  const parts = [shown];
  if (hasChildren) parts.push('<command>');
  parts.push('[options]');
  for (const a of node.arguments ?? []) parts.push(argumentTerm(a));
  return `Usage: ${parts.join(' ')}`;
}

/** Word-wrap one paragraph; lines the author indented are kept verbatim (yargs #2120). */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (/^\s/.test(line) || line.length <= width) {
      out.push(line);
      continue;
    }
    let current = '';
    for (const word of line.split(' ')) {
      if (current !== '' && current.length + 1 + word.length > width) {
        out.push(current);
        current = word;
      } else current = current === '' ? word : `${current} ${word}`;
    }
    out.push(current);
  }
  return out;
}

/** One term column for the whole help, sized to the longest term up to 40% of the width (R3). */
function termColumn(rows: Row[], width: number): number {
  const longest = Math.max(0, ...rows.map((r) => r.term.length));
  return Math.min(longest, Math.floor(width * TERM_SHARE));
}

/** Two columns: terms padded to the column, descriptions wrapped to the rest (R3). A term wider than the column gets its text on the next line, never wrapped itself. */
function layout(rows: Row[], width: number, column: number): string[] {
  const textWidth = Math.max(1, width - INDENT.length - column - GUTTER);
  const lines: string[] = [];
  for (const { term, text } of rows) {
    if (text === '') {
      lines.push(`${INDENT}${term}`);
      continue;
    }
    const wrapped = wrap(text, textWidth);
    const continuation = INDENT + ' '.repeat(column + GUTTER);
    if (term.length > column) {
      lines.push(`${INDENT}${term}`, ...wrapped.map((l) => `${continuation}${l}`));
      continue;
    }
    lines.push(`${INDENT}${term.padEnd(column + GUTTER)}${wrapped[0] ?? ''}`, ...wrapped.slice(1).map((l) => `${continuation}${l}`));
  }
  return lines;
}

/** `$ command` on one line, the description indented below; never two columns (R5, H2). */
function exampleLines(examples: Example[], width: number): string[] {
  const lines: string[] = [];
  for (const e of examples) {
    lines.push(`${INDENT}$ ${e.command}`);
    if (e.description !== undefined) lines.push(...wrap(e.description, width - INDENT.length * 2).map((l) => `${INDENT}${INDENT}${l}`));
  }
  return lines;
}

function section(title: string, body: string[]): string[] {
  return body.length === 0 ? [] : [title, ...body, ''];
}

/**
 * Render help for one node — a runnable command, a group, or both — as text.
 * Deterministic for a given node and width; a snapshot suite pins it.
 */
export function renderHelp(manifest: Manifest, node: CommandNode, opts: HelpOptions = {}): string {
  const width = opts.width ?? DEFAULT_WIDTH;
  const verbose = opts.verbose === true;
  const root = manifest.rootPath;
  const commands = commandSections(manifest, node);
  const args = argumentRows(node.arguments ?? []);
  const options = optionRows(node.options, verbose);
  const env = environmentRows(node.options);
  const column = termColumn([...args, ...options, ...GLOBAL, ...commands.flatMap((s) => s.rows), ...env], width);
  const lines: string[] = [usageLine(node, root, commands.length > 0), ''];
  if (node.description !== undefined) lines.push(...wrap(`${node.description}${deprecation(node.deprecated)}`, width), '');
  lines.push(...section('Arguments:', layout(args, width, column)));
  lines.push(...section('Options:', layout(options, width, column)));
  lines.push(...section('Global options:', layout(GLOBAL, width, column)));
  for (const s of commands) lines.push(...section(s.title, layout(s.rows, width, column)));
  lines.push(...section('Examples:', exampleLines(node.examples ?? [], width)));
  lines.push(...section('Environment:', layout(env, width, column)));
  if (node.epilogue !== undefined) lines.push(...wrap(node.epilogue, width), '');
  return `${lines.join('\n').trimEnd()}\n`;
}
