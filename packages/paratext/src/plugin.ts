/**
 * The plugin host for paratext's half of the contract
 * (`plugin-contract` R1, R5a, R6, R7, R8).
 *
 * A plugin is one plain object shared by the whole family. This file keeps the key paratext
 * understands — **`capabilities`** (R5a), OSC records by name — and **ignores every other
 * key without complaining**, which is what makes the same object work on any subset of the
 * family that is installed. A plugin written for flagstaff registers here and contributes
 * nothing; its `tokens`, `spinners` and `components` are not paratext's business and are not
 * an error.
 *
 * **Why paratext needed this file more than the other hosts did.** Until it existed, paratext
 * was the one published package with no `src/plugin.ts` — and that file is the *marker*
 * `scripts/plugin-schema-lock.test.ts` and `scripts/schema-sync.mjs` both look for. So
 * paratext's copy of the family schema was outside the lock that keeps the copies
 * byte-identical: it happened to match flagstaff's, and nothing in the repository would have
 * said so if it stopped.
 *
 * **Nothing here imports another layer, and the plugin shape is declared rather than
 * imported** (R3). It imports `./capability.js` because that is this package's own module:
 * the capability shape, the registry and `check()` have to have exactly one home, or
 * "fallback is required" means one thing to a plugin and another to a built-in.
 *
 * **R7, and why this host is the easy case.** R7 asks that no key require a function. Here
 * none does: a capability is `{ name, osc, when, encode, fallback }`, five fields of plain
 * data with two template strings, so a plugin can arrive as JSON, be diffed, and be printed
 * by a `plugin check` without anybody running its author's code. closeout's `handlers` owes
 * R7 an exemption; `capabilities` owes it nothing, which is the argument the design makes
 * for holding capabilities as data in the first place.
 */
import { type Capability, capabilityProblems, register as registerCapability } from './capability.js';

/**
 * The plugin contract version. One number for the family — the same `1` flagstaff, caique
 * and closeout declare, written out rather than imported for the reason in the file comment.
 */
export const CONTRACT = 1;

/**
 * The keys paratext reads. Declared structurally: any object with these fields is a plugin
 * here, whatever else it carries.
 */
export interface Plugin {
  name: string;
  contract?: number;
  /** Capabilities by name. The key and the record's own `name` must agree; see {@link validate}. */
  capabilities?: Record<string, Capability>;
}

/**
 * Three codes, all of them already in flagstaff's `PluginErrorCode` — the vocabulary home
 * (`scripts/plugin-error-vocabulary-lock.test.ts`). `E_NO_STATIC_PROJECTION` is the one
 * worth noticing: flagstaff raises it for a component with no static form and caique for a
 * widget with no `static`, and a capability with no `fallback` is the same defect wearing
 * OSC. One code, one fix shape, three layers.
 */
export type PluginErrorCode = 'E_PLUGIN_SCHEMA' | 'E_PLUGIN_CONTRACT' | 'E_NO_STATIC_PROJECTION';

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
 * Refuse a plugin that cannot contribute a capability, at the door.
 *
 * Every refusal is a refusal rather than a silent drop. A capability quietly ignored looks
 * like it worked right up until the day somebody runs the program on the terminal it was
 * written for, and then the thing they debug is the terminal.
 */
export function validate(plugin: unknown): asserts plugin is Plugin {
  if (!isRecord(plugin)) throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin is a plain object', 'export an object, not a function or an array');
  if (typeof plugin['name'] !== 'string' || plugin['name'] === '') {
    throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin needs a name', 'add `name: "…"` — it is how a shadowed capability is reported');
  }
  const contract = plugin['contract'];
  if (contract !== undefined && (!Number.isInteger(contract) || (contract as number) > CONTRACT)) {
    throw new PluginError(
      'E_PLUGIN_CONTRACT',
      `plugin "${plugin['name']}" declares contract ${String(contract)}; this paratext knows ${CONTRACT}`,
      FIX.E_PLUGIN_CONTRACT,
    );
  }
  validateCapabilities(plugin['capabilities'], plugin['name']);
}

function validateCapabilities(section: unknown, name: string): void {
  if (section === undefined) return;
  if (!isRecord(section)) {
    throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": capabilities must be an object of capabilities by name`, 'key each capability by its own `name`');
  }

  for (const [key, candidate] of Object.entries(section)) {
    const at = `plugin "${name}": capabilities.${key}`;
    if (!isRecord(candidate)) throw new PluginError('E_PLUGIN_SCHEMA', `${at} is not an object`, 'a capability is `{ name, osc, when, encode, fallback }` — five fields of plain data');

    /**
     * The key is what a reader edits and the `name` is what the registry files it under, so
     * a mismatch registers the capability somewhere nobody is looking. Refused rather than
     * reconciled: guessing which of the two the author meant is how a silent wrong answer
     * gets built. It is the one rule here that is about the *document* rather than the
     * capability, which is why it is the one rule written out in this file.
     */
    if (candidate['name'] !== key) {
      throw new PluginError(
        'E_PLUGIN_SCHEMA',
        `${at} is filed under "${key}" but names itself ${JSON.stringify(candidate['name'])}`,
        `key it by its own name — \`"${String(candidate['name'])}": { … }\` — or rename the capability to "${key}"`,
      );
    }

    /**
     * Everything else comes from `capability.ts`, which reads the published schema — the
     * presence of the five fields and, since the schema walk landed, their declared types,
     * `oneOf`, `minLength` and `additionalProperties: false`. A second copy of the rules here
     * is the drift `plugin-schema-lock.test.ts` exists to forbid, one level up; until this
     * call replaced it, `fallback`'s absence was hand-checked in both files and everything
     * else in neither.
     *
     * The code travels with the line, so `E_NO_STATIC_PROJECTION` still means "no static
     * projection" here and `FIX` is what to do about each — one message per code, because a
     * code that needs a different fix in a different file is not one code (R8).
     */
    const [first] = capabilityProblems(candidate, at);
    if (first !== undefined) throw new PluginError(first.code, first.line, FIX[first.code]);
  }
}

/** What to do about each refusal, by code. The family's `fix` half of the vocabulary. */
const FIX: Record<PluginErrorCode, string> = {
  E_NO_STATIC_PROJECTION: 'add `fallback: "…"` — what prints where the terminal cannot do it; `""` is a legitimate answer, absence is not',
  E_PLUGIN_SCHEMA: 'compare the object against `paratext/schema.json`, which is the contract every host in the family ships',
  E_PLUGIN_CONTRACT: 'upgrade paratext, or lower the plugin’s contract',
};

const order: Plugin[] = [];

/**
 * Register a plugin. Later wins, like ESLint flat config: the array is ordered, a caller
 * reads it top to bottom, and the last word on a capability name is the one nearest the
 * program — which is also the registry's own rule, since `register()` in `capability.ts`
 * replaces by name so a caller can correct a guess we got wrong.
 *
 * **Registering does not emit, and does not even reach the capability registry.** It records
 * the contribution; {@link attach} is what hands it over. That separation is what makes
 * {@link contributions} a static projection rather than a side effect.
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

/** One contributed capability, with the plugin it came from and the plugins it displaced. */
export interface Contribution {
  name: string;
  from: string;
  /** Plugins that contributed this name earlier and were overridden, in order. */
  shadowed: string[];
  capability: Capability;
}

/**
 * Every capability every registered plugin contributed, with who won each name.
 *
 * This is the static projection of the plugin set (R7): a caller — or `burgee plugin check`
 * — reads what *would* be registered, and who lost, without registering anything and without
 * a terminal being involved.
 */
export function contributions(): Contribution[] {
  const by = new Map<string, Contribution>();
  for (const plugin of order) {
    for (const [name, capability] of Object.entries(plugin.capabilities ?? {})) {
      const existing = by.get(name);
      by.set(name, { name, from: plugin.name, shadowed: existing === undefined ? [] : [...existing.shadowed, existing.from], capability });
    }
  }
  return [...by.values()];
}

/**
 * The half of the capability registry this needs — declared structurally so a caller can
 * attach to something it built itself, and so a host can watch what arrives.
 */
export interface CapabilityHost {
  register(capability: Capability): void;
}

/**
 * paratext's own registry, as a host. `register` here is the very call the built-ins go
 * through, so a plugin's capability is not a second-class citizen of the registry — which is
 * the property flagstaff U4 asks every host to be able to demonstrate.
 */
const DEFAULT_HOST: CapabilityHost = { register: registerCapability };

/**
 * Hand every contributed capability to a registry.
 *
 * Defaults to paratext's own, which is what a program wants: `attach()` after importing the
 * plugins, and `emit()` can then reach them by name exactly as it reaches the built-ins.
 * Passing a host is for a caller keeping its own registry, and for a test that wants to see
 * the order without touching the global one.
 */
export function attach(host?: CapabilityHost): void {
  const into = host ?? DEFAULT_HOST;
  for (const contribution of contributions()) into.register(contribution.capability);
}
