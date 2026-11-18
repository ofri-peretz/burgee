import { describe, expect, it } from 'vitest';

import { extractor as listExtractor, generator as listGenerator } from './__fixtures__/kit/correct.js';
import { createHost, type Extractor, type Finding, type GeneratedFile, type Generator, PluginError } from './host.js';
import { openapi } from './openapi.js';
import { deterministic, failureOf, fixLines, hasFix, type Outcome, outcome, paths, regeneration, roundtrip, RULES, type Run, sample, schema } from './testing-rules.js';

const file = (path: string, content = 'x', owner: GeneratedFile['owner'] = 'generated'): GeneratedFile => ({ path, content, owner });
const ok = (...files: GeneratedFile[]): Outcome => ({ files, findings: [] });
const finding = (problem: Finding['problem'], path = 'a.ts'): Finding => ({ generator: 'g', path, problem, fix: `fix ${problem}` });

it('lists the seven rules in the order a report reads them', () => {
  expect(RULES).toEqual(['schema', 'sample', 'deterministic', 'regeneration', 'roundtrip', 'fix-lines', 'paths']);
});

describe('failureOf and hasFix', () => {
  it('splits a refusal at its fix line, without the stop before it', () => {
    expect(failureOf('paths', 'here', new Error('it broke. fix: mend it'), 'fallback')).toEqual({ rule: 'paths', where: 'here', message: 'it broke', fix: 'mend it' });
    expect(failureOf('paths', 'here', new Error('it broke \n fix: mend it'), 'fallback').message).toBe('it broke');
    expect(failureOf('paths', 'here', new Error('fix: mend it'), 'fallback').message).toBe('');
  });

  it('uses the fallback for a refusal with no fix line, and reads a thrown non-error as text', () => {
    expect(failureOf('sample', 'there', 'bare. words', 'do this')).toEqual({ rule: 'sample', where: 'there', message: 'bare. words', fix: 'do this' });
  });

  it('knows a refusal that says what to do', () => {
    expect(hasFix(new Error('x. fix: y'))).toBe(true);
    expect(hasFix('x. fix: y')).toBe(true);
    expect(hasFix(new Error('x. fix:y'))).toBe(false);
    expect(hasFix(new Error('x'))).toBe(false);
  });
});

describe('outcome', () => {
  it('keeps the files and the findings, from a list or a result, sync or async', async () => {
    const found = [{ code: 'c', pointer: '', message: 'm', fix: 'f' }];
    expect(await outcome(() => [file('a')])).toEqual({ files: [file('a')], findings: [] });
    expect(await outcome(async () => ({ files: [file('a')], findings: found }))).toEqual({ files: [file('a')], findings: found });
  });

  it('keeps what a call threw or rejected with', async () => {
    const error = new Error('no');
    expect(
      await outcome(() => {
        throw error;
      }),
    ).toEqual({ error });
    expect(await outcome(async () => Promise.reject(error))).toEqual({ error });
  });
});

describe('schema', () => {
  it('reports what `validate` refuses, with its fix', () => {
    expect(schema({})).toEqual([{ rule: 'schema', where: 'plugin', message: 'a plugin needs a name', fix: 'add `name: "…"`: it is how a refused plugin is reported' }]);
  });

  it('refuses a plugin that contributes nothing apicontract reads', () => {
    expect(schema({ name: 'empty', commands: [] })).toEqual([
      { rule: 'schema', where: 'plugin "empty"', message: 'it contributes no adapter, generator or extractor', fix: 'add `generators`, `extractors` or `adapters`' },
    ]);
  });

  it.each([
    ['an adapter', { adapters: { openapi } }],
    ['a generator', { generators: { list: listGenerator } }],
    ['an extractor', { extractors: { list: listExtractor } }],
  ])('accepts a plugin with only %s', (_what, contributes) => {
    expect(schema({ name: 'p', ...contributes })).toEqual([]);
  });

  it('uses its own fix when the refusal carries none', () => {
    const throwing = {
      get name(): string {
        throw new Error('no name');
      },
    };
    expect(schema(throwing)).toEqual([{ rule: 'schema', where: 'plugin', message: 'no name', fix: 'export the shape `Plugin` in apicontract describes' }]);
  });
});

describe('sample', () => {
  it('reports what checkPlugin threw', () => {
    expect(sample({ error: new PluginError('E_PLUGIN_SCHEMA', 'bad', 'good') })).toEqual([{ rule: 'sample', where: 'sample', message: 'bad', fix: 'good' }]);
    expect(sample({ error: new Error('boom') })).toEqual([{ rule: 'sample', where: 'sample', message: 'boom', fix: 'make `run` succeed on its own `sample.document`' }]);
  });

  it('reports every finding but non-determinism', () => {
    expect(sample({ findings: [finding('missing'), finding('not deterministic'), finding('different', 'b.ts')] })).toEqual([
      { rule: 'sample', where: 'g: a.ts', message: 'the file is missing', fix: 'fix missing' },
      { rule: 'sample', where: 'g: b.ts', message: 'the file is different', fix: 'fix different' },
    ]);
  });
});

describe('deterministic', () => {
  const differ = { rule: 'deterministic', message: 'two runs on the same document differ', fix: 'remove whatever changes between runs: time, random values, iteration order' };

  it('reports the non-determinism checkPlugin found, and nothing when it threw', () => {
    expect(deterministic({ findings: [finding('not deterministic'), finding('missing')] }, [])).toEqual([
      { rule: 'deterministic', where: 'g: a.ts', message: 'two runs on the sample differ', fix: 'fix not deterministic' },
    ]);
    expect(deterministic({ error: new Error('x') }, [])).toEqual([]);
  });

  it('compares each run made twice: files, findings and refusals', () => {
    const error = (text: string): Outcome => ({ error: new Error(text) });
    const runs: Run[] = [
      { where: 'once', outcome: ok(file('a')) },
      { where: 'same', outcome: ok(file('a')), again: ok(file('a')) },
      { where: 'files', outcome: ok(file('a')), again: ok(file('a', 'y')) },
      { where: 'findings', outcome: ok(), again: { files: [], findings: [{ code: 'c', pointer: '', message: '', fix: 'f' }] } },
      { where: 'same refusal', outcome: error('no'), again: error('no') },
      { where: 'other refusal', outcome: error('no'), again: error('nope') },
      { where: 'refused once', outcome: error('no'), again: ok() },
      { where: 'refused second', outcome: ok(), again: error('no') },
    ];
    expect(deterministic({ findings: [] }, runs)).toEqual(['files', 'findings', 'other refusal', 'refused once', 'refused second'].map((where) => ({ ...differ, where })));
  });
});

describe('regeneration', () => {
  it('asks for `mutate` when the suite cannot change the sample', () => {
    expect(regeneration([{ generator: 'g', before: ok() }])).toEqual([
      {
        rule: 'regeneration',
        where: 'generator "g"',
        message: 'the suite cannot add an operation to this sample document',
        fix: 'pass `mutate` to `conformance`: a function that returns the sample document with one operation more',
      },
    ]);
  });

  it('reports a run that refused, before or after the change', () => {
    const refused = { error: new Error('no') };
    const expected = [{ rule: 'regeneration', where: 'generator "g"', message: 'no', fix: 'make `run` succeed on the sample document with one operation more' }];
    expect(regeneration([{ generator: 'g', before: refused, after: ok() }])).toEqual(expected);
    expect(regeneration([{ generator: 'g', before: ok(), after: refused }])).toEqual(expected);
  });

  it('names every user file the change would rewrite', () => {
    const fix = 'keep a user file the same whatever the spec says; put what follows the spec in a generated file it imports';
    expect(regeneration([{ generator: 'g', before: ok(file('a', '1', 'user'), file('b', '1', 'user'), file('c', '1')), after: ok(file('a', '2', 'user'), file('b', '2'), file('c', '2')) }])).toEqual([
      { rule: 'regeneration', where: 'g: a', message: 'the user file changes when the spec changes', fix },
      { rule: 'regeneration', where: 'g: b', message: 'the user file becomes generated when the spec changes', fix },
    ]);
  });

  it('leaves a path the host refuses to the `paths` rule', () => {
    expect(regeneration([{ generator: 'g', before: ok(file('a', '1', 'user')), after: ok(file('../a', '2', 'user')) }])).toEqual([]);
    expect(regeneration([{ generator: 'g', before: ok(file('../a', '1', 'user')), after: ok(file('a', '2', 'user')) }])).toEqual([]);
  });
});

describe('paths', () => {
  it('reports every run, first or second, whose files the host refuses', () => {
    const runs: Run[] = [
      { where: 'good', outcome: ok(file('a/b.ts')), again: ok(file('a/b.ts')) },
      { where: 'refused', outcome: { error: new Error('no') } },
      { where: 'first', outcome: ok(file('../a')) },
      { where: 'second', outcome: ok(file('a')), again: { files: 'nope', findings: [] } },
    ];
    expect(paths(runs)).toEqual([
      { rule: 'paths', where: 'first', message: 'first returned the path "../a", which leaves the output folder', fix: 'use a relative path with `/` separators and no `..`' },
      { rule: 'paths', where: 'second', message: 'second did not return a list of files', fix: 'return `{ path, content, owner }[]`' },
    ]);
  });

  it('uses its own fix when the refusal carries none', () => {
    const files = [
      {
        get path(): string {
          throw new Error('unreadable');
        },
      },
    ];
    expect(paths([{ where: 'odd', outcome: { files, findings: [] } }])).toEqual([{ rule: 'paths', where: 'odd', message: 'unreadable', fix: 'return relative paths with `/` separators' }]);
  });
});

const refusal = (where: string, text: string) => ({ rule: 'fix-lines', where, message: `it refused without a fix line: ${text}`, fix: 'end the message with `fix: <what to do>`, or throw a `PluginError`' });
const unfixed = (code: string) => ({ rule: 'fix-lines', where: 'run', message: `its finding "${code}" has no fix`, fix: 'give every finding a `fix`: what the user does about it' });

describe('fixLines', () => {
  it('reports every refusal without a fix line, first run or second, and the one checkPlugin threw once', () => {
    const runs: Run[] = [
      { where: 'fine', outcome: { error: new Error('no. fix: yes') } },
      { where: 'first', outcome: { error: new Error('bare') }, again: ok() },
      { where: 'second', outcome: ok(), again: { error: 'plain' } },
    ];
    expect(fixLines({ error: new Error('bare') }, runs)).toEqual([refusal('first', 'bare'), refusal('second', 'plain')]);
    expect(fixLines({ error: new Error('checked') }, runs)).toEqual([refusal('sample', 'checked'), refusal('first', 'bare'), refusal('second', 'plain')]);
    expect(fixLines({ error: new Error('checked. fix: x') }, [])).toEqual([]);
  });

  it('reports every finding without a fix', () => {
    const findings = [
      { code: 'good', pointer: '', message: '', fix: 'do' },
      { code: 'empty', pointer: '', message: '', fix: ' ' },
      { code: 'absent', pointer: '', message: '' },
    ];
    const runs = [
      { where: 'run', outcome: { files: [], findings } as unknown as Outcome },
      { where: 'refused', outcome: { error: new Error('x. fix: y') } },
    ];
    expect(fixLines({ findings: [] }, runs)).toEqual([unfixed('empty'), unfixed('absent')]);
  });
});

describe('roundtrip', () => {
  const host = createHost();
  host.register({ name: 'formats', adapters: { openapi } });
  const document = {
    openapi: '3.1.0',
    paths: { '/a': { get: { operationId: 'a', responses: { '200': { description: '', content: { 'application/json': { schema: { type: 'object', default: null, enum: [{ b: 1, a: 2 }] } } } } } } } },
  };
  const echo: Generator = {
    description: 'Writes the document',
    inputs: ['openapi'],
    sample: { document, options: { indent: 1 }, files: [] },
    run: (contract, options) => [file('doc.json', JSON.stringify({ document: contract.document, options }))],
  };
  const reading = (transform: (written: Record<string, unknown>) => unknown): Extractor => ({
    description: 'Reads it back',
    sample: { options: { from: 'doc.json' }, document: {} },
    run: (options) => {
      const files = options.files as GeneratedFile[];
      const written = JSON.parse(files.find((one) => one.path === options.from)?.content ?? '{}') as Record<string, unknown>;
      return transform(written);
    },
  });

  it('passes when the extracted document reads as the same contract, whatever its key order and sources', async () => {
    const reordered = reading((written) => {
      expect(written.options).toEqual({ indent: 1 });
      return {
        paths: { '/moved': { get: { responses: { '200': { content: { 'application/json': { schema: { enum: [{ a: 2, b: 1 }], default: null, type: 'object' } } } } }, operationId: 'a' } } },
        openapi: '3.1.0',
      };
    });
    expect(await roundtrip(host, [['echo', echo]], reordered)).toEqual([]);
  });

  it('reports a different contract', async () => {
    const lossy = reading(() => ({ openapi: '3.1.0', paths: { '/a': { get: { operationId: 'a' } } } }));
    expect(await roundtrip(host, [['echo', echo], ['again', echo]], lossy)).toEqual(
      ['echo', 'again'].map((name) => ({
        rule: 'roundtrip',
        where: `generator "${name}"`,
        message: 'extracting what it generated does not give back the sample contract',
        fix: 'make the extractor read every operation and payload the generator writes',
      })),
    );
  });

  it('reports a refusal, with its own fix or the suite’s', async () => {
    const refusing = reading(() => {
      throw new Error('cannot read');
    });
    expect(await roundtrip(host, [['echo', echo]], refusing)).toEqual([
      { rule: 'roundtrip', where: 'generator "echo"', message: 'cannot read', fix: 'make the extractor read the files the generator writes' },
    ]);
    const unoptioned: Generator = { ...echo, sample: { document, files: [] }, run: (_contract, options) => [file('doc.json', JSON.stringify(options))] };
    const fixed = reading((written) => {
      throw new Error(`saw ${JSON.stringify(written)}. fix: read more`);
    });
    expect(await roundtrip(host, [['bare', unoptioned]], fixed)).toEqual([{ rule: 'roundtrip', where: 'generator "bare"', message: 'saw {}', fix: 'read more' }]);
  });

  it('refuses generated paths before the extractor sees them', async () => {
    const escaping: Generator = { ...echo, run: () => [file('../doc.json')] };
    expect(await roundtrip(host, [['out', escaping]], reading(() => document))).toEqual([
      { rule: 'roundtrip', where: 'generator "out"', message: 'generator "out" returned the path "../doc.json", which leaves the output folder', fix: 'use a relative path with `/` separators and no `..`' },
    ]);
  });
});
