/* eslint-disable maintainability/no-missing-error-context, reliability/no-missing-error-context -- the rule only recognises `new Error(literal)`, so every refusal in this file reads as an error without a message: `PluginError`'s message is argument two, because argument one is the family's code. It is the same finding `packages/flagstaff/src/plugin.ts` carries an exemption for in eslint.config.mjs, on the same class and the same call shape — written inline here because a lane owns its package and not the root config. */
/**
 * The plugin host for burgee's half of the contract (`plugin-contract` R1, R6, R8).
 *
 * A plugin is one plain object shared by the whole family. This file keeps the keys burgee
 * understands — `commands`, `hooks`, and the `enforce` that orders them — and **ignores every
 * other key without complaining**, which is what makes the same object work on any subset of
 * the family that is installed. A plugin written for flagstaff registers here and contributes
 * nothing; its `tokens` and `spinners` are not burgee's business and are not an error.
 *
 * **Nothing here imports another layer**, and `./definition.js` is this package's own module:
 * the definition-time checks have to have exactly one home, or `json` means "reserved" to a
 * first-party command and "yours" to a plugin's — which is precisely what it meant until this
 * file existed.
 *
 * ## Why this file is the odd one in the family
 *
 * Every other host declared its `validate()` before anyone could have written a plugin for it.
 * burgee's extension point is **published**: 0.6.1 is on npm, `definePlugin` was `return
 * plugin;`, and `Manifest.use()` called `this.add()` directly rather than going through
 * `defineCommand`. So a plugin out there may already carry a command that this file now
 * refuses — and the worst of them is the one the first test in `plugin.test.ts` is named for.
 *
 * `toParseConfig` seeds `json: { type: 'boolean' }` and then writes every declared option over
 * the top of it. A plugin option named `json` therefore did not *clash* with the envelope
 * flag; it **replaced** it. On a framework whose entire agent-facing contract is that `--json`
 * prints machine-readable output, a third party could take that away from every caller by
 * naming an option, and nothing anywhere said so.
 *
 * ## What `contract` means here, and why absent is a refusal
 *
 * `contract` is the revision of the family plugin object the plugin was written against, and
 * burgee knows {@link CONTRACT}. The other hosts treat it as optional because nothing has ever
 * been written against them; burgee cannot, for the reason above. An object with no `contract`
 * is an object that was authored against a host which validated nothing, so the honest reading
 * of its silence is *unknown*, not *fine* — and it is refused with a message naming the
 * version, because a silent behaviour change on a published extension point is worse than a
 * loud breaking one. `definePlugin` stamps the number it was compiled against, so an author
 * who rebuilds never types it and an author who does not is told exactly what happened.
 */
import { checkCommand } from './definition.js';
import { type CommandNode, type Hook, type OptionSpec } from './manifest.js';

/**
 * The plugin contract version. One number for the family — the same `1` flagstaff, caique and
 * closeout declare, written out rather than imported because a layer never imports a layer.
 */
export const CONTRACT = 1;

/** The burgee this refuses a contract-less plugin on behalf of: the last one that accepted it. */
const UNVALIDATED = '0.6.1';

/**
 * The keys burgee reads. Declared structurally: any object with these fields is a plugin here,
 * whatever else it carries.
 */
export interface Plugin {
  name: string;
  contract?: number;
  commands?: CommandNode[];
  hooks?: { preRun?: Hook; postRun?: Hook; onError?: Hook };
  enforce?: 'pre' | 'post';
}

export type PluginErrorCode = 'E_PLUGIN_SCHEMA' | 'E_PLUGIN_CONTRACT';

/** A refused plugin says what is wrong and what to do about it — the family's one vocabulary. */
export class PluginError extends Error {
  constructor(
    readonly code: PluginErrorCode,
    message: string,
    readonly fix: string,
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `'pre'` first, then unordered, then `'post'` — the Vite/Rolldown convention, as data.
 *
 * A third spelling was accepted. `Manifest.ordered()` looks the value up in a two-key table,
 * so `enforce: 'mid'` made the comparator return `NaN`, and `NaN` is not an order: the sort
 * kept whatever arrangement the implementation happened to produce, for hooks whose whole
 * reason to declare a phase is that arrival order is not to be trusted.
 */
const ENFORCE: readonly string[] = ['pre', 'post'];

/** The three moments a hook may be fired at. A fourth spelling is a typo that never fires. */
const STAGES: readonly string[] = ['preRun', 'postRun', 'onError'];

const schema = (message: string, fix: string): PluginError => new PluginError('E_PLUGIN_SCHEMA', message, fix);

/**
 * Refuse a plugin that cannot contribute, at the door.
 *
 * `taken` is the command paths the manifest already serves. A contributed path that is already
 * declared is refused rather than merged, because the two projections disagree about which
 * node wins: `find()` answers the first on a path and `resolve()` the last, so the same
 * command reads one way to help and the other way to dispatch. Which of the two is right for a
 * *first-party* duplicate is a decision about every program rather than about plugins, and is
 * left alone here.
 */
export function validate(plugin: unknown, taken: readonly string[] = []): asserts plugin is Plugin {
  if (!isRecord(plugin)) throw schema('a plugin is a plain object', 'export an object, not a function or an array');
  const name = plugin['name'];
  if (typeof name !== 'string' || name === '') {
    throw schema('a plugin needs a name', 'add `name: "…"` — it is what a contributed command is attributed to');
  }
  checkContract(plugin['contract'], name);
  const enforce = plugin['enforce'];
  if (enforce !== undefined && !ENFORCE.includes(enforce as string)) {
    throw schema(
      `plugin "${name}": ${JSON.stringify(enforce)} is not an enforce`,
      `use ${ENFORCE.join(' or ')}, or leave it out`,
    );
  }
  checkHooks(plugin['hooks'], name);
  checkCommands(plugin['commands'], name, taken);
}

function checkContract(contract: unknown, name: string): void {
  if (contract === undefined) {
    throw new PluginError(
      'E_PLUGIN_CONTRACT',
      `plugin "${name}" declares no contract; burgee ${UNVALIDATED} and earlier validated none of it`,
      `rebuild it against this burgee — \`definePlugin\` stamps \`contract: ${CONTRACT}\` — or add that key by hand`,
    );
  }
  if (!Number.isInteger(contract) || (contract as number) < 1 || (contract as number) > CONTRACT) {
    throw new PluginError('E_PLUGIN_CONTRACT', `plugin "${name}" declares contract ${String(contract)}; this burgee knows ${CONTRACT}`, 'upgrade burgee, or lower the plugin’s contract');
  }
}

function checkHooks(hooks: unknown, name: string): void {
  if (hooks === undefined) return;
  if (!isRecord(hooks)) throw schema(`plugin "${name}": hooks must be an object`, 'map a stage to a hook: `{ preRun: { filter?, handler } }`');
  for (const [stage, hook] of Object.entries(hooks)) {
    if (!STAGES.includes(stage)) throw schema(`plugin "${name}": "${stage}" is not a hook stage`, `use one of ${STAGES.join(', ')}`);
    if (!isRecord(hook) || typeof hook['handler'] !== 'function') {
      throw schema(`plugin "${name}": ${stage} has no handler()`, 'add `handler(ctx)` — without one the TypeError arrives at fire() time, a run later');
    }
  }
}

function checkCommands(commands: unknown, name: string, taken: readonly string[]): void {
  if (commands === undefined) return;
  if (!Array.isArray(commands)) throw schema(`plugin "${name}": commands must be an array`, 'list them in an array of `{ path, options, … }` nodes');
  const seen = new Set(taken);
  for (const [index, node] of (commands as unknown[]).entries()) {
    const at = `plugin "${name}": commands[${index}]`;
    if (!isRecord(node) || !Array.isArray(node['path']) || node['path'].length === 0) {
      throw schema(`${at} has no path`, 'add `path: ["…"]` — the words a user types');
    }
    const path = (node['path'] as string[]).join(' ');
    if (seen.has(path)) {
      throw schema(`${at} contributes "${path}", which is already declared`, 'rename it — find() answers the first node on a path and resolve() the last');
    }
    seen.add(path);
    /*
     * The whole point of the lane. `checkCommand` is what `defineCommand` calls, so a plugin's
     * command is now read by exactly the code a first-party one is read by — the reserved
     * names of V5 and `checkDefinition`'s four. It throws a plain `Error` there because that
     * is what a program author sees; here it is re-thrown under the family's code, so a plugin
     * author debugging against any layer has already learned this one (R8).
     */
    try {
      checkCommand(path, (node['options'] ?? {}) as Record<string, OptionSpec>);
    } catch (error) {
      throw schema(`${at}: ${(error as Error).message}`, 'a plugin command is declared exactly as a first-party one');
    }
  }
}

/**
 * Declare a plugin: typed, validated, and stamped with the contract it was compiled against.
 *
 * The stamp is the half that makes the refusal in `checkContract` fair. An author who builds
 * against this burgee gets `contract: 1` without typing it, so the only objects that reach
 * `use()` without one are objects built against a burgee that checked nothing — which is
 * exactly the population the version message is addressed to.
 */
export function definePlugin(plugin: Plugin): Plugin {
  const stamped: Plugin = { ...plugin, contract: plugin.contract ?? CONTRACT };
  validate(stamped);
  return stamped;
}
