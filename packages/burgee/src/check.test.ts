/**
 * `checkPlugin` in-process. `scripts/plugin-check-lock.test.ts` drives `burgee check` as a
 * binary, in the workspace's own process, so none of it reaches this package's counter; the
 * cases here are the report's rows and each way a plugin is refused, read off the returned
 * document rather than off prose.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { type CheckRefusal, type CheckReport, checkPlugin, LAYERS } from './check.js';
import { ExitCode } from './exit-code.js';
import { MESSAGES } from './messages.js';

const dir = mkdtempSync(join(tmpdir(), 'burgee-check-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
/** A plugin module on disk, since `checkPlugin` takes a path and imports it. */
const plugin = (source: string): string => {
  n += 1;
  const file = join(dir, `plugin-${String(n)}.mjs`);
  writeFileSync(file, source);
  return file;
};

describe('burgee check reports what a plugin contributes', () => {
  it('lists each command with its description and effects, and each hook with what it applies to', async () => {
    const file = plugin(`export default {
      name: 'audit',
      contract: 1,
      commands: [
        { path: ['audit', 'run'], description: 'Run the audit', effects: 'read_only', options: {}, run: () => 'ok' },
        { path: ['audit'], options: {} },
      ],
      hooks: { preRun: { handler: () => undefined }, onError: { filter: { command: /^deploy/ }, handler: () => undefined } },
    };\n`);
    expect(await checkPlugin(file)).toEqual({
      name: 'audit',
      commands: [
        { path: 'audit run', description: 'Run the audit', effects: 'read_only' },
        // A group declares no effects and no description; the report says so rather than omitting the row.
        { path: 'audit', description: '', effects: 'undeclared' },
      ],
      hooks: [
        { stage: 'preRun', applies: 'every command' },
        { stage: 'onError', applies: 'commands matching /^deploy/' },
      ],
    });
  });

  it('reads a module with no default export as the plugin itself', async () => {
    const file = plugin("export const name = 'bare';\nexport const contract = 1;\nexport const hooks = { postRun: { handler: () => undefined } };\n");
    expect(await checkPlugin(file)).toEqual({ name: 'bare', commands: [], hooks: [{ stage: 'postRun', applies: 'every command' }] });
  });

  it('reports a plugin with commands and no hooks', async () => {
    const file = plugin("export default { name: 'cmds', contract: 1, commands: [{ path: ['x'], effects: 'idempotent', options: {}, run: () => ({ changed: false }) }] };\n");
    expect(await checkPlugin(file)).toEqual({ name: 'cmds', commands: [{ path: 'x', description: '', effects: 'idempotent' }], hooks: [] });
  });
});

describe('burgee check refuses, as data, with an exit code', () => {
  it('refuses a plugin that contributes nothing any layer of the family reads', async () => {
    const file = plugin("export default { name: 'empty', contract: 1, commands: [], spinnerz: {} };\n");
    expect(await checkPlugin(file)).toEqual({
      refused: {
        code: 'E_NO_CONTRIBUTION',
        message: 'empty registers, but contributes nothing any layer of the family reads',
        fix: 'add a key the family schema (burgee/schema.json) describes: `commands`, `hooks` or `locales` for burgee, or another layer’s, such as `tokens` for roundel or `spinners` for flagstaff',
      },
      exitCode: ExitCode.RUNTIME,
    });
  });

  it('refuses under the plugin host’s own code', async () => {
    const file = plugin("export default { name: 'old' };\n");
    expect(await checkPlugin(file)).toMatchObject({ refused: { code: 'E_PLUGIN_CONTRACT', message: expect.stringContaining('plugin "old" declares no contract') }, exitCode: ExitCode.RUNTIME });
  });

  it('refuses a plugin whose object throws while it is read, with the error’s own words', async () => {
    const file = plugin("export default { name: 'getter', contract: 1, get hooks() { throw new Error('hooks exploded'); } };\n");
    expect(await checkPlugin(file)).toEqual({
      refused: { code: 'E_PLUGIN_SCHEMA', message: 'hooks exploded', fix: 'fix the contributed command the message names; it is checked exactly as one of the program’s own' },
      exitCode: ExitCode.RUNTIME,
    });
  });

  it('rethrows what is not an Error at all, rather than inventing a message for it', async () => {
    const file = plugin("export default { name: 'thrower', contract: 1, get commands() { throw 'not an error'; } };\n");
    await expect(checkPlugin(file)).rejects.toBe('not an error');
  });
});

/**
 * `localised-human-surfaces` R4 — a locale pack is a plugin, and `burgee check <pack>` is how its
 * author learns whether it renders: every message of every locale, rendered, or the refusal.
 */
/** A locale pack named `pack` on disk, carrying `locales` and nothing else. */
const pack = (locales: unknown): string => plugin(`export default ${JSON.stringify({ name: 'pack', contract: 1, locales })};\n`);

describe('burgee check reads a locale pack (R4)', () => {

  it('renders every message of every locale, each plural form apart, with each placeholder named', async () => {
    const file = pack({
      de: { 'usage.unknownOption': 'unbekannte Option {option}', 'usage.stdinOnce': { one: '{count} Datei', other: '{count} Dateien' } },
      'pt-BR': { 'hint.passOne': 'passe um deles' },
    });
    expect(await checkPlugin(file)).toEqual({
      name: 'pack',
      commands: [],
      hooks: [],
      locales: [
        {
          locale: 'de',
          messages: [
            { id: 'usage.unknownOption', text: 'unbekannte Option <option>' },
            { id: 'usage.stdinOnce', form: 'one', text: '1 Datei' },
            { id: 'usage.stdinOnce', form: 'other', text: '0 Dateien' },
          ],
          coverage: expect.objectContaining({ translated: ['usage.unknownOption', 'usage.stdinOnce'] }),
        },
        { locale: 'pt-BR', messages: [{ id: 'hint.passOne', text: 'passe um deles' }], coverage: expect.objectContaining({ translated: ['hint.passOne'] }) },
      ],
    });
  });

  // locale-pack-in-five R1: the check that accepts a pack is the verification, so an author (or an
  // agent) does not run Intl.PluralRules, or diff ids against the schema, to know what it covers.
  describe('says what a passing pack covers of the catalog, per locale (locale-pack-in-five R1)', () => {
    const ids = Object.keys(MESSAGES);

    it('lists the ids translated and the ids left in English, in the catalog’s order, together the whole catalog', async () => {
      const report = await checkPlugin(pack({ fr: { 'hint.runHelp': 'lancez --help', 'usage.unknownOption': 'option inconnue {option}', 'caique.cancel': 'annulé' } }));
      const [fr] = (report as CheckReport).locales ?? [];
      expect(fr?.coverage.translated).toEqual(['usage.unknownOption', 'hint.runHelp']);
      expect(fr?.coverage.missing).toEqual(ids.filter((id) => id !== 'usage.unknownOption' && id !== 'hint.runHelp'));
      expect(fr?.coverage.missing).not.toContain('caique.cancel');
    });

    it('names, for each message with a {count}, the plural forms written against the forms the locale selects', async () => {
      const report = (await checkPlugin(
        pack({
          fr: { 'usage.stdinOnce': { one: '{count} fichier', many: '{count} de fichiers', other: '{count} fichiers' } },
          ru: { 'hint.passOne': 'один' },
          de: { 'usage.stdinOnce': '{count} Datei(en)' },
        }),
      )) as CheckReport;
      const plural = Object.fromEntries((report.locales ?? []).map((l) => [l.locale, l.coverage.plural]));
      expect(plural).toEqual({
        fr: { 'usage.stdinOnce': { have: ['one', 'many', 'other'], need: ['one', 'many', 'other'] } },
        ru: { 'usage.stdinOnce': { have: [], need: ['one', 'few', 'many', 'other'] } },
        // One string serves every count, so it has every form the locale selects.
        de: { 'usage.stdinOnce': { have: ['one', 'other'], need: ['one', 'other'] } },
      });
    });

    it('is on the --json document an agent reads, beside the rendered messages', async () => {
      const report = (await checkPlugin(pack({ ja: { 'usage.stdinOnce': { other: '{count} 個' } } }))) as CheckReport;
      expect(JSON.parse(JSON.stringify(report)).locales[0].coverage).toEqual({
        translated: ['usage.stdinOnce'],
        missing: ids.filter((id) => id !== 'usage.stdinOnce'),
        plural: { 'usage.stdinOnce': { have: ['other'], need: ['other'] } },
      });
    });
  });

  it('leaves an id caique owns to caique, so one pack serves both hosts', async () => {
    const file = pack({ de: { 'hint.passOne': 'eins davon', 'caique.anything': { whatever: 1 } } });
    expect(await checkPlugin(file)).toMatchObject({ locales: [{ locale: 'de', messages: [{ id: 'hint.passOne', text: 'eins davon' }] }] });
  });

  it('accepts the test pack the invariance lock registers', async () => {
    const file = plugin(`export default ${readFileSync(new URL('__fixtures__/locale-pack-de.json', import.meta.url), 'utf8')};\n`);
    expect(await checkPlugin(file)).toMatchObject({ name: 'test-de', locales: [{ locale: 'de' }] });
  });

  // The one example pack is JSON, and `import()` of a `.json` path without an import attribute
  // throws ERR_IMPORT_ATTRIBUTE_MISSING, so an author checking the example as shipped hit a
  // runtime error instead of a report. A `.json` file is read as data.
  it('checks a pack written as JSON, as the example pack is, without wrapping it in a module', async () => {
    const file = fileURLToPath(new URL('__fixtures__/locale-pack-de.json', import.meta.url));
    expect(await checkPlugin(file)).toMatchObject({ name: 'test-de', locales: [{ locale: 'de' }] });
  });

  it('reads a JSON pack an editor saved with a byte-order mark', async () => {
    const file = join(dir, 'bom.json');
    writeFileSync(file, `﻿${JSON.stringify({ name: 'bom', contract: 1, locales: { de: { 'hint.passOne': 'eins davon' } } })}`);
    expect(await checkPlugin(file)).toMatchObject({ name: 'bom', locales: [{ locale: 'de', messages: [{ id: 'hint.passOne', text: 'eins davon' }] }] });
  });

  it.each([
    ['an id the catalog does not have', { de: { 'usage.nope': 'x' } }, 'plugin "pack": locales.de["usage.nope"] is not a message burgee has'],
    ['a placeholder the English does not have', { de: { 'usage.unknownOption': 'unbekannte Option {flag}' } }, 'plugin "pack": locales.de["usage.unknownOption"] has {flag}, which the English "unknown option {option}" does not'],
    ['a placeholder in a message that has none', { de: { 'hint.passOne': 'übergeben Sie {option}' } }, 'plugin "pack": locales.de["hint.passOne"] has {option}, which the English "pass one of them" does not'],
    ['a plural message missing a form its locale selects', { ru: { 'usage.stdinOnce': { one: '{count}', other: '{count}' } } }, 'plugin "pack": locales.ru["usage.stdinOnce"] is missing the plural forms few, many'],
    ['a form its locale does not select', { de: { 'usage.stdinOnce': { one: 'a', other: 'b', few: 'c' } } }, 'plugin "pack": locales.de["usage.stdinOnce"].few is not a plural form of de'],
    ['plural forms for a message with no count', { de: { 'hint.passOne': { one: 'a', other: 'b' } } }, 'plugin "pack": locales.de["hint.passOne"] has plural forms, and the English has no {count}'],
    ['a translation that is not a string', { de: { 'hint.passOne': 42 } }, 'plugin "pack": locales.de["hint.passOne"] is not a string'],
    ['a tag Intl.Locale writes another way', { de_DE: { 'hint.passOne': 'x' } }, 'plugin "pack": locales has "de_DE", which is not a language tag as Intl.Locale writes it'],
    ['a tag that is not one', { 'not a tag': {} }, 'plugin "pack": locales has "not a tag", which is not a language tag as Intl.Locale writes it'],
    ['a locale that is not an object', { de: 'x' }, 'plugin "pack": locales.de must be an object'],
    ['locales that are not an object', ['de'], 'plugin "pack": locales must be an object'],
  ])('refuses %s, under E_PLUGIN_SCHEMA with a fix', async (_, locales, message) => {
    const report = await checkPlugin(pack(locales));
    expect(report).toMatchObject({ refused: { code: 'E_PLUGIN_SCHEMA', message, fix: expect.any(String) as string }, exitCode: ExitCode.RUNTIME });
  });

  it('refuses every problem in a pack at once, each with its own fix, so one repair clears them all', async () => {
    const file = pack({
      fr: { 'usage.nope': 'x', 'usage.unknownOption': 'option inconnue {flag}', 'usage.stdinOnce': { one: '{count} fichier', other: '{count} fichiers' } },
      de: { 'usage.stdinOnce': { one: 'a', other: 'b', few: 'c' } },
    });
    const report = await checkPlugin(file);
    expect(report).toMatchObject({ refused: { code: 'E_PLUGIN_SCHEMA' }, exitCode: ExitCode.RUNTIME });
    const { refused } = report as CheckRefusal;
    const problems = refused.problems ?? [];
    expect(problems.map((p) => p.message)).toEqual([
      'plugin "pack": locales.fr["usage.nope"] is not a message burgee has',
      'plugin "pack": locales.fr["usage.unknownOption"] has {flag}, which the English "unknown option {option}" does not',
      'plugin "pack": locales.fr["usage.stdinOnce"] is missing the plural form many',
      'plugin "pack": locales.de["usage.stdinOnce"].few is not a plural form of de',
    ]);
    expect(refused.message).toBe(`plugin "pack": 4 problems — ${problems.map((p) => p.message.replace('plugin "pack": ', '')).join('; ')}`);
    expect(refused.fix).toBe(problems.map((p, i) => `${String(i + 1)}. ${p.fix}`).join(' '));
    for (const p of problems) expect(p.fix).not.toBe('');
  });

  it('says which forms a locale selects, with a count for each, when a plural message lacks one', async () => {
    const report = await checkPlugin(pack({ fr: { 'usage.stdinOnce': { one: '{count} fichier', other: '{count} fichiers' } } }));
    expect(report).toMatchObject({
      refused: {
        message: 'plugin "pack": locales.fr["usage.stdinOnce"] is missing the plural form many',
        fix: 'add "many" beside the others: Intl.PluralRules selects one (for 0), many (for 1000000), other (for 2) for fr — write { "one": "…", "many": "…", "other": "…" }',
      },
    });
    expect((report as CheckRefusal).refused.problems).toHaveLength(1);
  });

  it('names the forms to keep when a plural message has one its locale does not select', async () => {
    expect(await checkPlugin(pack({ de: { 'usage.stdinOnce': { one: 'a', other: 'b', few: 'c' } } }))).toMatchObject({
      refused: { fix: 'drop "few": Intl.PluralRules selects one (for 1), other (for 0) for de' },
    });
  });

  it('renders every form of a locale with many, each with a count that selects it', async () => {
    const forms = { one: '{count} файл', few: '{count} файла', many: '{count} файлов', other: '{count} файла' };
    expect(await checkPlugin(pack({ ru: { 'usage.stdinOnce': forms } }))).toMatchObject({
      locales: [{ locale: 'ru', messages: [{ form: 'one', text: '1 файл' }, { form: 'few', text: '2 файла' }, { form: 'many', text: '0 файлов' }, { form: 'other', text: '1.5 файла' }] }],
    });
  });

  it('says which placeholders a message takes when a translation adds another', async () => {
    expect(await checkPlugin(pack({ de: { 'usage.unknownOption': '{flag}' } }))).toMatchObject({ refused: { fix: 'use only {option}' } });
    expect(await checkPlugin(pack({ de: { 'hint.passOne': '{option}' } }))).toMatchObject({ refused: { fix: 'take the placeholder out: this message has none' } });
  });

  it('names the tag to write when Intl.Locale reads it another way', async () => {
    expect(await checkPlugin(pack({ de_DE: {} }))).toMatchObject({ refused: { fix: 'write it as "de-DE"' } });
  });
});

/**
 * `plugin-contract` C3 — one `check` runs every installed layer's validation. A key another layer
 * hosts is handed to that layer's own `check`, found as `node_modules/<host>` at or above the
 * plugin's directory and run as a command; a layer that is not installed is named, with the
 * command to run.
 *
 * Each project here is a directory with a stand-in layer: a package whose bin prints what it is
 * given and exits with a chosen code, so a case says what burgee does with a verdict without
 * depending on what a real layer prints. `scripts/plugin-example-lock.test.ts` runs the real
 * ones, on the example every docs page shows.
 */
describe('burgee check hands each other layer’s keys to that layer’s check (plugin-contract C3)', () => {
  let projects = 0;
  /** A project directory holding `plugin.mjs` and a stand-in for each layer in `layers`. */
  const project = (source: string, layers: Record<string, { out: string; code?: number; bin?: unknown }>, at = ''): string => {
    projects += 1;
    const root = join(dir, `project-${String(projects)}`);
    for (const [host, { out, code = 0, bin = { [host]: 'cli.js' } }] of Object.entries(layers)) {
      const pkg = join(root, 'node_modules', host);
      mkdirSync(pkg, { recursive: true });
      writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: host, bin }));
      writeFileSync(join(pkg, 'cli.js'), `process.stdout.write(${JSON.stringify(out)} + process.argv.slice(2).join(' ') + '\\n');\nprocess.exitCode = ${String(code)};\n`);
    }
    const home = join(root, at);
    mkdirSync(home, { recursive: true });
    const file = join(home, 'plugin.mjs');
    writeFileSync(file, source);
    return file;
  };

  it('runs an installed layer’s check on the same file, and reports its keys, command, exit code and output', async () => {
    const file = project("export default { name: 'acme', contract: 1, tokens: { ok: '#1a7f37' } };\n", { roundel: { out: 'roundel ran: ' } });
    expect(await checkPlugin(file)).toEqual({
      name: 'acme',
      commands: [],
      hooks: [],
      layers: [{ host: 'roundel', keys: ['tokens'], run: `roundel check ${file}`, exitCode: 0, output: `roundel ran: check ${file}\n` }],
    });
  });

  it('runs a layer once for all the keys it hosts, in the order the plugin names them', async () => {
    const file = project("export default { name: 'acme', contract: 1, spinners: {}, tokens: {}, glyphs: {} };\n", { flagstaff: { out: 'f ' }, roundel: { out: 'r ' } });
    const { layers } = (await checkPlugin(file)) as CheckReport;
    expect(layers?.map(({ host, keys }) => ({ host, keys }))).toEqual([
      { host: 'flagstaff', keys: ['spinners', 'glyphs'] },
      { host: 'roundel', keys: ['tokens'] },
    ]);
  });

  it('finds a layer installed above the plugin’s directory, where Node would resolve it from', async () => {
    const file = project("export default { name: 'acme', contract: 1, widths: {} };\n", { linegauge: { out: 'lg ' } }, 'src/plugins');
    expect(await checkPlugin(file)).toMatchObject({ layers: [{ host: 'linegauge', exitCode: 0 }] });
  });

  it('reads a layer whose bin is a single path', async () => {
    const file = project("export default { name: 'acme', contract: 1, handlers: [] };\n", { closeout: { out: 'co ', bin: 'cli.js' } });
    expect(await checkPlugin(file)).toMatchObject({ layers: [{ host: 'closeout', exitCode: 0, output: `co check ${file}\n` }] });
  });

  it('names a layer that is not installed, with the command to run, and runs nothing', async () => {
    const file = project("export default { name: 'acme', contract: 1, sources: {} };\n", {});
    expect(await checkPlugin(file)).toEqual({ name: 'acme', commands: [], hooks: [], layers: [{ host: 'seniority', keys: ['sources'], run: `npx seniority check ${file}` }] });
  });

  it('treats a package of the layer’s name with no bin of that name as not installed', async () => {
    const file = project("export default { name: 'acme', contract: 1, resolvers: {} };\n", { bellpull: { out: '', bin: { other: 'cli.js' } } });
    expect(await checkPlugin(file)).toMatchObject({ layers: [{ host: 'bellpull', run: `npx bellpull check ${file}` }] });
    expect((await checkPlugin(file)) as CheckReport).not.toHaveProperty('layers.0.exitCode');
  });

  it('treats a package of the layer’s name with no bin at all as not installed', async () => {
    const file = project("export default { name: 'acme', contract: 1, resolvers: {} };\n", { bellpull: { out: '', bin: null } });
    expect(await checkPlugin(file)).toMatchObject({ layers: [{ host: 'bellpull', run: `npx bellpull check ${file}` }] });
  });

  it('reads the layer’s stderr too, where a crash says what happened', async () => {
    const file = project("export default { name: 'acme', contract: 1, panes: {} };\n", { controlroom: { out: '' } });
    writeFileSync(join(dirname(file), 'node_modules', 'controlroom', 'cli.js'), "process.stderr.write('boom\\n');\n");
    expect(await checkPlugin(file)).toMatchObject({ layers: [{ host: 'controlroom', exitCode: 0, output: 'boom\n' }] });
  });

  it('reads a refusal only where a line starts with the code, not a code quoted mid-line', async () => {
    const file = project("export default { name: 'acme', contract: 1, tokens: {} };\n", { roundel: { out: 'see E_QUOTED: x\n  fix: y\n', code: 1 } });
    expect(await checkPlugin(file)).toMatchObject({ refused: { code: 'E_PLUGIN_SCHEMA', message: 'roundel check exited 1 on acme' } });
  });

  it('reports burgee’s own contributions beside the other layers’', async () => {
    const file = project("export default { name: 'acme', contract: 1, widgets: {}, commands: [{ path: ['doctor'], options: {}, effects: 'read_only', run: () => 1 }] };\n", {});
    expect(await checkPlugin(file)).toMatchObject({ commands: [{ path: 'doctor' }], layers: [{ host: 'caique', keys: ['widgets'] }] });
  });

  it('refuses with the layer’s own code, message and fix when an installed layer refuses', async () => {
    const out = 'E_NO_STATIC_PROJECTION: spinner "acme" has no static projection\n  fix: add `static`, the line a pipe prints\n';
    const file = project("export default { name: 'acme', contract: 1, spinners: {} };\n", { flagstaff: { out, code: 1 } });
    expect(await checkPlugin(file)).toEqual({
      refused: { code: 'E_NO_STATIC_PROJECTION', message: 'flagstaff: spinner "acme" has no static projection', fix: 'add `static`, the line a pipe prints' },
      exitCode: ExitCode.RUNTIME,
    });
  });

  it('refuses with the command to run when a layer exits non-zero without the family’s refusal shape', async () => {
    const file = project("export default { name: 'acme', contract: 1, keymaps: {} };\n", { controlroom: { out: 'something broke ', code: 2 } });
    expect(await checkPlugin(file)).toEqual({
      refused: { code: 'E_PLUGIN_SCHEMA', message: 'controlroom check exited 2 on acme', fix: `run \`controlroom check ${file}\` and fix what it prints` },
      exitCode: ExitCode.RUNTIME,
    });
  });

  it('refuses for the first layer that refuses, after running every layer', async () => {
    const file = project("export default { name: 'acme', contract: 1, tokens: {}, capabilities: {} };\n", {
      roundel: { out: 'E_PLUGIN_SCHEMA: bad token\n  fix: use hex\n', code: 1 },
      paratext: { out: 'E_NO_STATIC_PROJECTION: no fallback\n  fix: add one\n', code: 1 },
    });
    expect(await checkPlugin(file)).toMatchObject({ refused: { code: 'E_PLUGIN_SCHEMA', message: 'roundel: bad token', fix: 'use hex' } });
  });

  it('leaves a key the table does not route, and one inherited from Object, to nobody', async () => {
    const file = project("export default { name: 'acme', contract: 1, tokens: {}, constructor: {}, toString: {} };\n", {});
    expect(((await checkPlugin(file)) as CheckReport).layers?.map((l) => l.host)).toEqual(['roundel']);
    expect([...LAYERS.values()]).not.toContain('burgee');
  });
});
