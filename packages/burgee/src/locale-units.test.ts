/**
 * Locale packs piece by piece: which variables name the run's language, every refusal's own fix,
 * a problem found after a message that passes, and which catalog line `say` matches when two
 * could.
 */
import { describe, expect, it } from 'vitest';

import { checkLocales, formsOf, localiserOf, resolveLocale } from './locale.js';
import { MESSAGES } from './messages.js';
import { type Plugin } from './plugin.js';

const refusal = (locales: unknown): unknown => {
  try {
    checkLocales({ name: 'p', locales });
  } catch (error) {
    return error;
  }
  return undefined;
};
const pack = (name: string, locales: unknown): Plugin => ({ name, contract: 1, locales }) as unknown as Plugin;

describe('resolveLocale', () => {
  it('reads C and POSIX as the base language, and a real tag in POSIX spelling as itself', () => {
    expect(resolveLocale(undefined, { LANG: 'C' })).toBeUndefined();
    expect(resolveLocale(undefined, { LANG: 'POSIX' })).toBeUndefined();
    expect(resolveLocale(undefined, { LANG: 'de_DE.UTF-8' })).toBe('de-DE');
  });

  it('does not read LANG under an agent', () => {
    expect(resolveLocale(undefined, { CLAUDECODE: '1', LANG: 'de_DE.UTF-8' })).toBeUndefined();
  });
});

describe('formsOf', () => {
  it('lists every CLDR category a locale selects, in CLDR order', () => {
    expect(formsOf('ar')).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
    expect(formsOf('cy')).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
  });
});

describe('checkLocales, each refusal with its own fix', () => {
  it.each([
    ['locales that are a list', [], 'map a language tag to its messages: `{ de: { "usage.unknownOption": "…" } }`'],
    ['a locale that is not an object', { de: 5 }, 'map a message id to its translation'],
    ['a tag Intl.Locale refuses', { 'not a tag!': {} }, 'write it as a BCP 47 tag, such as de or pt-BR'],
    ['a translation that is not a string', { de: { 'usage.unknownOption': 5 } }, 'write the translation as a string'],
    ['a placeholder the English lacks', { de: { 'usage.number': '{option} {x}' } }, 'use only {option}, {value}'],
    ['plural forms for a message with no count', { de: { 'usage.unknownOption': { one: 'a', other: 'b' } } }, 'write it as one string'],
  ])('%s', (_, locales, fix) => {
    expect(refusal(locales)).toMatchObject({ fix });
  });

  it('names every missing plural form', () => {
    expect(refusal({ ru: { 'usage.stdinOnce': { one: '{count}', other: '{count}' } } })).toMatchObject({ fix: expect.stringMatching(/^add "few", "many" beside the others/) });
  });

  it('checks the text of each plural form, and names the form', () => {
    expect(refusal({ de: { 'usage.stdinOnce': { one: '{x}', other: '{count}' } } })).toMatchObject({
      message: expect.stringMatching(/^plugin "p": locales\.de\["usage\.stdinOnce"\]\.one has \{x\}/),
    });
  });

  it('refuses a problem that follows a message that passes', () => {
    expect(refusal({ de: { 'usage.unknownOption': 'unbekannte Option {option}', 'usage.unknownCommand': 5 } })).toMatchObject({ fix: 'write the translation as a string' });
  });
});

describe('localiserOf', () => {
  const de = pack('de', { de: { 'usage.unknownOption': 'unbekannte Option {option}', 'hint.passOption': 'A {option}', 'hint.passValue': 'B {option} {value}', 'hint.passChoice': 'C {option} {value}' } });

  it('checks only the packs that speak the locale', () => {
    expect(localiserOf([pack('fr', { fr: { nope: 'x' } }), de], 'de')?.say('unknown option --x')).toBe('unbekannte Option --x');
  });

  it('translates a line of exactly the longest length, and returns one past it in English', () => {
    const say = localiserOf([de], 'de')?.say as (english: string, prefix?: string) => string;
    const at = `unknown option ${'x'.repeat(2048 - 'unknown option '.length)}`;
    expect(say(at)).toBe(`unbekannte Option ${at.slice('unknown option '.length)}`);
    expect(say(`${at}x`)).toBe(`${at}x`);
  });

  it('tries only the ids under the prefix it is given', () => {
    expect(localiserOf([de], 'de')?.say('unknown option --x', 'help.')).toBe('unknown option --x');
  });

  it('matches the line with the most literal text first', () => {
    expect(localiserOf([de], 'de')?.say('pass --x <value>')).toBe('A x');
  });

  it('reads every catalog line as its own message, however many others it also matches', () => {
    // Each id rendered as itself, the plural one in both German forms.
    const own = Object.fromEntries(Object.keys(MESSAGES).map((id) => [id, MESSAGES[id as keyof typeof MESSAGES].includes('{count}') ? { one: `[${id}]`, other: `[${id}]` } : `[${id}]`]));
    const say = localiserOf([pack('own', { de: own })], 'de')?.say as (english: string) => string;
    for (const [id, template] of Object.entries(MESSAGES)) {
      // Each placeholder filled with a value of its own, so no two fill alike.
      const instance = template.replaceAll(/\{(\w+)\}/gu, (_, name: string) => `v${String(name.length)}`);
      expect(say(instance), id).toBe(`[${id}]`);
    }
  });
});
