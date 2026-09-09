/**
 * burgee's additions on yargs syntax — the pure half. `yargs-factory.ts` snapshots what
 * a program registered (options, descriptions, commands and their builders' results) and
 * this module projects that snapshot into the manifest every surface reads (J7, J8).
 * Nothing here runs at parse time unless a burgee surface was asked for.
 */
import { type Effects, type Manifest, type OptionSpec } from '../manifest.js';
import { camelCase } from '../yargs-parser.js';

import type { Positional } from './utils.js';

/** What one yargs instance (the root, or a command's builder run on a scratch) registered. */
export interface Snapshot {
  name: string;
  version?: string | undefined;
  description?: string | undefined;
  effects?: Effects | undefined;
  hasHandler: boolean;
  keys: string[];
  aliases: Record<string, string[]>;
  boolean: string[];
  number: string[];
  string: string[];
  count: string[];
  array: string[];
  hiddenOptions: string[];
  demanded: Record<string, string | undefined>;
  deprecated: Record<string, string | boolean | undefined>;
  choices: Record<string, any[]>;
  defaults: Record<string, any>;
  descriptions: Record<string, string | undefined>;
  /** yargs' own `help`, `version` and `show-hidden` keys: burgee serves those itself. */
  skip: readonly string[];
  positionals: { demanded: Positional[]; optional: Positional[] };
  commands: { name: string; description: string | false | undefined; deprecated: boolean | string | undefined; child: Snapshot }[];
}

const DEFER_PREFIX = '__yargsString__:';

function describe(descriptions: Record<string, string | undefined>, key: string): string | undefined {
  const raw = descriptions[key];
  if (raw === undefined || raw === '') return undefined;
  return raw.startsWith(DEFER_PREFIX) ? raw.slice(DEFER_PREFIX.length) : raw;
}

function typeOf(s: Snapshot, key: string): OptionSpec['type'] {
  const any = (list: string[]): boolean => list.includes(key) || (s.aliases[key] ?? []).some((a) => list.includes(a));
  if (any(s.boolean)) return 'boolean';
  if (any(s.number) || any(s.count)) return 'number';
  return 'string';
}

/** Options as the manifest describes them, on a null-prototype record keyed by the canonical camelCase name. */
export function optionSpecs(s: Snapshot): Record<string, OptionSpec> {
  const specs = Object.create(null) as Record<string, OptionSpec>;
  const aliasOf = new Set<string>();
  for (const [key, list] of Object.entries(s.aliases)) {
    if (s.keys.includes(key)) for (const a of list) aliasOf.add(a);
  }
  const positional = new Set([...s.positionals.demanded, ...s.positionals.optional].flatMap((p) => p.cmd));
  for (const key of s.keys) {
    if (s.skip.includes(key) || aliasOf.has(key) || positional.has(key) || key.includes('.')) continue;
    const spec: OptionSpec = { type: typeOf(s, key) };
    const aliases = s.aliases[key] ?? [];
    const short = aliases.find((a) => a.length === 1 && !/^[0-9]$/.test(a));
    if (short !== undefined) spec.short = short;
    const desc = describe(s.descriptions, key) ?? aliases.map((a) => describe(s.descriptions, a)).find((d) => d !== undefined);
    if (desc !== undefined) spec.description = desc;
    if (key in s.demanded || aliases.some((a) => a in s.demanded)) spec.required = true;
    if (s.array.includes(key) || aliases.some((a) => s.array.includes(a))) spec.multiple = true;
    const choices = s.choices[key] ?? aliases.map((a) => s.choices[a]).find((c) => c !== undefined);
    if (choices !== undefined) spec.choices = choices.map(String);
    const def = s.defaults[key];
    if (typeof def === 'string' || typeof def === 'boolean' || typeof def === 'number') spec.default = def;
    else if (Array.isArray(def) && def.every((d) => typeof d === 'string')) spec.default = def;
    if (s.hiddenOptions.includes(key)) spec.hidden = true;
    const deprecated = s.deprecated[key];
    if (deprecated !== undefined && deprecated !== false) spec.deprecated = deprecated;
    Object.defineProperty(specs, camelCase(key), { value: spec, enumerable: true, writable: true, configurable: true });
  }
  return specs;
}

function argumentsOf(s: Snapshot): { name: string; required: boolean; variadic: boolean; description?: string }[] {
  const out: { name: string; required: boolean; variadic: boolean; description?: string }[] = [];
  const push = (p: Positional, required: boolean): void => {
    const name = p.cmd[0] as string;
    const desc = describe(s.descriptions, name);
    out.push({ name, required, variadic: p.variadic, ...(desc === undefined ? {} : { description: desc }) });
  };
  for (const p of s.positionals.demanded) push(p, true);
  for (const p of s.positionals.optional) push(p, false);
  return out;
}

/**
 * Project a snapshot into the manifest: the root, then every command as a child path.
 * Plugin-contributed nodes survive re-projection, exactly as on the commander façade.
 */
export function projectManifest(manifest: Manifest, root: Snapshot): void {
  const contributed = manifest.commands.filter((c) => c.plugin !== undefined);
  manifest.commands.splice(0, manifest.commands.length, ...contributed);
  manifest.rootPath = [root.name];
  if (root.version !== undefined) manifest.version = root.version;
  const visit = (s: Snapshot, at: string[], description: string | undefined, deprecated: boolean | string | undefined): void => {
    const args = argumentsOf(s);
    manifest.add({
      path: at,
      ...(description === undefined ? {} : { description }),
      ...(s.effects === undefined ? {} : { effects: s.effects }),
      ...(deprecated === undefined || deprecated === false ? {} : { deprecated }),
      options: optionSpecs(s),
      ...(args.length === 0 ? {} : { arguments: args }),
      ...(s.hasHandler ? { run: () => undefined } : {}),
    });
    for (const c of s.commands) visit(c.child, [...at, c.name], c.description === false ? undefined : c.description, c.deprecated);
  };
  visit(root, [root.name], root.description, undefined);
}

/** What a run prints for a handler's return value when the streams are injected. */
export function render(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return `${value}\n`;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}\n`)
      .join('');
  }
  return `${JSON.stringify(value)}\n`;
}
