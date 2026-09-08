/**
 * The manifest — the one thing every surface is a projection of.
 *
 * Commands reach it through a façade (`burgee/commander`, `burgee/yargs`) or
 * natively, and it does not record which. That is the whole reason a plugin
 * written once works on every rung of the adoption ladder (J7, J8).
 */
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
}

/**
 * What running a command does to the world (N6). Declared, never inferred: it decides
 * whether the command is exposed as an MCP tool at all (N2) and generates the tool's
 * `readOnlyHint` / `idempotentHint` / `destructiveHint` — MCP defaults `destructiveHint`
 * to true, so silence is the dangerous reading.
 */
export type Effects = 'read_only' | 'idempotent' | 'non_idempotent';

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
  /** Required for a command to be served as an MCP tool (N2, N6). */
  effects?: Effects;
  run?: (ctx: RunContext) => unknown;
  /** Which plugin contributed this, if any. Declared, never diffed (M3). */
  plugin?: string;
}

/** A hook may declare which commands it applies to, as data. */
export interface HookFilter {
  command?: RegExp;
}

export interface Hook {
  filter?: HookFilter;
  handler: (ctx: { command: string; options: Record<string, unknown> }) => void | Promise<void>;
}

export interface Plugin {
  name: string;
  commands?: CommandNode[];
  hooks?: { preRun?: Hook; postRun?: Hook; onError?: Hook };
  enforce?: 'pre' | 'post';
}

export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
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
    this.commands.push(node);
  }

  use(plugin: Plugin): void {
    this.plugins.push(plugin);
    for (const command of plugin.commands ?? []) {
      this.add({ ...command, plugin: plugin.name });
    }
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
