/**
 * Help, rendered from the manifest and nothing else (H1). One layout for every node,
 * so a subcommand's help has everything the root's has (yargs #1500, #1331, #1025).
 *
 * Section order is fixed (R2): usage, description, arguments, options, global options,
 * commands (grouped, yargs #684), examples, environment, the root's line for agents, epilogue. Empty sections are
 * omitted. Width comes from the caller — the runtime, in practice (H3) — default 100.
 *
 * Every measurement of rendered text here is `linegauge`'s `width`, never `String.length`.
 * `.length` counts UTF-16 code units, which equals the column count a terminal draws only
 * for the Latin-1 subset: `部署` is two code units and four columns, `🚀` is two and two.
 * This file sized its term column, decided which terms overflow it, computed the padding
 * after a term, and word-wrapped every description with `.length`, so a CJK or emoji
 * command name pushed its own description right of the shared column and a CJK
 * description wrapped to a line wider than the terminal. `yargs/cliui.ts` one directory
 * over has imported the same `width` for the same reason since it was ported; burgee
 * already depended on `linegauge`, and this file simply was not asking.
 *
 * For ASCII the two agree exactly, which is why no graded commander or yargs screen moves.
 */
import { styleText } from 'node:util';

import { width as displayWidth, widest, wrap as fold } from 'linegauge';
import { colorLevel } from 'roundel/policy';

import type { ArgumentSpec, CommandNode, Example, Manifest, OptionSpec } from './manifest.js';
import { flagsOf, kebab } from './names.js';

/** The token names of `roundel`'s R3, typed structurally: help never imports the tokens (U13). */
export type HelpToken = 'error' | 'warn' | 'ok' | 'hint' | 'muted' | 'command' | 'flag' | 'value' | 'heading';

/**
 * Per-token styling for help (R7). A user who has `roundel` passes its tokens; a user
 * who does not gets the defaults. Help reads `heading`, `command`, `flag` and `value`;
 * the others are accepted so one theme object serves the whole output stack.
 *
 * What the theme does not touch: the command name after `Usage:` and every `$ example`
 * line are rendered plain, whatever the theme says. Styling wraps a finished cell, so a
 * name is measured and padded plain and never coloured in the manifest (yargs #1699).
 */
export type HelpTheme = Partial<Record<HelpToken, (s: string) => string>>;

export interface HelpOptions {
  /** Columns available; 100 when unknown, never `process.stdout` directly (H3). */
  width?: number;
  /** Show type hints such as `[string]`; off by default (H6). */
  verbose?: boolean;
  /** Apply colour (R7). Off by default: the renderer is pure, so the TTY and NO_COLOR decision stays with the caller. */
  color?: boolean;
  /**
   * Replaces the default styling token by token; read only when `color` is on. See
   * `HelpTheme` for the lines it leaves plain: the `Usage:` command name and `$ example`.
   */
  theme?: HelpTheme;
  /**
   * The commands to list, in place of the node's visible children: each by its path from the
   * node, with what it takes (`config get <key>`), under the heading of the child it is reached
   * through. The engine passes every command that runs when they fit (`listed` in `usage.ts`).
   */
  commands?: readonly CommandNode[];
  /**
   * More rows for `Global options:`, after `--json`, `--help` and `--schema`: the global flags
   * the engine parses for this command (`--color`, `--quiet`, `--timeout`; agent-lint-conformance
   * R1–R3), passed in by the engine like `commands`, so this renderer carries none of their words.
   */
  globals?: readonly { term: string; text: string }[];
  /**
   * The run's language (`localised-human-surfaces` R1): every heading, row text and the root's
   * line for agents are passed through it once laid out in English (the node's own description
   * arrives already in the run's language, R5). The engine hands in a pack's translator; absent,
   * it is the identity, and help is byte-for-byte what it was.
   */
  say?: (english: string) => string;
  /**
   * Words the engine adds to the root's line for agents: `AGENTS.md`, when one sits beside the
   * binary (agent-skill R4). Passed in like `commands`, so this renderer looks for no file.
   */
  forAgents?: string;
}

/** What a term is, so the theme can style it; the term itself stays plain text. */
type Kind = 'command' | 'flag' | 'value';

export interface Row {
  term: string;
  text: string;
  kind: Kind;
}

/** The four styles help uses, resolved: identity when colour is off, the theme's or the default otherwise. */
type Paint = Record<'heading' | Kind, (s: string) => string>;

const identity = (s: string): string => s;
const PLAIN: Paint = { heading: identity, command: identity, flag: identity, value: identity };
/**
 * Whether the engine colours help (O2): roundel's `colorLevel`, above 0.
 *
 * `interactive` stands in for the stream's TTY — the caller's answer, in which a detected
 * agent is not a terminal (N12). Everything else is the family's one colour policy, so help
 * agrees with every other surface about the same run: `NO_COLOR` wins outright, `FORCE_COLOR`
 * and the `--color` flags in `argv` are the user's instruction, `CLI_ACCESSIBLE` is off, and
 * with no instruction a terminal colours only when `TERM`/`COLORTERM` say it can. This used
 * to be a rule of its own that let `FORCE_COLOR` beat `NO_COLOR`, ignored `--no-color`, and
 * coloured a terminal with no `TERM` at all.
 *
 * It lives here, not in the engine, so the startup path pays for none of it (W4).
 */
export function colorFor(env: Record<string, string | undefined>, interactive: boolean, argv: readonly string[] = []): boolean {
  return colorLevel({ env, isTTY: { stdout: interactive }, argv }) > 0;
}

/** The defaults, over `util.styleText`. The stream check is off: `color` is the one gate (R7). */
const DEFAULTS: Paint = {
  heading: (s) => styleText('bold', s, { validateStream: false }),
  command: (s) => styleText('bold', s, { validateStream: false }),
  flag: (s) => styleText('cyan', s, { validateStream: false }),
  value: (s) => styleText('dim', s, { validateStream: false }),
};

function paintOf(opts: HelpOptions): Paint {
  if (opts.color !== true) return PLAIN;
  const theme = opts.theme ?? {};
  return {
    heading: theme.heading ?? DEFAULTS.heading,
    command: theme.command ?? DEFAULTS.command,
    flag: theme.flag ?? DEFAULTS.flag,
    value: theme.value ?? DEFAULTS.value,
  };
}

export interface Section {
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
  { term: '--json', text: 'machine-readable output', kind: 'flag' },
  { term: '--help', text: 'show this help', kind: 'flag' },
];

/**
 * D-151 — the root's help names the schema, so a reader who has only `--help` finds the
 * program as data (clispec.dev's `help-mentions-schema`). The root only: a command's own help
 * is one command, and `--schema` there drills into it without needing to be advertised.
 */
export const ROOT_GLOBAL: Row[] = [...GLOBAL, { term: '--schema', text: 'the program as data', kind: 'flag' }];

/** Every command that runs parses `--explain` (V3), so its help says so (D-20260930). */
const EXPLAIN: Row = { term: '--explain <option>', text: "where an option's value came from", kind: 'flag' };

/** D-20260930 — the root names the agent surfaces and what each one saves; flags, not a command line, since a program is often run under another name. */
const FOR_AGENTS = 'For agents: --schema prints every command, option, default and env var as JSON, in one call. --json prints one envelope on stdout, and --explain <option> says where a value came from.';

function deprecation(d: boolean | string | undefined): string {
  if (d === undefined || d === false) return '';
  return d === true ? ' (deprecated)' : ` (deprecated: use ${d})`;
}

/**
 * Trailing annotations in a stable order (R4).
 *
 * `dependsOn` and `exclusive` sit between the value-shaped notes and the environment one
 * because that is where they are read: a caller who has decided what to pass then finds out
 * what else it obliges or forbids. A constraint declared and not rendered here is one a person
 * can only discover by being refused — the same defect `--schema` publishing `relations` fixed
 * for agents, and help is the person's copy of that document.
 */
function annotate(text: string, spec: OptionSpec, verbose: boolean): string {
  const parts = [text];
  if (spec.required === true) parts.push('(required)');
  if (spec.default !== undefined) parts.push(`(default: ${String(spec.default)})`);
  if (spec.choices !== undefined) parts.push(`(one of: ${spec.choices.join(', ')})`);
  if (spec.multiple === true) parts.push('(repeatable)');
  if (spec.dependsOn !== undefined && spec.dependsOn.length > 0) parts.push(`(requires ${flagsOf(spec.dependsOn).join(', ')})`);
  if (spec.exclusive !== undefined && spec.exclusive.length > 0) parts.push(`(conflicts with ${flagsOf(spec.exclusive).join(', ')})`);
  if (spec.env !== undefined) parts.push(`[env: ${spec.env}]`);
  if (verbose) parts.push(`[${spec.type}]`);
  return `${parts.filter((p) => p !== '').join(' ')}${deprecation(spec.deprecated)}`.trim();
}

function placeholder(spec: OptionSpec): string {
  if (spec.placeholder !== undefined) return spec.placeholder;
  return spec.type === 'number' ? 'n' : 'value';
}

function optionTerm(name: string, spec: OptionSpec): string {
  const short = spec.short === undefined ? '' : `-${spec.short}, `;
  const value = spec.type === 'boolean' ? '' : ` <${placeholder(spec)}>`;
  return `${short}--${kebab(name)}${value}`;
}

function optionRows(options: Record<string, OptionSpec>, verbose: boolean): Row[] {
  return Object.entries(options)
    .filter(([, spec]) => spec.hidden !== true)
    .map(([name, spec]) => ({ term: optionTerm(name, spec), text: annotate(spec.description ?? '', spec, verbose), kind: 'flag' as const }));
}

const argumentTerm = (a: ArgumentSpec): string => {
  const name = a.variadic === true ? `${a.name}...` : a.name;
  return a.required === false ? `[${name}]` : `<${name}>`;
};

function argumentRows(args: ArgumentSpec[]): Row[] {
  return args.map((a) => ({
    term: argumentTerm(a),
    text: [a.description ?? '', a.default === undefined ? '' : `(default: ${a.default})`].filter((p) => p !== '').join(' '),
    kind: 'value' as const,
  }));
}

/**
 * Commands one level below `node`, visible, in declaration order, grouped by heading (yargs #684),
 * or the `listed` ones by their path from `node`. Each is listed with what it takes — `get <key>`,
 * as commander lists `get [options] <key>` — so the line to run is on the screen: B1's agents read
 * a bare `get` and spent a turn on `config get --help` to learn it takes a key, in 5 of 20 runs of
 * the task that asks for one. A listed command sits under its top-level ancestor's heading; a row
 * the engine adds that the manifest does not hold sits under its own `group` — that is how root help
 * gets `completion <shell>` and its `Exit codes:` (agent-lint-conformance R4, R5), passed in like
 * the rest so this door carries none of their words.
 */
function commandSections(manifest: Manifest, node: CommandNode, listed?: readonly CommandNode[]): Section[] {
  const children =
    listed ?? manifest.commands.filter((c) => c.hidden !== true && c.path.length === node.path.length + 1 && node.path.every((seg, i) => c.path[i] === seg));
  const groups = new Map<string, Row[]>();
  for (const c of children) {
    const heading = (manifest.find(c.path.slice(0, node.path.length + 1)) ?? c).group ?? 'Commands:';
    const rows = groups.get(heading) ?? [];
    rows.push({ term: [...c.path.slice(node.path.length), ...(c.arguments ?? []).map(argumentTerm)].join(' '), text: `${c.summary ?? c.description ?? ''}${deprecation(c.deprecated)}`.trim(), kind: 'command' });
    groups.set(heading, rows);
  }
  return [...groups].map(([title, rows]) => ({ title, rows }));
}

function environmentRows(options: Record<string, OptionSpec>): Row[] {
  return Object.entries(options)
    .filter(([, spec]) => spec.env !== undefined && spec.hidden !== true)
    .map(([name, spec]) => ({ term: spec.env as string, text: `--${kebab(name)}`, kind: 'value' as const }));
}

/**
 * Word-wrap one paragraph; lines the author indented are kept verbatim (yargs #2120).
 *
 * The folding is `linegauge`'s `wrap`, not a loop of this file's own: this used to carry a
 * greedy fold at single spaces, measured with linegauge's `width`, which is the job
 * `linegauge/wrap` exists for — and which it does across styled text and hyperlinks too.
 * `hard: false` because a word wider than the row is left to overflow rather than broken: a
 * help epilogue is mostly URLs. Rows are trimmed, which is what the fold at spaces did.
 */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    // Kept verbatim: a line the author indented, and a line that already fits.
    if (/^\s/.test(line) || displayWidth(line) <= width) out.push(line);
    else out.push(...fold(line, width, { hard: false }).split('\n'));
  }
  return out;
}

/** One term column for the whole help, sized to the longest term up to 40% of the width (R3). */
function termColumn(rows: Row[], width: number): number {
  return Math.min(
    widest(rows.map((r) => r.term)),
    Math.floor(width * TERM_SHARE),
  );
}

/**
 * Two columns: terms padded to the column, descriptions wrapped to the rest (R3). A term
 * wider than the column gets its text on the next line, never wrapped itself. Colour wraps
 * the finished cell: the term is measured and padded plain, and the name in the manifest
 * is never touched, which is what yargs #1699 got wrong.
 */
/** The run's `HelpOptions.say`, set by `helpModel` for the call: one renderer at a time, and synchronous. */
let say: (english: string) => string = String;

function layout(rows: Row[], width: number, column: number, paint: Paint): string[] {
  const textWidth = Math.max(1, width - INDENT.length - column - GUTTER);
  const lines: string[] = [];
  for (const { term, text, kind } of rows) {
    // `Paint` is keyed by the three kinds, so the painter is a lookup. It replaced a three-branch
    // `painterFor` to pay for the global rows (agent-lint-conformance R1–R3) inside this door's
    // budget: 162 bytes. `kind` is the closed union `Kind`, typed on every row, never input.
    // eslint-disable-next-line secure-coding/detect-object-injection -- a key of a closed literal union, see above
    const cell = paint[kind](term);
    if (text === '') {
      lines.push(`${INDENT}${cell}`);
      continue;
    }
    // Translated once laid out in English: `say('')` is `''`, so the empty check above holds either way.
    const wrapped = wrap(say(text), textWidth);
    const continuation = INDENT + ' '.repeat(column + GUTTER);
    const termWidth = displayWidth(term);
    if (termWidth > column) {
      lines.push(`${INDENT}${cell}`, ...wrapped.map((l) => `${continuation}${l}`));
      continue;
    }
    const pad = ' '.repeat(column + GUTTER - termWidth);
    lines.push(`${INDENT}${cell}${pad}${wrapped[0] as string}`, ...wrapped.slice(1).map((l) => `${continuation}${l}`));
  }
  return lines;
}

/** `$ command` on one line, the description indented below; never two columns (R5, H2). */
function exampleLines(examples: Row[], width: number): string[] {
  const lines: string[] = [];
  for (const e of examples) {
    lines.push(`${INDENT}$ ${e.term}`);
    if (e.text !== '') lines.push(...wrap(e.text, width - INDENT.length * 2).map((l) => `${INDENT}${INDENT}${l}`));
  }
  return lines;
}

/**
 * agent-skill R1 — the section list, before any layout: what both targets render, in R2's order,
 * empty sections already gone. `Examples:` is a section whose rows are `{ term: command, text:
 * description }`. The terminal layout is `renderHelp`'s; the Markdown one is `help-markdown.ts`.
 */
export interface HelpModel {
  usage: string;
  description: string | undefined;
  sections: Section[];
  /** Paragraphs after the sections: the root's line for agents, then the epilogue. */
  trailer: string[];
}

export function helpModel(manifest: Manifest, node: CommandNode, opts: HelpOptions = {}): HelpModel {
  say = opts.say ?? String;
  const commands = commandSections(manifest, node, opts.commands);
  const atRoot = node.path.length === manifest.rootPath.length;
  const global = [...(atRoot ? ROOT_GLOBAL : GLOBAL), ...(opts.globals ?? []).map((r) => ({ ...r, kind: 'flag' as const })), ...(node.run === undefined ? [] : [EXPLAIN])];
  const sections = [
    { title: 'Arguments:', rows: argumentRows(node.arguments ?? []) },
    { title: 'Options:', rows: optionRows(node.options, opts.verbose === true) },
    { title: 'Global options:', rows: global },
    ...commands,
    { title: 'Examples:', rows: (node.examples ?? []).map((e: Example) => ({ term: e.command, text: e.description ?? '', kind: 'value' as const })) },
    { title: 'Environment:', rows: environmentRows(node.options) },
  ].filter((s) => s.rows.length > 0);
  const trailer = [...(atRoot ? [say(FOR_AGENTS) + say(opts.forAgents ?? '')] : []), ...(node.epilogue === undefined ? [] : [node.epilogue])];
  // `usage` is what follows the command's name on its usage line.
  const usage = [...(commands.length > 0 ? ['<command>'] : []), '[options]', ...(node.arguments ?? []).map(argumentTerm)].join(' ');
  return { usage, description: node.description === undefined ? undefined : `${node.description}${deprecation(node.deprecated)}`, sections, trailer };
}

/**
 * Render help for one node — a runnable command, a group, or both — as text.
 * Deterministic for a given node and width; a snapshot suite pins it. With `color`
 * off — the default — a theme changes nothing; with it on, only ANSI is added.
 *
 * With `format: 'markdown'` it is the same sections as Markdown (agent-skill R1), and a
 * promise: that layout is loaded when asked for, so this door carries none of it.
 */
export function renderHelp(manifest: Manifest, node: CommandNode, opts?: HelpOptions & { format?: 'text' }): string;
export function renderHelp(manifest: Manifest, node: CommandNode, opts: HelpOptions & { format: 'markdown' }): Promise<string>;
export function renderHelp(manifest: Manifest, node: CommandNode, opts: HelpOptions & { format?: 'text' | 'markdown' } = {}): string | Promise<string> {
  const model = helpModel(manifest, node, opts);
  if (opts.format === 'markdown') return import('./help-markdown.js').then((m) => m.markdownHelp(model, node));
  const width = opts.width ?? DEFAULT_WIDTH;
  const paint = paintOf(opts);
  const shown = node.path.slice(manifest.rootPath.length).join(' ') || node.path.join(' ');
  const column = termColumn(model.sections.filter((s) => s.title !== 'Examples:').flatMap((s) => s.rows), width);
  const lines: string[] = [`${paint.heading(say('Usage:'))} ${shown} ${model.usage}`, ''];
  if (model.description !== undefined) lines.push(...wrap(model.description, width), '');
  for (const s of model.sections) lines.push(paint.heading(say(s.title)), ...(s.title === 'Examples:' ? exampleLines(s.rows, width) : layout(s.rows, width, column, paint)), '');
  for (const t of model.trailer) lines.push(...wrap(t, width), '');
  return `${lines.join('\n').trimEnd()}\n`;
}
