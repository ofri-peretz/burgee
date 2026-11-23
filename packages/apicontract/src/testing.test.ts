import { describe, expect, it } from 'vitest';

import { plugin as brokenDeterministic } from './__fixtures__/kit/broken-deterministic.js';
import { plugin as brokenFixLines } from './__fixtures__/kit/broken-fix-lines.js';
import { plugin as brokenPaths } from './__fixtures__/kit/broken-paths.js';
import { plugin as brokenRegeneration } from './__fixtures__/kit/broken-regeneration.js';
import { extractor as brokenExtractor, plugin as brokenRoundtrip } from './__fixtures__/kit/broken-roundtrip.js';
import { plugin as brokenSample } from './__fixtures__/kit/broken-sample.js';
import { plugin as brokenSchema } from './__fixtures__/kit/broken-schema.js';
import { document, extractor, generator, plugin } from './__fixtures__/kit/correct.js';
import { type GeneratedFile, type Generator } from './host.js';
import { ConformanceError, conformance, type ConformanceOptions, type Failure } from './testing.js';

const failures = async (candidate: unknown, options?: ConformanceOptions): Promise<readonly Failure[]> => {
  try {
    await conformance(candidate, options);
  } catch (error) {
    if (error instanceof ConformanceError) return error.failures;
    throw error;
  }
  return [];
};

describe('the seven broken fixture plugins', () => {
  it.each([
    ['schema', brokenSchema, {}],
    ['sample', brokenSample, {}],
    ['deterministic', brokenDeterministic, {}],
    ['regeneration', brokenRegeneration, {}],
    ['roundtrip', brokenRoundtrip, { extractor: brokenExtractor }],
    ['fix-lines', brokenFixLines, {}],
    ['paths', brokenPaths, {}],
  ] as const)('the one breaking `%s` fails that rule and no other', async (rule, broken, options) => {
    const found = await failures(broken, options);
    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found.map((failure) => failure.rule))).toEqual(new Set([rule]));
  });
});

it('passes the correct plugin, round trip included', async () => {
  await expect(conformance(plugin, { extractor })).resolves.toBeUndefined();
});

const refusing = (text: string) => ({ name: 'no', generators: { list: { ...generator, run: async () => Promise.reject(new Error(text)) } } });

describe('conformance', () => {
  const lines = { description: 'Lines of text as operations', detect: (document: unknown) => typeof document === 'string', read: (document: unknown) => ({ format: 'lines', document, operations: String(document).split(' ').map((id) => ({ id, source: '', payloads: [] })) }) };
  const ids: Generator = {
    description: 'One line per operation',
    inputs: ['lines', 'openapi'],
    sample: { document: 'a b', options: { banner: '#' }, files: [{ path: 'ids.txt', owner: 'generated', content: '#a\n#b\n' }] },
    run: (contract, options) => {
      if (typeof options.banner !== 'string') throw new Error('no banner');
      return [{ path: 'ids.txt', owner: 'generated', content: contract.operations.map((operation) => `${String(options.banner)}${operation.id}\n`).join('') }];
    },
  };

  it('reports every rule broken, in the order of RULES, in one error that names the plugin', async () => {
    const error = await conformance({ name: 'two', generators: { list: { ...brokenPaths.generators?.list, sample: { ...generator.sample, document } } } }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConformanceError);
    expect((error as ConformanceError).name).toBe('ConformanceError');
    expect((error as ConformanceError).message).toBe(
      [
        'plugin "two" breaks 2 conformance rule(s) in 4 place(s):',
        '- sample: list: listPets.txt: the file is unexpected',
        '  fix: add the file to `sample.files`, or stop generating it',
        '- sample: list: operations.txt: the file is missing',
        '  fix: generate the file, or remove it from `sample.files`',
        '- sample: list: custom.ts: the file is missing',
        '  fix: generate the file, or remove it from `sample.files`',
        '- paths: generator "list" on an operation id with "../" in it: generator "list" on an operation id with "../" in it returned the path "../conformance-probe.txt", which leaves the output folder',
        '  fix: use a relative path with `/` separators and no `..`',
      ].join('\n'),
    );
  });

  it.each([[null], [42], [{ name: 3 }]])('calls a plugin with no name "unnamed": %j', async (candidate) => {
    await expect(conformance(candidate)).rejects.toThrow(/^plugin "unnamed" breaks 1 conformance rule\(s\) in 1 place\(s\):\n- schema: plugin: /u);
  });

  it('reports a plugin that contributes nothing, by its name', async () => {
    await expect(conformance({ name: 'idle' })).rejects.toThrow('plugin "idle" breaks 1 conformance rule(s) in 1 place(s):\n- schema: plugin "idle": it contributes no adapter, generator, extractor or rule\n  fix: add `generators`, `extractors`, `adapters` or `rules`');
  });

  it('runs every generator with its sample options, its own adapters, and asks for `mutate` on a format it cannot change', async () => {
    const own = { name: 'own', adapters: { lines }, generators: { ids } };
    expect((await failures(own)).map((failure) => [failure.rule, failure.message])).toEqual([['regeneration', 'the suite cannot add an operation to this sample document']]);
    await expect(conformance(own, { mutate: (document) => `${String(document)} c` })).resolves.toBeUndefined();
  });

  it('runs every corpus document twice, for determinism and paths', async () => {
    let calls = 0;
    const flaky: Generator = {
      ...ids,
      run: (contract, options) => {
        calls += 1;
        const out = ids.run(contract, options) as GeneratedFile[];
        if (contract.operations.some((operation) => operation.id === 'escape')) return [...out, { path: '../escape.txt', owner: 'generated', content: '' }];
        return contract.operations.some((operation) => operation.id === 'flaky') ? [...out, { path: `${String(calls)}.txt`, owner: 'generated', content: '' }] : out;
      },
    };
    const plugin = { name: 'corpus', adapters: { lines }, generators: { ids: flaky } };
    expect((await failures(plugin, { mutate: (document) => `${String(document)} c`, corpus: ['a', 'flaky', 'escape'] })).map((failure) => [failure.rule, failure.where])).toEqual([
      ['deterministic', 'generator "ids" on corpus document 1'],
      ['paths', 'generator "ids" on corpus document 2'],
      ['paths', 'generator "ids" on corpus document 2'],
    ]);
  });

  it('round-trips only the generator the extractor pairs with, when it names one', async () => {
    const both = { ...plugin, generators: { ...plugin.generators, ids: { ...ids, sample: { ...ids.sample, document, files: [{ path: 'ids.txt', owner: 'generated' as const, content: '#listPets\n' }] } } } };
    const unpaired = await failures(both, { extractor });
    expect(unpaired.map((failure) => [failure.rule, failure.where])).toEqual([['roundtrip', 'generator "ids"']]);
    await expect(conformance(both, { extractor, generator: 'list' })).resolves.toBeUndefined();
    expect((await failures(both, { extractor, generator: 'ids' })).map((failure) => [failure.rule, failure.where])).toEqual([['roundtrip', 'generator "ids"']]);
  });

  it('checks an extractor-only plugin through checkPlugin', async () => {
    await expect(conformance({ name: 'reads', extractors: { list: extractor } })).resolves.toBeUndefined();
    const failing = { name: 'reads', extractors: { list: { ...extractor, sample: { options: {}, document: { openapi: '3.0.0', paths: {} } } } } };
    expect((await failures(failing)).map((failure) => failure.rule)).toEqual(['sample']);
  });

  it('reports a generator that refuses its own sample under `sample`, and a bare refusal once under `fix-lines`', async () => {
    expect((await failures(refusing('cannot. fix: do'))).map((failure) => [failure.rule, failure.where])).toEqual([
      ['sample', 'sample'],
      ['regeneration', 'generator "list"'],
    ]);
    expect((await failures(refusing('cannot'))).map((failure) => [failure.rule, failure.where])).toEqual([
      ['sample', 'sample'],
      ['regeneration', 'generator "list"'],
      ['fix-lines', 'generator "list" on its sample'],
      ['fix-lines', 'generator "list" after a spec change'],
      ['fix-lines', 'generator "list" on an operation id with "../" in it'],
      ['fix-lines', 'generator "list" on a contract with no operations'],
    ]);
    const reader = { name: 'reader', extractors: { list: { ...extractor, run: () => Promise.reject(new Error('unread')) } } };
    expect((await failures(reader)).map((failure) => [failure.rule, failure.where])).toEqual([
      ['sample', 'sample'],
      ['fix-lines', 'sample'],
    ]);
  });

  it('probes only what the sample allows: no "../" probe and no corpus unless given', async () => {
    const anything = { description: 'Reads anything', detect: () => true, read: (document: unknown) => ({ format: 'any', document, operations: [] }) };
    const bare = { name: 'bare', adapters: { anything }, generators: { ids: { ...ids, run: () => [] as GeneratedFile[], sample: { document: 'x', files: [] } } } };
    await expect(conformance(bare, { mutate: () => 'y' })).resolves.toBeUndefined();
    const refusing = { ...bare, generators: { ids: { ...bare.generators.ids, run: () => { throw new Error('bare'); } } } };
    expect((await failures(refusing, { mutate: () => 'y' })).filter((failure) => failure.rule === 'fix-lines').map((failure) => failure.where)).toEqual([
      'generator "ids" on its sample',
      'generator "ids" after a spec change',
      'generator "ids" on a contract with no operations',
    ]);
  });
});
