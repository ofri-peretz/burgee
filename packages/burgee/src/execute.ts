/**
 * The execution core: resolve a command from argv, parse its options, fire the
 * plugin hooks around it, render, exit. Every façade calls this, so a
 * commander-syntax program and a native one take exactly the same path (J2, J8).
 *
 * Kept out of the barrel so a façade can import it without loading the entry.
 */
import { parseArgs } from 'node:util';

import { ExitCode, isExitCode, type ExitCode as ExitCodeType } from './exit-code.js';
import { type CommandNode, Manifest, type OptionSpec, type RunContext } from './manifest.js';

export interface CommandContext<O> extends Omit<RunContext, 'options'> {
  options: O;
}

export interface Command<O = Record<string, string | boolean | undefined>> {
  name: string;
  description?: string;
  options?: Record<string, OptionSpec>;
  /** Absent on a group that only holds subcommands. */
  run?: (ctx: CommandContext<O>) => unknown;
  commands?: Command[];
}

export interface Program {
  name: string;
  description?: string;
  commands: Command[];
}

/** Reserved names a command may not redefine (V5). */
const RESERVED = new Set(['json', 'help']);

export function defineCommand<O = Record<string, string | boolean | undefined>>(command: Command<O>): Command<O> {
  for (const name of Object.keys(command.options ?? {})) {
    if (RESERVED.has(name)) throw new Error(`burgee: option "${name}" is reserved and cannot be redefined`);
  }
  return command;
}

function addTree(manifest: Manifest, parent: string[], commands: Command[]): void {
  for (const c of commands) {
    const path = [...parent, c.name];
    manifest.add({
      path,
      ...(c.description === undefined ? {} : { description: c.description }),
      options: c.options ?? {},
      ...(c.run === undefined ? {} : { run: c.run as (ctx: RunContext) => unknown }),
    });
    if (c.commands !== undefined) addTree(manifest, path, c.commands);
  }
}

/** A native multi-command program. The manifest it builds is the same one the façades fill. */
export function defineProgram(program: Program): Manifest {
  const manifest = new Manifest();
  manifest.rootPath = [program.name];
  manifest.add({ path: [program.name], ...(program.description === undefined ? {} : { description: program.description }), options: {} });
  addTree(manifest, [program.name], program.commands);
  return manifest;
}

export interface RunOptions {
  argv?: string[];
  /** The environment env-bound options read from. Injected by the harness; the process's own otherwise. */
  env?: Record<string, string | undefined>;
  stdout?: { write: (s: string) => unknown };
  stderr?: { write: (s: string) => unknown };
  exit?: (code: number) => never;
}

/** A usage problem the caller can fix, carrying the flag that fixes it (E3). */
class UsageError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

/** Spaces between the widest flag and the description column. */
const HELP_GUTTER = 2;
const RESERVED_ROWS: [string, string][] = [
  ['--json', 'machine-readable output'],
  ['--help', 'show this help'],
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A leaf renders as itself; anything deeper renders as compact JSON. */
function leaf(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * The text surface. One level deep on purpose, and deliberately not recursive: a caller
 * who wants the whole structure asks for `--json`, which is the surface that promises it.
 */
function render(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => leaf(v)).join('\n');
  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${leaf(v)}`)
      .join('\n');
  }
  return String(value);
}

function table(rows: [string, string][]): string[] {
  // One column for every row, sized to the widest (H3: width from the runtime later).
  const width = Math.max(...rows.map(([left]) => left.length)) + HELP_GUTTER;
  return rows.map(([left, text]) => `  ${left.padEnd(width)}${text}`.trimEnd());
}

function optionRows(options: Record<string, OptionSpec>): [string, string][] {
  return Object.entries(options).map(([name, spec]): [string, string] => {
    const env = spec.env === undefined ? '' : ` [env: ${spec.env}]`;
    const req = spec.required === true ? ' (required)' : '';
    return [`--${name}${spec.type === 'string' ? ' <value>' : ''}`, `${spec.description ?? ''}${env}${req}`.trim()];
  });
}

/** Help for one runnable command. */
function commandHelp(node: CommandNode, root: string[]): string {
  const name = node.path.slice(root.length).join(' ') || node.path.join(' ');
  const lines = [
    ...(node.description === undefined ? [] : [node.description, '']),
    `Usage: ${name} [options]`,
    '',
    'Options:',
    ...table([...optionRows(node.options), ...RESERVED_ROWS]),
  ];
  return `${lines.join('\n')}\n`;
}

/** Help for the program, or for a group: the commands one level below `prefix` (H1). */
function groupHelp(manifest: Manifest, prefix: string[], root: string[]): string {
  const description = manifest.find(prefix)?.description;
  const children = manifest.commands.filter((c) => c.path.length === prefix.length + 1 && prefix.every((seg, i) => c.path[i] === seg));
  const shown = prefix.slice(root.length).join(' ') || prefix.join(' ');
  const lines = [
    ...(description === undefined ? [] : [description, '']),
    `Usage: ${shown} <command> [options]`,
    '',
    'Commands:',
    ...table(children.map((c): [string, string] => [c.path[c.path.length - 1] ?? '', c.description ?? ''])),
    '',
    'Options:',
    ...table(RESERVED_ROWS),
  ];
  return `${lines.join('\n')}\n`;
}

type ParseConfig = Record<string, { type: 'string' | 'boolean'; short?: string }>;
type Values = Record<string, string | boolean | undefined>;

/** `--json` and `--help` are always available and always reserved (V5). */
function toParseConfig(specs: Record<string, OptionSpec>): ParseConfig {
  const config: ParseConfig = { json: { type: 'boolean' }, help: { type: 'boolean' } };
  for (const [name, spec] of Object.entries(specs)) {
    config[name] = { type: spec.type, ...(spec.short === undefined ? {} : { short: spec.short }) };
  }
  return config;
}

const FALSY_ENV = new Set(['', '0', 'false']);

/** Precedence flag > env > default (V1), then fail on anything still missing and required. */
function applyDefaults(values: Values, specs: Record<string, OptionSpec>, env: Record<string, string | undefined>): void {
  for (const [name, spec] of Object.entries(specs)) {
    const fromEnv = spec.env === undefined ? undefined : env[spec.env];
    if (values[name] === undefined && fromEnv !== undefined) {
      values[name] = spec.type === 'boolean' ? !FALSY_ENV.has(fromEnv) : fromEnv;
    }
    if (values[name] === undefined && spec.default !== undefined) values[name] = spec.default;
    if (values[name] === undefined && spec.required === true) {
      throw new UsageError(`missing required option --${name}`, `pass --${name} <value>`);
    }
  }
}

/**
 * `--` is the end of options. Everything after it is handed to the handler verbatim as
 * `passthrough`, so a CLI can forward it to a child process untouched (G5; commander
 * #2530, yargs #1527, #1821, #2423). parseArgs keeps the boundary only in `tokens`.
 */
type Token = NonNullable<ReturnType<typeof parseArgs>['tokens']>[number];

function splitPositionals(tokens: readonly Token[]): { positionals: string[]; passthrough: string[] } {
  const positionals: string[] = [];
  const passthrough: string[] = [];
  let after = false;
  for (const token of tokens) {
    const { kind } = token;
    const value = 'value' in token ? token.value : undefined;
    if (kind === 'option-terminator') after = true;
    else if (kind === 'positional' && typeof value === 'string') (after ? passthrough : positionals).push(value);
  }
  return { positionals, passthrough };
}

/**
 * parseArgs reports every malformed-argv case with an ERR_PARSE_ARGS_* code. Each one is
 * the caller mistyping something, which is USAGE (2) — never RUNTIME (1), because 1 is
 * the code an agent reads as "the command ran and failed".
 */
function isParseArgsFailure(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  const { code } = cause as Error & { code?: unknown };
  return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS_');
}

/** `ctx.exit(code)` or a harness exit: an E1 code to honour, with nothing to print. */
function exitSignal(cause: unknown): ExitCodeType | undefined {
  const code = (cause as { code?: unknown } | null)?.code;
  return typeof code === 'number' && isExitCode(code) ? code : undefined;
}

const SINGLE_DASH_WORD = /^-([a-zA-Z][\w-]+)(?:=.*)?$/;

/** `-foo=bar` means three short flags to a parser and one long flag to a person (citty #237). */
function singleDashHint(argv: string[]): string | undefined {
  for (const token of argv) {
    if (token === '--') return undefined;
    const found = SINGLE_DASH_WORD.exec(token);
    if (found?.[1] !== undefined) return `did you mean --${found[1]}? a single dash introduces one-letter options`;
  }
  return undefined;
}

interface Failure {
  code: ExitCodeType;
  message: string;
  hint?: string;
  /** An exit signal: honour the code, print nothing. */
  silent?: boolean;
}

/** E2/E3 — a usage error never prints a stack, a runtime failure never prints help. */
function describeFailure(cause: unknown, argv: string[]): Failure {
  const signal = exitSignal(cause);
  if (signal !== undefined) return { code: signal, message: '', silent: true };
  const message = cause instanceof Error ? cause.message : String(cause);
  if (cause instanceof UsageError) {
    return { code: ExitCode.USAGE, message, ...(cause.hint === undefined ? {} : { hint: cause.hint }) };
  }
  if (isParseArgsFailure(cause)) {
    return { code: ExitCode.USAGE, message, hint: singleDashHint(argv) ?? 'run --help to see the available options' };
  }
  return { code: ExitCode.RUNTIME, message };
}

function textFailure(failure: Failure): string {
  const hint = failure.hint === undefined ? '' : `hint: ${failure.hint}\n`;
  return `error: ${failure.message}\n${hint}`;
}

const HELP_FLAGS = new Set(['--help', '-h', 'help']);

/** The real exit, used only when a caller injects none. */
const processExit = (code: number): never => process.exit(code);

/** The part of argv the parser will read as options: everything before `--`. */
export function beforeTerminator(argv: readonly string[]): readonly string[] {
  const at = argv.indexOf('--');
  return at === -1 ? argv : argv.slice(0, at);
}

/** What to do when argv resolves to no runnable command: help, or a usage error naming it. */
function unresolved(manifest: Manifest, argv: string[], root: string[], at: CommandNode | undefined): { text: string; code: ExitCodeType } {
  const prefix = at?.path ?? root;
  if (argv.length > 0 && HELP_FLAGS.has(argv[0] ?? '')) return { text: groupHelp(manifest, prefix, root), code: ExitCode.OK };
  const typed = argv.slice(prefix.length - root.length);
  if (typed.length === 0) return { text: groupHelp(manifest, prefix, root), code: ExitCode.USAGE };
  throw new UsageError(`unknown command "${typed[0] ?? ''}"`, 'run --help to see the available commands');
}

type Runnable = CommandNode & { run: NonNullable<CommandNode['run']> };
interface Resolved {
  node: Runnable;
  rest: string[];
  name: string;
}
interface Io {
  out: { write: (s: string) => unknown };
  err: { write: (s: string) => unknown };
  env: Record<string, string | undefined>;
  exit: (code: number) => never;
}
interface Outcome {
  json: boolean;
  data?: unknown;
  help?: string;
}

async function dispatch(manifest: Manifest, { node, rest, name }: Resolved, io: Io): Promise<Outcome> {
  const parsed = parseArgs({ args: rest, options: toParseConfig(node.options), allowPositionals: true, strict: true, tokens: true });
  const values = parsed.values as Values;
  const json = values.json === true;
  if (values.help === true) return { json, help: commandHelp(node, manifest.rootPath) };

  applyDefaults(values, node.options, io.env);
  const { positionals, passthrough } = splitPositionals(parsed.tokens);
  await manifest.fire('preRun', name, values);
  const data = await node.run({ options: values, positionals, passthrough, env: io.env, exit: io.exit });
  await manifest.fire('postRun', name, values);
  return { json, data };
}

/** Success: help, or the data on the requested surface. */
function emit(io: Io, outcome: Outcome): never {
  if (outcome.help !== undefined) {
    io.out.write(outcome.help);
    return io.exit(ExitCode.OK);
  }
  io.out.write(outcome.json ? `${JSON.stringify({ ok: true, data: outcome.data })}\n` : `${render(outcome.data)}\n`);
  return io.exit(ExitCode.OK);
}

interface FailureContext {
  manifest: Manifest;
  io: Io;
  argv: string[];
  json: boolean;
  name: string;
}

/** Failure: an exit signal is honoured silently; anything else is described on the requested surface. */
async function report(cause: unknown, { manifest, io, argv, json, name }: FailureContext): Promise<never> {
  const failure = describeFailure(cause, argv);
  if (failure.silent === true) return io.exit(failure.code);
  await manifest.fire('onError', name, {});
  const body = { code: failure.code, message: failure.message, hint: failure.hint };
  io.err.write(json ? `${JSON.stringify({ ok: false, error: body })}\n` : textFailure(failure));
  return io.exit(failure.code);
}

/**
 * Execute a whole manifest: resolve the command from argv, parse its options, fire the
 * plugin hooks around it, render, exit.
 */
export async function execute(manifest: Manifest, opts: RunOptions & { root?: string[]; from?: 'node' | 'user' } = {}): Promise<void> {
  const io: Io = {
    out: opts.stdout ?? process.stdout,
    err: opts.stderr ?? process.stderr,
    env: opts.env ?? process.env,
    exit: opts.exit ?? processExit,
  };
  // `from: 'node'` is commander's default and means argv still carries execPath and the
  // script. Doing the slice here keeps `process` out of every façade.
  const raw = opts.argv ?? process.argv;
  const argv = opts.argv === undefined || opts.from === 'node' ? raw.slice(2) : raw;
  const root = opts.root ?? manifest.rootPath;

  // Only a `--json` before `--` asks for the envelope; after it, it is pass-through (G5).
  let json = beforeTerminator(argv).includes('--json');
  let name = '';
  try {
    const { node, rest } = manifest.resolve(argv, root);
    if (node?.run === undefined) {
      const { text, code } = unresolved(manifest, argv, root, node);
      (code === ExitCode.OK ? io.out : io.err).write(text);
      return io.exit(code);
    }
    name = node.path.slice(root.length).join(' ');
    const outcome = await dispatch(manifest, { node: node as Runnable, rest, name }, io);
    json = outcome.json;
    return emit(io, outcome);
  } catch (cause) {
    return await report(cause, { manifest, io, argv, json, name });
  }
}

/**
 * The one-file entry: a single command, or a program from `defineProgram`. Both go
 * through `execute`, so there is exactly one code path from argv to exit.
 */
export async function run<O>(target: Command<O> | Manifest, opts: RunOptions = {}): Promise<void> {
  if (target instanceof Manifest) return await execute(target, opts);
  const manifest = new Manifest();
  manifest.rootPath = [target.name];
  manifest.add({
    path: [target.name],
    ...(target.description === undefined ? {} : { description: target.description }),
    options: target.options ?? {},
    ...(target.run === undefined ? {} : { run: target.run as (ctx: RunContext) => unknown }),
  });
  return await execute(manifest, opts);
}
