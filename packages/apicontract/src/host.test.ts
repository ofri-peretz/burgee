import { describe, expect, it } from 'vitest';

import { type Contract } from './core/model.js';
import {
  checkPlugin,
  CONTRACT,
  createHost,
  documentOf,
  type GeneratedFile,
  type Generator,
  type Plugin,
  PluginError,
  register,
  registered,
  reset,
  resultOf,
  validate,
  validateFiles,
} from './host.js';
import { openapi } from './openapi.js';

const document = { openapi: '3.1.0', paths: { '/pets': { get: { operationId: 'listPets' } } } };

/** One line per operation: enough to see a generator ran on the right contract. */
const list = (contract: Contract, options: Readonly<Record<string, unknown>>): GeneratedFile[] => [
  { path: 'operations.txt', owner: 'generated', content: contract.operations.map((operation) => `${String(options.prefix ?? '')}${operation.id}\n`).join('') },
];

const generator = (over: Partial<Generator> = {}): Generator => ({
  description: 'Lists the operations',
  inputs: ['openapi'],
  sample: { document, files: [{ path: 'operations.txt', owner: 'generated', content: 'listPets\n' }] },
  run: list,
  ...over,
});

const plugin = (over: Partial<Generator> = {}): Plugin => ({ name: 'demo', adapters: { openapi }, generators: { list: generator(over) } });

const refusal = (attempt: () => unknown): PluginError => {
  try {
    attempt();
  } catch (error) {
    if (error instanceof PluginError) return error;
  }
  throw new Error('expected a PluginError');
};

const notAPlugin = (): object => ({});

const file = (over: Record<string, unknown>): unknown[] => [{ path: 'a.ts', content: '', owner: 'generated', ...over }];

describe('validate', () => {
  it('accepts a plugin with adapters and generators, one with neither, and keys it does not read', () => {
    expect(() => validate(plugin())).not.toThrow();
    expect(() => validate({ name: 'other-layer', contract: CONTRACT, spinners: {}, commands: [] })).not.toThrow();
  });

  it.each<[string, unknown, string, string]>([
    ['a function', notAPlugin, 'a plugin is a plain object', 'export an object, not a function or an array'],
    ['an array', [], 'a plugin is a plain object', 'export an object, not a function or an array'],
    ['null', null, 'a plugin is a plain object', 'export an object, not a function or an array'],
    ['no name', {}, 'a plugin needs a name', 'add `name: "…"`: it is how a refused plugin is reported'],
    ['an empty name', { name: '' }, 'a plugin needs a name', 'add `name: "…"`: it is how a refused plugin is reported'],
    ['adapters as a list', { name: 'p', adapters: [] }, 'plugin "p": adapters must be an object', 'map a name to each of the adapters'],
    ['generators as text', { name: 'p', generators: 'x' }, 'plugin "p": generators must be an object', 'map a name to each of the generators'],
    ['an adapter that is not an object', { name: 'p', adapters: { a: 1 } }, 'plugin "p": adapters.a is not an adapter', 'an adapter is `{ description, detect(document), read(document) }`'],
    ['an adapter with no description', { name: 'p', adapters: { a: { ...openapi, description: '' } } }, 'plugin "p": adapters.a is not an adapter', 'an adapter is `{ description, detect(document), read(document) }`'],
    ['an adapter with no detect', { name: 'p', adapters: { a: { ...openapi, detect: true } } }, 'plugin "p": adapters.a is not an adapter', 'an adapter is `{ description, detect(document), read(document) }`'],
    ['an adapter with no read', { name: 'p', adapters: { a: { ...openapi, read: undefined } } }, 'plugin "p": adapters.a is not an adapter', 'an adapter is `{ description, detect(document), read(document) }`'],
    ['a generator that is not an object', { name: 'p', generators: { g: null } }, 'plugin "p": generators.g is not a generator', 'a generator is `{ description, inputs, sample, run(contract, options) }`'],
    ['a generator with no description', { name: 'p', generators: { g: generator({ description: '' }) } }, 'plugin "p": generators.g is not a generator', 'a generator is `{ description, inputs, sample, run(contract, options) }`'],
    ['a generator with no run', { name: 'p', generators: { g: { ...generator(), run: 'x' } } }, 'plugin "p": generators.g is not a generator', 'a generator is `{ description, inputs, sample, run(contract, options) }`'],
    ['inputs that are not a list', { name: 'p', generators: { g: { ...generator(), inputs: 'openapi' } } }, 'plugin "p": generators.g does not say which input formats it accepts', 'add `inputs: ["openapi"]`'],
    ['no inputs', { name: 'p', generators: { g: generator({ inputs: [] }) } }, 'plugin "p": generators.g does not say which input formats it accepts', 'add `inputs: ["openapi"]`'],
    ['an empty input', { name: 'p', generators: { g: generator({ inputs: ['openapi', ''] }) } }, 'plugin "p": generators.g does not say which input formats it accepts', 'add `inputs: ["openapi"]`'],
    ['options as a list', { name: 'p', generators: { g: { ...generator(), options: [] } } }, 'plugin "p": generators.g: options must be an object', 'map an option name to its burgee declaration'],
    ['sample options as a list', { name: 'p', generators: { g: { ...generator(), sample: { document, options: [], files: [] } } } }, 'plugin "p": generators.g: sample.options must be an object', 'pass the options the sample was generated with'],
    ['sample files that are not a list', { name: 'p', generators: { g: { ...generator(), sample: { document } } } }, 'plugin "p": generators.g: sample did not return a list of files', 'return `{ path, content, owner }[]`'],
  ])('refuses %s as a schema error, with a fix', (_, value, message, fix) => {
    const error = refusal(() => validate(value));
    expect(error).toMatchObject({ code: 'E_PLUGIN_SCHEMA', name: 'PluginError', fix, message: `${message}. fix: ${fix}` });
  });

  it.each([0, 2, 1.5, '1', null])('refuses contract %s, which this host does not know', (contract) => {
    const error = refusal(() => validate({ name: 'p', contract }));
    expect(error.code).toBe('E_PLUGIN_CONTRACT');
    expect(error.message).toBe(`plugin "p" declares contract ${String(contract)}; this apicontract knows 1. fix: upgrade apicontract, or lower the plugin's \`contract\``);
  });

  it.each<[string, unknown]>([
    ['none', undefined],
    ['one that is not an object', 'sample'],
    ['one with no document', { files: [] }],
  ])('refuses a generator whose sample is %s: it has no static projection', (_, sample) => {
    const error = refusal(() => validate({ name: 'p', generators: { g: { ...generator(), sample } } }));
    expect(error.code).toBe('E_NO_STATIC_PROJECTION');
    expect(error.message).toBe('plugin "p": generators.g has no sample. fix: add `sample: { document, files }`: a small document and exactly the files it produces');
  });

  it('accepts a sample whose document is null, and options that are objects', () => {
    const sample = { document: null, options: {}, files: [] };
    expect(() => validate({ name: 'p', generators: { g: { ...generator(), options: {}, sample } } })).not.toThrow();
  });
});

describe('validateFiles', () => {
  it('returns the files it was given when each may be written', () => {
    const files = [...file({}), ...file({ path: 'src/b/c.ts', owner: 'user' })];
    expect(validateFiles(files, 'x')).toBe(files);
  });

  it.each<[string, unknown, string, string]>([
    ['not a list', {}, 'x did not return a list of files', 'return `{ path, content, owner }[]`'],
    ['a file that is not an object', [1], 'x returned a file without a path and content', 'each file is `{ path, content, owner }`, both strings'],
    ['a file with no path', file({ path: 1 }), 'x returned a file without a path and content', 'each file is `{ path, content, owner }`, both strings'],
    ['a file with no content', file({ content: undefined }), 'x returned a file without a path and content', 'each file is `{ path, content, owner }`, both strings'],
    ['no owner', file({ owner: 'me' }), 'x returned "a.ts" without an owner', 'say `owner: "generated"` (rewritten every run) or `owner: "user"` (written once)'],
    ['the same path twice', [...file({}), ...file({})], 'x returned "a.ts" twice', 'return each path once'],
  ])('refuses %s', (_, files, message, fix) => {
    expect(refusal(() => validateFiles(files, 'x')).message).toBe(`${message}. fix: ${fix}`);
  });

  // The one place somebody else's code meets the user's disk.
  it.each(['', '/etc/passwd', '../up.ts', 'a/../../up.ts', 'a/./b.ts', 'a//b.ts', 'a/', String.raw`a\b.ts`, 'C:/x.ts', '..'])('refuses the path %j, which leaves the output folder', (path) => {
    const error = refusal(() => validateFiles(file({ path }), 'x'));
    expect(error.message).toBe(`x returned the path "${path}", which leaves the output folder. fix: use a relative path with \`/\` separators and no \`..\``);
  });

  it('accepts dots that are part of a name', () => {
    expect(() => validateFiles(file({ path: '.config/a..b/.c.ts' }), 'x')).not.toThrow();
  });
});

describe('a host', () => {
  it('starts empty, and keeps plugins in the order they were registered', () => {
    const host = createHost();
    expect(host.plugins()).toEqual([]);
    const first = plugin();
    const second = { name: 'second' };
    host.register(first);
    host.register(second);
    expect(host.plugins()).toEqual([first, second]);
    expect(createHost().plugins()).toEqual([]);
  });

  it('refuses a bad plugin and does not keep it', () => {
    const host = createHost();
    expect(() => host.register({})).toThrow(PluginError);
    expect(host.plugins()).toEqual([]);
  });

  it('reads a document with the adapter that recognises it', () => {
    const host = createHost();
    host.register(plugin());
    expect(host.read(document).operations.map((operation) => operation.id)).toEqual(['listPets']);
  });

  it('says which formats it knows when none recognises the document', () => {
    const host = createHost();
    expect(refusal(() => host.read({})).message).toBe('no input format recognises this document. fix: pass one of: none; or install the plugin that reads it');
    host.register(plugin());
    host.register({ name: 'more', adapters: { asyncapi: { ...openapi, detect: () => false }, openapi } });
    // A plugin written for another layer is asked nothing and adds nothing.
    host.register({ name: 'another-layer' });
    const error = refusal(() => host.read({}));
    expect(error.code).toBe('E_NO_CONTRIBUTION');
    expect(error.message).toBe('no input format recognises this document. fix: pass one of: asyncapi, openapi; or install the plugin that reads it');
  });

  it('runs a generator on a document, with the options it is given', async () => {
    const host = createHost();
    host.register(plugin());
    expect(await host.generate('list', document)).toEqual([{ path: 'operations.txt', owner: 'generated', content: 'listPets\n' }]);
    expect(await host.generate('list', document, { prefix: '- ' })).toEqual([{ path: 'operations.txt', owner: 'generated', content: '- listPets\n' }]);
  });

  it('waits for a generator that answers later', async () => {
    const host = createHost();
    host.register(plugin({ run: async (contract, options) => Promise.resolve(list(contract, options)) }));
    expect(await host.generate('list', document)).toHaveLength(1);
  });

  it('lets the later plugin win a name, and a later adapter win a document', async () => {
    const host = createHost();
    host.register(plugin());
    const empty: Contract = { format: 'other', document, operations: [] };
    host.register({ name: 'override', adapters: { openapi: { ...openapi, read: () => empty } }, generators: { list: generator({ run: () => [] }) } });
    expect(host.read(document)).toBe(empty);
    expect(await host.generate('list', document)).toEqual([]);
    host.register({ name: 'no-generators' });
    expect(host.generator('list').run(empty, {})).toEqual([]);
  });

  it('gives a generator only the formats it accepts', async () => {
    const host = createHost();
    host.register({ name: 'any', adapters: { anything: { ...openapi, detect: () => true } }, generators: { list: generator() } });
    expect(host.read(document).operations).toHaveLength(1);
    await expect(host.generate('list', document)).rejects.toThrow('no input format recognises this document. fix: pass one of: openapi; or install the plugin that reads it');
  });

  it('names every format a generator accepts when none of them recognises the document', async () => {
    const host = createHost();
    host.register({ name: 'p', generators: { list: generator({ inputs: ['openapi', 'asyncapi'] }) } });
    await expect(host.generate('list', document)).rejects.toThrow('fix: pass one of: openapi, asyncapi; or install the plugin that reads it');
  });

  it('names the generators it has when asked for one it has not, and ignores inherited names', () => {
    const host = createHost();
    expect(refusal(() => host.generator('ts')).message).toBe('no generator is named "ts". fix: use one of: none; or install the plugin that provides it and add it to `plugins`');
    host.register(plugin());
    host.register({ name: 'more', generators: { zeta: generator(), alpha: generator(), list: generator() } });
    host.register({ name: 'another-layer' });
    for (const target of ['ts', 'toString']) {
      const error = refusal(() => host.generator(target));
      expect(error.code).toBe('E_NO_CONTRIBUTION');
      expect(error.message).toBe(`no generator is named "${target}". fix: use one of: alpha, list, zeta; or install the plugin that provides it and add it to \`plugins\``);
    }
  });

  it('refuses what a generator returns when it must not be written', async () => {
    const host = createHost();
    host.register(plugin({ run: () => [{ path: '../escape.ts', content: '', owner: 'generated' }] }));
    await expect(host.generate('list', document)).rejects.toThrow('generator "list" returned the path "../escape.ts", which leaves the output folder');
  });
});

describe("the program's host", () => {
  it('registers, lists and forgets plugins, and refuses a bad one', () => {
    reset();
    const one = plugin();
    register(one);
    expect(registered()).toEqual([one]);
    expect(() => register({ name: '' })).toThrow(PluginError);
    expect(registered()).toEqual([one]);
    reset();
    expect(registered()).toEqual([]);
    expect(createHost().plugins()).not.toBe(registered());
  });
});

describe('checkPlugin', () => {
  it('passes a plugin whose generators produce exactly their samples, and one with no generators', async () => {
    expect(await checkPlugin(plugin())).toEqual([]);
    expect(await checkPlugin({ name: 'adapters-only', adapters: { openapi } })).toEqual([]);
  });

  it('runs the sample with the sample options', async () => {
    const sample = { document, options: { prefix: '> ' }, files: [{ path: 'operations.txt', owner: 'generated' as const, content: '> listPets\n' }] };
    expect(await checkPlugin(plugin({ sample }))).toEqual([]);
  });

  it('refuses a plugin that is not one, and a generator whose output must not be written', async () => {
    await expect(checkPlugin(null)).rejects.toThrow('a plugin is a plain object');
    const escaping = plugin({ run: () => [{ path: '/abs.ts', content: '', owner: 'generated' }] });
    await expect(checkPlugin(escaping)).rejects.toThrow('generator "list" returned the path "/abs.ts", which leaves the output folder');
  });

  it('finds a file that differs, in content or in owner', async () => {
    const different = { generator: 'list', path: 'operations.txt', problem: 'different', fix: 'update `sample.files` to what `run` returns, or fix `run`' };
    const content = { document, files: [{ path: 'operations.txt', owner: 'generated' as const, content: 'listPets' }] };
    expect(await checkPlugin(plugin({ sample: content }))).toEqual([different]);
    const owner = { document, files: [{ path: 'operations.txt', owner: 'user' as const, content: 'listPets\n' }] };
    expect(await checkPlugin(plugin({ sample: owner }))).toEqual([different]);
  });

  it('finds a file the sample does not declare, and one the generator does not produce', async () => {
    const sample = { document, files: [{ path: 'README.md', owner: 'user' as const, content: '' }] };
    expect(await checkPlugin(plugin({ sample }))).toEqual([
      { generator: 'list', path: 'operations.txt', problem: 'unexpected', fix: 'add the file to `sample.files`, or stop generating it' },
      { generator: 'list', path: 'README.md', problem: 'missing', fix: 'generate the file, or remove it from `sample.files`' },
    ]);
  });

  it('finds output that changes between two runs: content, and the set of files', async () => {
    let runs = 0;
    const counting = plugin({ run: () => [{ path: 'operations.txt', owner: 'generated', content: `run ${String((runs += 1))}\n` }] });
    expect(await checkPlugin(counting)).toEqual([
      { generator: 'list', path: 'operations.txt', problem: 'not deterministic', fix: 'remove whatever changes between runs: time, random values, iteration order' },
    ]);
    let calls = 0;
    const growing = plugin({
      run: (contract, options) => ((calls += 1) === 1 ? list(contract, options) : [...list(contract, options), { path: 'late.txt', owner: 'generated', content: '' }]),
    });
    expect(await checkPlugin(growing)).toEqual([{ generator: 'list', path: 'late.txt', problem: 'not deterministic', fix: 'return the same files on every run' }]);
  });

  it('checks every generator of the plugin, each under its own name', async () => {
    const two: Plugin = { name: 'two', adapters: { openapi }, generators: { good: generator(), bad: generator({ run: () => [] }) } };
    expect((await checkPlugin(two)).map((finding) => [finding.generator, finding.problem])).toEqual([['bad', 'missing']]);
  });
});

/** Check a plugin with one extractor, `schemas`, whose sample declares `document`. */
const checkExtractor = async (run: () => unknown, document: unknown = { a: 1, b: [2] }) =>
  checkPlugin({ name: 'x', extractors: { schemas: { description: 'd', sample: { options: {}, document }, run } } });

describe('what 6.0 added for the lanes', () => {
  const finding = { code: 'keyword-dropped', pointer: '/paths', message: 'dropped', fix: 'nothing to do' };
  const extractor = { description: 'Reads schemas', sample: { options: { module: './a.js' }, document: { openapi: '3.1.0' } }, run: () => ({ openapi: '3.1.0' }) };

  it('lets a generator return files with findings, and writes only the files', async () => {
    const host = createHost();
    host.register(plugin({ run: (contract, options) => ({ files: list(contract, options), findings: [finding] }) }));
    expect(await host.generate('list', document)).toEqual([{ path: 'operations.txt', owner: 'generated', content: 'listPets\n' }]);
    expect(resultOf({ files: [], findings: [finding] }).findings).toEqual([finding]);
    expect(resultOf({ files: [], findings: 'not a list' }).findings).toEqual([]);
    expect(resultOf([])).toEqual({ files: [], findings: [] });
    expect(resultOf(null)).toEqual({ files: null, findings: [] });
    expect(resultOf({ path: 'a' })).toEqual({ files: { path: 'a' }, findings: [] });
  });

  it('accepts an extractor with a sample, and refuses one without', () => {
    expect(() => validate({ name: 'x', extractors: { schemas: extractor } })).not.toThrow();
    for (const bad of [1, { ...extractor, description: '' }, { ...extractor, run: 'no' }]) {
      expect(refusal(() => validate({ name: 'x', extractors: { schemas: bad } })).message).toBe(
        'plugin "x": extractors.schemas is not an extractor. fix: an extractor is `{ description, sample, run(options) }`',
      );
    }
    expect(refusal(() => validate({ name: 'x', extractors: { schemas: { ...extractor, sample: {} } } })).message).toBe(
      'plugin "x": extractors.schemas has no sample. fix: add `sample: { options, document }`: the options it runs with and the document it returns',
    );
    expect(refusal(() => validate({ name: 'x', extractors: 1 })).message).toBe('plugin "x": extractors must be an object. fix: map a name to each of the extractors');
    expect(refusal(() => validate({ name: 'x', extractors: { schemas: { description: 'd' } } })).fix).toBe('an extractor is `{ description, sample, run(options) }`');
    expect(refusal(() => validate({ name: 'x', extractors: { schemas: { ...extractor, sample: { document: {} } } } })).code).toBe('E_NO_STATIC_PROJECTION');
    expect(refusal(() => validate({ name: 'x', extractors: { schemas: { ...extractor, sample: { options: {} } } } })).code).toBe('E_NO_STATIC_PROJECTION');
    expect(refusal(() => validate({ name: 'x', extractors: { schemas: { ...extractor, sample: 1 } } })).code).toBe('E_NO_STATIC_PROJECTION');
  });

  it('checks each extractor against its sample, as data, and run twice', async () => {
    expect(await checkExtractor(() => ({ b: [2], a: 1 }))).toEqual([]);
    expect(await checkExtractor(async () => ({ a: 1, b: [2] }))).toEqual([]);
    expect(await checkExtractor(() => ({ a: 2, b: [2] }))).toEqual([
      { generator: 'schemas', path: 'sample.document', problem: 'different', fix: 'update `sample.document` to what `run(sample.options)` returns, or fix `run`' },
    ]);
    expect(await checkExtractor(() => undefined)).toEqual([expect.objectContaining({ problem: 'different' })]);
    let calls = 0;
    expect(await checkExtractor(() => ({ a: (calls += 1), b: [2] }), { a: 1, b: [2] })).toEqual([
      { generator: 'schemas', path: 'sample.document', problem: 'not deterministic', fix: 'remove whatever changes between runs: time, random values, iteration order' },
    ]);
    const options = { module: './m.js' };
    let seen: unknown;
    await checkPlugin({ name: 'x', extractors: { schemas: { description: 'd', sample: { options, document: 1 }, run: (o: unknown) => ((seen = o), 1) } } });
    expect(seen).toBe(options);
  });

  it('lets an extractor return its document with findings, and takes a document without them as is', () => {
    expect(documentOf({ document: { openapi: '3.1.0' }, findings: [finding] })).toEqual({ document: { openapi: '3.1.0' }, findings: [finding] });
    expect(documentOf({ document: 1, findings: 'not a list' })).toEqual({ document: 1, findings: [] });
    expect(documentOf({ openapi: '3.1.0' })).toEqual({ document: { openapi: '3.1.0' }, findings: [] });
    // A spec may have a `document` key of its own: only both keys make a result.
    expect(documentOf({ document: 1 })).toEqual({ document: { document: 1 }, findings: [] });
    expect(documentOf({ findings: [] })).toEqual({ document: { findings: [] }, findings: [] });
    expect(documentOf(null)).toEqual({ document: null, findings: [] });
    expect(documentOf([1])).toEqual({ document: [1], findings: [] });
  });

  it('checks an extractor that returns findings by its document only', async () => {
    expect(await checkExtractor(() => ({ document: { a: 1, b: [2] }, findings: [finding] }))).toEqual([]);
    let calls = 0;
    expect(await checkExtractor(() => ({ document: { a: 1, b: [2] }, findings: [{ ...finding, message: String((calls += 1)) }] }))).toEqual([]);
    expect(await checkExtractor(() => ({ document: { a: 2, b: [2] }, findings: [] }))).toEqual([expect.objectContaining({ problem: 'different' })]);
  });

  it('checks a plugin that carries no adapter, by the built-in formats', async () => {
    const generators = { list: generator() };
    expect(await checkPlugin({ name: 'no-adapters', generators })).toEqual([]);
  });
});

describe('what the spine (6.1) added', () => {
  const finding = { code: 'keyword-dropped', pointer: '/paths', message: 'dropped', fix: 'nothing to do' };
  const readerFinding = { code: 'construct-translated', pointer: '/info', message: 'translated', fix: 'nothing to do' };
  const extractor = { description: 'Reads schemas', sample: { options: {}, document: {} }, run: () => ({ openapi: '3.1.0' }) };

  it('accepts files that name the symbols they declare per operation', () => {
    const files = file({ symbols: [{ operation: 'listPets', symbol: 'ListPets' }] });
    expect(validateFiles(files, 'x')).toBe(files);
    expect(validateFiles(file({ symbols: [] }), 'x')).toHaveLength(1);
  });

  it.each<[string, unknown]>([
    ['not a list', { operation: 'a', symbol: 'A' }],
    ['an entry that is not an object', ['A']],
    ['an entry with no operation', [{ symbol: 'A' }]],
    ['an entry with an empty operation', [{ operation: '', symbol: 'A' }]],
    ['an entry with no symbol', [{ operation: 'a' }]],
    ['an entry with an empty symbol', [{ operation: 'a', symbol: '' }]],
  ])('refuses symbols that are %s', (_, symbols) => {
    expect(refusal(() => validateFiles(file({ symbols }), 'x')).message).toBe(
      'x returned "a.ts" with malformed symbols. fix: each symbol is `{ operation, symbol }`, both non-empty strings',
    );
  });

  it('runs a generator and keeps what the reader and the generator report, reader first', async () => {
    const host = createHost();
    const reading = { ...openapi, read: (d: unknown) => ({ ...openapi.read(d), findings: [readerFinding] }) };
    host.register({ name: 'demo', adapters: { openapi: reading }, generators: { list: generator({ run: (c, o) => ({ files: list(c, o), findings: [finding] }) }) } });
    expect(await host.run('list', document, { prefix: '> ' })).toEqual({ files: [{ path: 'operations.txt', owner: 'generated', content: '> listPets\n' }], findings: [readerFinding, finding] });
  });

  it('runs a generator with no options and a reader with no findings', async () => {
    const host = createHost();
    host.register(plugin());
    expect(await host.run('list', document)).toEqual({ files: [{ path: 'operations.txt', owner: 'generated', content: 'listPets\n' }], findings: [] });
    await expect(host.run('list', document)).resolves.toBeDefined();
    host.register({ name: 'bad', generators: { list: generator({ run: () => [{ path: '../x', content: '', owner: 'user' }] }) } });
    await expect(host.run('list', document)).rejects.toThrow('generator "list" returned the path "../x"');
  });

  it('finds an extractor by name, the later plugin winning, and ignores inherited names', () => {
    const host = createHost();
    const later = { ...extractor, description: 'Later' };
    host.register({ name: 'a', extractors: { schemas: extractor } });
    host.register({ name: 'b', generators: {} });
    host.register({ name: 'c', extractors: { schemas: later, routes: extractor } });
    expect(host.extractor('schemas')).toBe(later);
    expect(refusal(() => host.extractor('toString')).message).toBe(
      'no extractor is named "toString". fix: use one of: routes, schemas; or install the plugin that provides it and add it to `plugins`',
    );
    expect(refusal(() => host.extractor('nope')).code).toBe('E_NO_CONTRIBUTION');
    expect(refusal(() => createHost().extractor('x')).fix).toBe('use one of: none; or install the plugin that provides it and add it to `plugins`');
  });
});
