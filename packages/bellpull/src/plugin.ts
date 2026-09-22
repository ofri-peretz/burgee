/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The plugin host for bellpull's half of the contract — `plugin-contract` R5a, R6, R7, R8,
 * and PLAN step 1.5.
 *
 * A plugin is one plain object shared by the whole family. This file keeps the key bellpull
 * understands — **`resolvers`**, how an executable is found — and **ignores every other key
 * without complaining**, which is what makes the same object work on any subset of the
 * family that is installed. A plugin written for flagstaff registers here and contributes
 * nothing; its `spinners` and `components` are not bellpull's business and are not an error.
 *
 * **Nothing here imports another layer, and the plugin shape is declared rather than
 * imported** (R3).
 *
 * ## Why `resolvers` is the key this layer owns
 *
 * R5a's sentence is *"how an executable is found (`PATH`, a version manager, a container),
 * since `which` is the part every environment does differently"*. That is the whole
 * argument: `PATH` is a convention from a world with one filesystem and one user, and the
 * environments people actually run in have since bolted a search order on top of it — `nvm`
 * and `asdf` put shims in a directory computed from an environment variable, `pnpm` and
 * `yarn` place binaries somewhere `npm` does not, a devcontainer mounts tools outside every
 * `PATH` the host had. Each of those is *the same operation with a different list of
 * directories*, which is exactly the kind of difference that should be data rather than a
 * fork of the resolver.
 *
 * ## R7 is met with no exception asked for, and that is deliberate
 *
 * `closeout`'s `handlers` had to take a function, because an exit handler *is* behaviour and
 * there is no data encoding of "close this socket". A resolver has one: a search order is a
 * list of directories. So every field here is inspectable without running anything —
 * `burgee plugin check` can print the search order a plugin contributes, and an agent can
 * *write* one, which is PRINCIPLES' "plugins as data that agents write" rather than a slogan.
 *
 * The one thing a directory list cannot express on its own is a path computed from the
 * environment (`$ASDF_DATA_DIR/shims`). That is solved the way `paratext` solved the same
 * problem for OSC payloads: `{VAR}` in a path is substituted from the runtime's environment,
 * and an entry naming a variable that is not set is **dropped**, not guessed at. A template
 * is still data; a function would not be.
 *
 * ## Security: a resolver may only add absolute directories
 *
 * A resolver contributes directories that are searched **before** `PATH`, which is real
 * privilege: whoever writes the plugin decides what `run('node')` means. Two refusals bound
 * it, both at `register()` rather than at search time, because a refusal at search time is a
 * refusal nobody sees:
 *
 *  - **a path must be absolute after substitution.** A relative entry resolves against
 *    whatever the working directory happens to be when a child is spawned, so a plugin that
 *    contributed `node_modules/.bin` would mean something different in every directory the
 *    program was run from — and in a directory an attacker can write to, it means their
 *    binary. `which.ts` refuses relative `PATH` entries for the same reason; this is the
 *    same rule one layer out, where it can be enforced before anything runs.
 *  - **a substitution may not smuggle a separator.** `{HOME}` is a value from the
 *    environment, and an environment variable containing `:` or `;` would otherwise split
 *    one contributed directory into two — the entry is dropped rather than split.
 */
import { isWindows, pathDelimiter, type Runtime } from './runtime.js';

/**
 * The plugin contract version. One number for the family — the same `1` flagstaff, roundel,
 * caique and closeout declare, written out rather than imported for the reason above.
 */
export const CONTRACT = 1;

/** When a resolver applies. Every clause must hold; each array is an OR within itself. */
export interface ResolverWhen {
  /** Platforms, as `process.platform` spells them. Absent means every platform. */
  platform?: readonly string[];
  /** Any one of these environment variables merely being set — how a version manager announces itself. */
  envAny?: readonly string[];
}

/**
 * One contributed way of finding an executable.
 *
 * No functions, so it travels through JSON and a `plugin check` can print it.
 */
export interface Resolver {
  /**
   * Where this sits relative to `PATH`, which is rank `0`. A negative rank searches before
   * `PATH` — which is what a version manager's shims want, because being *after* `PATH` is
   * the same as not being installed. Ties keep registration order.
   */
  rank: number;
  /**
   * Directories to search, in order. Absolute after substitution, or dropped.
   * `{VAR}` is replaced by `runtime.env.VAR`; an unset variable drops the entry.
   */
  paths: readonly string[];
  /** Extra extensions to try, in order — `PATHEXT` for one resolver rather than the machine. */
  extensions?: readonly string[];
  /** When it applies. Absent means always. */
  when?: ResolverWhen;
}

/**
 * The keys bellpull reads. Declared structurally: any object with these fields is a plugin
 * here, whatever else it carries.
 */
export interface Plugin {
  name: string;
  contract?: number;
  resolvers?: Record<string, Resolver>;
}

export type PluginErrorCode = 'E_PLUGIN_SCHEMA' | 'E_PLUGIN_CONTRACT' | 'E_NO_CONTRIBUTION';

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
 * Refuse a plugin that cannot contribute a resolver, at the door.
 *
 * Every refusal here is a refusal rather than a silent drop, for the reason roundel's host
 * gives about a misspelt token: a contribution that is quietly ignored looks like it worked,
 * and its author debugs the wrong thing — except that here the thing they are debugging is
 * "why did CI run a different `node` from my laptop", which is the question this layer
 * exists to make answerable.
 */
export function validate(plugin: unknown): asserts plugin is Plugin {
  if (!isRecord(plugin)) throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin is a plain object', 'export an object, not a function or an array');
  if (typeof plugin['name'] !== 'string' || plugin['name'] === '') {
    throw new PluginError('E_PLUGIN_SCHEMA', 'a plugin needs a name', 'add `name: "…"` — it is how a shadowed resolver is reported');
  }
  const contract = plugin['contract'];
  if (contract !== undefined && (!Number.isInteger(contract) || (contract as number) > CONTRACT)) {
    throw new PluginError(
      'E_PLUGIN_CONTRACT',
      `plugin "${plugin['name']}" declares contract ${String(contract)}; this bellpull knows ${CONTRACT}`,
      'upgrade bellpull, or lower the plugin’s contract',
    );
  }
  validateResolvers(plugin['resolvers'], plugin['name']);
}

function validateResolvers(resolvers: unknown, name: string): void {
  if (resolvers === undefined) return;
  if (!isRecord(resolvers)) {
    throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": resolvers must be an object`, 'map a resolver name to `{ rank, paths, extensions?, when? }` — compare it against `bellpull/schema.json`');
  }
  for (const [key, resolver] of Object.entries(resolvers)) {
    if (key === '') throw new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": a resolver’s name is empty`, 'name it — the name is what a `plugin check` prints and what shadowing is reported by');
    validateResolver(resolver, `plugin "${name}": resolver "${key}"`);
  }
}

function validateResolver(resolver: unknown, at: string): void {
  if (!isRecord(resolver)) throw new PluginError('E_PLUGIN_SCHEMA', `${at} is not an object`, 'a resolver is `{ rank, paths, extensions?, when? }`');
  if (!Number.isFinite(resolver['rank'])) {
    throw new PluginError('E_PLUGIN_SCHEMA', `${at} has no rank`, 'add `rank: -10` to search before PATH, or a positive rank to search after it');
  }
  validatePaths(resolver['paths'], at);
  validateWhen(resolver['when'], at);
}

function validatePaths(paths: unknown, at: string): void {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new PluginError('E_PLUGIN_SCHEMA', `${at} contributes no paths`, 'add `paths: ["/opt/tool/bin"]` — a resolver is a search order, and an empty one cannot find anything');
  }
  for (const entry of paths as unknown[]) {
    if (typeof entry !== 'string' || entry === '') {
      throw new PluginError('E_PLUGIN_SCHEMA', `${at} has a path that is not a string`, 'each path is a string; `{VAR}` is substituted from the environment');
    }
    // Checked on the template, before substitution, so the refusal names the line the
    // author wrote. A `{VAR}` may still expand to something relative; `directories()`
    // drops that at search time and `templateIsAbsolute` says why it cannot know here.
    if (!templateIsAbsolute(entry)) {
      throw new PluginError(
        'E_PLUGIN_SCHEMA',
        `${at}: ${JSON.stringify(entry)} is not an absolute path`,
        'use an absolute path, or start it with a `{VAR}` that holds one — a relative entry means a different directory every time the program is run from somewhere else, including one somebody else can write to',
      );
    }
  }
}

/**
 * Whether a path template can only ever produce an absolute path.
 *
 * `/opt/bin` can. `{HOME}/.local/bin` can, if `HOME` is absolute — which cannot be known
 * here and is re-checked after substitution. `bin` and `./bin` cannot, and are refused now,
 * where the message can name the author's own text.
 */
function templateIsAbsolute(template: string): boolean {
  return template.startsWith('/') || template.startsWith('{') || /^[A-Za-z]:[\\/]/.test(template) || template.startsWith('\\\\');
}

function validateWhen(when: unknown, at: string): void {
  if (when === undefined) return;
  if (!isRecord(when)) throw new PluginError('E_PLUGIN_SCHEMA', `${at} has a \`when\` that is not an object`, 'a `when` is `{ platform?, envAny? }`, or leave it out and the resolver always applies');
  for (const key of ['platform', 'envAny']) {
    const value = when[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) || (value as unknown[]).some((v) => typeof v !== 'string')) {
      throw new PluginError('E_PLUGIN_SCHEMA', `${at}: \`when.${key}\` must be an array of strings`, `list them: \`${key}: ["…"]\``);
    }
  }
}

const order: Plugin[] = [];

/**
 * Register a plugin. Later wins, like ESLint flat config — though "wins" is narrower here
 * than for a colour token: two resolvers under the same name shadow, and two resolvers under
 * different names both apply, in rank order.
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

/** One contributed resolver, with the plugin it came from and what it shadowed. */
export interface Contribution {
  name: string;
  from: string;
  resolver: Resolver;
  /** Plugins that contributed this name earlier and were overridden, in order. */
  shadowed: string[];
}

/**
 * Every resolver every registered plugin contributed, in the order they will be searched.
 *
 * This is the static projection of the search order, and the reason `rank` is worth having:
 * a caller — or `burgee plugin check` — reads what `run('node')` would resolve against
 * without resolving anything.
 */
export function contributions(): Contribution[] {
  const by = new Map<string, Contribution>();
  for (const plugin of order) {
    for (const [name, resolver] of Object.entries(plugin.resolvers ?? {})) {
      const existing = by.get(name);
      by.set(name, { name, from: plugin.name, resolver, shadowed: existing === undefined ? [] : [...existing.shadowed, existing.from] });
    }
  }
  // Stable by rank: two resolvers at one rank keep the order they were contributed in.
  return [...by.values()].toSorted((a, b) => a.resolver.rank - b.resolver.rank);
}

/** Whether a resolver's `when` holds for this runtime. */
function applies(resolver: Resolver, runtime: Runtime): boolean {
  const when = resolver.when;
  if (when === undefined) return true;
  if (when.platform !== undefined && !when.platform.includes(runtime.platform)) return false;
  if (when.envAny !== undefined && !when.envAny.some((key) => runtime.env[key] !== undefined)) return false;
  return true;
}

/**
 * Substitute `{VAR}` from the environment.
 *
 * `undefined` for an unset variable, for a value that is not absolute, and for a value
 * carrying a `PATH` separator — see the security note at the top of this file. Every one of
 * those is "this entry does not apply here", which is a normal answer in an environment
 * where the tool is simply not installed.
 */
export function substitute(template: string, runtime: Runtime): string | undefined {
  let failed = false;
  const expanded = template.replaceAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key: string) => {
    const value = runtime.env[key];
    if (value === undefined || value === '' || value.includes(pathDelimiter(runtime))) {
      failed = true;
      return '';
    }
    return value;
  });
  if (failed) return undefined;
  const absolute = expanded.startsWith('/') || /^[A-Za-z]:[\\/]/.test(expanded) || expanded.startsWith('\\\\');
  return absolute || (isWindows(runtime) && expanded.startsWith('\\')) ? expanded : undefined;
}

/** A contributed directory, and which resolver put it there. */
export interface ContributedDirectory {
  dir: string;
  /** The resolver's name, so a report can say why this directory is being searched. */
  resolver: string;
  rank: number;
}

/**
 * The directories registered plugins contribute for this runtime, in search order.
 *
 * A negative rank means "before `PATH`", so a caller splices these around the entries
 * `which.ts`'s own `searchPath()` returns. Nothing here searches: this is the list, as data,
 * which is the half a plugin is allowed to decide.
 */
export function directories(runtime: Runtime): ContributedDirectory[] {
  const out: ContributedDirectory[] = [];
  for (const contribution of contributions()) {
    if (!applies(contribution.resolver, runtime)) continue;
    for (const template of contribution.resolver.paths) {
      const dir = substitute(template, runtime);
      if (dir !== undefined) out.push({ dir, resolver: contribution.name, rank: contribution.resolver.rank });
    }
  }
  return out;
}
