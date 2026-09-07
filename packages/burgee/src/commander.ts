/**
 * `burgee/commander` — commander's public surface, implemented over burgee's
 * engine. It does **not** depend on commander (J9): a user installs burgee and
 * nothing else, which `weight.test.ts` asserts.
 *
 * Every command declared here lands in the same manifest a native
 * `defineCommand` fills, so the surfaces (`--json`, `--schema`, `--mcp`,
 * completions) and the plugin hooks apply identically — J2, J7, J8.
 *
 * This is a proving slice of the surface, not the full 151 methods; the rest
 * lands in wave 2 graded by commander's own 1,215 tests.
 */
import { Manifest, type OptionSpec, type Plugin } from './manifest.js';

type Action = (options: Record<string, unknown>, command: Command) => unknown;

/** Names that would reach Object.prototype if used as a key. */
const POLLUTING = new Set(['__proto__', 'constructor', 'prototype']);

function parseFlags(flags: string): { name: string; type: 'string' | 'boolean' } {
  // Leading underscore is legal in a flag name, and `__proto__` is exactly the case
  // the guard below exists for — so the pattern must match it in order to reject it.
  const long = /--([a-zA-Z_][\w-]*)/.exec(flags);
  const name = long?.[1] ?? flags;
  if (POLLUTING.has(name)) {
    throw new Error(`burgee: option name "${name}" is not allowed — it would reach Object.prototype`);
  }
  return { name, type: flags.includes('<') || flags.includes('[') ? 'string' : 'boolean' };
}

/** Option maps have a null prototype, so a key can never reach Object.prototype. */
function setOption(options: Record<string, OptionSpec>, name: string, spec: OptionSpec): void {
  Object.defineProperty(options, name, { value: spec, enumerable: true, writable: true, configurable: true });
}

export class Command {
  readonly manifest: Manifest;
  #path: string[];

  constructor(name = '', manifest = new Manifest(), path: string[] = []) {
    this.manifest = manifest;
    this.#path = name === '' ? path : [...path, name];
    if (this.#path.length > 0 && this.manifest.find(this.#path) === undefined) {
      this.manifest.add({ path: this.#path, options: Object.create(null) as Record<string, OptionSpec> });
    }
  }

  #node(): {
    path: string[];
    options: Record<string, OptionSpec>;
    description?: string;
    run?: (ctx: { options: Record<string, unknown> }) => unknown;
  } {
    const found = this.manifest.find(this.#path);
    if (found === undefined) throw new Error(`no manifest node for ${this.#path.join(' ')}`);
    return found as never;
  }

  name(value: string): this {
    this.#path = [value];
    if (this.manifest.find(this.#path) === undefined) {
      this.manifest.add({ path: this.#path, options: Object.create(null) as Record<string, OptionSpec> });
    }
    return this;
  }

  description(value: string): this {
    this.#node().description = value;
    return this;
  }

  option(flags: string, description?: string): this {
    const { name, type } = parseFlags(flags);
    setOption(this.#node().options, name, { type, ...(description === undefined ? {} : { description }) });
    return this;
  }

  requiredOption(flags: string, description?: string): this {
    const { name, type } = parseFlags(flags);
    setOption(this.#node().options, name, {
      type,
      required: true,
      ...(description === undefined ? {} : { description }),
    });
    return this;
  }

  command(name: string): Command {
    return new Command(name, this.manifest, this.#path);
  }

  action(handler: Action): this {
    const node = this.#node();
    node.run = (ctx: { options: Record<string, unknown> }) => handler(ctx.options, this);
    return this;
  }

  /**
   * Additive, and the point of the whole exercise: a commander-syntax program
   * gains plugins commander itself has never had (#2505, unlanded).
   */
  use(plugin: Plugin): this {
    this.manifest.use(plugin);
    return this;
  }
}

export function createCommand(name?: string): Command {
  return new Command(name);
}
