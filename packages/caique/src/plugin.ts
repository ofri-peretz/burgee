/**
 * The plugin host for caique's half of the contract (`plugin-contract` R1, R5, R6, R7, R8).
 *
 * A plugin is one plain object shared by the whole family. This file keeps the key caique
 * understands — `widgets`, a prompt kind and how to draw it — and **ignores every other key
 * without complaining**, which is what makes the same object work on any subset of the
 * family that is installed. A plugin written for flagstaff registers here and contributes
 * its widgets; its `tokens`, `glyphs` and `components` are not caique's business and are
 * not an error.
 *
 * **Nothing here imports another layer**, and the plugin shape is declared rather than
 * imported (R3). Types erase, so an import would cost nothing at run time — and it would
 * still put flagstaff in caique's dependency story, which is the one thing the family
 * promises it does not do.
 *
 * **A widget is the same shape a flagstaff component is** — `{ static, frame?, sample? }` —
 * and a widget without `static` is refused with `E_NO_STATIC_PROJECTION`, the same code and
 * the same fix shape. That sameness is the whole content of R5: the moment the two shapes
 * differ by a key, "the same shape" stops being a fact a lock can hold and becomes prose.
 *
 * **Why this file, and not `ask.ts`, raises `E_UNKNOWN_KIND`.** `PromptKind` is an open
 * union now, so `{ kind: 'acme-rating' }` type-checks whether or not anyone can draw it.
 * The refusal therefore has to happen where the registry is, and it has to be *loud*: a
 * kind nobody registered rendered as a text prompt is the silent-wrong-answer failure this
 * package exists to prevent, wearing a hat.
 */
import { projection } from './ask.js';
import { BUILT_IN_KINDS, type PromptSpec } from './spec.js';

/**
 * The plugin contract version. One number for the family — the same `1` flagstaff and
 * roundel declare, written out rather than imported for the reason in the file comment.
 */
export const CONTRACT = 1;

/**
 * Two named states of plain data, which a grader renders a widget with (R7).
 *
 * It carries no behaviour, so reading it does not mean running the author's code — that is
 * why an optional `sample` does not turn a plugin into a program.
 */
export interface WidgetSample {
  running: unknown;
  done: unknown;
}

/**
 * How a plugin draws one kind of prompt.
 *
 * `static(spec)` is what a pipe, an agent and a screen reader get; it is what `projection()`
 * already returns for the six built-ins, so a plugin widget slots into the same surface
 * rather than beside it. `frame` is optional and drives `caique/raw`.
 */
export interface Widget {
  static: (spec: PromptSpec) => string;
  frame?: (t: number, spec: PromptSpec) => string;
  sample?: WidgetSample;
}

/**
 * The keys caique reads. Declared structurally: any object with these fields is a plugin
 * here, whatever else it carries.
 */
export interface Plugin {
  name: string;
  contract?: number;
  widgets?: Record<string, Widget>;
}

export type PluginErrorCode = 'E_PLUGIN_SCHEMA' | 'E_PLUGIN_CONTRACT' | 'E_NO_STATIC_PROJECTION' | 'E_UNKNOWN_KIND';

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

/** The six, in the order a person reads them — for the `fix` on an unknown kind. */
const builtIns = (): string => [...BUILT_IN_KINDS].join(', ');

/**
 * Refuse a plugin that cannot contribute a widget, at the door.
 *
 * Every refusal here is about the `widgets` key or the plugin's own identity. A key another
 * layer owns is not inspected and not rejected (R1) — caique has no opinion about a spinner.
 */
export function validate(plugin: unknown): asserts plugin is Plugin {
  if (!isRecord(plugin)) throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin is a plain object', 'export an object, not a function or an array');
  if (typeof plugin['name'] !== 'string' || plugin['name'] === '') {
    throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin needs a name', 'add `name: "…"` — it is how a shadowed widget is reported');
  }
  const contract = plugin['contract'];
  if (contract !== undefined && (!Number.isInteger(contract) || (contract as number) > CONTRACT)) {
    throw new PluginError('E_PLUGIN_CONTRACT', `plugin "${plugin['name']}" declares contract ${String(contract)}; this caique knows ${CONTRACT}`, 'upgrade caique, or lower the plugin’s contract');
  }
  validateWidgets(plugin['widgets'], plugin['name']);
}

function validateWidgets(widgetMap: unknown, name: string): void {
  if (widgetMap === undefined) return;
  if (!isRecord(widgetMap)) throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": widgets must be an object`, 'map a prompt kind to a widget: `{ static, frame?, sample? }`');

  for (const [kind, widget] of Object.entries(widgetMap)) {
    if (kind === '') throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": a widget’s kind is empty`, 'name the kind — it is what a `PromptSpec` sets as `kind`');

    /**
     * A plugin may not replace one of the six. The built-ins are the accessible floor and
     * the drop-in surface, and `password` in particular guarantees that nothing writes back
     * what it read — a third party that could override it could defeat that from a config
     * file. Extension is the space *outside* the six, which is exactly what widening
     * `PromptKind` opened up.
     */
    if (BUILT_IN_KINDS.has(kind)) {
      throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": "${kind}" is a built-in prompt kind`, `caique draws the six itself (${builtIns()}); name a kind of your own`);
    }

    if (!isRecord(widget)) throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": widget "${kind}" is not an object`, 'a widget is `{ static, frame?, sample? }`');

    /** U3 everywhere else, and the reason a third-party prompt cannot break the non-TTY guarantee. */
    if (typeof widget['static'] !== 'function') {
      throw new PluginError('E_NO_STATIC_PROJECTION', `plugin "${name}": widget "${kind}" has no static projection`, 'add `static: (spec) => "…"` — it is what a pipe, an agent and a screen reader get');
    }
    if (widget['frame'] !== undefined && typeof widget['frame'] !== 'function') {
      throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": widget "${kind}" has a \`frame\` that is not a function`, 'a frame is `(t, spec) => "…"`, or leave it out and the widget is line-mode only');
    }
    validateSample(widget['sample'], name, kind);
  }
}

function validateSample(sample: unknown, name: string, kind: string): void {
  if (sample === undefined) return;
  if (!isRecord(sample) || !('running' in sample) || !('done' in sample)) {
    throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": widget "${kind}" has a malformed \`sample\``, 'a sample is `{ running, done }` — two named states of plain data, which a grader renders the widget with');
  }
}

/** Which plugin last contributed each kind — the shadowing a `plugin check` prints. */
export interface Contribution {
  kind: string;
  from: string;
  /** Plugins that contributed this kind earlier and were overridden, in order. */
  shadowed: string[];
}

const order: Plugin[] = [];

/**
 * Register a plugin. Later wins, like ESLint flat config: the array is ordered, a caller
 * reads it top to bottom, and the last word on a kind is the one nearest the program.
 */
export function register(plugin: unknown): void {
  validate(plugin);
  order.push(plugin);
}

/** Forget every registered plugin. For tests, and for a program that re-registers at runtime. */
export function reset(): void {
  order.length = 0;
}

/** The plugins registered, in registration order. */
export function registered(): readonly Plugin[] {
  return order;
}

/** Every kind a plugin contributed, with who won it and who it shadowed. */
export function widgets(): Contribution[] {
  const by = new Map<string, Contribution>();
  for (const plugin of order) {
    for (const kind of Object.keys(plugin.widgets ?? {})) {
      const existing = by.get(kind);
      by.set(kind, { kind, from: plugin.name, shadowed: existing === undefined ? [] : [...existing.shadowed, existing.from] });
    }
  }
  return [...by.values()];
}

/** The widget that draws `kind`, or nothing when no plugin registered one. */
export function widgetFor(kind: string): Widget | undefined {
  // Walked backwards because later wins, and the first hit from the end is the winner.
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const widget = (order[i] as Plugin).widgets?.[kind];
    if (widget !== undefined) return widget;
  }
  return undefined;
}

/** Every kind that can be drawn right now: the six, plus whatever is registered. */
export function kinds(): string[] {
  return [...BUILT_IN_KINDS, ...widgets().map((c) => c.kind)];
}

/**
 * The static projection for *any* kind — the one surface a caller needs.
 *
 * The six are still drawn by caique; anything else is a registered widget's `static`. A
 * kind that is neither is a refusal naming what *is* registered, so the reader can see the
 * typo rather than a text prompt where their rating widget should have been.
 */
export function projectionOf(spec: PromptSpec): string {
  if (BUILT_IN_KINDS.has(spec.kind)) return projection(spec);

  const widget = widgetFor(spec.kind);
  if (widget === undefined) {
    const known = widgets().map((c) => c.kind);
    const named = known.length === 0 ? 'no plugin has registered a widget' : `registered kinds: ${known.join(', ')}`;
    throw new PluginError('E_UNKNOWN_KIND', `no widget draws prompt kind ${JSON.stringify(spec.kind)} — ${named}`, `register a plugin whose \`widgets\` defines ${JSON.stringify(spec.kind)}, or use a built-in kind: ${builtIns()}`);
  }
  return widget.static(spec).trimEnd();
}
