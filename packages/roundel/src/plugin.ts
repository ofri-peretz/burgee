/**
 * The plugin host for roundel's half of the contract (`plugin-contract` R1, R4, R6, R8).
 *
 * A plugin is one plain object shared by the whole family. This file keeps the key roundel
 * understands — `tokens`, a theme — and **ignores every other key without complaining**,
 * which is what makes the same object work on any subset of the family that is installed.
 * A plugin written for flagstaff registers here and contributes its theme; its `spinners`
 * and `components` are not roundel's business and are not an error.
 *
 * **Nothing here imports flagstaff, and the shape is declared rather than imported.** Types
 * erase, so an import would cost nothing at run time — and it would still put flagstaff in
 * roundel's dependency story, which is the one thing the family promises it does not do.
 * Four keys declared structurally is three lines, and keeps "none requires the others"
 * literally true instead of true-modulo-types.
 *
 * **A plugin cannot smuggle an unreadable colour in.** This file collects tokens; `fly()`
 * contrast-checks them against the ground exactly as it checks a hand-written theme, and
 * throws below 4.5:1. That is deliberately not re-implemented here: one contrast gate, in
 * the place that already had it (roundel R5).
 */
import { type Hex, type Theme } from './theme.js';

/**
 * The plugin contract version. One number for the family — the same `1` flagstaff declares,
 * written out rather than imported for the reason in the file comment above.
 */
export const CONTRACT = 1;

/**
 * The keys roundel reads. Declared structurally: any object with these fields is a plugin
 * here, whatever else it carries.
 */
export interface Plugin {
  name: string;
  contract?: number;
  tokens?: Record<string, string>;
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

/** The nine, plus the ground a theme is checked against. A tenth name is a typo, not a token. */
const TOKEN_NAMES = new Set(['error', 'warn', 'ok', 'hint', 'muted', 'command', 'flag', 'value', 'heading', 'ground']);
const HEX = /^#[0-9a-f]{6}$/i;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Refuse a plugin that cannot contribute a theme, at the door.
 *
 * A misspelt token name is refused rather than ignored: a plugin whose `errror` key is
 * silently dropped looks like it worked, and the author debugs the wrong thing.
 */
export function validate(plugin: unknown): asserts plugin is Plugin {
  if (!isRecord(plugin)) throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin is a plain object', 'export an object, not a function or an array');
  if (typeof plugin['name'] !== 'string' || plugin['name'] === '') {
    throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin needs a name', 'add `name: "…"` — it is how a shadowed token is reported');
  }
  const contract = plugin['contract'];
  if (contract !== undefined && (!Number.isInteger(contract) || (contract as number) > CONTRACT)) {
    throw new PluginError('E_PLUGIN_CONTRACT', `plugin "${plugin['name']}" declares contract ${String(contract)}; this roundel knows ${CONTRACT}`, 'upgrade roundel, or lower the plugin’s contract');
  }
  validateTokens(plugin['tokens'], plugin['name']);
}

function validateTokens(tokens: unknown, name: string): void {
  if (tokens === undefined) return;
  if (!isRecord(tokens)) throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": tokens must be an object`, 'map a token name to a #rrggbb colour');
  for (const [token, value] of Object.entries(tokens)) {
    if (!TOKEN_NAMES.has(token)) {
      throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": "${token}" is not a token`, `use one of ${[...TOKEN_NAMES].join(', ')}`);
    }
    if (typeof value !== 'string' || !HEX.test(value)) {
      throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": token "${token}" is ${JSON.stringify(value)}`, 'a token is a #rrggbb colour, contrast-checked when the theme is flown');
    }
  }
}

/** Which plugin last contributed each token — the shadowing a `plugin check` prints. */
export interface Contribution {
  token: string;
  value: Hex;
  from: string;
  /** Plugins that contributed this token earlier and were overridden, in order. */
  shadowed: string[];
}

const order: Plugin[] = [];

/**
 * Register a plugin. Later wins, like ESLint flat config: the array is ordered, a caller
 * reads it top to bottom, and the last word on a token is the one nearest the program.
 */
export function register(plugin: unknown): void {
  validate(plugin);
  order.push(plugin);
}

/** Forget every registered plugin. For tests, and for a program that re-themes at runtime. */
export function reset(): void {
  order.length = 0;
}

/**
 * The theme every registered plugin adds up to, ready for `fly()`.
 *
 * It is *not* flown here. A plugin contributing colour must not decide when colour is
 * decided — `fly()` is called once by the program, and calling it from a `register()` would
 * mean the last plugin imported quietly re-flew the theme.
 */
export function theme(): Theme {
  // Built through a Map and filtered against the allowlist a second time: `validate()` has
  // already refused a token name that is not one of the ten, and `theme()` still does not
  // copy an arbitrary key onto an object — a merge that trusts its input is how a `__proto__`
  // in a third party's JSON becomes a prototype.
  const out = new Map<string, string>();
  for (const plugin of order) {
    for (const [token, value] of Object.entries(plugin.tokens ?? {})) {
      if (TOKEN_NAMES.has(token)) out.set(token, value);
    }
  }
  return Object.fromEntries(out) as Theme;
}

/** Every token a plugin contributed, with who won it and who it shadowed. */
export function contributions(): Contribution[] {
  const by = new Map<string, Contribution>();
  for (const plugin of order) {
    for (const [token, value] of Object.entries(plugin.tokens ?? {})) {
      const existing = by.get(token);
      by.set(token, { token, value: value as Hex, from: plugin.name, shadowed: existing === undefined ? [] : [...existing.shadowed, existing.from] });
    }
  }
  return [...by.values()];
}

/** The plugins registered, in registration order. */
export function registered(): readonly Plugin[] {
  return order;
}
