/**
 * `burgee check <plugin-file>` — validate a burgee plugin, register it into a throwaway
 * manifest, and report what it contributes (PRINCIPLES 7, `plugin-contract` R8).
 *
 * The other eight hosts print their report; this one **returns** it, because burgee's own
 * commands are documents the engine renders — text for a person, `{ ok, data }` for `--json`,
 * a tool result for `--mcp`. So `burgee check --json` is the one check in the family an agent
 * can read without parsing prose, which is the reader PRINCIPLES 7's eval is written for.
 *
 * A refusal is data too: `{ refused: { code, message, fix }, exitCode: 1 }`. The command
 * still exits 1 — `exitCodeOf` reads the code off the result — so a script branches on the
 * status and an agent reads the fix, and neither has to do both. The `--json` envelope's `ok`
 * is that same verdict: `false` on a refusal, because the exit is.
 *
 * **Registered into a throwaway `Manifest`, not validated alone.** `validate` checks the shape;
 * `Manifest.use()` is what runs every contributed command through the same door a first-party
 * one takes — reserved names, declared effects, relations — so a plugin that validates and then
 * refuses at `use()` is caught here rather than in the program an author ships it into.
 *
 * **Every other layer's keys go to that layer's own `check`** (`plugin-contract` C3). One object
 * extends ten packages, and an author should not run nine commands to learn one verdict. Each key
 * another layer hosts is handed to that layer's `check`, run as a command from where Node would
 * resolve the layer for the plugin, never imported: burgee depends on no layer (R3). A layer that
 * is not installed is named with the command to run; one that refuses refuses the check.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ExitCode } from './exit-code.js';
import { checkLocales, countFor, formsOf, isOwnedElsewhere, type LocaleMessages, type LocaleRefusal, type Locales, type Message, render } from './locale.js';
import { Manifest } from './manifest.js';
import { MESSAGES } from './messages.js';
import { type Plugin, PluginError, validate } from './plugin.js';

export interface CheckReport {
  name: string;
  commands: { path: string; description: string; effects: string }[];
  hooks: { stage: 'preRun' | 'postRun' | 'onError'; applies: string }[];
  /**
   * A locale pack's every message, rendered (`localised-human-surfaces` R4): each placeholder as
   * `<name>`, and a plural message once per form, with a count that selects it. Present only
   * for a plugin that carries `locales`.
   */
  locales?: { locale: string; messages: { id: string; form?: string; text: string }[]; coverage: Coverage }[];
  /** Each other layer the plugin reaches, and what its own `check` said. Present only for a plugin that reaches one. */
  layers?: Layer[];
}

/** One layer's verdict on the keys it hosts, as its own `check` gave it. */
export interface Layer {
  host: string;
  /** The plugin's keys this layer hosts, in the plugin's order. */
  keys: string[];
  /** The command that checks them: the one that ran, or the one to run where the layer is not installed. */
  run: string;
  /** The layer's exit code. Absent when no `node_modules/<host>` with its bin is at or above the plugin's directory. */
  exitCode?: number;
  /** What the layer's `check` printed. */
  output?: string;
}

/**
 * The family key each other layer hosts, and the layer: R4's "one key, one host". A table, not a
 * probe, because a key is a promise a layer makes; a `Map`, so a key `Object.prototype` has
 * (`constructor`) routes nowhere. `scripts/plugin-check-lock.test.ts` holds it to the family
 * schema, so a key the schema gains without a row here fails there.
 */
export const LAYERS: ReadonlyMap<string, string> = new Map([
  ['tokens', 'roundel'],
  ['glyphs', 'flagstaff'],
  ['spinners', 'flagstaff'],
  ['borders', 'flagstaff'],
  ['components', 'flagstaff'],
  ['widgets', 'caique'],
  ['capabilities', 'paratext'],
  ['sources', 'seniority'],
  ['handlers', 'closeout'],
  ['resolvers', 'bellpull'],
  ['widths', 'linegauge'],
  ['keymaps', 'controlroom'],
  ['panes', 'controlroom'],
]);

/**
 * What a passing pack covers of burgee's catalog, per locale (`locale-pack-in-five` R1), so the
 * check that accepts a pack is also the verification an author would otherwise run by hand:
 * which ids are translated, which are left in English, and, for each message that takes a
 * `{count}`, the plural forms written against the forms `Intl.PluralRules` selects there. A
 * passing pack writes every form or none: a single string serves every count, and a pack missing
 * a form is refused before this is built.
 */
export interface Coverage {
  translated: string[];
  missing: string[];
  plural: Record<string, { have: string[]; need: string[] }>;
}

export interface CheckRefusal {
  /**
   * `problems`, on a locale pack's refusal: every problem the pack has, each with its own fix, found in one run.
   * `code` is the family's vocabulary: burgee's own, or the code another layer's `check` refused with.
   */
  refused: { code: string; message: string; fix: string; problems?: readonly { message: string; fix: string }[] };
  exitCode: ExitCode;
}

const STAGES = ['preRun', 'postRun', 'onError'] as const;

const refuse = (code: string, message: string, fix: string, problems?: CheckRefusal['refused']['problems']): CheckRefusal => ({
  refused: { code, message, fix, ...(problems === undefined ? {} : { problems }) },
  exitCode: ExitCode.RUNTIME,
});

/**
 * The plugin a file holds. A `.json` file is read as data: `import()` of one throws
 * ERR_IMPORT_ATTRIBUTE_MISSING without `with: { type: 'json' }`, and on Node 20 a JSON module
 * with it still prints an ExperimentalWarning — and the example locale pack is JSON. Decoded by
 * `TextDecoder`, which drops a byte-order mark that `JSON.parse` would refuse.
 */
async function load(path: string): Promise<unknown> {
  // Stryker disable next-line ConditionalExpression,MethodExpression: under vitest's loader `import()` reads JSON too, so only the built bin tells the two paths apart — scripts/plugin-check-lock.test.ts spawns it on the example pack
  if (path.endsWith('.json')) return JSON.parse(new TextDecoder().decode(await readFile(path)));
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the file to check is the user's own, named on the command line
  const loaded = (await import(pathToFileURL(path).href)) as { default?: unknown };
  return loaded.default ?? loaded;
}

export async function checkPlugin(file: string): Promise<CheckReport | CheckRefusal> {
  const plugin = await load(resolve(file));
  try {
    validate(plugin, []);
    new Manifest().use(plugin as Plugin);
    checkLocales(plugin as Plugin);
  } catch (error) {
    if (error instanceof PluginError) return refuse(error.code, error.message, error.fix, (error as PluginError & Partial<LocaleRefusal>).problems);
    // `use()` refuses a contributed command through `checkCommand`, which throws a plain
    // `Error` naming the problem — the same words a first-party command gets.
    if (error instanceof Error) return refuse('E_PLUGIN_SCHEMA', error.message, 'fix the contributed command the message names; it is checked exactly as one of the program’s own');
    throw error;
  }
  const { name, commands = [], hooks = {}, locales } = plugin as Plugin;
  const layers = layersOf(plugin as object, resolve(file));
  const refusing = layers.find((layer) => (layer.exitCode ?? 0) !== 0);
  if (refusing !== undefined) return refusedBy(refusing, name);
  const report: CheckReport = {
    name,
    commands: commands.map((c) => ({ path: c.path.join(' '), description: c.description ?? '', effects: String(c.effects ?? 'undeclared') })),
    hooks: STAGES.filter((stage) => hooks[stage] !== undefined).map((stage) => ({
      stage,
      applies: hooks[stage]?.filter?.command === undefined ? 'every command' : `commands matching ${String(hooks[stage]?.filter?.command)}`,
    })),
    ...(locales === undefined ? {} : { locales: rendered(locales) }),
    ...(layers.length === 0 ? {} : { layers }),
  };
  if (report.commands.length === 0 && report.hooks.length === 0 && (report.locales ?? []).length === 0 && layers.length === 0) {
    return refuse(
      'E_NO_CONTRIBUTION',
      `${name} registers, but contributes nothing any layer of the family reads`,
      'add a key the family schema (burgee/schema.json) describes: `commands`, `hooks` or `locales` for burgee, or another layer’s, such as `tokens` for roundel or `spinners` for flagstaff',
    );
  }
  return report;
}

/** The layers a plugin reaches beyond burgee, each with the keys it hosts, in the order the plugin names them. */
function reached(plugin: object): Map<string, string[]> {
  const byHost = new Map<string, string[]>();
  for (const key of Object.keys(plugin)) {
    const host = LAYERS.get(key);
    if (host !== undefined) byHost.set(host, [...(byHost.get(host) ?? []), key]);
  }
  return byHost;
}

/**
 * The layer's bin, from the nearest `node_modules/<host>` at or above `dir`, where Node would
 * resolve the package from a module there. Read from its `package.json`, never imported.
 */
function binOf(host: string, dir: string): string | undefined {
  const pkg = join(dir, 'node_modules', host, 'package.json');
  if (existsSync(pkg)) {
    const { bin } = JSON.parse(readFileSync(pkg).toString()) as { bin?: string | Record<string, string> };
    const file = typeof bin === 'string' ? bin : bin?.[host];
    return file === undefined ? undefined : join(dirname(pkg), file);
  }
  const parent = dirname(dir);
  return parent === dir ? undefined : binOf(host, parent);
}

/** Every layer the plugin reaches, each checked by its own installed `check`, or named for the author to run. */
function layersOf(plugin: object, file: string): Layer[] {
  return [...reached(plugin)].map(([host, keys]) => {
    const bin = binOf(host, dirname(file));
    if (bin === undefined) return { host, keys, run: `npx ${host} check ${file}` };
    const ran = spawnSync(process.execPath, [bin, 'check', file]);
    return { host, keys, run: `${host} check ${file}`, exitCode: ran.status ?? ExitCode.RUNTIME, output: Buffer.concat([ran.stdout, ran.stderr]).toString() };
  });
}

/** A layer's refusal as burgee's: the family's `CODE: message` and `  fix: …` lines, which every layer's `check` prints (R8). */
function refusedBy(layer: Layer, name: string): CheckRefusal {
  const said = /^(E_[A-Z_]+): (.*)\n {2}fix: (.*)/mu.exec(layer.output ?? '');
  if (said === null) return refuse('E_PLUGIN_SCHEMA', `${layer.host} check exited ${String(layer.exitCode)} on ${name}`, `run \`${layer.run}\` and fix what it prints`);
  const [, code, message, fix] = said;
  return refuse(String(code), `${layer.host}: ${String(message)}`, String(fix));
}

/** Every value a placeholder can take in a rendering: its own name, so the reader sees where it lands. */
const named = (count: number): Record<string, string> => new Proxy({ count: String(count) }, { get: (counted, name: string) => (name === 'count' ? counted.count : `<${name}>`) });

/** One message as `rendered` lists it: once, or once per plural form; nothing for an id another package owns. */
function each(locale: string, id: string, message: Message): { id: string; form?: string; text: string }[] {
  if (isOwnedElsewhere(id)) return [];
  if (typeof message === 'string') return [{ id, text: render(message, named(0), locale) }];
  return Object.keys(message).map((form) => ({ id, form, text: render(message, named(countFor(locale, form)), locale) }));
}

/**
 * R4 — each of burgee's messages of each locale, rendered as a run would render it. The pack has
 * passed `checkLocales`. An id another package owns (`caique.…`) is that package's to render.
 */
function rendered(locales: Locales): NonNullable<CheckReport['locales']> {
  return Object.entries(locales).map(([locale, messages]) => ({
    locale,
    messages: Object.entries(messages).flatMap(([id, message]: [string, Message]) => each(locale, id, message)),
    coverage: coverageOf(locale, messages),
  }));
}

/** R1 of `locale-pack-in-five`: the catalog against one locale's messages, in the catalog's order. */
function coverageOf(locale: string, messages: LocaleMessages): Coverage {
  const ids = Object.keys(MESSAGES) as (keyof typeof MESSAGES)[];
  const need = formsOf(locale);
  const plural = ids
    .filter((id) => MESSAGES[id].includes('{count}'))
    // The pack has passed `checkLocales`, so a plural message it writes has exactly the forms the
    // locale selects, and one string serves every count: written is every form, left out is none.
    .map((id): [string, Coverage['plural'][string]] => [id, { have: messages[id] === undefined ? [] : [...need], need: [...need] }]);
  return {
    translated: ids.filter((id) => messages[id] !== undefined),
    missing: ids.filter((id) => messages[id] === undefined),
    plural: Object.fromEntries(plural),
  };
}
