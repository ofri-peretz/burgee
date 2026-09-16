/**
 * What must be true of a command's declaration before it is added — whoever declared it.
 *
 * Split out of `validate.ts` on 2026-09-16, and the weight lock is what asked for it. That
 * file holds two unrelated jobs: these checks, which run once when a program is built, and
 * the run-time half — relations, numbers, choices, Standard Schema — which runs on every
 * invocation and is four fifths of the bytes. Nothing minded while the only caller was
 * `defineCommand`, because the engine carries both anyway.
 *
 * The plugin host is what made it matter. `Manifest.use()` has to run these checks, so
 * `plugin.ts` imports them, so **every** graph that reaches the manifest now reaches them —
 * and that includes the commander and yargs front-ends, which reach the manifest and nothing
 * else of the engine. Importing `validate.js` for `checkDefinition` put 6,409 bytes of
 * run-time coercion into both front-ends to get 1,600 bytes of definition checking, and took
 * `./commander` over 128,000 — the budget that exists to prove the front-end is no heavier
 * than commander's own `lib/`. One file per job, and the front-ends pay for the job they use.
 */
import { type OptionSpec } from './manifest.js';
import { kebab } from './names.js';

const TYPES = new Set(['string', 'boolean', 'number']);

/** Reserved names a command may not redefine (V5): the surfaces every program serves. */
const RESERVED = new Set(['json', 'help', 'schema', 'mcp', 'version', 'explain']);

/**
 * What must be true of a declaration before anything runs (yargs #1198, #887, #1679):
 * a known type, one short alias per command, no two keys that meet on the command line.
 */
export function checkDefinition(name: string, options: Record<string, OptionSpec>): void {
  const shorts = new Map<string, string>();
  const flags = new Map<string, string>();
  for (const [key, spec] of Object.entries(options)) {
    if (!TYPES.has(spec.type)) throw new Error(`burgee: option "${key}" of "${name}" has unknown type "${String(spec.type)}"`);
    if (spec.short !== undefined) {
      const owner = shorts.get(spec.short);
      if (owner !== undefined) throw new Error(`burgee: options "${owner}" and "${key}" of "${name}" both use -${spec.short}`);
      shorts.set(spec.short, key);
    }
    const flag = kebab(key);
    const clash = flags.get(flag);
    if (clash !== undefined) throw new Error(`burgee: options "${clash}" and "${key}" of "${name}" are both --${flag}`);
    flags.set(flag, key);
    if ((spec.minimum !== undefined || spec.maximum !== undefined || spec.integer !== undefined) && spec.type !== 'number') {
      throw new Error(`burgee: option "${key}" of "${name}" declares a numeric bound but is not a number`);
    }
  }
}

/**
 * The whole door: the reserved names of V5, then {@link checkDefinition}.
 *
 * This exists as one function because it was two. `defineCommand` ran both; `Manifest.use()`
 * ran neither, so a plugin's command was admitted unread — and a plugin option named `json`
 * did not clash with the envelope flag, it replaced it in the parse config. The fix is not a
 * second copy of the guard beside `use()`; it is that there is one guard and both callers
 * reach it, which is the only arrangement a reader can check by looking.
 */
export function checkCommand(name: string, options: Record<string, OptionSpec>): void {
  for (const key of Object.keys(options)) {
    if (RESERVED.has(key) || RESERVED.has(kebab(key))) throw new Error(`burgee: option "${key}" is reserved and cannot be redefined`);
  }
  checkDefinition(name, options);
}
