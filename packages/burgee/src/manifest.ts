/**
 * The manifest — the one thing every surface is a projection of.
 *
 * Commands reach it through a façade (`burgee/commander`, `burgee/yargs`) or
 * natively, and it does not record which. That is the whole reason a plugin
 * written once works on every rung of the adoption ladder (J7, J8).
 */
export interface OptionSpec {
  type: 'string' | 'boolean';
  description?: string;
  required?: boolean;
  short?: string;
  default?: string | boolean;
  /** Environment variable consulted when the flag is absent (V2). Read from the injected env, never process.env directly. */
  env?: string;
  /** Allowed values; help renders `(one of: a, b)` (yargs #1408). */
  choices?: string[];
  /** The value's name in help: `--id <dataset-id>` (yargs #833). */
  placeholder?: string;
  /** `true` renders `(deprecated)`; a string names the replacement: `(deprecated: use --force)` (yargs #2248). */
  deprecated?: boolean | string;
  hidden?: boolean;
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
export interface RunContext {
  options: Record<string, unknown>;
  positionals: string[];
  passthrough: string[];
  env: Record<string, string | undefined>;
  /** Exit with an E1 code. Unwinds cleanly: the code is honoured and nothing is printed. */
  exit: (code: number) => never;
}

export interface CommandNode {
  path: string[];
  description?: string;
  /** Shown in command lists instead of the description (yargs #1265). */
  summary?: string;
  options: Record<string, OptionSpec>;
  arguments?: ArgumentSpec[];
  examples?: Example[];
  /** Heading this command is listed under in its parent's help (yargs #684). */
  group?: string;
  epilogue?: string;
  hidden?: boolean;
  deprecated?: boolean | string;
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
