/**
 * The execution core: resolve a command from argv, parse its options, fire the
 * plugin hooks around it, render, exit. Every façade calls this, so a
 * commander-syntax program and a native one take exactly the same path (J2, J8).
 *
 * Kept out of the barrel so a façade can import it without loading the entry.
 */
import type { parseArgs } from 'node:util';

import { type Layers, type Provenance, resolve as resolveLayers } from 'seniority/precedence';

import { beforeTerminator, isJsonFlag, mayServe } from './argv.js';
import { checkCommand, type Declared } from './definition.js';
import { ExitCode, isExitCode, type ExitCode as ExitCodeType } from './exit-code.js';
import { type LazyArgs } from './fields.js';
import { type ActionRequiredSpec, type ArgumentSpec, type CommandNode, type CommandOutput, type DeclaredEffects, type Example, type LazyModule, Manifest, type OptionSpec, type OutputOf, type Relation, relationsOf, type RunContext } from './manifest.js';
import { type Print } from './max-bytes.js';
import { camel, kebab } from './names.js';
import { owningPackage, type Package } from './pkg.js';
import { builtin, host } from './runtime.js';
import { detachedTeardown, processTeardown, type Teardown } from './shutdown.js';
import { coerce, UsageError } from './validate.js';

export interface CommandContext<O, A = Record<string, unknown>> extends Omit<RunContext, 'options' | 'args'> {
  options: O;
  /** The declared positionals by name, typed from the declaration (typed-positionals R2). */
  args: A;
}

type Scalar<S extends DeclaredOption> = S['type'] extends 'number' ? number : S['type'] extends 'boolean' ? boolean : S extends { choices: readonly (infer C)[] } ? C : string;
type Many<S extends DeclaredOption, V> = S extends { multiple: true } ? V[] : V;
type Present<S extends DeclaredOption> = S extends { required: true } ? true : S extends { default: unknown } ? true : false;

/**
 * A positional as declared (typed-positionals R1): `choices` on a string type only, as on an
 * option, so `{ type: 'number', choices: [...] }` is a type error here and a definition-time
 * error for a caller TypeScript does not check.
 */
export type DeclaredArgument = Omit<ArgumentSpec, 'type' | 'choices'> & ({ type?: 'string'; choices?: readonly string[] } | { type: 'number' | 'integer' | 'boolean' | 'file'; choices?: never });

type ArgValue<A> = A extends { type: 'number' | 'integer' } ? number : A extends { type: 'boolean' } ? boolean : A extends { choices: readonly (infer C)[] } ? C : string;
type ArgPresent<A> = A extends { variadic: true } | { default: string } ? true : A extends { required: false } ? false : true;

/**
 * The handler's `args`, derived from the declaration (typed-positionals R2): keyed by name, a
 * variadic one an array, `number` and `integer` a number, `boolean` a boolean, `choices` a union,
 * and `| undefined` only on an optional one with no default. `any` stays `any`, so a list of
 * commands of different shapes (`AnyCommand`) still holds each of them.
 */
export type InferArgs<A extends readonly DeclaredArgument[]> = 0 extends 1 & A
  ? any
  : { [K in A[number] as K['name']]: K extends { variadic: true } ? ArgValue<K>[] : ArgPresent<K> extends true ? ArgValue<K> : ArgValue<K> | undefined };

/** The handler's `options`, derived from the declaration (S1): `choices` become a union, `multiple` an array, `number` a number. */
export type InferOptions<S extends Record<string, DeclaredOption>> = {
  [K in keyof S]: Present<S[K]> extends true ? Many<S[K], Scalar<S[K]>> : Many<S[K], Scalar<S[K]>> | undefined;
};

/**
 * `localised-human-surfaces` R5 — text an author writes in more than one language: one string, or
 * locale → text with the author's base language **first**. Help renders the run's locale (the
 * tag, then its bare language, then the base); `--schema`, `--mcp` and every other machine
 * surface carry the base language and nothing else, because a command's description there is
 * data a program reads, not prose (R3).
 */
export type Localised = string | Readonly<Record<string, string>>;

/** An option as declared: an {@link OptionSpec} whose description may be {@link Localised} (R5). */
export type DeclaredOption = Omit<OptionSpec, 'description'> & { description?: Localised };

/** An example as declared: its description may be {@link Localised} (R5). */
export type DeclaredExample = Omit<Example, 'description'> & { description?: Localised };

export type OptionSpecs = Record<string, DeclaredOption>;

// Children are declared with their own specs; a container holds a heterogeneous list of them.
export type AnyCommand = Command<any, any, any>;

/** What `run` may return: anything, or what `output.schema` describes (clispec-conformance R5). */
type Returns<O> = O extends { schema: infer J } ? OutputOf<J> | Promise<OutputOf<J>> : unknown;

export interface Command<S extends OptionSpecs = OptionSpecs, O extends CommandOutput = CommandOutput, A extends readonly DeclaredArgument[] = readonly []> {
  name: string;
  /** Other words that run this command, `['s']` for `serve`: listed on it in help, `--schema` and completions, never as commands of their own. */
  aliases?: readonly string[];
  /**
   * Runs when argv names no command at this level (default-command R2): `tool`, or `tool --port 1`
   * with only this command's options, and a word as its positional when it declares one and the
   * word is near no command's name. One per level; two siblings that both say so are refused.
   */
  default?: boolean;
  description?: Localised;
  /** Shown in command lists instead of the description. */
  summary?: Localised;
  /** Declared once (S1); the handler's `options` type is derived from it. */
  options?: S;
  /** Positionals in order, each with its `type` and `choices` (typed-positionals R1); the handler reads them as `args`. */
  arguments?: A;
  examples?: DeclaredExample[];
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
  /**
   * clispec-conformance R5 — what the result is and how much of it: `--schema` publishes it as
   * `output_kind`, `cardinality` and `stdout_schema`. With a `schema`, `run` must return what it
   * describes; without one, anything.
   */
  output?: O;
  /** Pass positionals past the declared ones to the handler instead of refusing them. */
  allowExcess?: boolean;
  /** Absent on a group that only holds subcommands. `NoInfer`: the spec fixes S, the handler only reads it. */
  run?: (ctx: CommandContext<InferOptions<NoInfer<S>>, InferArgs<NoInfer<A>>>) => Returns<NoInfer<O>>;
  /** The handler's module, imported on dispatch only (M2); everything else about the command is declared here. */
  load?: () => Promise<LazyModule>;
  commands?: AnyCommand[];
}

/** The declared keys a node carries as they are: what help renders, and what `--schema` publishes. */
const NODE_KEYS = ['description', 'summary', 'aliases', 'default', 'arguments', 'examples', 'group', 'epilogue', 'hidden', 'deprecated', 'effects', 'relations', 'fields', 'output', 'allowExcess'] as const;

/**
 * Everything help renders, copied as declared; `undefined` never lands on the node. One loop over
 * the keys, not an `if` per key: the eleven `if`s were more bytes than the loop with clispec's
 * `output` added to it, against a core budget with 71 to spare (clispec-conformance R5).
 */
function helpFields(c: AnyCommand): Partial<CommandNode> & Pick<CommandNode, 'options'> {
  const node: Record<string, unknown> = {};
  for (const key of NODE_KEYS) if (c[key] !== undefined) node[key] = c[key];
  node['examples'] &&= (node['examples'] as DeclaredExample[]).map(based);
  node['options'] = Object.fromEntries(Object.entries(c.options ?? {}).map(([key, spec]) => [key, based(spec as DeclaredOption)]));
  return based(node) as Partial<CommandNode> & Pick<CommandNode, 'options'>;
}

/**
 * `localised-human-surfaces` R5 — a declaration as the manifest holds it: a {@link Localised}
 * `description` or `summary` becomes its base language, the first entry, and the declaration as
 * written rides along under `Symbol.for('burgee.l10n')` for help to pick the run's locale
 * from. Every projection that reads the manifest — `--schema`, `--mcp`, completions, Fig — sees
 * a string and nothing else, and a symbol is invisible to `JSON.stringify` and `Object.keys`.
 * A declaration with no `Record` is returned as it came.
 */
function based<T extends object>(declared: T): T {
  let node = declared;
  // `description` and `summary`, the first two of the keys a node carries: named once, in `NODE_KEYS`.
  for (const key of NODE_KEYS.slice(0, 2)) {
    const text = (declared as Record<string, unknown>)[key];
    if (text instanceof Object) node = { ...node, [key]: Object.values(text as object)[0], [Symbol.for('burgee.l10n')]: declared };
  }
  return node;
}

export interface Program {
  name: string;
  version?: string;
  description?: Localised;
  /** Options read `PREFIX_OPTION_NAME` from the environment unless they name their own variable (V2). */
  envPrefix?: string;
  /** Characters of `--schema` output above which it is summarised (N13); 48,000 by default. */
  schemaBudget?: number;
  /**
   * Opt into config discovery (V6): `--config <path>` > `NAME_CONFIG` > `./name.config.{json,mjs,js,cjs}`
   * > `package.json#name` > the user config directory; `true` uses the program's name.
   */
  config?: boolean | { name: string };
  /** Shown under `Examples:` in root help; without them, each top-level command's first example is (agent-lint-conformance R6). */
  examples?: DeclaredExample[];
  /**
   * The credential a non-interactive caller supplies, by the environment variable it sets (agent-lint-conformance
   * R8). Declared, the program's exit-code contract lists `auth` and names the variable in its advice
   * and in an `AuthError`'s default hint; undeclared, the program claims no auth failure at all.
   */
  auth?: { env: string };
  commands: AnyCommand[];
}

export function defineCommand<const S extends OptionSpecs = OptionSpecs, const O extends CommandOutput = CommandOutput, const A extends readonly DeclaredArgument[] = readonly []>(command: Command<S, O, A>): Command<S, O, A> {
  // The reserved names of V5, `checkDefinition`'s four and N6's declared effects, in one
  // place, because `Manifest.use()` needs exactly these on a plugin's commands and used to
  // run none of them. A node with `load` and no `run` is runnable: its module has not been
  // imported, and what running it does to the world was knowable when it was declared.
  checkCommand(command.name, command as Declared);
  return command;
}

function addTree(manifest: Manifest, parent: string[], commands: AnyCommand[]): void {
  // default-command R1 — one default per level: with two, which one `tool` runs would be declaration order.
  const defaults = commands.filter((c) => c.default).map((c) => c.name);
  if (defaults[1]) throw new Error(`burgee: commands ${defaults.join(' and ')} of "${parent.join(' ')}" are both default; keep default: true on one`);
  for (const c of commands) {
    const path = [...parent, c.name];
    manifest.add({
      path,
      ...helpFields(c),
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
  // agent-lint-conformance R8 — help and `--schema` print the variable as the way to recover from
  // `auth`, so it has to be one a shell can set. Checked here, not in `definition.ts`: every
  // front-end loads that file, and only a native program declares `auth`.
  if (program.auth !== undefined && !/^[A-Z][A-Z\d_]*$/.test((manifest.auth = program.auth).env)) throw new Error('burgee: auth.env must name an environment variable, such as DEMO_TOKEN');
  if (program.config === true) manifest.config = { name: program.name };
  else if (typeof program.config === 'object' && program.config !== null) manifest.config = program.config;
  manifest.add({ path: [program.name], ...helpFields(program as AnyCommand) });
  addTree(manifest, [program.name], program.commands);
  return manifest;
}

export interface RunOptions {
  argv?: string[];
  /** Read by `--mcp`, which serves JSON-RPC over it; its `isTTY` is whether a person may be asked (N12). */
  stdin?: NodeJS.ReadableStream;
  /** The environment env-bound options read from. Injected by the harness; the process's own otherwise. */
  env?: Record<string, string | undefined>;
  /** `columns` is read when present, so help wraps to the terminal (H3); `isTTY` decides whether help is coloured (O2). */
  stdout?: { write: (s: string) => unknown; columns?: number; isTTY?: boolean };
  /** `isTTY` decides whether a failure adds its structured line (clispec-conformance R6): absent is a pipe. */
  stderr?: { write: (s: string) => unknown; isTTY?: boolean };
  /** Receives the E1 code. The default calls process.exit; an injected one may simply record it. */
  exit?: (code: number) => void;
  /** Where config discovery starts; the process's own otherwise. */
  cwd?: string;
  /** The entry file, whose nearest package.json owns the program's version (V4); `process.argv[1]` otherwise. */
  entry?: string;
  /**
   * The language help and refusals speak to a person, ahead of `BURGEE_LOCALE`, `LC_ALL`,
   * `LC_MESSAGES` and `LANG` (`localised-human-surfaces` R2). A BCP 47 tag, or `C` for the
   * program's own words; a registered plugin's `locales` supplies the translation. Machine
   * surfaces never read it (R3).
   */
  locale?: string;
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

/**
 * The text surface. Nothing and a string are printed here; anything else is `render.ts`'s,
 * a chunk loaded only for a result that needs it (U5), which also honours a result's own text.
 */
async function render(value: unknown): Promise<string> {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : (await import('./render.js')).render(value);
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
      ...(spec.short && { short: spec.short }),
      ...(spec.multiple && { multiple: true }),
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
  for (const [k, v] of Object.entries(values)) if (!k.startsWith(NO) || !negatable(k)) out[camel(k)] = v;
  for (const token of tokens) {
    if (token.kind !== 'option') continue;
    const bare = negatable(token.name);
    if (bare) out[bare] = !token.name.startsWith(NO);
  }
  return out;
}

interface Resolved2 {
  values: Values;
  provenance: Record<string, Provenance>;
  explainText?: string | undefined;
}

/**
 * Every layer, read and resolved (V1) — what a run uses and what `config explain` prints.
 * Precedence is flag > env > config > package.json > default. Config is loaded lazily, only for
 * a program that opted in: the layers come from `config-layers.js` (U5), which reaches
 * `seniority/config` the same way.
 */
async function resolution(manifest: Manifest, specs: Record<string, OptionSpec>, values: Values, io: Io): Promise<ReturnType<typeof resolveLayers>> {
  const layers: Layers = { flags: values, env: io.env };
  if (manifest.envPrefix !== undefined) layers.envPrefix = manifest.envPrefix;
  if (manifest.config !== undefined) Object.assign(layers, await (await import('./config-layers.js')).configLayers(manifest.config.name, values, io));
  return resolveLayers(specs, layers);
}

// eslint-disable-next-line maintainability/max-parameters -- the fifth is the token list `as-typed.js` needs to name a flag as typed; an options object would cost the startup path bytes that `weight.test.ts`'s budget for `.` does not have.
async function resolveValues(manifest: Manifest, specs: Record<string, OptionSpec>, values: Values, io: Io, tokens: readonly Token[]): Promise<Resolved2> {
  const resolved = await resolution(manifest, specs, values, io);
  const out: Resolved2 = { values: resolved.values as Values, provenance: resolved.provenance };
  const asked = values['explain'];
  // `--explain` is 1,018 bundled bytes and one more module that a program which never explains
  // its configuration should not carry. Lazy here, and at `seniority/explain` rather than in
  // `seniority/precedence`, because a re-export from a module the engine imports statically
  // would have kept it on the startup path however this line were written.
  // `as-typed.js` rides the same import: the two places a flag's provenance is read — the
  // `--json` envelope and `--explain` — are the two that load it, and it names each flag as
  // it was typed before either reads it (see that file).
  // Stryker disable next-line ConditionalExpression: equivalent — loading `as-typed.js` on every run renames flag locations only `--json` and `--explain` print, and returns no text unless `--explain` names an option
  if (values.json === true || asked !== undefined) out.explainText = (await import('./as-typed.js')).asTyped(resolved, specs, tokens, asked, io);
  for (const [name, spec] of Object.entries(specs)) {
    if (out.values[name] === undefined && spec.required && out.explainText === undefined) {
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
export type Token = NonNullable<ReturnType<typeof parseArgs>['tokens']>[number];

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
  /** `isTTY` is read by help's colour only (O2), in `surfaces.ts`: an output decision, never whether to ask. */
  out: { write: (s: string) => unknown; isTTY?: boolean };
  err: { write: (s: string) => unknown; isTTY?: boolean };
  env: Record<string, string | undefined>;
  exit: (code: number) => void;
  width: number;
  stdin: NodeJS.ReadableStream;
  cwd: string;
  /** The package.json owning the entry file, read once (V4). */
  pkg: Package | undefined;
  /** Where `ctx.onExit` registers, and what `leave` runs before the exit (E5, O5). */
  teardown: Teardown;
  /** `RunOptions.locale`, read only by the prose paths (`localised-human-surfaces` R2). */
  locale?: string | undefined;
}
interface Outcome {
  json: boolean;
  /** How the success is written when a registered format or `--max-bytes` was typed (N15, RF, R3). */
  print?: Print | undefined;
  data?: unknown;
  /** Text to print and leave OK: help, a version, an explanation. */
  text?: string;
  provenance?: Record<string, Provenance>;
  /** What an idempotent command reports (N7); read from the data's own `changed`. */
  changed?: boolean | undefined;
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

/**
 * A flag `fields.js` reads off argv: N14's `--json=<fields>`, `agent-headroom`'s `--format`
 * (RF; N15's `agent` is one registered format) and `--max-bytes` (R3), and the globals of
 * agent-lint-conformance R1–R3 (`--color`, `--no-color`, `--quiet`, `-q`, `--timeout`), which it
 * hands to `globals.js`. One test and one lazy load for all of them: the startup bundle had 3
 * bytes under its ceiling, and a second loader cost 42. `--format=json` loads it too, and is
 * handed straight back for the spelling that answers it.
 */
const readsLazily = (arg: string): boolean => /^(--json=|-q$|--(no-color|quiet|color|timeout|format|max-bytes)(=|$))/.test(arg);

// eslint-disable-next-line maintainability/cognitive-complexity -- parse-refusals' gate is inline: as a helper it cost B4's core bundle ceiling (24,282 B) the bytes it does not have, and the branch it adds is one `if`.
async function dispatch(manifest: Manifest, { node, rest: typed, name }: Resolved, io: Io): Promise<Outcome> {
  // N14's selection, the formats, the budget and the R1–R3 globals are imported only when a caller
  // typed one of them (M2): every other run pays nothing for any. A listing — `--json=`'s fields or
  // `--format`'s formats — comes back as `text`, and the handler never runs.
  const select = typed.some(readsLazily) ? await import('./fields.js') : undefined;
  const { args: rest, fields, print, global, text } = select?.lazyArgs(typed, node, manifest.plugins) ?? ({ args: typed } as LazyArgs);
  if (text) return { json: true, text };
  const parsed = builtin('node:util').parseArgs({ args: rest, options: toParseConfig(node.options, manifest.config !== undefined), allowPositionals: true, strict: true, tokens: true });
  const flags = canonical(parsed.values as Values, node.options, parsed.tokens);
  const json = flags.json === true;
  // F2 — help as data when both flags are given. It printed the same prose as `--help`, so a
  // caller who asked for a machine-readable answer got one they had to parse: the exact
  // failure the `--json` surface exists to avoid, on the flag people type first.
  // Help and the version are surfaces (U5): `surfaces.js` is imported only when one is asked for.
  if (flags.help) return { json, text: await (await import('./surfaces.js')).helpFor(manifest, node, io, { json, color: global?.color }) };
  if (flags.version) return { json, text: `${(await import('./surfaces.js')).versionOf(manifest, io)}\n` };

  const resolved = await resolveValues(manifest, node.options, flags, io, parsed.tokens);
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
  // A missing argument, and parse-refusals R1/R3: a surplus positional and a flag given twice were
  // dropped, and the run reported success with the wrong input. All three are one chunk (M2), loaded
  // only when the count of positionals is not the declared one, or when there are more tokens than
  // positionals, `--` tail and value keys together: parseArgs keeps one value per option it saw and is
  // given no defaults, so an option named twice is one token more than its key (a `--` is one more
  // too, and loads the chunk for nothing). Inline, not a helper: B4's bundle ceiling had no room for one.
  if (positionals.length !== (node.arguments?.length ?? 0) || parsed.tokens.length > positionals.length + passthrough.length + Object.keys(parsed.values).length) (await import('./parse-refusals.js')).refuse(node, positionals, parsed, rest, typed);
  // typed-positionals R2 — each declared positional by name: a variadic one takes the rest, an absent
  // one its default. R3's types and choices are their own chunk (M2), loaded only for a command whose
  // arguments declare one, so a program of plain words carries the naming and nothing else. S4's `-`
  // rides the same load: standard input is only ever a `type: 'file'` argument's.
  let given: Pick<RunContext, 'args' | 'stdin'> = { args: Object.fromEntries((node.arguments ?? []).map((a, i) => [a.name, a.variadic ? positionals.slice(i) : (positionals[i] ?? a.default)])) };
  // Stryker disable next-line ConditionalExpression: loading the chunk for a command of plain words changes no result, only what start-up loads, which benchmarks/cold-start-modules.test.ts locks by name
  if (node.arguments?.some((a) => a.type ?? a.choices)) given = (await import('./typed-args.js')).typedArgs(node, given.args, parsed, rest, typed, io.stdin);
  // M5, from its own chunk, loaded only for a deprecated command; `--quiet` silences it (R2).
  if (node.deprecated) (await import('./deprecation.js')).warnDeprecated(node, io, global?.quiet);
  await manifest.fire('preRun', name, values);
  // `env`, `onExit`, `agent`, `interactive`, `signal`, `quiet` and `runtime` come from `ctx.js`, a
  // chunk loaded on this path only: whether a person may be asked is roundel's rule, over stdin
  // (D-20260930-one-interactive-rule). `--timeout` races the handler against its deadline (R3).
  const ran = node.run({ options: values, ...given, positionals, passthrough, exit: ctxExit, actionRequired, ...(await import('./ctx.js')).ctxOf(io, global) });
  const data = await (global?.within(ran) ?? ran);
  await manifest.fire('postRun', name, values);
  const changed = changedOf(node, data);
  const selected = fields && select ? select.selectFields(data, fields) : data;
  // `emit` leaves an undefined `changed` out of `meta`, so it is handed on as it is.
  return { json, print, data: selected, provenance, changed };
}

/** Success: help, or the data on the requested surface. */
async function emit(io: Io, outcome: Outcome): Promise<void> {
  if (outcome.text !== undefined) {
    io.out.write(outcome.text);
    return await leave(io, ExitCode.OK);
  }
  // `meta.provenance` says where every option value came from (V3) — the difference between one call and five for an agent.
  const meta = { provenance: outcome.provenance, ...(outcome.changed === undefined ? {} : { changed: outcome.changed }) };
  // `ok` is the exit code's verdict, not "the handler returned": a result that names a non-zero
  // `exitCode` (a `check` refusal, `migrate` with refusals) leaves non-zero, so it says `false`.
  const code = exitCodeOf(outcome.data);
  const envelope = { ok: code === ExitCode.OK, data: outcome.data, meta };
  io.out.write(outcome.print?.(envelope, outcome.json, io) ?? (outcome.json ? `${JSON.stringify(envelope)}\n` : `${await render(outcome.data)}\n`));
  return await leave(io, code);
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
async function report(cause: unknown, { manifest, io, argv, json, name }: FailureContext): Promise<string[] | void> {
  // U5 — the whole failure vocabulary is its own chunk: a run that succeeds never loads it.
  const { describeFailure, reportFailure } = await import('./failure.js');
  const failure = await describeFailure(cause, { manifest, argv }, resolveCommand(manifest, argv) ?? undefined, cause instanceof ActionRequired ? cause.spec : undefined);
  // Nothing is reported and nothing has run: the caller runs this line instead (`execute`).
  if (failure.again) return failure.again;
  if (failure.silent) return await leave(io, failure.code);
  await manifest.fire('onError', name, {});
  await reportFailure(failure, manifest, json, io);
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
    // What the run was given, under every field below that resolves it: so `locale`
    // (`localised-human-surfaces` R2) reaches the prose paths without a line of its own.
    ...opts,
    out,
    err: opts.stderr ?? host.stderr,
    env: opts.env ?? host.env,
    exit: opts.exit ?? processExit,
    width: out.columns ?? HELP_WIDTH,
    stdin: opts.stdin ?? host.stdin,
    cwd: opts.cwd ?? host.cwd(),
    pkg: owningPackage(opts.entry ?? host.argv[1] ?? host.cwd()),
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
  // One pass over argv, from resolution to the exit. A refusal whose only fault was how JSON was
  // asked for runs nothing and hands back the same words with `--json` where it is read, for the
  // next pass (D-20261009-json-asked-is-json). That line skips the parse hook, which had its words.
  const pass = async (next: string[] | Promise<string[]>): Promise<string[] | void> => {
    try {
      argv = await next;
      // facade-projection-fidelity R5 — each alias typed in a command's place becomes that command's
      // name, so dispatch, help, `--schema` and `__complete` all read one spelling. Its own chunk (M2),
      // loaded only for a program that declares an alias.
      if (manifest.commands.some((c) => c.aliases)) argv = (await import('./aliases.js')).unalias(manifest, argv, root);
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
  };
  // The parse hook's promise goes in unawaited, so a hook that rejects is reported like any refusal.
  let next: string[] | Promise<string[]> | void = manifest.declares('parse') ? manifest.parse([...typed]) : typed;
  // eslint-disable-next-line reliability/no-await-in-loop -- each pass runs the line the one before it handed back, so none can start before the last has refused
  while (next) next = await pass(next);
}

/**
 * M6: which command argv names, or null — the same longest-prefix match `execute` uses, over the
 * declared names. An alias is not read here: `execute` rewrites one to its command's name before it
 * resolves (`aliases.ts`, facade-projection-fidelity R5), and that chunk is loaded only on a run, so
 * this function stays synchronous and off the startup path. Pass the canonical words.
 */
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
export async function runCommand(manifest: Manifest, argv: readonly string[], opts: Pick<RunOptions, 'env' | 'cwd' | 'entry' | 'stdin' | 'locale'> = {}): Promise<RunResult> {
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
export async function run<S extends OptionSpecs, A extends readonly DeclaredArgument[] = readonly []>(target: Command<S, CommandOutput, A> | Manifest, opts: RunOptions = {}): Promise<void> {
  if (target instanceof Manifest) return await execute(target, opts);
  const manifest = new Manifest();
  manifest.rootPath = [target.name];
  // Every declared field, through the same copy `defineProgram` uses. This listed three by
  // hand, so the `effects` `defineCommand` requires never reached `--mcp` (the tool said
  // `undeclared`), and `examples`, `arguments` and `relations` never reached help or the schema.
  manifest.add({
    path: [target.name],
    ...helpFields(target as AnyCommand),
    ...(target.run && { run: target.run as (ctx: RunContext) => unknown }),
  });
  return await execute(manifest, opts);
}

export { beforeTerminator } from './argv.js';
