/**
 * The execution core: resolve a command from argv, parse its options, fire the
 * plugin hooks around it, render, exit. Every façade calls this, so a
 * commander-syntax program and a native one take exactly the same path (J2, J8).
 *
 * Kept out of the barrel so a façade can import it without loading the entry.
 */
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { type Layers, type Provenance, resolve as resolveLayers } from 'seniority/precedence';

import { detectAgent } from './agent.js';
import { beforeTerminator, isJsonFlag, mayServe } from './argv.js';
import { checkCommand } from './definition.js';
import { ExitCode, isExitCode, type ExitCode as ExitCodeType } from './exit-code.js';
import { type ActionRequiredSpec, type ArgumentSpec, type CommandNode, type DeclaredEffects, type Example, type LazyModule, Manifest, type OptionSpec, type Relation, relationsOf, type RunContext } from './manifest.js';
import { camel, kebab } from './names.js';
import { nearestPackage, type Package } from './pkg.js';
import { host } from './runtime.js';
import { detachedTeardown, processTeardown, type Teardown } from './shutdown.js';
import { coerce, UsageError } from './validate.js';

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
  /** What replaces this command, e.g. `'deploy'`: shown in help, `--schema` and the warning. `true` alone is refused (D1). */
  deprecated?: boolean | string;
  /**
   * What running it does to the world (N6). Declaring one of the three is what exposes the
   * command as an MCP tool (N2); `'withheld'` declares that it is not offered to agents.
   *
   * Optional on the type and **required at definition time** on a command that runs:
   * `defineCommand` refuses one that omits it. It stays optional here because a group that
   * only holds subcommands declares none, and TypeScript cannot make a field's presence
   * depend on a sibling's without splitting `Command` into a union that would cost the
   * option-spec inference every caller of this type relies on.
   */
  effects?: DeclaredEffects;
  /** Relationships between options, validated before choices and the handler (S2, S6). */
  relations?: readonly Relation[];
  /**
   * The top-level fields of this command's result (N14). With them, `--json=` lists them
   * without running the handler and `--json=a,b` refuses an unknown field before it runs.
   * Without them `--json=a,b` still selects, checked against the result's own keys.
   */
  fields?: readonly string[];
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
  if (c.fields !== undefined) node.fields = c.fields;
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

export function defineCommand<const S extends OptionSpecs = OptionSpecs>(command: Command<S>): Command<S> {
  // The reserved names of V5, `checkDefinition`'s four and N6's declared effects, in one
  // place, because `Manifest.use()` needs exactly these on a plugin's commands and used to
  // run none of them. A node with `load` and no `run` is runnable: its module has not been
  // imported, and what running it does to the world was knowable when it was declared.
  checkCommand(command.name, command);
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

/**
 * `ctx.exit(code)`. It throws and does nothing else, which is the half that changed for E5.
 *
 * It used to call `io.exit` first and then throw. On a run that owns the process that first
 * call is `process.exit`, so a handler the command had registered through `ctx.onExit` was
 * registered and never ran — the program left before its own cleanup. `report` honours an
 * exit signal silently and leaves through `leave`, so the code is still the caller's and the
 * drain and the cleanup now happen on this path like every other.
 */
const ctxExit = (code: number): never => {
  throw new ExitSignal(code);
};

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

/** The negation prefix, in one place: `toParseConfig` writes it and `canonical` reads it. */
const NO = 'no-';

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
    // Every boolean is negatable, and it is the precedence order that requires it rather
    // than a convention borrowed from yargs. `flag > env > config > package.json > default`
    // lets any boolean arrive `true` without the user typing anything — config and the
    // package.json field set options *by name*, not only ones with an `env` binding — and a
    // boolean flag cannot carry a value, so `--x=false` is refused. Without `--no-x` the
    // top layer of that chain can only ever say `true`, and a boolean turned on in a config
    // file could not be turned off from the command line at all.
    if (spec.type === 'boolean' && spec.negatable !== false) config[`${NO}${kebab(name)}`] = { type: 'boolean' };
  }
  return config;
}

/**
 * Parsed flags back under their canonical camelCase keys, with `--no-x` folded onto `x`.
 *
 * `--x` and `--no-x` in the same command line: **the later one wins**, the semantic a
 * wrapper depends on — a script appending `--no-color` to whatever the user typed expects
 * to be the one heard, and both incumbents behave this way.
 *
 * It reads the tokens, and an earlier draft did not. `values` looks ordered enough: it
 * carries `x` and `no-x` as separate keys and parseArgs inserts each as it meets it, so
 * folding while iterating appears to give last-wins for free. It gives *last distinct
 * spelling* wins. `--quiet --no-quiet --quiet` re-writes the value at the existing `quiet`
 * key without moving its position, so `no-quiet` is still second and still wins — the
 * wrong answer, from a version that passed every two-flag test.
 *
 * `no-config` is deliberately not folded: `config` is a *string* option and `--no-config`
 * means "load none", not `config: false`. Only a declared boolean gets the treatment, which
 * is why this needs the specs.
 */
function canonical(values: Values, specs: Record<string, OptionSpec>, tokens: readonly Token[]): Values {
  const out: Values = {};
  const negatable = (key: string): string => {
    const bare = camel(key.startsWith(NO) ? key.slice(NO.length) : key);
    return specs[bare]?.type === 'boolean' ? bare : '';
  };
  for (const [k, v] of Object.entries(values)) if (!k.startsWith(NO) || negatable(k) === '') out[camel(k)] = v;
  for (const token of tokens) {
    if (token.kind !== 'option') continue;
    const bare = negatable(token.name);
    if (bare !== '') out[bare] = !token.name.startsWith(NO);
  }
  return out;
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
  const { discover } = await import('seniority/config');
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

/** Every layer, read and resolved (V1) — what a run uses and what `config explain` prints. */
async function resolution(manifest: Manifest, specs: Record<string, OptionSpec>, values: Values, io: Io): Promise<ReturnType<typeof resolveLayers>> {
  const layers: Layers = { flags: values, env: io.env };
  if (manifest.envPrefix !== undefined) layers.envPrefix = manifest.envPrefix;
  if (manifest.config !== undefined) Object.assign(layers, await configLayers(manifest.config.name, values, io));
  return resolveLayers(specs, layers);
}

async function resolveValues(manifest: Manifest, specs: Record<string, OptionSpec>, values: Values, io: Io): Promise<Resolved2> {
  const resolved = await resolution(manifest, specs, values, io);
  const out: Resolved2 = { values: resolved.values as Values, provenance: resolved.provenance };
  const asked = values['explain'];
  // `--explain` is 1,018 bundled bytes and one more module that a program which never explains
  // its configuration should not carry. Lazy here, and at `seniority/explain` rather than in
  // `seniority/precedence`, because a re-export from a module the engine imports statically
  // would have kept it on the startup path however this line were written.
  if (typeof asked === 'string') out.explainText = (await import('seniority/explain')).explain(asked, resolved);
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

/** Help width: the terminal's columns when the stream has them, else 100 (H3). */
const HELP_WIDTH = 100;

/** The real exit, used only when a caller injects none. */
const processExit = (code: number): void => host.exit(code);

/**
 * The one way out (E5, O5): drain, run the run's cleanup, then leave.
 *
 * Every `io.exit` in this file goes through here, which is what makes the file's own
 * sentence — *"exactly one code path from argv to exit"* — true of the exit as well as of
 * the parse. It is awaited, so an asynchronous handler finishes; `process.exit` would have
 * abandoned it, and closeout says so in its own words about the `'exit'` path.
 *
 * A signal that beat us here already ran the handlers, and closeout's run-once state machine
 * makes this call a no-op rather than a second shutdown.
 */
async function leave(io: Io, code: number): Promise<void> {
  await io.teardown.run(code);
  io.exit(code);
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
  /** Where `ctx.onExit` registers, and what `leave` runs before the exit (E5, O5). */
  teardown: Teardown;
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

/**
 * E1 — a command that ran to completion and left work undone names its own code in its
 * result, and the engine honours it.
 *
 * Read off the data the way `changedOf` reads `changed`, because it is the same kind of
 * fact: something the handler knows and the caller cannot see. Before this there was
 * exactly one success path and it left with `OK`, so a command could report *or* fail, not
 * both — `ctx.exit` unwinds before the result is emitted and prints nothing, and a throw
 * carries a message where the document should be.
 *
 * `burgee migrate` is what made that a gap rather than a shape. Its whole contract is that
 * an agent reads the refusal list *and* branches on the code (A8): a report with no code
 * means re-running to find out, and a code with no report means parsing prose for a file
 * name. Opt-in by naming the field, so nothing that does not name it changes.
 */
function exitCodeOf(data: unknown): ExitCodeType {
  const code = isPlainObject(data) ? data['exitCode'] : undefined;
  return isExitCode(code) ? code : ExitCode.OK;
}

async function dispatch(manifest: Manifest, { node, rest: typed, name }: Resolved, io: Io): Promise<Outcome> {
  // N14's selection is imported only when a caller typed `--json=` (M2): every other run pays nothing for it.
  const select = typed.some((a) => a.startsWith('--json=')) ? await import('./fields.js') : undefined;
  const { args: rest, fields } = select?.jsonFields(typed) ?? { args: typed };
  if (fields?.length === 0) return { json: true, text: `${JSON.stringify(select?.listFields(node))}\n` };
  if (fields !== undefined) select?.checkFields(fields, node);
  const parsed = parseArgs({ args: rest, options: toParseConfig(node.options, manifest.config !== undefined), allowPositionals: true, strict: true, tokens: true });
  const flags = canonical(parsed.values as Values, node.options, parsed.tokens);
  const json = flags.json === true;
  // F2 — help as data when both flags are given. It printed the same prose as `--help`, so a
  // caller who asked for a machine-readable answer got one they had to parse: the exact
  // failure the `--json` surface exists to avoid, on the flag people type first.
  // Help and the version are surfaces (U5): `surfaces.js` is imported only when one is asked for.
  if (flags.help === true) return { json, text: await (await import('./surfaces.js')).helpFor(manifest, node, io, json) };
  if (flags.version === true) return { json, text: `${(await import('./surfaces.js')).versionOf(manifest, io)}\n` };

  const resolved = await resolveValues(manifest, node.options, flags, io);
  if (resolved.explainText !== undefined) return { json, text: resolved.explainText };
  const { provenance } = resolved;
  // S6: relations, then each value — numbers, choices, its Standard Schema — then the handler.
  // `relationsOf` is what makes `dependsOn`/`exclusive` enforced rather than documented: the
  // command's own `relations` and the ones its options spell on themselves are one list here,
  // and `schema.ts` publishes that same list. The check is its own chunk (U5), loaded only
  // for a command that declares a relation.
  const relations = relationsOf(node);
  if (relations.length > 0) (await import('./relations.js')).checkRelations(relations, resolved.values, provenance);
  const values = await coerce(node.options, resolved.values);
  const { positionals, passthrough } = splitPositionals(parsed.tokens);
  requirePositionals(node, positionals);
  warnDeprecated(node, io);
  await manifest.fire('preRun', name, values);
  const detection = detectAgent(io.env, io.tty);
  const onExit = (handler: () => void | Promise<void>, label?: string): (() => void) => io.teardown.add(handler, label);
  // S4's check is imported only when a `-` was typed (M2).
  const stdin = positionals.includes('-') ? (await import('./stdin-dash.js')).stdinFor(node, positionals, io.stdin) : {};
  const data = await node.run({ options: values, positionals, passthrough, ...stdin, env: io.env, exit: ctxExit, onExit, actionRequired, ...detection });
  await manifest.fire('postRun', name, values);
  const changed = changedOf(node, data);
  const selected = fields === undefined || select === undefined ? data : select.selectFields(data, fields);
  return { json, data: selected, provenance, ...(changed === undefined ? {} : { changed }) };
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
async function emit(io: Io, outcome: Outcome): Promise<void> {
  if (outcome.text !== undefined) {
    io.out.write(outcome.text);
    return await leave(io, ExitCode.OK);
  }
  // `meta.provenance` says where every option value came from (V3) — the difference between one call and five for an agent.
  const meta = { provenance: outcome.provenance ?? {}, ...(outcome.changed === undefined ? {} : { changed: outcome.changed }) };
  const envelope = { ok: true, data: outcome.data, meta };
  io.out.write(outcome.json ? `${JSON.stringify(envelope)}\n` : `${render(outcome.data)}\n`);
  return await leave(io, exitCodeOf(outcome.data));
}

interface FailureContext {
  manifest: Manifest;
  io: Io;
  argv: string[];
  json: boolean;
  name: string;
}

/**
 * Failure: an exit signal is honoured silently; anything else is described on the requested surface.
 *
 * **Under `--json` the envelope is on stdout, and stderr carries nothing** (O1, D-140) — the
 * same place the success envelope goes and the same place both façades have always put theirs.
 * It was on stderr with stdout empty, so a caller reading stdout for the envelope `--json`
 * promises read nothing on exactly the runs that needed one, and `--mcp` only found it because
 * its reader fell back to stderr. Without `--json` it is prose on stderr, as it was.
 */
async function report(cause: unknown, { manifest, io, argv, json, name }: FailureContext): Promise<void> {
  // U5 — the whole failure vocabulary is its own chunk: a run that succeeds never loads it.
  const { describeFailure, failureText } = await import('./failure.js');
  const failure = await describeFailure(cause, argv, resolveCommand(manifest, argv) ?? undefined, cause instanceof ActionRequired ? cause.spec : undefined);
  if (failure.silent === true) return await leave(io, failure.code);
  await manifest.fire('onError', name, {});
  (json ? io.out : io.err).write(failureText(failure, manifest, json));
  return await leave(io, failure.code);
}

/**
 * Execute a whole manifest: resolve the command from argv, parse its options, fire the
 * plugin hooks around it, render, exit.
 */
/** The injected streams, env, exit and cwd, or the process's own for each one not injected. */
function ioOf(opts: RunOptions): Io {
  const out = opts.stdout ?? host.stdout;
  return {
    out,
    err: opts.stderr ?? host.stderr,
    env: opts.env ?? host.env,
    exit: opts.exit ?? processExit,
    width: out.columns ?? HELP_WIDTH,
    stdin: opts.stdin ?? host.stdin,
    cwd: opts.cwd ?? host.cwd(),
    pkg: nearestPackage(dirname(opts.entry ?? host.argv[1] ?? host.cwd())),
    tty: out.isTTY === true,
    // An injected `exit` is the whole definition of "this run does not own the process":
    // the harness, the MCP loop and every façade test pass one, and none of them may have
    // nine listeners attached to the runner's own process on their behalf.
    teardown: opts.exit === undefined ? processTeardown([host.stdout, host.stderr]) : detachedTeardown(),
  };
}

export async function execute(manifest: Manifest, opts: RunOptions & { root?: string[]; from?: 'node' | 'user' } = {}): Promise<void> {
  const io = ioOf(opts);
  // `from: 'node'` is commander's default and means argv still carries execPath and the
  // script. Doing the slice here keeps `process` out of every façade.
  const raw = opts.argv ?? host.argv;
  const typed = opts.argv === undefined || opts.from === 'node' ? raw.slice(2) : raw;
  const root = opts.root ?? manifest.rootPath;

  // Only a `--json` before `--` asks for the envelope; after it, it is pass-through (G5).
  let json = beforeTerminator(typed).some(isJsonFlag);
  let name = '';
  // D-122 — `shutdown` fires once, on whichever path the run leaves by, through the same
  // teardown `ctx.onExit` uses. Registered only when a plugin declares one.
  if (manifest.declares('shutdown')) io.teardown.add(async () => await manifest.fire('shutdown', name, {}), 'plugin shutdown hooks');
  let argv = typed;
  try {
    argv = manifest.declares('parse') ? await manifest.parse([...typed]) : typed;
    json = beforeTerminator(argv).some(isJsonFlag);
    // U5 — every surface lives in `surfaces.js`, imported only when argv could be asking for one.
    if (mayServe(argv) && (await (await import('./surfaces.js')).serve(manifest, argv, io, { resolution: (specs, flags) => resolution(manifest, specs, flags, io), execute }))) return await leave(io, ExitCode.OK);
    const { node, rest } = manifest.resolve(argv, root);
    if (node?.run === undefined) {
      const { text, code } = await (await import('./surfaces.js')).unresolved({ manifest, root, io }, argv, node);
      (code === ExitCode.OK ? io.out : io.err).write(text);
      return await leave(io, code);
    }
    name = node.path.slice(root.length).join(' ');
    const outcome = await dispatch(manifest, { node: node as Runnable, rest, name }, io);
    json = outcome.json;
    return await emit(io, outcome);
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
  // Every declared field, through the same copy `defineProgram` uses. This listed three by
  // hand, so the `effects` `defineCommand` requires never reached `--mcp` (the tool said
  // `undeclared`), and `examples`, `arguments` and `relations` never reached help or the schema.
  manifest.add({
    path: [target.name],
    ...helpFields(target as AnyCommand),
    options: target.options ?? {},
    ...(target.run === undefined ? {} : { run: target.run as (ctx: RunContext) => unknown }),
  });
  return await execute(manifest, opts);
}

export { beforeTerminator } from './argv.js';
