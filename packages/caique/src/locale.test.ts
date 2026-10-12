/**
 * `localised-human-surfaces` R6 — caique's own chrome speaks the run's locale.
 *
 * The locale arrives on the `Runtime` (`runtime.locale`, which burgee resolves), so caique reads
 * it without importing burgee. The translations arrive as a locale pack registered through
 * caique's `register()`: one plugin object carrying `locales`, under ids that begin `caique.`,
 * so the same object serves burgee's catalog and this one. What caique draws for a person — the
 * instruction under a list, a validation problem, the giving-up line — is translated. A refusal
 * is a value a host reports and may put in a machine envelope, so its `message` and `fix` stay
 * English and the translation rides beside them as `localised`.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { ask, type Reader, type Writer } from './ask.js';
import { localise, resolvePrompts, type PromptableOption } from './binding.js';
import { check } from './check.js';
import { type Runtime } from './decide.js';
import { checkLocales, sayFor } from './locale.js';
import { register, reset } from './plugin.js';

afterEach(() => reset());

function io(lines: (string | undefined)[]): { reader: Reader; writer: Writer; transcript: () => string } {
  const out: string[] = [];
  let at = 0;
  return {
    reader: { line: () => Promise.resolve(at < lines.length ? lines[at++] : undefined) },
    writer: { write: (t: string) => out.push(t) },
    transcript: () => out.join(''),
  };
}

const GERMAN = {
  'caique.answerYesNo': 'antworten Sie j oder n',
  'caique.enterNumber': 'Nummer eingeben (1-{last}):',
  'caique.numberRange': 'eine Nummer von 1 bis {last}',
  'caique.givingUp': { one: 'nach {count} Versuch aufgegeben', other: 'nach {count} Versuchen aufgegeben' },
  'caique.requiredNoTerminal': '{flag} ist ohne Terminal Pflicht',
  'caique.wouldHaveAsked': 'übergeben Sie {flag}; gefragt worden wäre "{question}"',
  'caique.cancelledAt': 'bei --{option} abgebrochen',
};

const pack = { name: 'test-de', contract: 1, locales: { de: GERMAN } };

const OPTIONS: Record<string, PromptableOption> = {
  force: { required: true, prompt: { kind: 'confirm', message: 'Overwrite?' } },
};

describe('the chrome caique draws, in the run’s locale (R6)', () => {
  it('translates a validation problem and the giving-up line, never the author’s question', async () => {
    register(pack);
    const world = io(['x', 'x', 'x', 'x', 'x']);
    await ask({ kind: 'confirm', message: 'Overwrite?' }, { ...world, say: sayFor('de-DE') });
    expect(world.transcript()).toContain('Overwrite? (y/N) ');
    expect(world.transcript()).toContain('  antworten Sie j oder n\n');
    expect(world.transcript()).toContain('  nach 5 Versuchen aufgegeben\n');
  });

  it('translates the instruction under a list', async () => {
    register(pack);
    const world = io(['9', undefined]);
    await ask({ kind: 'select', message: 'Target?', choices: [{ value: 'node' }, { value: 'deno' }] }, { ...world, say: sayFor('de') });
    expect(world.transcript()).toBe('Target?\n  1) node\n  2) deno\n  Nummer eingeben (1-2):   eine Nummer von 1 bis 2\nTarget?\n  1) node\n  2) deno\n  Nummer eingeben (1-2): ');
  });

  it('is English, byte for byte, with no locale, or none a pack carries', async () => {
    register(pack);
    const worlds = [sayFor(undefined), sayFor('fr')].map((say) => ({ say, world: io(['x', undefined]) }));
    await Promise.all(worlds.map(({ say, world }) => ask({ kind: 'confirm', message: 'Overwrite?' }, { ...world, say })));
    for (const { world } of worlds) expect(world.transcript()).toBe('Overwrite? (y/N)   answer y or n\nOverwrite? (y/N) ');
  });

  it('speaks the runtime’s locale when resolving prompts, through the translator sayFor builds from it', async () => {
    register(pack);
    const world = io(['x', undefined]);
    const runtime: Runtime = { env: {}, isTTY: { stdin: true }, locale: 'de' };
    const r = await resolvePrompts({ options: OPTIONS, values: {}, runtime, io: { ...world, say: sayFor(runtime.locale) } });
    expect(world.transcript()).toContain('antworten Sie j oder n');
    expect(r.failure).toEqual({ option: 'force', code: 'CANCELLED', message: 'cancelled at --force', fix: 'pass --force to skip the question', localised: { message: 'bei --force abgebrochen', fix: 'pass --force to skip the question' } });
  });

  it('keeps a refusal’s message and fix English, with the translation beside them', async () => {
    register(pack);
    const runtime: Runtime = { env: {}, isTTY: { stdin: false }, locale: 'de' };
    const r = await resolvePrompts({ options: OPTIONS, values: {}, runtime, io: { ...io([]), say: sayFor(runtime.locale) } });
    expect(r.failure).toEqual({
      option: 'force',
      code: 'USAGE',
      message: '--force is required when there is no terminal',
      fix: 'pass --force; it would have been asked as "Overwrite?"',
      localised: { message: '--force ist ohne Terminal Pflicht', fix: 'übergeben Sie --force; gefragt worden wäre "Overwrite?"' },
    });
  });

  it('translates a refusal that carries no fix without inventing one', () => {
    register(pack);
    expect(localise({ option: 'force', code: 'CANCELLED', message: 'cancelled at --force' }, sayFor('de'))).toEqual({
      option: 'force',
      code: 'CANCELLED',
      message: 'cancelled at --force',
      localised: { message: 'bei --force abgebrochen' },
    });
  });

  it('adds nothing to a refusal when no pack speaks the locale', async () => {
    const r = await resolvePrompts({ options: OPTIONS, values: {}, runtime: { env: {}, isTTY: { stdin: false }, locale: 'de' }, io: { ...io([]), say: sayFor('de') } });
    expect(r.failure).not.toHaveProperty('localised');
  });
});

describe('sayFor', () => {
  it('returns a line it does not recognise, one the pack leaves untranslated, and a long one as they came', () => {
    register(pack);
    const say = sayFor('de');
    expect(say('a line caique never wrote')).toBe('a line caique never wrote');
    expect(say('cancelled at --force')).toBe('bei --force abgebrochen');
    expect(say('pass --force to skip the question')).toBe('pass --force to skip the question');
    const long = `${'x'.repeat(4096)} is not a choice; use numbers from 1 to 2`;
    expect(say(long)).toBe(long);
  });

  it('takes a region’s own message over its language’s, and skips a pack for another language', () => {
    register(pack);
    register({ name: 'fr', contract: 1, locales: { fr: { 'caique.answerYesNo': 'répondez o ou n' } } });
    register({ name: 'at', contract: 1, locales: { 'de-AT': { 'caique.answerYesNo': 'sagen Sie j oder n' }, de: { 'usage.unknownOption': 'not caique’s' } } });
    expect(sayFor('de-AT')('answer y or n')).toBe('sagen Sie j oder n');
    expect(sayFor('de-AT')('enter a number from 1 to 3')).toBe('eine Nummer von 1 bis 3');
  });
});

describe('a caique locale pack is checked (R6)', () => {
  it.each([
    ['an id caique does not have', { 'caique.nope': 'x' }, 'plugin "p": locales.de["caique.nope"] is not a message caique has'],
    ['a placeholder the English lacks', { 'caique.answerYesNo': '{flag}' }, 'plugin "p": locales.de["caique.answerYesNo"] has {flag}, which the English "answer y or n" does not'],
    ['a missing plural form', { 'caique.givingUp': { other: '{count}' } }, 'plugin "p": locales.de["caique.givingUp"] is missing the plural form one'],
    ['a placeholder the English lacks, naming the ones it has', { 'caique.numberRange': 'von 1 bis {max}' }, 'plugin "p": locales.de["caique.numberRange"] has {max}, which the English "enter a number from 1 to {last}" does not'],
    ['plural forms with no count', { 'caique.answerYesNo': { one: 'a', other: 'b' } }, 'plugin "p": locales.de["caique.answerYesNo"] has plural forms, and the English has no {count}'],
    ['a form the locale does not select', { 'caique.givingUp': { one: 'a', other: 'b', few: 'c' } }, 'plugin "p": locales.de["caique.givingUp"].few is not a plural form of de'],
    ['a translation that is not a string', { 'caique.answerYesNo': 7 }, 'plugin "p": locales.de["caique.answerYesNo"] is not a string'],
  ])('refuses %s', (_, messages, message) => {
    expect(() => checkLocales({ name: 'p', locales: { de: messages } })).toThrow(message);
  });

  it('names every form a locale with more of them lacks, and the placeholders a message takes', () => {
    expect(() => checkLocales({ name: 'p', locales: { ru: { 'caique.givingUp': { one: '{count}', other: '{count}' } } } })).toThrow('is missing the plural forms few, many');
    expect(() => checkLocales({ name: 'p', locales: { de: { 'caique.numberRange': '{max}' } } })).toThrow(expect.objectContaining({ fix: 'use only {last}' }) as Error);
  });

  it('leaves an id that is not caique’s to the package that owns it', () => {
    expect(() => checkLocales({ name: 'p', locales: { de: { 'usage.unknownOption': 'x' } } })).not.toThrow();
  });

  it('refuses locales that are not a map of maps', () => {
    expect(() => checkLocales({ name: 'p', locales: 'de' })).toThrow('plugin "p": locales must be an object');
    expect(() => checkLocales({ name: 'p', locales: { de: 'x' } })).toThrow('plugin "p": locales.de must be an object');
  });

  it('is refused under E_PLUGIN_SCHEMA by the run whose locale it speaks, and not by one in another', async () => {
    register({ name: 'p', locales: { de: { 'caique.nope': 'x' } } });
    expect(sayFor('fr')('answer y or n')).toBe('answer y or n');
    expect(() => sayFor('de')).toThrow(expect.objectContaining({ code: 'E_PLUGIN_SCHEMA' }) as Error);
  });

  it('is refused by caique check, with the fix', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const file = join(mkdtempSync(join(tmpdir(), 'caique-locale-')), 'bad.mjs');
    writeFileSync(file, `export default ${JSON.stringify({ name: 'bad', locales: { de: { 'caique.nope': 'x' } } })};\n`);
    const out: string[] = [];
    expect(await check([file], (s) => out.push(s))).not.toBe(0);
    expect(out.join('')).toContain('E_PLUGIN_SCHEMA: plugin "bad": locales.de["caique.nope"] is not a message caique has');
  });
});

describe('caique check renders a pack (R6)', () => {
  it('lists each of caique’s messages, each plural form apart', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const file = join(mkdtempSync(join(tmpdir(), 'caique-locale-')), 'pack.mjs');
    writeFileSync(file, `export default ${JSON.stringify(pack)};\n`);
    const out: string[] = [];
    expect(await check([file], (s) => out.push(s))).toBe(0);
    const text = out.join('');
    expect(text).toContain('de  caique.answerYesNo  antworten Sie j oder n\n');
    expect(text).toContain('de  caique.givingUp.one  nach 1 Versuch aufgegeben\n');
    expect(text).toContain('de  caique.givingUp.other  nach 0 Versuchen aufgegeben\n');
    expect(text).toContain('test-de: ok\n');
  });
});
