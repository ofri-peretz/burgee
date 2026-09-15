/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The plugin host for closeout's half of the contract
 * (`plugin-contract` R1, R5a, R6, R8).
 *
 * A plugin is one plain object shared by the whole family. This file keeps the key closeout
 * understands — `handlers`, cleanup with a declared phase — and **ignores every other key
 * without complaining**, which is what makes the same object work on any subset of the
 * family that is installed. A plugin written for flagstaff registers here and contributes
 * nothing; its `spinners` and `components` are not closeout's business and are not an error.
 *
 * **Nothing here imports another layer, and the plugin shape is declared rather than
 * imported** (R3). It imports `./registry.js` because that is this package's own module —
 * the phase vocabulary has to have exactly one home or `phase: 'restore'` means one thing in
 * the validator and another in the runner.
 *
 * ## What `phase` buys, and why it is the whole point
 *
 * The load-bearing sentence in R5a is *"so a plugin's cleanup runs before terminal restore
 * and never after it"*. A handler that runs after the cursor is back and raw mode is off
 * cannot clean up what it was registered to clean up — it writes its "releasing lock…" line
 * into a terminal that has already been handed back, and whatever it was guarding is
 * released after the user got their prompt.
 *
 * Registration order cannot give that guarantee to a *plugin*, because a plugin's registration
 * moment is decided by whoever imported it, and the restore's registration moment is decided
 * by whichever renderer hid the cursor first. Both are import order wearing a lanyard. So the
 * order is data: a handler declares a phase, {@link PHASES} declares the sequence, and the
 * runner reads the sequence rather than the arrival times.
 *
 * ## R7, honestly
 *
 * `plugin-contract` R7 says no key may require a function except a component's `frame` and
 * burgee's `hooks`. `handlers` requires one: an exit handler *is* behaviour, and there is no
 * data encoding of "close this socket". What R5a asks for, and what this delivers, is that
 * the **ordering** is data — inspectable, diffable, and printable by a `plugin check` without
 * running anything. R7's exemption list owes `handlers.run` an entry; that edit belongs to
 * the lane that owns `plugin-contract`, and is recorded in this package's `design.md` rather
 * than left in a commit message.
 */
import { DEFAULT_PHASE, type ExitHandler, type HandlerSpec, PHASES, type Phase } from './registry.js';

/**
 * The plugin contract version. One number for the family — the same `1` flagstaff declares,
 * written out rather than imported for the reason in the file comment above.
 */
export const CONTRACT = 1;

/**
 * The phases a plugin may put a handler in.
 *
 * `restore` is deliberately **not** one of them. It is closeout's own phase, it runs last,
 * and it is where the cursor and raw mode go; a plugin handler admitted to it could land
 * after the terminal was handed back, depending on nothing more than which of the two
 * registered first — which is precisely the coincidence phases exist to replace. R5a says
 * "never after it", and a rule enforced at the door is the only version of "never" a reader
 * can rely on.
 */
export const PLUGIN_PHASES = ['flush', 'release'] as const;

/** One contributed handler: a name to report it by, a phase to order it by, and the work. */
export interface PluginHandler {
  /** How the handler is named in a report — including the one the deadline prints. */
  name: string;
  /** Defaults to `release`. Never `restore`; see {@link PLUGIN_PHASES}. */
  phase?: (typeof PLUGIN_PHASES)[number];
  /** The cleanup itself. May be async; the phase is awaited before the next one begins. */
  run: ExitHandler;
}

/**
 * The keys closeout reads. Declared structurally: any object with these fields is a plugin
 * here, whatever else it carries.
 */
export interface Plugin {
  name: string;
  contract?: number;
  handlers?: readonly PluginHandler[];
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
 * Refuse a plugin that cannot contribute a handler, at the door.
 *
 * Every refusal here is a refusal rather than a silent drop, for the reason roundel's host
 * gives about a misspelt token: a handler that is quietly ignored looks like it worked, and
 * its author debugs the wrong thing — except that here the thing they are debugging is a
 * lock that was never released.
 */
export function validate(plugin: unknown): asserts plugin is Plugin {
  if (!isRecord(plugin)) throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin is a plain object', 'export an object, not a function or an array');
  if (typeof plugin['name'] !== 'string' || plugin['name'] === '') {
    throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin needs a name', 'add `name: "…"` — it is how a handler that hung is reported');
  }
  const contract = plugin['contract'];
  if (contract !== undefined && (!Number.isInteger(contract) || (contract as number) > CONTRACT)) {
    throw new PluginError(
      'E_PLUGIN_CONTRACT',
      `plugin "${plugin['name']}" declares contract ${String(contract)}; this closeout knows ${CONTRACT}`,
      'upgrade closeout, or lower the plugin’s contract',
    );
  }
  validateHandlers(plugin['handlers'], plugin['name']);
}

function validateHandlers(handlers: unknown, name: string): void {
  if (handlers === undefined) return;
  if (!Array.isArray(handlers)) {
    throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": handlers must be an array`, 'list them in an array — the phase decides the order, not the position');
  }
  for (const [index, handler] of (handlers as unknown[]).entries()) {
    const at = `plugin "${name}": handlers[${index}]`;
    if (!isRecord(handler)) throw new PluginError('E_PLUGIN_SCHEMA', `${at} is not an object`, 'each handler is `{ name, phase?, run }`');
    if (typeof handler['name'] !== 'string' || handler['name'] === '') {
      throw new PluginError('E_PLUGIN_SCHEMA', `${at} has no name`, 'add `name: "…"` — the deadline report names the handler that did not return');
    }
    if (typeof handler['run'] !== 'function') {
      throw new PluginError('E_PLUGIN_SCHEMA', `${at} has no run()`, 'add `run(info)` — the cleanup itself, sync or async');
    }
    const phase = handler['phase'];
    if (phase === undefined) continue;
    if (typeof phase !== 'string' || !(PLUGIN_PHASES as readonly string[]).includes(phase)) {
      throw new PluginError(
        'E_PLUGIN_SCHEMA',
        `${at}: ${JSON.stringify(phase)} is not a phase a plugin may use`,
        `use one of ${PLUGIN_PHASES.join(', ')} — "restore" is closeout’s own last phase, and a handler placed after it could not clean up what it was registered to clean up`,
      );
    }
  }
}

const order: Plugin[] = [];

/**
 * Register a plugin. Later wins, like ESLint flat config — but "wins" is a weaker word here
 * than it is for a colour token: handlers do not shadow each other, they accumulate. Order
 * is kept because two handlers in the same phase run in it, and because a `plugin check`
 * wants to print the list a reader will see.
 */
export function register(plugin: unknown): void {
  validate(plugin);
  order.push(plugin);
}

/** Forget every registered plugin. For tests, and for a program that re-plugs at runtime. */
export function reset(): void {
  order.length = 0;
}

/** The plugins registered, in registration order. */
export function registered(): readonly Plugin[] {
  return order;
}

/** One contributed handler, with the plugin it came from and the phase it resolved to. */
export interface Contribution {
  /** `"<plugin>:<handler>"` — the name a report prints. */
  id: string;
  phase: Phase;
  from: string;
  run: ExitHandler;
}

/**
 * Every handler every registered plugin contributed, in the order they will run.
 *
 * This is the static projection of the ordering, and the reason `phase` is worth having: a
 * caller — or `burgee plugin check` — reads the shutdown sequence without triggering one.
 */
export function contributions(): Contribution[] {
  const all: Contribution[] = [];
  for (const plugin of order) {
    for (const handler of plugin.handlers ?? []) {
      all.push({ id: `${plugin.name}:${handler.name}`, phase: handler.phase ?? DEFAULT_PHASE, from: plugin.name, run: handler.run });
    }
  }
  // Stable by phase: PHASES is the sequence, and two handlers in one phase keep the order
  // they were contributed in.
  return all.toSorted((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase));
}

/**
 * The half of a `Registry` this needs — declared structurally so a caller can attach
 * to something it built itself, and so this file does not pull the process wiring in.
 */
export interface HandlerHost {
  add(handler: ExitHandler, spec?: HandlerSpec): () => void;
}

/**
 * Hand every contributed handler to a closeout's registry, each in its own phase.
 *
 * Returns the function that takes them all back off, so a test — or a program that reloads
 * its plugins — can undo a registration without rebuilding the registry.
 *
 * **Registering does not run.** A plugin contributing cleanup must not decide *when*
 * shutdown happens; `attach()` wires, and the process (or the caller) triggers.
 */
export function attach(host: HandlerHost): () => void {
  /*
   * Each handler is registered under its contributed id, which is the whole reason a plugin
   * handler is required to carry a name. A plugin's cleanup is the handler least likely to be
   * a named function and most likely to be the one that hangs: it is somebody else's
   * anonymous closure, registered by a host that never saw its source. Passing the id here is
   * what turns "a handler did not return" into "acme:unlock did not return", which is the
   * sentence the whole package exists to be able to say.
   */
  const offs = contributions().map((c) => host.add(c.run, { phase: c.phase, label: c.id }));
  return () => {
    for (const off of offs) off();
  };
}
