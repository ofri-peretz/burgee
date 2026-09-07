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
}

export interface CommandNode {
  path: string[];
  description?: string;
  options: Record<string, OptionSpec>;
  run?: (ctx: { options: Record<string, unknown>; positionals: string[] }) => unknown;
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
}
