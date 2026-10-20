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
 */
import { resolve } from 'node:path';
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
}

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
  /** `problems`, on a locale pack's refusal: every problem the pack has, each with its own fix, found in one run. */
  refused: { code: string; message: string; fix: string; problems?: readonly { message: string; fix: string }[] };
  exitCode: ExitCode;
}

const STAGES = ['preRun', 'postRun', 'onError'] as const;

const refuse = (code: string, message: string, fix: string, problems?: CheckRefusal['refused']['problems']): CheckRefusal => ({
  refused: { code, message, fix, ...(problems === undefined ? {} : { problems }) },
  exitCode: ExitCode.RUNTIME,
});

export async function checkPlugin(file: string): Promise<CheckReport | CheckRefusal> {
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the file to check is the user's own, named on the command line
  const loaded = (await import(pathToFileURL(resolve(file)).href)) as { default?: unknown };
  const plugin: unknown = loaded.default ?? loaded;
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
  const report: CheckReport = {
    name,
    commands: commands.map((c) => ({ path: c.path.join(' '), description: c.description ?? '', effects: String(c.effects ?? 'undeclared') })),
    hooks: STAGES.filter((stage) => hooks[stage] !== undefined).map((stage) => ({
      stage,
      applies: hooks[stage]?.filter?.command === undefined ? 'every command' : `commands matching ${String(hooks[stage]?.filter?.command)}`,
    })),
    ...(locales === undefined ? {} : { locales: rendered(locales) }),
  };
  if (report.commands.length === 0 && report.hooks.length === 0 && (report.locales ?? []).length === 0) {
    return refuse(
      'E_NO_CONTRIBUTION',
      `${name} registers, but contributes nothing burgee reads`,
      'add `commands`, `hooks` or `locales` — a key another package in the family reads is allowed in the same object, but `burgee check` cannot show it',
    );
  }
  return report;
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
