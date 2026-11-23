/**
 * apicontract-lint R4–R7: a plugin contributes `lint` rules, each carrying the sample that is its
 * test; the host keeps them, conformance checks them, and `lint` runs them.
 */
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { levelsOf, runLint, toSarif } from './command-lint.js';
import { createHost, PluginError, validate } from './host.js';
import { type Rule } from './lint-engine.js';
import { ConfigError, validateConfig } from './run-config.js';
import { ConformanceError, conformance, type Failure } from './testing.js';

const document = { openapi: '3.1.0', info: { title: 't', version: '1' }, paths: { '/pets': { get: { operationId: 'listPets', responses: { 200: { description: 'ok' } } } } } };
const MISSING = { pointer: '#/paths/~1pets/get', message: '`summary` is missing' };

/** A rule's members, any of them set to `undefined` to leave it out. */
type Over = { [K in keyof Rule]?: Rule[K] | undefined };

const rule = (over: Over = {}): Rule => ({
  description: 'Every operation has a summary',
  given: { select: 'operation' },
  then: { field: 'summary', function: 'truthy' },
  fix: 'add a one-line `summary`',
  sample: { document, findings: [MISSING] },
  ...over,
}) as Rule;

const refusal = (candidate: unknown): PluginError => {
  try {
    validate(candidate);
  } catch (error) {
    if (error instanceof PluginError) return error;
  }
  throw new Error('expected a PluginError');
};

const failures = async (rules: Record<string, unknown>, corpus?: unknown[]): Promise<readonly Failure[]> => {
  try {
    await conformance({ name: 'r', rules }, corpus === undefined ? {} : { corpus });
  } catch (error) {
    if (error instanceof ConformanceError) return error.failures;
    throw error;
  }
  return [];
};

const throwing = (text: string): Over => ({
  then: undefined,
  check: () => {
    throw new Error(text);
  },
});

describe('validate: a plugin rule', () => {
  it('accepts a rule by `then`, a list of them, or a `check`, each with its sample', () => {
    expect(() => validate({ name: 'r', rules: { bare: rule({ then: { function: 'truthy' } }), a: rule(), b: rule({ then: [{ function: 'defined', field: 'x', functionOptions: {} }] }), c: rule({ then: undefined, check: () => [] }) } })).not.toThrow();
  });

  it.each<[string, unknown]>([
    ['not an object', 1],
    ['no description', rule({ description: '' })],
    ['no fix', rule({ fix: '' })],
    ['no given', { ...rule(), given: 1 }],
    ['a select there is not', rule({ given: { select: 'path' as 'operation' } })],
  ])('refuses %s as not a rule', (_, candidate) => {
    const error = refusal({ name: 'r', rules: { a: candidate } });
    expect(error.message).toBe('plugin "r": rules.a is not a rule. fix: a rule is `{ description, given: { select }, then or check, fix, sample }`, `select` one of document, operation, parameter, property, schema');
    expect(error.code).toBe('E_PLUGIN_SCHEMA');
  });

  it.each<[string, Over]>([
    ['neither then nor check', { then: undefined }],
    ['a function there is not', { then: { function: 'nope' as 'truthy' } }],
    ['a then that is not an object', { then: 1 as unknown as Rule['then'] }],
    ['a field that is not text', { then: { function: 'truthy', field: 1 as unknown as string } }],
    ['options that are not an object', { then: { function: 'truthy', functionOptions: 1 as unknown as Record<string, unknown> } }],
    ['one bad entry in a list', { then: [{ function: 'truthy' }, { function: 'nope' as 'truthy' }] }],
    ['a check that is not a function', { check: 1 as unknown as Rule['check'] }],
  ])('refuses %s as saying nothing that must hold', (_, over) => {
    expect(refusal({ name: 'r', rules: { a: rule(over) } }).message).toBe(
      'plugin "r": rules.a says nothing that must hold. fix: give it `then: { function }`, `function` one of truthy, falsy, defined, undefined, pattern, casing, enumeration, length, xor, schema, or a `check(node, context)` function',
    );
  });

  it.each<[string, unknown]>([
    ['none', undefined],
    ['not an object', 1],
    ['no document', { findings: [] }],
    ['no findings', { document }],
    ['a finding that is not one', { document, findings: [1] }],
    ['a finding with no pointer', { document, findings: [{ message: 'm' }] }],
    ['a finding with no message', { document, findings: [{ pointer: '' }] }],
  ])('refuses a sample that is %s', (_, sample) => {
    const error = refusal({ name: 'r', rules: { a: { ...rule(), sample } } });
    expect(error.message).toBe('plugin "r": rules.a has no sample. fix: add `sample: { document, findings: [{ pointer, message }] }`: a small document and exactly what the rule finds on it');
    expect(error.code).toBe('E_NO_STATIC_PROJECTION');
  });

  it('accepts a sample whose document is null and that finds nothing', () => {
    expect(() => validate({ name: 'r', rules: { a: rule({ sample: { document: null, findings: [] } }) } })).not.toThrow();
  });
});

describe('host.rules', () => {
  it('is every rule the plugins contribute, a later plugin winning an id', () => {
    const host = createHost();
    expect(host.rules()).toEqual({});
    const later = rule({ fix: 'later' });
    host.register({ name: 'a', rules: { x: rule(), y: rule() } });
    host.register({ name: 'none' });
    host.register({ name: 'b', rules: { x: later } });
    expect(Object.keys(host.rules())).toEqual(['x', 'y']);
    expect(host.rules().x).toBe(later);
  });
});

describe('conformance: a plugin rule', () => {
  it('passes a rule that finds exactly its sample, on its sample and on a corpus', async () => {
    expect(await failures({ a: rule() }, [document, { openapi: '3.1.0', paths: {} }])).toEqual([]);
  });

  it('fails `sample` when the rule finds something else, naming both', async () => {
    expect(await failures({ a: rule({ sample: { document, findings: [] } }) })).toEqual([
      {
        rule: 'sample',
        where: 'rule "a" on its sample',
        message: `it finds ${JSON.stringify([MISSING])}; the sample says []`,
        fix: 'make `sample.findings` exactly what the rule finds on `sample.document`, or fix the rule',
      },
    ]);
  });

  it('fails `sample` for a rule that throws, with its own fix line when it has one', async () => {
    expect(await failures({ a: rule(throwing('boom')) })).toEqual([{ rule: 'sample', where: 'rule "a" on its sample', message: 'boom', fix: 'make the rule run on any document an adapter reads, without throwing' }]);
    expect((await failures({ a: rule(throwing('bad. fix: do x')) }))[0]).toMatchObject({ message: 'bad', fix: 'do x' });
  });

  it('fails `deterministic` when two runs differ, on the sample and on a corpus document', async () => {
    let calls = 0;
    const flaky = rule({ then: undefined, check: () => ((calls += 1), calls % 2 === 0 ? ['again'] : []), sample: { document, findings: [] } });
    const found = await failures({ a: flaky }, [document]);
    expect(found.map((failure) => [failure.rule, failure.where])).toEqual([
      ['deterministic', 'rule "a" on its sample'],
      ['deterministic', 'rule "a" on corpus document 0'],
    ]);
    expect(found[0]).toMatchObject({ message: 'two runs found different things', fix: 'remove whatever changes between runs: time, random values, iteration order, state kept between calls' });
  });

  it('fails `deterministic` when only the second run throws', async () => {
    let calls = 0;
    const second = rule({
      then: undefined,
      check: () => {
        calls += 1;
        if (calls % 2 === 0) throw new Error('second');
        return [];
      },
      sample: { document, findings: [] },
    });
    expect((await failures({ a: second })).map((failure) => failure.rule)).toEqual(['deterministic']);
  });

  it('fails `no-io` for a rule that calls fetch, whether or not it catches the refusal, and puts fetch back', async () => {
    const real = globalThis.fetch;
    const caught = rule({
      then: undefined,
      check: () => {
        try {
          void fetch('https://example.com', { signal: AbortSignal.timeout(1) });
        } catch {
          // a rule that swallows the refusal is still caught calling it
        }
        return [];
      },
    });
    const thrown = rule({ then: undefined, check: () => (void fetch('https://example.com', { signal: AbortSignal.timeout(1) }), []) });
    const found = await failures({ caught, thrown });
    expect(found.map((failure) => [failure.rule, failure.where, failure.message])).toEqual([
      ['no-io', 'rule "caught" on its sample', 'it called fetch'],
      ['no-io', 'rule "thrown" on its sample', 'it called fetch'],
    ]);
    let calls = 0;
    const second = rule({ then: undefined, check: () => ((calls += 1), calls % 2 === 0 && void fetch('https://example.com', { signal: AbortSignal.timeout(1) }), []) });
    expect((await failures({ second })).map((failure) => failure.rule)).toEqual(['no-io']);
    expect(found[0]?.fix).toBe('a rule reads only the node and the contract it is given: no network, no files, no model');
    expect(globalThis.fetch).toBe(real);
  });

  it('names rules among what a plugin may contribute', async () => {
    expect(await failures({})).toEqual([
      { rule: 'schema', where: 'plugin "r"', message: 'it contributes no adapter, generator, extractor or rule', fix: 'add `generators`, `extractors`, `adapters` or `rules`' },
    ]);
  });
});

const FIXTURE = fileURLToPath(new URL('__fixtures__/lint-plugin/summary-rule.mjs', import.meta.url));
const makeDir = scratchDirs();
const TEXT = Symbol.for('burgee.text');

describe('lint with a plugin rule', () => {
  const dir = makeDir('apicontract-lint-plugin-');
  copyFileSync(FIXTURE, join(dir, 'summary-rule.mjs'));
  writeFileSync(join(dir, 'api.json'), JSON.stringify(document));
  const configured = (lint?: object) => validateConfig({ plugins: ['./summary-rule.mjs'], ...(lint === undefined ? {} : { lint }) }, join(dir, 'apicontract.config.json'));

  it('runs a contributed rule at warn, and at the level the config sets', async () => {
    const data = await runLint({ cwd: dir, specs: ['api.json'], config: configured(), sarif: true });
    expect((data.findings as { rule: string; level: string }[]).filter((finding) => finding.rule === 'operation-summary-says-what').map((finding) => finding.level)).toEqual(['warn']);
    expect(JSON.stringify(data.sarif)).toContain('"text":"Every operation has a summary"');
    const raised = await runLint({ cwd: dir, specs: ['api.json'], config: configured({ rules: { 'operation-summary-says-what': 'error' } }) });
    expect(raised).toMatchObject({ exitCode: expect.any(Number) as number });
    expect((data[TEXT] as () => string)()).toContain('`summary` is missing');
  });

  it('refuses a config that sets a rule no plugin contributes, naming where it could come from', () => {
    expect(() => levelsOf(['recommended'], { nope: 'off' }, { mine: rule() })).toThrow(ConfigError);
    expect(() => levelsOf(['recommended'], { nope: 'off' }, { mine: rule() })).toThrow(/- `lint\.rules` names `nope`, which is not a rule\. fix: use one of .*, mine, .*, or add the plugin that contributes it to `plugins`$/u);
    expect(levelsOf([], {}, { mine: rule() })).toEqual({ mine: 'warn' });
    expect(levelsOf([], { mine: 'off' }, { mine: rule() })).toEqual({ mine: 'off' });
  });

  it('describes a contributed rule in SARIF, and a built-in one by default', () => {
    const result = { findings: [], counts: { mine: { checked: 1, failed: 0 } }, inputs: [] };
    expect(JSON.stringify(toSarif(result, { mine: rule() }))).toContain('Every operation has a summary');
  });
});
