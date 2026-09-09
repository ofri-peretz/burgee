/**
 * The execution core: resolve a command from argv, parse its options, fire the
 * plugin hooks around it, render, exit. Every façade calls this, so a
 * commander-syntax program and a native one take exactly the same path (J2, J8).
 *
 * Kept out of the barrel so a façade can import it without loading the entry.
 */
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { detectAgent } from './agent.js';
import { ExitCode, isExitCode, type ExitCode as ExitCodeType } from './exit-code.js';
import { renderHelp } from './help.js';
import { type ActionRequiredSpec, type ArgumentSpec, type CommandNode, type Effects, type Example, type LazyModule, Manifest, type OptionSpec, type Relation, type RunContext } from './manifest.js';
import { serveMcp } from './mcp.js';
import { camel, kebab } from './names.js';
import { nearestPackage, type Package } from './pkg.js';
import { ConfigError, explain, type Layers, type Provenance, resolve as resolveLayers } from './precedence.js';
import { commandSchemaOf, schemaOf, summaryOf } from './schema.js';
import { checkDefinition, checkRelations, coerce, UsageError } from './validate.js';

export interface CommandContext<O> extends Omit<RunContext, 'options'> {
  options: O;
}

type Scalar<S extends OptionSpec> = S['type'] extends 'number' ? number : S['type'] extends 'boolean' ? boolean : S extends { choices: readonly (infer C)[] } ? C : string;
type Many<S extends OptionSpec, V> = S extends { multiple: true } ? V[] : V;
type Present<S extends OptionSpec> = S extends { required: true } ? true : S extends { default: unknown } ? true : false;

/** The handler's `options`, derived from the declaration (S1): `choices` become a union, `multiple` an array, `number` a number. */
export type InferOptions<S extends Record<string, OptionSpec>> = {
  [K in keyof S]: Present<S[K]> extends true ? Many<S[K], Scalar<S[K]>> : Many<S[K], Scalar<S[K]>> | undefined;
};

export type OptionSpecs = Record<string, OptionSpec>;

// Children are declared with their own specs; a container holds a heterogeneous list of them.
export type AnyCommand = Command<any>;

export interface Command<S extends OptionSpecs = OptionSpecs> {
  name: string;
  description?: string;
  /** Shown in command lists instead of the description. */
  summary?: string;
  /** Declared once (S1); the handler's `options` type is derived from it. */
  options?: S;
  arguments?: ArgumentSpec[];
  examples?: Example[];
  /** Heading this command is listed under in its parent's help. */
  group?: string;
  epilogue?: string;
  hidden?: boolean;
  deprecated?: boolean | string;
  /** What running it does to the world (N6). Declaring it is what exposes the command as an MCP tool (N2). */
  effects?: Effects;
  /** Relationships between options, validated before choices and the handler (S2, S6). */
  relations?: readonly Relation[];
  /** Absent on a group that only holds subcommands. `NoInfer`: the spec fixes S, the handler only reads it. */
  run?: (ctx: CommandContext<InferOptions<NoInfer<S>>>) => unknown;
  /** The handler's module, imported on dispatch only (M2); everything else about the command is declared here. */
  load?: () => Promise<LazyModule>;
  commands?: AnyCommand[];
}

/** Everything help renders, copied as declared; `undefined` never lands on the node. */
function helpFields(c: AnyCommand): Partial<CommandNode> {
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
  if (c.relations !== undefined) node.relations = c.relations;
  return node;
}

export interface Program {
  name: string;
  version?: string;
  description?: string;
  /** Options read `PREFIX_OPTION_NAME` from the environment unless they name their own variable (V2). */
  envPrefix?: string;
  /** Characters of `--schema` output above which it is summarised (N13); 48,000 by default. */
  schemaBudget?: number;
  /**
   * Opt into config discovery (V6): `--config <path>` > `NAME_CONFIG` > `./name.config.{json,mjs,js,cjs}`
   * > `package.json#name` > the user config directory; `true` uses the program's name.
   */
  config?: boolean | { name: string };
  commands: AnyCommand[];
}

/** Reserved names a command may not redefine (V5): the surfaces every program serves. */
const RESERVED = new Set(['json', 'help', 'schema', 'mcp', 'version', 'explain']);

export function defineCommand<const S extends OptionSpecs = OptionSpecs>(command: Command<S>): Command<S> {
  for (const name of Object.keys(command.options ?? {})) {
    if (RESERVED.has(name) || RESERVED.has(kebab(name))) throw new Error(`burgee: option "${name}" is reserved and cannot be redefined`);
  }
  checkDefinition(command.name, command.options ?? {});
  return command;
}

function addTree(manifest: Manifest, parent: string[], commands: AnyCommand[]): void {
  for (const c of commands) {
    const path = [...parent, c.name];
    manifest.add({
      path,
      ...helpFields(c),
      options: c.options ?? {},
      ...(c.run === undefined ? {} : { run: c.run as (ctx: RunContext) => unknown }),
      ...(c.load === undefined ? {} : { load: c.load }),
    });
    if (c.commands !== undefined) addTree(manifest, path, c.commands);
  }
}

/**
 * Options declared once and spread into each command that takes them (M4): never global,
 * so `--schema` stays a tree and each command's help lists them as its own, and the
 * handler's `options` type carries them like any other. Every copy is tagged
 * `sharedFrom` with the set's name, so the schema says where it came from.
 */
export function sharedOptions<const T extends OptionSpecs>(name: string, specs: T): T {
  return Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key, { ...spec, sharedFrom: name }])) as T;
}

/** A native multi-command program. The manifest it builds is the same one the façades fill. */
export function defineProgram(program: Program): Manifest {
  const manifest = new Manifest();
  manifest.rootPath = [program.name];
  if (program.version !== undefined) manifest.version = program.version;
  if (program.envPrefix !== undefined) manifest.envPrefix = program.envPrefix;
  if (program.schemaBudget !== undefined) manifest.schemaBudget = program.schemaBudget;
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
  /** `columns` is read when present, so help wraps to the terminal (H3); `isTTY` feeds agent detection (N12). */
  stdout?: { write: (s: string) => unknown; columns?: number; isTTY?: boolean };
  stderr?: { write: (s: string) => unknown };
  /** Receives the E1 code. The default calls process.exit; an injected one may simply record it. */
  exit?: (code: number) => void;
  /** Where config discovery starts; the process's own otherwise. */
  cwd?: string;
  /** The entry file, whose nearest package.json owns the program's version (V4); `process.argv[1]` otherwise. */
  entry?: string;
}

/** `ctx.actionRequired(spec)` unwinds through this: the caller must act before the command can continue (N11). */
class ActionRequired extends Error {
  constructor(readonly spec: ActionRequiredSpec) {
    super(spec.message);
  }
}

const actionRequired = (spec: ActionRequiredSpec): never => {
  throw new ActionRequired(spec);
};

/** `ctx.exit(code)` unwinds through this when the injected exit returns instead of leaving. */
class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
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

type ParseConfig = Record<string, { type: 'string' | 'boolean'; short?: string; multiple?: boolean }>;
type Values = Record<string, unknown>;

/** The reserved surfaces are always parsed (V5); `--config` and `--no-config` only for a program that opted in. */
function toParseConfig(specs: Record<string, OptionSpec>, withConfig: boolean): ParseConfig {
  const config: ParseConfig = { json: { type: 'boolean' }, help: { type: 'boolean' }, version: { type: 'boolean' }, explain: { type: 'string' } };
  if (withConfig) {
    config['config'] = { type: 'string' };
    config['no-config'] = { type: 'boolean' };
  }
  // The CLI form is kebab-case (S5); numbers arrive as strings and are checked after resolution (S3).
  for (const [name, spec] of Object.entries(specs)) {
    config[kebab(name)] = {
      type: spec.type === 'boolean' ? 'boolean' : 'string',
      ...(spec.short === undefined ? {} : { short: spec.short }),
      ...(spec.multiple === true ? { multiple: true } : {}),
    };
  }
  return config;
}

/** Parsed flags back under their canonical camelCase keys. */
function canonical(values: Values): Values {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [camel(k), v]));
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
  // Flags are canonical (camelCase) by now: `--no-config` reads as `noConfig`.
  const disabled = values['noConfig'] === true;
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
      throw new UsageError(`missing required option --${kebab(name)}`, `pass --${kebab(name)} <value>`);
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

interface Failure {
  code: ExitCodeType;
  message: string;
  hint?: string;
  /** An exit signal: honour the code, print nothing. */
  silent?: boolean;
  /** N11: the caller must act; carried into the envelope with the runnable `next[]`. */
  action?: ActionRequiredSpec;
}

/** E2/E3 — a usage error never prints a stack, a runtime failure never prints help. */
async function describeFailure(cause: unknown, argv: string[], node?: CommandNode): Promise<Failure> {
  const signal = exitSignal(cause);
  if (signal !== undefined) return { code: signal, message: '', silent: true };
  const message = cause instanceof Error ? cause.message : String(cause);
  if (cause instanceof ActionRequired) return { code: ExitCode.CANCELLED, message, action: cause.spec, ...(cause.spec.hint === undefined ? {} : { hint: cause.spec.hint }) };
  if (cause instanceof UsageError) {
    return { code: ExitCode.USAGE, message, ...(cause.hint === undefined ? {} : { hint: cause.hint }) };
  }
  if (cause instanceof ConfigError) {
    return { code: ExitCode.CONFIG, message, ...(cause.hint === undefined ? {} : { hint: cause.hint }) };
  }
  if (isParseArgsFailure(cause)) {
    // Loaded only here: see unknown-option.ts for why none of this is imported.
    const explain = await import('./unknown-option.js');
    const dash = explain.singleDashHint(argv);
    if (dash !== undefined) return { code: ExitCode.USAGE, message, hint: dash };
    const better = explain.unknownOption(cause, Object.keys(node?.options ?? {}));
    return { code: ExitCode.USAGE, message, hint: 'run --help to see the available options', ...better };
  }
  return { code: ExitCode.RUNTIME, message };
}

function textFailure(failure: Failure): string {
  const hint = failure.hint === undefined ? '' : `hint: ${failure.hint}\n`;
  if (failure.action !== undefined) {
    const next = (failure.action.next ?? []).map((n) => `  ${n.command}    ${n.when}\n`).join('');
    return `action required (${failure.action.reason}): ${failure.message}\n${next === '' ? '' : `next:\n${next}`}${hint}`;
  }
  return `error: ${failure.message}\n${hint}`;
}

/** The `next[]` commands as the caller can run them: the program in front, the caller's own `--json` carried (N11). */
function runnableNext(manifest: Manifest, spec: ActionRequiredSpec, json: boolean): { command: string; when: string }[] {
  const program = manifest.rootPath.join(' ');
  return (spec.next ?? []).map((n) => ({ command: `${program} ${n.command}${json && !n.command.includes('--json') ? ' --json' : ''}`, when: n.when }));
}

const HELP_FLAGS = new Set(['--help', '-h']);
/**
 * The same courtesy `--help` gets, for the flag people type first.
 *
 * `dispatch` has always answered `--version`, but only once a command resolved. A program
 * that is a pure command group resolves nothing for `burgee --version`, so it fell through
 * to `unknown command "--version"` and **exit 2** — which under E1 means *rewrite the
 * command*, so an agent asked for the version would rewrite it until it gave up. Real
 * commander and real yargs both print the version and exit 0 for the identical program.
 *
 * `-V` is commander's spelling, and `commander-command.ts` already defaults to
 * `-V, --version`. Like `HELP_FLAGS` above, this does not check whether the root declares
 * an option of the same name: a root that is not runnable has no path that would answer it.
 */


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

function unresolved({ manifest, root, io }: Resolving, argv: string[], at: CommandNode | undefined): { text: string; code: ExitCodeType } {
  const node = at ?? rootNode(manifest, root);
  const typed = argv.slice(node.path.length - root.length);
  const first = typed[0] ?? '';
  if (typed.length > 0 && HELP_FLAGS.has(first)) return { text: renderHelp(manifest, node, { width: io.width }), code: ExitCode.OK };
  if (first === '--version' || first === '-V') return { text: `${versionOf(manifest, io)}\n`, code: ExitCode.OK };
  if (typed.length === 0) return { text: renderHelp(manifest, node, { width: io.width }), code: ExitCode.USAGE };
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
    io.out.write(`${JSON.stringify(schemaSurface(manifest, argv), null, 2)}\n`);
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

const SCHEMA_BUDGET = 48_000;

/**
 * `--schema` under a character budget (N13): one command's full schema when a command is
 * named (the drilling), the whole program when it fits, a summary naming every command
 * and how to drill when it does not.
 */
function schemaSurface(manifest: Manifest, argv: string[]): unknown {
  const { node } = manifest.resolve(beforeTerminator(argv).filter((a) => a !== '--schema') as string[], manifest.rootPath);
  if (node?.run !== undefined) return commandSchemaOf(node, manifest.rootPath);
  const full = schemaOf(manifest);
  const budget = manifest.schemaBudget ?? SCHEMA_BUDGET;
  return JSON.stringify(full).length <= budget ? full : summaryOf(manifest, budget);
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
  /** Whether stdout is a terminal — one input to N12, never the whole answer. */
  tty: boolean;
}
interface Outcome {
  json: boolean;
  data?: unknown;
  /** Text to print and leave OK: help, a version, an explanation. */
  text?: string;
  provenance?: Record<string, Provenance>;
  /** What an idempotent command reports (N7); read from the data's own `changed`. */
  changed?: boolean;
}

/** N7: an idempotent command must say whether it changed anything; silence is what an agent misreads as success. */
function changedOf(node: CommandNode, data: unknown): boolean | undefined {
  const value = isPlainObject(data) ? data['changed'] : undefined;
  if (typeof value === 'boolean') return value;
  if (node.effects === 'idempotent') {
    throw new Error(`"${node.path.slice(1).join(' ')}" is idempotent and must report changed: true | false in its result (N7)`);
  }
  return undefined;
}

/** `--version`: the declared version, else the owning package.json's (V4). */
function versionOf(manifest: Manifest, io: Io): string {
  const declared = manifest.version ?? (typeof io.pkg?.data['version'] === 'string' ? io.pkg.data['version'] : undefined);
  if (declared === undefined) throw new ConfigError('no version declared', 'pass version to defineProgram, or set "version" in the owning package.json');
  return declared;
}

async function dispatch(manifest: Manifest, { node, rest, name }: Resolved, io: Io): Promise<Outcome> {
  const parsed = parseArgs({ args: rest, options: toParseConfig(node.options, manifest.config !== undefined), allowPositionals: true, strict: true, tokens: true });
  const flags = canonical(parsed.values as Values);
  const json = flags.json === true;
  if (flags.help === true) return { json, text: renderHelp(manifest, node, { width: io.width }) };
  if (flags.version === true) return { json, text: `${versionOf(manifest, io)}\n` };

  const resolved = await resolveValues(manifest, node.options, flags, io);
  if (resolved.explainText !== undefined) return { json, text: resolved.explainText };
  const { provenance } = resolved;
  // S6: relations, then each value — numbers, choices, its Standard Schema — then the handler.
  checkRelations(node.relations, resolved.values, provenance);
  const values = await coerce(node.options, resolved.values);
  const { positionals, passthrough } = splitPositionals(parsed.tokens);
  requirePositionals(node, positionals);
  warnDeprecated(node, io);
  await manifest.fire('preRun', name, values);
  const exit = (code: number): never => {
    io.exit(code);
    throw new ExitSignal(code);
  };
  const detection = detectAgent(io.env, io.tty);
  const data = await node.run({ options: values, positionals, passthrough, env: io.env, exit, actionRequired, ...detection });
  await manifest.fire('postRun', name, values);
  const changed = changedOf(node, data);
  return { json, data, provenance, ...(changed === undefined ? {} : { changed }) };
}

/** A declared, required positional that argv did not supply is a usage error naming it, as on both hosts. */
function requirePositionals(node: CommandNode, positionals: string[]): void {
  const required = (node.arguments ?? []).filter((a) => a.required !== false && a.variadic !== true);
  const missing = required[positionals.length];
  if (positionals.length < required.length && missing !== undefined) {
    throw new UsageError(`missing required argument "${missing.name}"`, `run --help to see what "${node.path.slice(1).join(' ')}" takes`);
  }
}

const warned = new Set<string>();

/** M5: a deprecated command says so once per process, on stderr, and still runs — exit OK. */
function warnDeprecated(node: CommandNode, io: Io): void {
  if (node.deprecated === undefined || node.deprecated === false) return;
  const key = node.path.join(' ');
  if (warned.has(key)) return;
  warned.add(key);
  const typed = node.path.slice(1).join(' ') || key;
  const use = typeof node.deprecated === 'string' ? `, use '${node.deprecated}'` : '';
  io.err.write(`warning: '${typed}' is deprecated${use}\n`);
}

/** Success: help, or the data on the requested surface. */
function emit(io: Io, outcome: Outcome): void {
  if (outcome.text !== undefined) {
    io.out.write(outcome.text);
    return io.exit(ExitCode.OK);
  }
  // `meta.provenance` says where every option value came from (V3) — the difference between one call and five for an agent.
  const meta = { provenance: outcome.provenance ?? {}, ...(outcome.changed === undefined ? {} : { changed: outcome.changed }) };
  const envelope = { ok: true, data: outcome.data, meta };
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
  const failure = await describeFailure(cause, argv, resolveCommand(manifest, argv) ?? undefined);
  if (failure.silent === true) return io.exit(failure.code);
  await manifest.fire('onError', name, {});
  if (failure.action !== undefined) {
    const next = runnableNext(manifest, failure.action, json);
    const rendered: Failure = { ...failure, action: { ...failure.action, next } };
    const body = { ok: false, status: 'action_required', reason: failure.action.reason, message: failure.message, next, hint: failure.hint, error: { code: failure.code, message: failure.message } };
    io.err.write(json ? `${JSON.stringify(body)}\n` : textFailure(rendered));
    return io.exit(failure.code);
  }
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
    tty: out.isTTY === true,
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

/** M6: which command argv names, or null — the same longest-prefix match `execute` uses. */
export function resolveCommand(manifest: Manifest, argv: readonly string[]): CommandNode | null {
  const { node } = manifest.resolve(beforeTerminator(argv) as string[], manifest.rootPath);
  return node ?? null;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * M6: run a command programmatically — the harness's own entry, public. The streams are
 * captured, the exit recorded; env, cwd and the entry can be injected like `execute`'s.
 */
export async function runCommand(manifest: Manifest, argv: readonly string[], opts: Pick<RunOptions, 'env' | 'cwd' | 'entry' | 'stdin'> = {}): Promise<RunResult> {
  const out: string[] = [];
  const err: string[] = [];
  let code: number = ExitCode.OK;
  await execute(manifest, { ...opts, argv: [...argv], from: 'user', stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, exit: (c) => void (code = c) });
  return { code, stdout: out.join(''), stderr: err.join('') };
}

/**
 * The one-file entry: a single command, or a program from `defineProgram`. Both go
 * through `execute`, so there is exactly one code path from argv to exit.
 */
export async function run<S extends OptionSpecs>(target: Command<S> | Manifest, opts: RunOptions = {}): Promise<void> {
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
