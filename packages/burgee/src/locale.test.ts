/**
 * `localised-human-surfaces` R2 — the locale is resolved once, natively: the program's option,
 * then `BURGEE_LOCALE`, then `LC_ALL`, `LC_MESSAGES`, `LANG`; normalised through `Intl.Locale`;
 * `C` and `POSIX` are the base language; under agent detection only the first two apply.
 */
import { describe, expect, it } from 'vitest';

import { candidatesOf, localiserOf, resolveLocale } from './locale.js';
import { type Plugin } from './plugin.js';

describe('resolveLocale (R2)', () => {
  it('takes the first that is set: option, BURGEE_LOCALE, LC_ALL, LC_MESSAGES, LANG', () => {
    const env = { BURGEE_LOCALE: 'fr', LC_ALL: 'es_ES.UTF-8', LC_MESSAGES: 'it_IT', LANG: 'de_DE.UTF-8' };
    expect(resolveLocale('pt-BR', env)).toBe('pt-BR');
    expect(resolveLocale(undefined, env)).toBe('fr');
    expect(resolveLocale(undefined, { ...env, BURGEE_LOCALE: undefined })).toBe('es-ES');
    expect(resolveLocale(undefined, { LC_MESSAGES: 'it_IT', LANG: 'de_DE.UTF-8' })).toBe('it-IT');
    expect(resolveLocale(undefined, { LANG: 'de_DE.UTF-8' })).toBe('de-DE');
  });

  it('skips a variable that is set but empty, as POSIX does', () => {
    expect(resolveLocale('', { BURGEE_LOCALE: '', LC_ALL: '', LANG: 'de_DE' })).toBe('de-DE');
  });

  it('reads C and POSIX, with or without a codeset, as the base language', () => {
    for (const lang of ['C', 'POSIX', 'C.UTF-8', 'POSIX.utf8']) expect(resolveLocale(undefined, { LANG: lang })).toBeUndefined();
    // The first one set decides, so `LC_ALL=C` over a German `LANG` is the base language.
    expect(resolveLocale(undefined, { LC_ALL: 'C', LANG: 'de_DE.UTF-8' })).toBeUndefined();
  });

  it('normalises de_DE.UTF-8 and a @modifier through Intl.Locale', () => {
    expect(resolveLocale(undefined, { LANG: 'de_DE.UTF-8' })).toBe('de-DE');
    expect(resolveLocale(undefined, { LANG: 'sr_RS@latin' })).toBe('sr-RS');
    expect(resolveLocale(undefined, { LANG: 'EN_us' })).toBe('en-US');
  });

  it('reads a tag Intl.Locale refuses as the base language, never as an error', () => {
    expect(resolveLocale(undefined, { LANG: 'not a locale' })).toBeUndefined();
  });

  it('ignores the environment under agent detection, but not the option or BURGEE_LOCALE', () => {
    const env = { CLAUDECODE: '1', LANG: 'de_DE.UTF-8', LC_ALL: 'de_DE.UTF-8' };
    expect(resolveLocale(undefined, env)).toBeUndefined();
    expect(resolveLocale(undefined, { ...env, BURGEE_LOCALE: 'de' })).toBe('de');
    expect(resolveLocale('de', env)).toBe('de');
    expect(resolveLocale(undefined, { AI_AGENT: 'my-agent', LANG: 'de_DE' })).toBeUndefined();
  });
});

describe('candidatesOf', () => {
  it('goes de-DE → de, and stops at a bare language', () => {
    expect(candidatesOf('de-DE')).toEqual(['de-DE', 'de']);
    expect(candidatesOf('de')).toEqual(['de']);
    expect(candidatesOf('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh']);
  });
});

describe('localiserOf', () => {
  const plugins = [{ name: 'pack', contract: 1, locales: { de: { 'usage.unknownOption': 'unbekannte Option {option}' } } } as Plugin];

  it('is undefined in the base language, and for a locale no pack carries', () => {
    expect(localiserOf(plugins, undefined)).toBeUndefined();
    expect(localiserOf(plugins, 'fr')).toBeUndefined();
  });

  it('translates a line it recognises, and returns any other as it came', () => {
    const say = localiserOf(plugins, 'de-DE')?.say;
    expect(say?.('unknown option --nope')).toBe('unbekannte Option --nope');
    expect(say?.('unknown command "x"')).toBe('unknown command "x"');
    expect(say?.('something the catalog never wrote')).toBe('something the catalog never wrote');
  });

  it('leaves a line longer than it matches in English, so a long typed value cannot make matching slow', () => {
    const long = `unknown option --${'x'.repeat(4096)}`;
    expect(localiserOf(plugins, 'de')?.say(long)).toBe(long);
  });
});
