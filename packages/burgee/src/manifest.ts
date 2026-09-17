/**
 * The manifest — the one thing every surface is a projection of.
 *
 * Commands reach it through a façade (`burgee/commander`, `burgee/yargs`) or
 * natively, and it does not record which. That is the whole reason a plugin
 * written once works on every rung of the adoption ladder (J7, J8).
 *
 * The plugin *shape* and its refusals live in `./plugin.js`, which is this package's host in
 * the sense `plugin-contract` means: one file per package owning `Plugin`, `validate()` and
 * the error vocabulary. `use()` below is burgee's `register()`.
 */
import { type Plugin, validate } from './plugin.js';

/**
 * The Standard Schema interface (standardschema.dev), declared here so any implementation
 * — zod, valibot, arktype — is accepted as an option's `schema` without a dependency (S1).
 */
export interface StandardSchemaV1<Output = unknown> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
  };
}
export type StandardResult<Output> = { readonly value: Output; readonly issues?: undefined } | { readonly issues: readonly { readonly message: string }[] };

/**
 * One option, declared once (S1). The key is the canonical camelCase name the handler
 * reads; the CLI form is derived as kebab-case (S5): `dryRun` is typed `--dry-run`.
 */
export interface OptionSpec {
  /** `boolean` never consumes a value (S7); `number` rejects NaN and Infinity (S3). */
  type: 'string' | 'boolean' | 'number';
  description?: string;
  required?: boolean;
  short?: string;
  default?: string | boolean | number | readonly string[] | readonly number[];
  /** Environment variable consulted when the flag is absent (V2). Read from the injected env, never process.env directly. */
  env?: string;
  /** Allowed values, enforced and shown as `(one of: a, b)` (yargs #1408, #1186). */
  choices?: readonly string[];
  /** Repeatable, and split on `separator` (`,` unless declared): `--tag a --tag b,c` → `['a', 'b', 'c']` (S8). */
  multiple?: boolean;
  separator?: string;
  /**
   * The other options this one requires: `--out --dependsOn force` is a usage error without
   * `--force` (S2). Sugar for a `{ implies: [this, other] }` relation per name, and nothing
   * else — one engine, one order, one error vocabulary.
   *
   * It exists as a second spelling because the first states the constraint away from the
   * option it constrains: a reader looking at `out` learns nothing from a `relations` entry
   * three keys down, and neither does the help line for `--out`. Both incumbents spell it on
   * the option (commander `.implies()`, yargs `.implies()`), and so does Fig, whose `Option`
   * declares this exact key.
   */
  dependsOn?: readonly string[];
  /**
   * The other options this one may not be given with (S2): `{ conflicts: [this, other] }` per
   * name. Commander's `.conflicts()`, yargs' `.conflicts()`, Fig's `exclusiveOn`.
   *
   * One-sided is enough — the relation it compiles to holds whichever of the two argv names
   * first — so declare it once, on whichever option the constraint belongs to.
   */
  exclusive?: readonly string[];
  /** `number` only. */
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  /** Any Standard Schema, run on the parsed value; its issues become a usage error (S1). */
  schema?: StandardSchemaV1;
  /** The value's name in help: `--id <dataset-id>` (yargs #833). */
  placeholder?: string;
  /** `true` renders `(deprecated)`; a string names the replacement: `(deprecated: use --force)` (yargs #2248). */
  deprecated?: boolean | string;
  hidden?: boolean;
  /** The shared set this option was copied from (M4); `--schema` carries it, help lists the option like any other. */
  sharedFrom?: string;
}

/** What a lazily loaded command module exports: the handler as `run` or as the default export (M2). */
export interface LazyModule {
  default?: (ctx: RunContext) => unknown;
  run?: (ctx: RunContext) => unknown;
}

/**
 * What running a command does to the world (N6). Declared, never inferred: it decides
 * whether the command is exposed as an MCP tool at all (N2) and generates the tool's
 * `readOnlyHint` / `idempotentHint` / `destructiveHint` — MCP defaults `destructiveHint`
 * to true, so silence is the dangerous reading.
 */
export type Effects = 'read_only' | 'idempotent' | 'non_idempotent';

/**
 * What a command may declare under `effects`: one of the three above, or `'withheld'`.
 *
 * `'withheld'` is not an effect and is deliberately not spelled like one. It answers a
 * different question — *may an agent call this?* — and it exists because the two questions
 * used to share one absence. `effects: undefined` meant both "I decided agents should not
 * have this" and "I forgot", and the second is the one that ships: the tool an author built
 * for an agent was simply not in `tools/list`, and nothing said so (N6).
 *
 * It is not `'none'`, which reads as *this command has no effects* — which is `read_only`,
 * the one value it could be confused with and the one confusion that would matter. Nor is it
 * a second field: a boolean beside a now-required `effects` would mean that declaring what a
 * command does to the world silently opts it in, and the default for *that* field would be
 * the silence this change exists to remove. One field, four answers, no default.
 *
 * {@link Effects} stays the three, because `annotationsOf` is total on them: a withheld
 * command has no hints, because it has no tool.
 */
export type DeclaredEffects = Effects | 'withheld';

/**
 * A relationship between options, validated after parsing and before choices and the
 * handler (S2, S6). `implies` takes a second option name, or a predicate over the values.
 */
export type Relation =
  | { exactlyOneOf: readonly string[] }
  | { atLeastOneOf: readonly string[] }
  | { atMostOneOf: readonly string[] }
  | { conflicts: readonly string[] }
  | { implies: readonly [string, string | ((values: Record<string, unknown>) => boolean)] };

/**
 * The option-level `dependsOn` / `exclusive` of {@link OptionSpec}, as the `Relation` union
 * the engine already enforces. Declaration order, options then their names, so two runs of
 * the same manifest publish the same list.
 */
export function optionRelations(options: Record<string, OptionSpec>): Relation[] {
  const out: Relation[] = [];
  for (const [key, spec] of Object.entries(options)) {
    for (const other of spec.dependsOn ?? []) out.push({ implies: [key, other] });
    for (const other of spec.exclusive ?? []) out.push({ conflicts: [key, other] });
  }
  return out;
}

/**
 * Every constraint on a command, from wherever it was declared: the command's own
 * `relations` first, then the ones its options spell on themselves.
 *
 * One function because there must be one answer. `validate.ts` enforces this list and
 * `schema.ts` publishes it, and a surface that computed its own would be the defect
 * `relations-schema.test.ts` was written for — an agent learning a constraint by being
 * refused, one round trip at a time.
 */
export function relationsOf(node: Pick<CommandNode, 'options' | 'relations'>): Relation[] {
  return [...(node.relations ?? []), ...optionRelations(node.options)];
}

/** A positional, as help documents it (yargs #2012). */
export interface ArgumentSpec {
  name: string;
  description?: string;
  required?: boolean;
  variadic?: boolean;
  default?: string;
}

/** One example: a single copy-pasteable command line, the description below it (H2). */
export interface Example {
  command: string;
  description?: string;
}

/** What a handler receives. `passthrough` is everything after `--`, verbatim (G5). */
/** What a caller must do before the command can continue (N11): synthesised into the envelope. */
export interface ActionRequiredSpec {
  /** A short machine-readable reason: `login`, `confirm`, `missing-config` … */
  reason: string;
  message: string;
  /** Runnable commands, each with when to run it; the engine prefixes the program and carries the caller's flags. */
  next?: readonly { command: string; when: string }[];
  hint?: string;
}

export interface RunContext {
  options: Record<string, unknown>;
  positionals: string[];
  passthrough: string[];
  env: Record<string, string | undefined>;
  /** Exit with an E1 code. Unwinds cleanly: the code is honoured and nothing is printed. */
  exit: (code: number) => never;
  /** A person may be prompted (N12): a terminal, no detected agent, or `FORCE_TTY=1`. */
  interactive: boolean;
  /** The agent the environment names, if any (N12). */
  agent?: string;
  /** Stop and tell the caller what to do instead of blocking on a prompt (N11). */
  actionRequired: (spec: ActionRequiredSpec) => never;
  /**
   * Cleanup that runs on **every** path out of the run (E5): a normal return, `ctx.exit`,
   * Ctrl-C, SIGTERM, a terminal closing, an uncaught throw. Returns the function that
   * unregisters it, for a command that cleaned up on its own.
   *
   * The handler runs after stdout has been drained (O5) and before the terminal is handed
   * back, and it runs exactly once however many of those arrive together. `label` is what a
   * breached shutdown deadline calls it; without one an arrow is reported as `(anonymous)`,
   * and the anonymous arrow is the shape that hangs.
   *
   * Typed here rather than re-exported from `closeout`, so a command's signature does not
   * change when that package's does.
   */
  onExit: (handler: () => void | Promise<void>, label?: string) => () => void;
}

export interface CommandNode {
  path: string[];
  description?: string;
  /** Shown in command lists instead of the description (yargs #1265). */
  summary?: string;
  options: Record<string, OptionSpec>;
  relations?: readonly Relation[];
  arguments?: ArgumentSpec[];
  examples?: Example[];
  /** Heading this command is listed under in its parent's help (yargs #684). */
  group?: string;
  epilogue?: string;
  hidden?: boolean;
  deprecated?: boolean | string;
  /**
   * What running it does to the world, or `'withheld'` (N2, N6). Required on a node that
   * runs — `checkCommand` refuses one that omits it — and optional on the type, because a
   * group carries no `effects` and the host front-ends build nodes that never reach that
   * door: commander and yargs have no notion of effects and their graded suites declare
   * none, so a façade's command is withheld in fact and cannot be made to say so.
   */
  effects?: DeclaredEffects;
  run?: (ctx: RunContext) => unknown;
  /**
   * The handler's module, imported on dispatch only (M2): the manifest — help, schema,
   * completions, MCP tool list — is complete from this node without loading it. A node
   * with `load` and no `run` gets a `run` that imports on first call.
   */
  load?: () => Promise<LazyModule>;
  /** Which plugin contributed this, if any. Declared, never diffed (M3). */
  plugin?: string;
}

/** `run` for a lazy node: the module is imported on the first call and never before (M2). */
export function lazyRun(load: () => Promise<LazyModule>): (ctx: RunContext) => unknown {
  let loaded: Promise<LazyModule> | undefined;
  return async (ctx) => {
    loaded ??= load();
    const mod = await loaded;
    const handler = mod.run ?? mod.default;
    if (handler === undefined) throw new Error('burgee: a lazy command module must export its handler as run or as the default export');
    return await handler(ctx);
  };
}

/** A hook may declare which commands it applies to, as data. */
export interface HookFilter {
  command?: RegExp;
}

export interface Hook {
  filter?: HookFilter;
  handler: (ctx: { command: string; options: Record<string, unknown> }) => void | Promise<void>;
}

/** Rolldown's lesson: evaluate the filter before crossing the boundary. */
export function hookApplies(hook: Hook | undefined, command: string): hook is Hook {
  if (hook === undefined) return false;
  return hook.filter?.command === undefined || hook.filter.command.test(command);
}

const ORDER = { pre: 0, post: 2 } as const;

export class Manifest {
  readonly commands: CommandNode[] = [];
  readonly plugins: Plugin[] = [];
  /** The program's own name, which the user never types; `execute` strips it. */
  rootPath: string[] = [];
  /** Reported by `--schema`, `--version` and the MCP handshake; the owning package.json otherwise (V4). */
  version?: string;
  /** With a prefix, every option reads `PREFIX_OPTION_NAME` unless it names its own env (V2). */
  envPrefix?: string;
  /** Config discovery is opt-in; the name is the file stem and the package.json field (V6). */
  config?: { name: string };
  /** Characters of `--schema` output above which it is summarised (N13). */
  schemaBudget?: number;

  add(node: CommandNode): void {
    // A lazy node is runnable from the descriptor alone; its module loads on dispatch (M2).
    this.commands.push(node.load !== undefined && node.run === undefined ? { ...node, run: lazyRun(node.load) } : node);
  }

  /**
   * Register a plugin, after the plugin host has read it (`plugin.ts`).
   *
   * Nothing is pushed until everything has been checked, so a refused plugin contributes no
   * command and leaves no half-registration behind: `use()` used to push first and read the
   * object afterwards, which is how `use(undefined)` became a `TypeError` one line later.
   */
  use(plugin: Plugin): void {
    validate(
      plugin,
      this.commands.map((c) => c.path.join(' ')),
    );
    this.plugins.push(plugin);
    // Through the same guard `defineCommand` runs (V5 + checkDefinition), by way of `validate`
    // above — a plugin's command is declared exactly as a first-party one and is read as one.
    for (const command of plugin.commands ?? []) this.add({ ...command, plugin: plugin.name });
  }

  /** `enforce: 'pre'` first, then unordered, then `'post'` — the Vite/Rolldown convention. */
  private ordered(): Plugin[] {
    return [...this.plugins].sort(
      (a, b) => (a.enforce === undefined ? 1 : ORDER[a.enforce]) - (b.enforce === undefined ? 1 : ORDER[b.enforce]),
    );
  }

  async fire(
    stage: 'preRun' | 'postRun' | 'onError',
    command: string,
    options: Record<string, unknown>,
  ): Promise<void> {
    for (const plugin of this.ordered()) {
      const hook = plugin.hooks?.[stage];
      if (hookApplies(hook, command)) await hook.handler({ command, options });
    }
  }

  find(path: string[]): CommandNode | undefined {
    const key = path.join(' ');
    return this.commands.find((c) => c.path.join(' ') === key);
  }

  /**
   * Longest-prefix match of argv against declared command paths. The root's own
   * name is not typed by the user, so it is skipped when matching.
   */
  resolve(argv: string[], root: string[] = []): { node: CommandNode | undefined; rest: string[] } {
    let best: CommandNode | undefined;
    let depth = 0;
    for (const node of this.commands) {
      const typed = node.path.slice(root.length);
      if (typed.length > argv.length) continue;
      if (typed.every((seg, i) => argv[i] === seg) && typed.length >= depth) {
        best = node;
        depth = typed.length;
      }
    }
    return { node: best, rest: argv.slice(depth) };
  }
}

/**
 * Re-exported so a façade importing `Plugin` keeps importing it from the module it registers
 * against. The declaration itself lives in `./plugin.js`, which is the host file the family's
 * locks read.
 */
export type { Plugin };
