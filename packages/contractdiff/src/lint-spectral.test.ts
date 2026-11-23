/**
 * apicontract-lint R9: a Spectral ruleset read as `lint` rules, and every rule it cannot carry listed.
 */
import { describe, expect, it } from 'vitest';

import { type Contract } from './core/model.js';
import { findingsOn, type Rule } from './lint-engine.js';
import { readSpectral, SPECTRAL_OAS } from './lint-spectral.js';
import { openapi } from './openapi.js';

const KNOWN = new Set(['operation-tags', 'info-description', 'no-unused-component']);
const read = (document: unknown) => readSpectral(document, '.spectral.yaml', KNOWN);
const one = (definition: unknown) => read({ rules: { r: definition } });
const reason = (definition: unknown): string | undefined => one(definition).notCarried[0]?.reason;

const contract: Contract = openapi.read({
  openapi: '3.1.0',
  info: { title: 'pets', version: '1' },
  paths: { '/pets': { get: { operationId: 'listPets', summary: 'List', responses: { 200: { description: 'ok' } } }, post: { operationId: 'AddPet', responses: { 201: { description: 'ok' } } } } },
});

describe('readSpectral: a rule it carries', () => {
  it('turns given and then into a path rule, at its severity, with a fix naming where it came from', () => {
    const { rules, levels, notCarried } = one({ description: 'Ids are camel case', given: '$.paths.*.*', then: { field: 'operationId', function: 'casing', functionOptions: { type: 'camel' } }, severity: 'error' });
    expect(notCarried).toEqual([]);
    expect(levels).toEqual({ r: 'error' });
    expect(rules.r).toEqual({
      description: 'Ids are camel case',
      given: { select: 'path', path: '$.paths.*.*' },
      then: { function: 'casing', field: 'operationId', functionOptions: { type: 'camel' } },
      fix: 'make it hold, as `r` in .spectral.yaml asks: Ids are camel case',
    });
    expect(findingsOn(rules.r as Rule, contract)).toEqual([{ pointer: '#/paths/~1pets/post', message: '`operationId` "AddPet" is not camel case' }]);
  });

  it('applies a then with no field to the value the path selected', () => {
    const { rules } = one({ given: ['$.info.title', '$.info.version'], then: [{ function: 'length', functionOptions: { min: 2 } }] });
    expect(rules.r?.given).toEqual({ select: 'path', path: ['$.info.title', '$.info.version'] });
    expect(rules.r?.description).toBe('r');
    expect(findingsOn(rules.r as Rule, contract)).toEqual([{ pointer: '#/info/version', message: 'has 1, fewer than 2' }]);
  });

  it('skips a message with {{…}} placeholders, which lint does not fill, for the id', () => {
    expect((one({ message: '{{property}} should be camelCase', given: '$.info', then: { function: 'truthy' } }).rules.r as Rule).description).toBe('r');
    expect((one({ message: '{{error}}', description: 'Plain', given: '$.info', then: { function: 'truthy' } }).rules.r as Rule).description).toBe('Plain');
  });

  it('reads the message as the description when there is none, and several thens as a list', () => {
    const { rules } = one({ message: 'Summaries and ids', given: '$.paths.*.*', then: [{ field: 'summary', function: 'truthy' }, { field: 'operationId', function: 'defined' }] });
    expect(rules.r?.description).toBe('Summaries and ids');
    expect(rules.r?.then).toStrictEqual([{ function: 'truthy', field: 'summary' }, { function: 'defined', field: 'operationId' }]);
    expect(findingsOn(rules.r as Rule, contract)).toEqual([{ pointer: '#/paths/~1pets/post', message: '`summary` is missing' }]);
  });

  it('carries a pattern, losing the slashes of /x/, and the formats as the adapters name them', () => {
    const { rules } = one({ given: '$.info', formats: ['oas3', 'oas3_1', 'oas2'], then: { field: 'title', function: 'pattern', functionOptions: { match: '/^[A-Z]/', notMatch: 'x' } } });
    expect(rules.r?.given).toEqual({ select: 'path', path: '$.info', formats: ['openapi', 'swagger2'] });
    expect(rules.r?.then).toEqual({ function: 'pattern', field: 'title', functionOptions: { match: '^[A-Z]', notMatch: 'x' } });
    expect(one({ given: '$.info', then: { function: 'pattern', functionOptions: { notMatch: 'x' } } }).rules.r?.then).toEqual({ function: 'pattern', functionOptions: { notMatch: 'x' } });
    expect(one({ given: '$.info', then: { function: 'pattern', functionOptions: { match: 'x' } } }).rules.r?.then).toStrictEqual({ function: 'pattern', functionOptions: { match: 'x' } });
    expect(one({ given: '$', then: { function: 'pattern', functionOptions: { match: 'x/a/', notMatch: '/a/ b' } } }).rules.r?.then).toStrictEqual({ function: 'pattern', functionOptions: { match: 'x/a/', notMatch: '/a/ b' } });
    expect(one({ given: '$', then: { function: 'truthy' } }).rules.r?.then).toStrictEqual({ function: 'truthy' });
  });

  it('carries the other core functions with their options as given', () => {
    const then = { function: 'enumeration', functionOptions: { values: ['a'] } };
    expect(one({ given: '$', then }).rules.r?.then).toEqual(then);
    expect(one({ given: '$', then: { function: 'xor', functionOptions: { properties: ['a', 'b'] } } }).notCarried).toEqual([]);
  });

  it.each<[unknown, string]>([
    ['error', 'error'],
    [0, 'error'],
    ['warn', 'warn'],
    [1, 'warn'],
    ['info', 'warn'],
    [2, 'warn'],
    ['hint', 'warn'],
    [3, 'warn'],
    ['off', 'off'],
    [-1, 'off'],
    [false, 'off'],
    [true, 'warn'],
    [undefined, 'warn'],
  ])('reads severity %s as %s', (severity, level) => {
    expect(one({ given: '$', then: { function: 'truthy' }, severity }).levels).toEqual({ r: level });
  });
});

describe('readSpectral: what it does not carry', () => {
  it.each<[string, unknown, string]>([
    ['a custom function', { given: '$', then: { function: 'myFunction' } }, 'function `myFunction` is not a core function contractdiff carries (truthy, falsy, defined, undefined, pattern, casing, enumeration, length, xor, schema)'],
    ['a path outside the subset', { given: '$.paths[*]~', then: { function: 'truthy' } }, '$.paths[*]~: `~` is outside the subset'],
    ['no given', { then: { function: 'truthy' } }, '`given` is not a JSONPath or a list of them'],
    ['an empty given', { given: [], then: { function: 'truthy' } }, '`given` is not a JSONPath or a list of them'],
    ['a then that is not an object', { given: '$', then: 'truthy' }, 'a `then` entry is not an object'],
    ['a key field', { given: '$', then: { field: '@key', function: 'truthy' } }, '`field` `@key` is not a member name; `@key` and JSONPath fields are not carried'],
    ['a JSONPath field', { given: '$', then: { field: '$.a', function: 'truthy' } }, '`field` `$.a` is not a member name; `@key` and JSONPath fields are not carried'],
    ['a field that is not text', { given: '$', then: { field: 1, function: 'truthy' } }, '`field` `1` is not a member name; `@key` and JSONPath fields are not carried'],
    ['options that are not an object', { given: '$', then: { function: 'length', functionOptions: 1 } }, '`functionOptions` is not an object'],
    ['a casing contractdiff lacks', { given: '$', then: { function: 'casing', functionOptions: { type: 'cobol' } } }, '`casing` type `cobol` is not one of camel, pascal, kebab, snake, macro, flat'],
    ['casing options it does not read', { given: '$', then: { function: 'casing', functionOptions: { type: 'camel', disallowDigits: true, separator: {} } } }, '`casing` options `disallowDigits`, `separator` are not carried'],
    ['a pattern with flags', { given: '$', then: { function: 'pattern', functionOptions: { match: '/x/i' } } }, "`pattern`'s `match` has the flags `i`, which are not carried"],
    ['a pattern that is not text', { given: '$', then: { function: 'pattern', functionOptions: { notMatch: 1 } } }, "`pattern`'s `notMatch` is not a string"],
    ['a pattern that does not compile', { given: '$', then: { function: 'pattern', functionOptions: { match: '\\p{Nope}' } } }, "`pattern`'s `match` does not compile as a Unicode regular expression"],
    ['a format it does not read', { given: '$', formats: ['arazzo1_0'], then: { function: 'truthy' } }, 'format `arazzo1_0` is not one contractdiff reads'],
    ['a severity it does not know', { given: '$', then: { function: 'truthy' }, severity: 'loud' }, 'severity `loud` is not error, warn, info, hint or off'],
    ['one casing option it does not read', { given: '$', then: { function: 'casing', functionOptions: { type: 'camel', separator: {} } } }, '`casing` options `separator` are not carried'],
    ['a given with a path that is not text', { given: ['$', 1], then: { function: 'truthy' } }, '`given` is not a JSONPath or a list of them'],
    ['a numeric severity past hint', { given: '$', then: { function: 'truthy' }, severity: 4 }, 'severity `4` is not error, warn, info, hint or off'],
  ])('lists %s, with the fix', (_, definition, why) => {
    const { rules, notCarried } = one(definition);
    expect(rules).toEqual({});
    expect(notCarried).toEqual([{ id: 'r', file: '.spectral.yaml', pointer: '#/rules/r', reason: why, fix: 'rewrite it with core functions and a `given` inside the JSONPath subset, or turn it off here and keep it in Spectral' }]);
  });

  it('escapes the rule id in its pointer', () => {
    expect(read({ rules: { 'a/b~c': { given: '$', then: { function: 'nope' } } } }).notCarried[0]?.pointer).toBe('#/rules/a~1b~0c');
  });

  it('reads a document that is not a ruleset as an empty one', () => {
    for (const document of [null, 1, [], { rules: [] }]) expect(read(document)).toEqual({ rules: {}, levels: {}, notCarried: [] });
  });

  it('keeps one bad rule from stopping the others', () => {
    expect(Object.keys(read({ rules: { bad: { given: '$', then: { function: 'nope' } }, good: { given: '$', then: { function: 'truthy' } } } }).rules)).toEqual(['good']);
    expect(reason({ given: '$', then: { function: 'nope' } })).toMatch(/^function `nope`/u);
  });
});

describe('the tables', () => {
  it('maps each spectral:oas rule it carries to its contractdiff rule and Spectral level', () => {
    expect(SPECTRAL_OAS).toStrictEqual({
      'info-description': { id: 'info-description', level: 'warn' },
      'operation-description': { id: 'operation-description', level: 'warn' },
      'operation-operationId': { id: 'operation-operation-id', level: 'warn' },
      'operation-operationId-unique': { id: 'operation-operation-id-unique', level: 'error' },
      'operation-success-response': { id: 'operation-success-response', level: 'warn' },
      'operation-tags': { id: 'operation-tags', level: 'warn' },
      'path-keys-no-trailing-slash': { id: 'path-no-trailing-slash', level: 'warn' },
      'oas3-unused-component': { id: 'no-unused-component', level: 'warn' },
      'oas3-valid-media-example': { id: 'example-valid', level: 'warn' },
    });
  });

  it.each([
    ['oas2', 'swagger2'],
    ['oas3', 'openapi'],
    ['oas3_0', 'openapi'],
    ['oas3.0', 'openapi'],
    ['oas3_1', 'openapi'],
    ['oas3.1', 'openapi'],
    ['asyncapi', 'asyncapi'],
    ['asyncapi2', 'asyncapi'],
    ['asyncapi2.0', 'asyncapi'],
  ])('reads Spectral format %s as %s', (format, ours) => {
    expect(one({ given: '$', formats: format, then: { function: 'truthy' } }).rules.r?.given.formats).toEqual([ours]);
  });
});

describe('readSpectral: extends and bare severities', () => {
  it('carries spectral:oas as its contractdiff equivalents, and lists the rest in one entry', () => {
    const { levels, notCarried } = read({ extends: 'spectral:oas' });
    expect(levels).toEqual(Object.fromEntries(Object.values(SPECTRAL_OAS).map(({ id, level }) => [id, level])));
    expect(levels['operation-operation-id-unique']).toBe('error');
    expect(notCarried).toEqual([
      {
        id: 'spectral:oas',
        file: '.spectral.yaml',
        pointer: '#/extends/0',
        reason: `carries 9 of its rules as contractdiff equivalents (${Object.keys(SPECTRAL_OAS).join(', ')}); the others are not carried`,
        fix: 'add the others you rely on as rules in this file, or run `contractdiff lint --ruleset recommended` for the built-in set',
      },
    ]);
    expect(read({ extends: [['spectral:oas', 'recommended']] }).notCarried).toHaveLength(1);
  });

  it('skips an extends turned off, and lists one it does not read', () => {
    expect(read({ extends: [['spectral:oas', 'off']] })).toEqual({ rules: {}, levels: {}, notCarried: [] });
    expect(read({ extends: ['spectral:oas', './house.yaml'] }).notCarried[1]).toEqual({
      id: './house.yaml',
      file: '.spectral.yaml',
      pointer: '#/extends/1',
      reason: 'extends `./house.yaml`, which contractdiff does not read',
      fix: 'copy the rules you need from `./house.yaml` into .spectral.yaml, inside the JSONPath subset',
    });
  });

  it('sets the level of a spectral:oas rule by its contractdiff name, and of an contractdiff rule by its own', () => {
    expect(read({ extends: 'spectral:oas', rules: { 'operation-operationId': 'error', 'oas3-unused-component': 'off', 'info-description': false } }).levels).toMatchObject({
      'operation-operation-id': 'error',
      'no-unused-component': 'off',
      'info-description': 'off',
    });
    expect(read({ rules: { 'operation-tags': 'error' } }).levels).toEqual({ 'operation-tags': 'error' });
    expect(read({ rules: { 'no-unused-component': 'error' } }).levels).toEqual({ 'no-unused-component': 'error' });
  });

  it('lists a bare severity for a rule nothing defines', () => {
    expect(read({ rules: { 'oas3-schema': 'error' } }).notCarried[0]?.reason).toBe('it sets the level of `oas3-schema`, which no carried ruleset defines');
    expect(read({ rules: { 'operation-tags': 'loud' } }).notCarried[0]?.reason).toBe('severity `loud` is not error, warn, info, hint or off');
  });
});
