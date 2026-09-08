/**
 * The execution core: resolve a command from argv, parse its options, fire the
 * plugin hooks around it, render, exit. Every façade calls this, so a
 * commander-syntax program and a native one take exactly the same path (J2, J8).
 *
 * Kept out of the barrel so a façade can import it without loading the entry.
 */
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { ExitCode, isExitCode, type ExitCode as ExitCodeType } from './exit-code.js';
import { renderHelp } from './help.js';
import { type ArgumentSpec, type CommandNode, type Effects, type Example, Manifest, type OptionSpec, type RunContext } from './manifest.js';
import { serveMcp } from './mcp.js';
import { nearestPackage, type Package } from './pkg.js';
import { ConfigError, explain, type Layers, type Provenance, resolve as resolveLayers } from './precedence.js';
import { schemaOf } from './schema.js';

export interface CommandContext<O> extends Omit<RunContext, 'options'> {
  options: O;
}

export interface Command<O = Record<string, string | boolean | undefined>> {
  name: string;
  description?: string;
  /** Shown in command lists instead of the description. */
  summary?: string;
  options?: Record<string, OptionSpec>;
  arguments?: ArgumentSpec[];
  examples?: Example[];
  /** Heading this command is listed under in its parent's help. */
  group?: string;
  epilogue?: string;
  hidden?: boolean;
  deprecated?: boolean | string;
  /** What running it does to the world (N6). Declaring it is what exposes the command as an MCP tool (N2). */
  effects?: Effects;
  /** Absent on a group that only holds subcommands. */
  run?: (ctx: CommandContext<O>) => unknown;
  commands?: Command[];
}

/** Everything help renders, copied as declared; `undefined` never lands on the node. */
function helpFields(c: Command): Partial<CommandNode> {
  const node: Partial<CommandNode> = {};
  if (c.description !== undefined) node.description = c.description;
  if (c.summary !== undefined) node.summary = c.summary;
  if (c.arguments !== undefined) node.arguments = c.arguments;
  if (c.examples !== undefined) node.examples = c.examples;
  if (c.group !== undefined) node.group = c.group;
  if (c.epilogue !== undefined) node.epilogue = c.epilogue;
  if (c.hidden !== undefined) node.hidden = c.hidden;
  if (c.deprecated !== undefined) node.deprecated = c.deprecated;
  if (c.effects !== undefined) node.effects = c.effects;
  return node;
}

export interface Program {
  name: string;
  version?: string;
  description?: string;
  /** Options read `PREFIX_OPTION_NAME` from the environment unless they name their own variable (V2). */
  envPrefix?: string;
  /**
   * Opt into config discovery (V6): `--config <path>` > `NAME_CONFIG` > `./name.config.{json,mjs,js,cjs}`
   * > `package.json#name` > the user config directory; `true` uses the program's name.
   */
  config?: boolean | { name: string };
  commands: Command[];
}

/** Reserved names a command may not redefine (V5): the surfaces every program serves. */
const RESERVED = new Set(['json', 'help', 'schema', 'mcp', 'version', 'explain']);

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
      ...helpFields(c),
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
  if (program.version !== undefined) manifest.version = program.version;
  if (program.envPrefix !== undefined) manifest.envPrefix = program.envPrefix;
  if (program.config === true) manifest.config = { name: program.name };
  else if (typeof program.config === 'object' && program.config !== null) manifest.config = program.config;
  manifest.add({ path: [program.name], ...(program.description === undefined ? {} : { description: program.description }), options: {} });
  addTree(manifest, [program.name], program.commands);
  return manifest;
}

export interface RunOptions {
  argv?: string[];
  /** Read only by `--mcp`, which serves JSON-RPC over it. */
  stdin?: NodeJS.ReadableStream;
  /** The environment env-bound options read from. Injected by the harness; the process's own otherwise. */
  env?: Record<string, string | undefined>;
  /** `columns` is read when present, so help wraps to the terminal (H3). */
  stdout?: { write: (s: string) => unknown; columns?: number };
  stderr?: { write: (s: string) => unknown };
  /** Receives the E1 code. The default calls process.exit; an injected one may simply record it. */
  exit?: (code: number) => void;
  /** Where config discovery starts; the process's own otherwise. */
  cwd?: string;
  /** The entry file, whose nearest package.json owns the program's version (V4); `process.argv[1]` otherwise. */
  entry?: string;
}

/** `ctx.exit(code)` unwinds through this when the injected exit returns instead of leaving. */
class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
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

type ParseConfig = Record<string, { type: 'string' | 'boolean'; short?: string }>;
type Values = Record<string, string | boolean | undefined>;

/** The reserved surfaces are always parsed (V5); `--config` and `--no-config` only for a program that opted in. */
function toParseConfig(specs: Record<string, OptionSpec>, withConfig: boolean): ParseConfig {
  const config: ParseConfig = { json: { type: 'boolean' }, help: { type: 'boolean' }, version: { type: 'boolean' }, explain: { type: 'string' } };
  if (withConfig) {
    config['config'] = { type: 'string' };
    config['no-config'] = { type: 'boolean' };
  }
  for (const [name, spec] of Object.entries(specs)) {
    config[name] = { type: spec.type, ...(spec.short === undefined ? {} : { short: spec.short }) };
  }
  return config;
}

interface Resolved2 {
  values: Values;
  provenance: Record<string, Provenance>;
  explainText?: string;
}

/** The owning package.json's field named after the program, as a layer below config. */
function packageLayer(pkg: Package | undefined, name: string | undefined): Layers['pkg'] {
  if (pkg === undefined || name === undefined) return undefined;
  const field = pkg.data[name];
  return typeof field === 'object' && field !== null && !Array.isArray(field) ? { path: pkg.path, data: field as Record<string, unknown> } : undefined;
}

/**
 * Precedence flag > env > config > package.json > default (V1), then fail on anything still
 * missing and required. Config is loaded here, lazily, only for a program that opted in.
 */
/** The config file and the package.json field, for a program that opted in; loaded lazily (K6). */
async function configLayers(name: string, values: Values, io: Io): Promise<Pick<Layers, 'config' | 'pkg'>> {
  const { discover } = await import('./config.js');
  const explicit = values['config'];
  const disabled = values['no-config'] === true;
  const loaded = await discover({ name, cwd: io.cwd, env: io.env, ...(typeof explicit === 'string' ? { explicit } : {}), disabled });
  const out: Pick<Layers, 'config' | 'pkg'> = {};
  if (loaded !== undefined) out.config = { path: loaded.chain.join(' ← '), data: loaded.data };
  // --no-config turns off every discovered source, the package.json field included.
  const pkg = disabled ? undefined : packageLayer(io.pkg, name);
  if (pkg !== undefined) out.pkg = pkg;
  return out;
}

async function resolveValues(manifest: Manifest, specs: Record<string, OptionSpec>, values: Values, io: Io): Promise<Resolved2> {
  const layers: Layers = { flags: values, env: io.env };
  if (manifest.envPrefix !== undefined) layers.envPrefix = manifest.envPrefix;
  if (manifest.config !== undefined) Object.assign(layers, await configLayers(manifest.config.name, values, io));
  const resolution = resolveLayers(specs, layers);
  const out: Resolved2 = { values: resolution.values as Values, provenance: resolution.provenance };
  const asked = values['explain'];
  if (typeof asked === 'string') out.explainText = explain(asked, resolution);
  for (const [name, spec] of Object.entries(specs)) {
    if (out.values[name] === undefined && spec.required === true && out.explainText === undefined) {
      throw new UsageError(`missing required option --${name}`, `pass --${name} <value>`);
    }
  }
  return out;
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
  if (cause instanceof ConfigError) {
    return { code: ExitCode.CONFIG, message, ...(cause.hint === undefined ? {} : { hint: cause.hint }) };
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

const HELP_FLAGS = new Set(['--help', '-h']);

/** Help width: the terminal's columns when the stream has them, else 100 (H3). */
const HELP_WIDTH = 100;

/** The real exit, used only when a caller injects none. */
const processExit = (code: number): void => process.exit(code);

/** The part of argv the parser will read as options: everything before `--`. */
export function beforeTerminator(argv: readonly string[]): readonly string[] {
  const at = argv.indexOf('--');
  return at === -1 ? argv : argv.slice(0, at);
}

/** The node help is rendered for when nothing more specific resolves: the root's own. */
function rootNode(manifest: Manifest, root: string[]): CommandNode {
  return manifest.find(root) ?? { path: root, options: {} };
}

/** What to do when argv resolves to no runnable command: help, or a usage error naming it. */
interface Resolving {
  manifest: Manifest;
  root: string[];
  io: Io;
}

function unresolved({ manifest, root, io: { width } }: Resolving, argv: string[], at: CommandNode | undefined): { text: string; code: ExitCodeType } {
  const node = at ?? rootNode(manifest, root);
  const typed = argv.slice(node.path.length - root.length);
  if (typed.length > 0 && HELP_FLAGS.has(typed[0] ?? '')) return { text: renderHelp(manifest, node, { width }), code: ExitCode.OK };
  if (typed.length === 0) return { text: renderHelp(manifest, node, { width }), code: ExitCode.USAGE };
  throw new UsageError(`unknown command "${typed[0] ?? ''}"`, 'run --help to see the available commands');
}

/**
 * `--schema` (F1, N8) and `--mcp` (N1) are served for every program from the manifest
 * alone, before any command resolves: no config, no network, no handler runs.
 */
/**
 * `completion <shell>` is synthesised unless the program defines its own `completion`
 * command (D2). The templates are loaded only here, on that command (K6): a program pays
 * for them when it prints a completion script, never at startup.
 */
async function completion(manifest: Manifest, argv: string[], io: Io): Promise<boolean> {
  if (argv[0] !== 'completion' || manifest.find([...manifest.rootPath, 'completion']) !== undefined) return false;
  const { renderCompletion, renderFigSpec, SHELLS } = await import('./completions.js');
  const shell = argv[1] ?? '';
  if (shell === 'fig') {
    io.out.write(`${JSON.stringify(renderFigSpec(manifest), null, 2)}\n`);
    return true;
  }
  const known = SHELLS.find((s) => s === shell);
  if (known === undefined) throw new UsageError(`unknown shell "${shell}"`, `completion ${SHELLS.join('|')}|fig`);
  io.out.write(renderCompletion(manifest, known));
  return true;
}

async function surface(manifest: Manifest, argv: string[], io: Io): Promise<boolean> {
  const head = beforeTerminator(argv);
  if (await completion(manifest, argv, io)) return true;
  if (argv[0] === 'help') {
    io.out.write(helpCommand(manifest, argv.slice(1), manifest.rootPath, io.width));
    return true;
  }
  if (head.includes('--schema')) {
    io.out.write(`${JSON.stringify(schemaOf(manifest), null, 2)}\n`);
    return true;
  }
  if (head[0] === '--mcp') {
    const invoke = async (args: string[]): Promise<{ stdout: string; stderr: string; code: number }> => {
      const out: string[] = [];
      const err: string[] = [];
      let code = 0;
      await execute(manifest, {
        argv: args,
        env: io.env,
        stdout: { write: (s: string) => out.push(s) },
        stderr: { write: (s: string) => err.push(s) },
        exit: (c: number) => {
          code = c;
        },
      });
      return { stdout: out.join(''), stderr: err.join(''), code };
    };
    await serveMcp(manifest, { input: io.stdin, output: io.out, invoke });
    return true;
  }
  return false;
}

/** `help [command…]` is synthesised for every program (yargs #1020): the named node's help, or the root's. */
function helpCommand(manifest: Manifest, argv: string[], root: string[], width: number): string {
  const { node } = manifest.resolve(argv, root);
  return renderHelp(manifest, node ?? rootNode(manifest, root), { width });
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
  exit: (code: number) => void;
  width: number;
  stdin: NodeJS.ReadableStream;
  cwd: string;
  /** The package.json owning the entry file, read once (V4). */
  pkg: Package | undefined;
}
interface Outcome {
  json: boolean;
  data?: unknown;
  /** Text to print and leave OK: help, a version, an explanation. */
  text?: string;
  provenance?: Record<string, Provenance>;
}

/** `--version`: the declared version, else the owning package.json's (V4). */
function versionOf(manifest: Manifest, io: Io): string {
  const declared = manifest.version ?? (typeof io.pkg?.data['version'] === 'string' ? io.pkg.data['version'] : undefined);
  if (declared === undefined) throw new ConfigError('no version declared', 'pass version to defineProgram, or set "version" in the owning package.json');
  return declared;
}

async function dispatch(manifest: Manifest, { node, rest, name }: Resolved, io: Io): Promise<Outcome> {
  const parsed = parseArgs({ args: rest, options: toParseConfig(node.options, manifest.config !== undefined), allowPositionals: true, strict: true, tokens: true });
  const flags = parsed.values as Values;
  const json = flags.json === true;
  if (flags.help === true) return { json, text: renderHelp(manifest, node, { width: io.width }) };
  if (flags.version === true) return { json, text: `${versionOf(manifest, io)}\n` };

  const { values, provenance, explainText } = await resolveValues(manifest, node.options, flags, io);
  if (explainText !== undefined) return { json, text: explainText };
  const { positionals, passthrough } = splitPositionals(parsed.tokens);
  await manifest.fire('preRun', name, values);
  const exit = (code: number): never => {
    io.exit(code);
    throw new ExitSignal(code);
  };
  const data = await node.run({ options: values, positionals, passthrough, env: io.env, exit });
  await manifest.fire('postRun', name, values);
  return { json, data, provenance };
}

/** Success: help, or the data on the requested surface. */
function emit(io: Io, outcome: Outcome): void {
  if (outcome.text !== undefined) {
    io.out.write(outcome.text);
    return io.exit(ExitCode.OK);
  }
  // `meta.provenance` says where every option value came from (V3) — the difference between one call and five for an agent.
  const envelope = { ok: true, data: outcome.data, meta: { provenance: outcome.provenance ?? {} } };
  io.out.write(outcome.json ? `${JSON.stringify(envelope)}\n` : `${render(outcome.data)}\n`);
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
async function report(cause: unknown, { manifest, io, argv, json, name }: FailureContext): Promise<void> {
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
/** The injected streams, env, exit and cwd, or the process's own for each one not injected. */
function ioOf(opts: RunOptions): Io {
  const out = opts.stdout ?? process.stdout;
  return {
    out,
    err: opts.stderr ?? process.stderr,
    env: opts.env ?? process.env,
    exit: opts.exit ?? processExit,
    width: out.columns ?? HELP_WIDTH,
    stdin: opts.stdin ?? process.stdin,
    cwd: opts.cwd ?? process.cwd(),
    pkg: nearestPackage(dirname(opts.entry ?? process.argv[1] ?? process.cwd())),
  };
}

export async function execute(manifest: Manifest, opts: RunOptions & { root?: string[]; from?: 'node' | 'user' } = {}): Promise<void> {
  const io = ioOf(opts);
  // `from: 'node'` is commander's default and means argv still carries execPath and the
  // script. Doing the slice here keeps `process` out of every façade.
  const raw = opts.argv ?? process.argv;
  const argv = opts.argv === undefined || opts.from === 'node' ? raw.slice(2) : raw;
  const root = opts.root ?? manifest.rootPath;

  // Only a `--json` before `--` asks for the envelope; after it, it is pass-through (G5).
  let json = beforeTerminator(argv).includes('--json');
  let name = '';
  try {
    if (await surface(manifest, argv, io)) return io.exit(ExitCode.OK);
    const { node, rest } = manifest.resolve(argv, root);
    if (node?.run === undefined) {
      const { text, code } = unresolved({ manifest, root, io }, argv, node);
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
