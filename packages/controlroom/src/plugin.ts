/**
 * R10 — plugins. Keymaps and panes register through one `register()`, against the family
 * schema (`schema.json`, flagstaff's, synced here). Everything in a contribution is data: a
 * keymap is key spec → action name, a pane names a flagstaff component and a label. A tab bar
 * is a pane over flagstaff's `tab-bar` component, so it needs no key of its own.
 *
 * The built-ins go through the same door: the `default` keymap below is registered by this
 * module, and a user replaces it by registering their own `default`.
 */
import { canonical, KeysError } from 'caique/keys';

export const CONTRACT = 1;

/** A keymap: key spec → action name, and the label each action shows in the hint line. */
export interface KeymapDef {
  keys: Readonly<Record<string, string>>;
  labels?: Readonly<Record<string, string>>;
}

/** A pane as data: the flagstaff component that draws it, and the label a static projection prints. */
export interface PaneDef {
  component: string;
  label?: string;
}

export interface Plugin {
  name: string;
  contract?: number;
  keymaps?: Readonly<Record<string, KeymapDef>>;
  panes?: Readonly<Record<string, PaneDef>>;
}

/** The family's refusal vocabulary, the members this host can raise. */
export type PluginErrorCode = 'E_PLUGIN_SCHEMA' | 'E_PLUGIN_CONTRACT' | 'E_NO_CONTRIBUTION';

/** A refused plugin says what is wrong, where, and what to do about it. */
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
const isStrings = (v: unknown): boolean => isRecord(v) && Object.values(v).every((s) => typeof s === 'string' && s !== '');

function validateKeymap(name: string, def: unknown): void {
  if (!isRecord(def) || !isStrings(def['keys'])) throw new PluginError('E_PLUGIN_SCHEMA', `keymaps.${name}.keys must map key specs to action names`, "write `keys: { left: 'tab.prev' }`");
  if (def['labels'] !== undefined && !isStrings(def['labels'])) throw new PluginError('E_PLUGIN_SCHEMA', `keymaps.${name}.labels must map action names to labels`, "write `labels: { 'tab.prev': 'switch tab' }`");
  for (const spec of Object.keys(def['keys'] as Record<string, string>)) {
    try {
      canonical(spec);
    } catch (error) {
      // caique owns what a key is called, so its message and fix are the ones an author reads.
      const { message, fix } = error as KeysError;
      throw new PluginError('E_PLUGIN_SCHEMA', `keymaps.${name}: ${message}`, fix);
    }
  }
}

function validatePane(name: string, def: unknown): void {
  if (!isRecord(def) || typeof def['component'] !== 'string' || def['component'] === '') {
    throw new PluginError('E_PLUGIN_SCHEMA', `panes.${name} must name the flagstaff component that draws it`, "write `component: 'log-tail'`");
  }
  if (def['label'] !== undefined && typeof def['label'] !== 'string') throw new PluginError('E_PLUGIN_SCHEMA', `panes.${name}.label must be a string`, 'make the label the text a pipe prints above the pane');
}

/** Refuse what the schema refuses, and say why. */
export function validate(plugin: unknown): asserts plugin is Plugin {
  if (!isRecord(plugin) || typeof plugin['name'] !== 'string' || plugin['name'] === '') {
    throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin is an object with a non-empty `name`', "add `name: 'my-keys'`");
  }
  const { contract, keymaps = {}, panes = {} } = plugin;
  if (contract !== undefined && contract !== CONTRACT) {
    throw new PluginError('E_PLUGIN_CONTRACT', `plugin declares contract ${String(contract)}; this controlroom knows ${String(CONTRACT)}`, `set \`contract: ${String(CONTRACT)}\`, or drop the field`);
  }
  if (!isRecord(keymaps)) throw new PluginError('E_PLUGIN_SCHEMA', '`keymaps` must be an object of named keymaps', "write `keymaps: { default: { keys: { … } } }`");
  if (!isRecord(panes)) throw new PluginError('E_PLUGIN_SCHEMA', '`panes` must be an object of named panes', "write `panes: { log: { component: 'log-tail' } }`");
  for (const [name, def] of Object.entries(keymaps)) validateKeymap(name, def);
  for (const [name, def] of Object.entries(panes)) validatePane(name, def);
}

/** Maps, not records: a plugin's keys are its author's, and a Map cannot be polluted by one. */
const keymapRegistry = new Map<string, Required<KeymapDef>>();
const paneRegistry = new Map<string, PaneDef>();

/**
 * The built-ins, through the same door as everyone else's — on first use rather than at load,
 * so importing the package runs nothing (`sideEffects: false`) and a user's own `default`
 * registered before any screen opens still replaces this one.
 */
const BUILT_IN: Plugin = {
  name: 'controlroom',
  keymaps: {
    default: {
      keys: { left: 'tab.prev', right: 'tab.next', tab: 'focus.next', 'shift+tab': 'focus.prev', 'ctrl+c': 'quit' },
      labels: { 'tab.prev': 'switch tab', 'tab.next': 'switch tab', 'focus.next': 'focus', quit: 'quit' },
    },
  },
};
let builtIn = false;

/** Validate, then keep every keymap and pane. A later entry of the same name replaces an earlier one. */
export function register(plugin: unknown): void {
  if (!builtIn) {
    builtIn = true;
    register(BUILT_IN);
  }
  validate(plugin);
  for (const [name, def] of Object.entries(plugin.keymaps ?? {})) keymapRegistry.set(name, Object.freeze({ keys: { ...def.keys }, labels: { ...def.labels } }));
  for (const [name, def] of Object.entries(plugin.panes ?? {})) paneRegistry.set(name, Object.freeze({ ...def }));
}

/** Forget every registration, the built-ins included: they come back on the next use. For tests. */
export function reset(): void {
  keymapRegistry.clear();
  paneRegistry.clear();
  builtIn = false;
}

/** Copies of what has been registered: the only way in is `register()`. */
export function registered(): { keymaps: Map<string, Required<KeymapDef>>; panes: Map<string, PaneDef> } {
  if (!builtIn) register({ name: 'controlroom' });
  return { keymaps: new Map(keymapRegistry), panes: new Map(paneRegistry) };
}

