/* eslint-disable maintainability/no-missing-error-context, reliability/no-missing-error-context -- every refusal here is a `PluginError`, whose message is argument two because argument one is the family's code; `plugin.ts` carries the same call shape. */
/**
 * What a locale pack says in caique's chrome (`localised-human-surfaces` R6): the check a pack
 * passes at `register()`, and the translator a run with a locale hands its widgets.
 *
 * The locale is the caller's: `runtime.locale`, which burgee resolves (its R2) and a program may
 * set itself. caique does not read `LANG`, so it cannot disagree with the host about what
 * language a run speaks. Published at `caique/locale` and reached by nothing else but `check.ts`:
 * a caller with a locale builds `io.say` here and hands it to `ask` or `resolvePrompts`, so
 * neither carries the catalog, and a run without a locale pays nothing. A pack is checked where it is
 * first used, by the run whose locale it speaks, and in full by `caique check`.
 */
import { MESSAGES, type MessageId } from './messages.js';
import { PluginError, registered } from './plugin.js';

/** A translation: one string, or — for a message that carries `{count}` — one per plural form. */
export type Message = string | Readonly<Partial<Record<Intl.LDMLPluralRule, string>>>;

/** A pack's `locales`: language tag → message id → translation. Ids outside `caique.` are another package's. */
export type Locales = Readonly<Record<string, Readonly<Record<string, Message>>>>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const placeholders = (template: string): string[] => [...template.matchAll(/\{(\w+)\}/gu)].map((m) => m[1] as string);

const refuse = (name: string, message: string, fix: string): PluginError => new PluginError('E_PLUGIN_SCHEMA', `plugin "${name}": ${message}`, fix);

function checkText(name: string, at: string, text: unknown, english: string): void {
  if (typeof text !== 'string') throw refuse(name, `${at} is not a string`, 'write the translation as a string');
  const known = placeholders(english);
  const stray = placeholders(text).find((p) => !known.includes(p));
  if (stray !== undefined) throw refuse(name, `${at} has {${stray}}, which the English "${english}" does not`, known.length === 0 ? 'take the placeholder out: this message has none' : `use only ${known.map((p) => `{${p}}`).join(', ')}`);
}

function checkMessage(name: string, locale: string, id: string, message: unknown): void {
  if (!id.startsWith('caique.')) return;
  const at = `locales.${locale}["${id}"]`;
  const english = MESSAGES[id as MessageId] as string | undefined;
  if (english === undefined) throw refuse(name, `${at} is not a message caique has`, `use one of ${Object.keys(MESSAGES).join(', ')}`);
  if (!isRecord(message)) return checkText(name, at, message, english);
  if (!placeholders(english).includes('count')) throw refuse(name, `${at} has plural forms, and the English has no {count}`, 'write it as one string');
  const forms = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  const missing = forms.filter((form) => message[form] === undefined);
  if (missing.length > 0) throw refuse(name, `${at} is missing the plural form${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`, `give every form Intl.PluralRules selects for ${locale}: ${forms.join(', ')}`);
  for (const [form, text] of Object.entries(message)) {
    if (!(forms as readonly string[]).includes(form)) throw refuse(name, `${at}.${form} is not a plural form of ${locale}`, `use ${forms.join(', ')}`);
    checkText(name, `${at}.${form}`, text, english);
  }
}

/**
 * R6 — refuse a pack whose caique messages cannot be rendered: an id caique does not have, a
 * placeholder the English lacks, a plural message missing a form its locale selects. Ids that
 * do not begin `caique.` are another package's and are left to it. A tag is burgee's to check,
 * which reads it the same way; here it only has to name an object.
 */
export function checkLocales(plugin: { name: string; locales?: unknown }): void {
  const { name, locales } = plugin;
  if (locales === undefined) return;
  if (!isRecord(locales)) throw refuse(name, 'locales must be an object', 'map a language tag to its messages: `{ de: { "caique.answerYesNo": "…" } }`');
  for (const [locale, messages] of Object.entries(locales)) {
    if (!isRecord(messages)) throw refuse(name, `locales.${locale} must be an object`, 'map a message id to its translation');
    for (const [id, message] of Object.entries(messages)) checkMessage(name, locale, id, message);
  }
}

/** A checked message in `locale`, with the values put back: the plural form by `count`, then each `{name}`. */
export function render(message: Message, values: Readonly<Record<string, string>>, locale: string): string {
  const text = typeof message === 'string' ? message : (message[new Intl.PluralRules(locale).select(Number(values['count']))] as string);
  return text.replaceAll(/\{(\w+)\}/gu, (_, name: string) => values[name] as string);
}

/** The longest line `say` matches; past it a line stays English, so no typed answer makes matching slow. */
const LONGEST = 2048;

/** The catalog as patterns, most specific first: the more literal text a template fixes, the earlier it is tried. */
const PATTERNS = (Object.entries(MESSAGES) as [MessageId, string][])
  .toSorted(([, a], [, b]) => b.replaceAll(/\{\w+\}/gu, '').length - a.replaceAll(/\{\w+\}/gu, '').length)
  .map(([id, template]) => {
    const escaped = template.replaceAll(/[.*+?^$()|[\]\\]/gu, '\\$&').replaceAll(/\\?\{(\w+)\\?\}/gu, '(?<$1>.+?)');
    // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- built from the committed catalog, escaped above; matched only against lines of at most LONGEST characters
    return { id, pattern: new RegExp(`^${escaped}$`, 'u') };
  });

/** Where a pack is looked for: the tag, then its bare language — `de-DE`, then `de`. */
const candidatesOf = (tag: string): string[] => {
  const { language } = new Intl.Locale(tag);
  return language === tag ? [tag] : [tag, language];
};

/**
 * R6 — the run's translator: an English line of caique's in `locale`, from the registered packs.
 * The identity when there is no locale, no pack speaks it, or the line is not one of caique's.
 */
/** caique's messages for `locale` from every registered pack, each pack checked first: `de` under `de-DE`, a later pack over an earlier. */
function messagesFor(locale: string): Map<string, Message> {
  const merged = new Map<string, Message>();
  for (const tag of candidatesOf(locale).toReversed()) {
    for (const plugin of registered() as readonly { name: string; locales?: Locales }[]) {
      const messages = plugin.locales?.[tag];
      if (messages === undefined) continue;
      checkLocales(plugin);
      for (const [id, message] of Object.entries(messages)) if (id.startsWith('caique.')) merged.set(id, message);
    }
  }
  return merged;
}

export function sayFor(locale: string | undefined): (english: string) => string {
  if (locale === undefined) return String;
  const merged = messagesFor(locale);
  if (merged.size === 0) return String;
  return (english) => {
    if (english.length > LONGEST) return english;
    for (const { id, pattern } of PATTERNS) {
      const match = pattern.exec(english);
      if (match === null) continue;
      const message = merged.get(id);
      return message === undefined ? english : render(message, { ...match.groups }, locale);
    }
    return english;
  };
}
