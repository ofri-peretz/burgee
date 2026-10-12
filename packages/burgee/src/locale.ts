/* eslint-disable maintainability/no-missing-error-context, reliability/no-missing-error-context -- every refusal here is a `PluginError`, whose message is argument two because argument one is the family's code; `plugin.ts` carries the same exemption for the same call shape. */
/**
 * Which language a run speaks to a person, and what a locale pack says in it
 * (`localised-human-surfaces` R2, R4).
 *
 * Reached only through `await import()` from the two paths that write prose — `failure.ts`
 * for a refusal and `surfaces.ts` for help — and from `check.ts`. A run that succeeds, and
 * every machine surface, loads none of it: that is how the core byte budget holds (the
 * intent's constraint) and why no machine output can read it (R3).
 *
 * **English is never looked up.** The engine prints the English it always printed, from the
 * call site, and {@link Localiser.say} recognises a finished English line by matching it
 * against the catalog's templates (`messages.ts`), then renders the pack's message with the
 * values the English carried. A line the catalog does not hold, or a pack does not translate,
 * is returned as it came — so an untranslated message degrades to English, never to an id.
 */
import { detectAgent } from './agent.js';
import { type CommandNode, type Manifest } from './manifest.js';
import { MESSAGES, type MessageId } from './messages.js';
import { type Plugin, PluginError } from './plugin.js';

/** A translation: one string, or — for a message that carries `{count}` — one per plural form. */
export type Message = string | Readonly<Partial<Record<Intl.LDMLPluralRule, string>>>;

/** One language's translations, keyed by catalog id. */
export type LocaleMessages = Readonly<Partial<Record<MessageId, Message>>>;

/** A pack's `locales`: BCP 47 tag → its messages. The whole of what a pack contributes. */
export type Locales = Readonly<Record<string, LocaleMessages>>;

/** The variables POSIX reads for the language of messages, most specific first. */
const POSIX = ['LC_ALL', 'LC_MESSAGES', 'LANG'] as const;

/**
 * A tag as `Intl.Locale` writes it, or `undefined` for the base language: `C`, `POSIX`, an
 * empty value and a tag `Intl.Locale` refuses all mean "the program's own words". The POSIX
 * codeset and modifier (`.UTF-8`, `@latin`) are not BCP 47 and are dropped first.
 */
function normalise(raw: string): string | undefined {
  const bare = (raw.split(/[.@]/u)[0] as string).replaceAll('_', '-');
  if (bare === 'C' || bare === 'POSIX') return undefined;
  try {
    return new Intl.Locale(bare).toString();
  } catch {
    return undefined;
  }
}

/**
 * R2 — the run's locale: the program's `locale` option, then `BURGEE_LOCALE`, then `LC_ALL`,
 * `LC_MESSAGES`, `LANG`, the first that is set and not empty. `undefined` is the base language.
 *
 * **Under agent detection the POSIX variables are not read.** An agent inherits its user's
 * `LANG` without having asked for anything, and reads the prose it is given; only the program
 * or an explicit `BURGEE_LOCALE` localises for it (the intent's first open question).
 */
export function resolveLocale(option: string | undefined, env: Record<string, string | undefined>): string | undefined {
  const agent = detectAgent(env, false).agent !== undefined;
  const asked = [option, env['BURGEE_LOCALE'], ...(agent ? [] : POSIX.map((name) => env[name]))].find((v) => v !== undefined && v !== '');
  return asked === undefined ? undefined : normalise(asked);
}

/** Where a pack is looked for: the tag, then its bare language — `de-DE`, then `de`. */
export function candidatesOf(tag: string): string[] {
  const { language } = new Intl.Locale(tag);
  return language === tag ? [tag] : [tag, language];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const placeholders = (template: string): string[] => [...template.matchAll(/\{(\w+)\}/gu)].map((m) => m[1] as string);

/** The plural forms `Intl.PluralRules` selects among for `locale`: `one, other` for German, six for Arabic. */
const formsOf = (locale: string): readonly Intl.LDMLPluralRule[] => new Intl.PluralRules(locale).resolvedOptions().pluralCategories;

const refuse = (name: string, message: string, fix: string): PluginError => new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": ${message}`, fix);

/** One translation against its English: no placeholder the English lacks (R4). */
function checkText(name: string, at: string, text: unknown, english: string): void {
  if (typeof text !== 'string') throw refuse(name, `${at} is not a string`, 'write the translation as a string');
  const known = placeholders(english);
  const stray = placeholders(text).find((p) => !known.includes(p));
  if (stray !== undefined) {
    throw refuse(name, `${at} has {${stray}}, which the English "${english}" does not`, known.length === 0 ? 'take the placeholder out: this message has none' : `use only ${known.map((p) => `{${p}}`).join(', ')}`);
  }
}

/**
 * Ids another package in the family owns: one pack object carries every package's messages, the
 * way one plugin object carries every package's keys, so burgee leaves these to their owner's
 * own check rather than refusing them as unknown. caique's prompt chrome is the one so far (R6).
 */
export const isOwnedElsewhere = (id: string): boolean => id.startsWith('caique.');

/** One message: a string, or — only where the English carries `{count}` — every form the locale selects (R4). */
function checkMessage(name: string, locale: string, id: string, message: unknown): void {
  if (isOwnedElsewhere(id)) return;
  const at = `locales.${locale}["${id}"]`;
  const english = MESSAGES[id as MessageId] as string | undefined;
  if (english === undefined) throw refuse(name, `${at} is not a message burgee has`, 'use an id from burgee/locale-pack-schema.json; `burgee check` lists the catalog');
  if (!isRecord(message)) return checkText(name, at, message, english);
  if (!placeholders(english).includes('count')) throw refuse(name, `${at} has plural forms, and the English has no {count}`, 'write it as one string');
  const forms = formsOf(locale);
  const missing = forms.filter((form) => message[form] === undefined);
  if (missing.length > 0) throw refuse(name, `${at} is missing the plural form${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`, `give every form Intl.PluralRules selects for ${locale}: ${forms.join(', ')}`);
  for (const [form, text] of Object.entries(message)) {
    if (!(forms as readonly string[]).includes(form)) throw refuse(name, `${at}.${form} is not a plural form of ${locale}`, `use ${forms.join(', ')}`);
    checkText(name, `${at}.${form}`, text, english);
  }
}

/**
 * R4 — refuse a pack that cannot be rendered: a tag `Intl.Locale` does not read, an id the
 * catalog does not have, a placeholder the English does not have, a plural message missing a
 * form its locale selects. In the family's one vocabulary, `E_PLUGIN_SCHEMA` with a `fix`.
 *
 * A plugin without `locales` passes untouched: the key is this file's, and every other key is
 * someone else's (`plugin.ts`).
 */
export function checkLocales(plugin: Pick<Plugin, 'name'> & { locales?: unknown }): void {
  const { name, locales } = plugin;
  if (locales === undefined) return;
  if (!isRecord(locales)) throw refuse(name, 'locales must be an object', 'map a language tag to its messages: `{ de: { "usage.unknownOption": "…" } }`');
  for (const [locale, messages] of Object.entries(locales)) {
    if (normalise(locale) !== locale) throw refuse(name, `locales has "${locale}", which is not a language tag as Intl.Locale writes it`, `write it ${normalise(locale) === undefined ? 'as a BCP 47 tag, such as de or pt-BR' : `as "${String(normalise(locale))}"`}`);
    if (!isRecord(messages)) throw refuse(name, `locales.${locale} must be an object`, 'map a message id to its translation');
    for (const [id, message] of Object.entries(messages)) checkMessage(name, locale, id, message);
  }
}

/**
 * A message in `locale`, with the values put back: the plural form by `count`, then each
 * `{name}`. Only a pack {@link checkLocales} has passed reaches here, so every form the locale
 * selects is present and every placeholder is one the English carried a value for.
 */
export function render(message: Message, values: Readonly<Record<string, string>>, locale: string): string {
  const text = typeof message === 'string' ? message : (message[new Intl.PluralRules(locale).select(Number(values['count']))] as string);
  return text.replaceAll(/\{(\w+)\}/gu, (_, name: string) => values[name] as string);
}

/**
 * A template as the pattern its English instances match, each placeholder a named group. The
 * template is the catalog's, never input, and is escaped before it is built; the input it is
 * run against is bounded by {@link LONGEST} below, because each lazy group between two
 * literals can be tried at every position a typed value offers.
 */
function patternOf(template: string): RegExp {
  const escaped = template.replaceAll(/[.*+?^$()|[\]\\]/gu, '\\$&').replaceAll(/\\?\{(\w+)\\?\}/gu, '(?<$1>.+?)');
  // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- built from the committed catalog, escaped above; matched only against lines of at most LONGEST characters
  return new RegExp(`^${escaped}$`, 'u');
}

/** The longest line `say` matches: past it a line is returned in English, so no typed value makes matching slow. */
const LONGEST = 2048;

/** Literal characters in a template: the more it fixes, the earlier it is tried, so `pass --{option} <value>` wins over `pass {option} {value}`. */
const fixed = (template: string): number => template.replaceAll(/\{\w+\}/gu, '').length;

/** The catalog as patterns, most specific first. Built once per process, on the first localised line. */
let patterns: { id: MessageId; pattern: RegExp }[] | undefined;

function catalog(): { id: MessageId; pattern: RegExp }[] {
  patterns ??= (Object.entries(MESSAGES) as [MessageId, string][]).toSorted(([, a], [, b]) => fixed(b) - fixed(a)).map(([id, template]) => ({ id, pattern: patternOf(template) }));
  return patterns;
}

/** What a localised run's prose paths are handed. */
export interface Localiser {
  /** The resolved tag, `Intl.Locale`'s spelling. */
  locale: string;
  /**
   * An English line in the run's language: the pack's message for the catalog entry the line
   * is an instance of, with its values. `prefix` narrows the entries tried (`'help.'`), so an
   * author's own description is never mistaken for an engine sentence it happens to resemble.
   */
  say: (english: string, prefix?: string) => string;
}

/**
 * The run's localiser, or `undefined` when it speaks the base language: no locale resolved, or
 * no registered plugin has messages for it. Every pack consulted is checked first (R4), so a
 * pack that cannot be rendered is refused where it would have been used.
 */
export function localiserOf(plugins: readonly Plugin[], locale: string | undefined): Localiser | undefined {
  if (locale === undefined) return undefined;
  const merged = new Map<string, Message>();
  // Least specific first, so `de-DE`'s own message overrides `de`'s, and a later plugin a former one.
  for (const tag of candidatesOf(locale).toReversed()) {
    for (const plugin of plugins as readonly (Plugin & { locales?: Locales })[]) {
      const messages = plugin.locales?.[tag];
      if (messages === undefined) continue;
      checkLocales(plugin);
      for (const [id, message] of Object.entries(messages)) merged.set(id, message as Message);
    }
  }
  if (merged.size === 0) return undefined;
  const say = (english: string, prefix = ''): string => {
    if (english.length > LONGEST) return english;
    for (const { id, pattern } of catalog()) {
      if (!id.startsWith(prefix)) continue;
      const match = pattern.exec(english);
      if (match === null) continue;
      const message = merged.get(id);
      return message === undefined ? english : render(message, { ...match.groups }, locale);
    }
    return english;
  };
  return { locale, say };
}

/** The run's localiser from its manifest and io: the one call each prose path makes. */
export const localiserFor = (manifest: Pick<Manifest, 'plugins'>, io: { env: Record<string, string | undefined>; locale?: string | undefined }): Localiser | undefined =>
  localiserOf(manifest.plugins, resolveLocale(io.locale, io.env));

/** Where `execute.ts` keeps a declaration written with a {@link Localised} text (R5). */
const LOCALISED = Symbol.for('burgee.localised');

/**
 * R5 — a declaration in the run's locale: each `description` and `summary` the author wrote as
 * locale → text, read for the tag, then its bare language, and otherwise left in the base
 * language the manifest already holds. Anything else is returned as it came.
 */
export function inLocale<T extends object>(node: T, locale: string | undefined): T {
  const declared = (node as Record<symbol, Record<string, unknown> | undefined>)[LOCALISED];
  if (declared === undefined || locale === undefined) return node;
  const out: Record<string, unknown> = { ...(node as Record<string, unknown>) };
  for (const key of ['description', 'summary']) {
    const texts = declared[key];
    if (!(texts instanceof Object)) continue;
    const text = candidatesOf(locale)
      .map((tag) => (texts as Record<string, string | undefined>)[tag])
      .find((t) => t !== undefined);
    if (text !== undefined) out[key] = text;
  }
  return out as T;
}

/** A command as help renders it in `locale`: its own texts, its options' and its examples' (R5). */
export const commandInLocale = (node: CommandNode, locale: string | undefined): CommandNode => ({
  ...inLocale(node, locale),
  options: Object.fromEntries(Object.entries(node.options).map(([key, spec]) => [key, inLocale(spec, locale)])),
  ...(node.examples === undefined ? {} : { examples: node.examples.map((e) => inLocale(e, locale)) }),
});
