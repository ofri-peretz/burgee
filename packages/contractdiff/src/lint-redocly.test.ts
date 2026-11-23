/**
 * apicontract-lint R9: a Redocly config read as `lint` rules, and every rule it cannot carry listed.
 */
import { describe, expect, it } from 'vitest';

import { type Contract } from './core/model.js';
import { findingsOn, type Rule } from './lint-engine.js';
import { readRedocly, REDOCLY_RECOMMENDED } from './lint-redocly.js';
import { openapi } from './openapi.js';

const KNOWN = new Set(['operation-tags', 'info-description']);
const read = (document: unknown) => readRedocly(document, 'redocly.yaml', KNOWN);
const one = (definition: unknown, id = 'rule/r') => read({ rules: { [id]: definition } });
const reason = (definition: unknown, id = 'rule/r'): string | undefined => one(definition, id).notCarried[0]?.reason;
const on = (assertions: Record<string, unknown>, property: unknown = 'operationId') => one({ subject: { type: 'Operation', property }, assertions }).rules['rule/r'] as Rule;
const then = (assertions: Record<string, unknown>) => on(assertions).then;
const given = (type: string) => (one({ subject: { type }, assertions: { defined: true } }).rules['rule/r'] as Rule).given;
const casing = (name: string) => on({ casing: name }).then;

const contract: Contract = openapi.read({
  openapi: '3.1.0',
  info: { title: 'pets', version: '1' },
  paths: { '/pets': { get: { operationId: 'listPets', summary: 'List', responses: { 200: { description: 'ok' } } }, post: { operationId: 'AddPet', responses: { 201: { description: 'ok' } } } } },
});

describe('readRedocly: a configurable rule it carries', () => {
  it('turns subject and assertions into a rule, at its severity, with a fix naming where it came from', () => {
    const { rules, levels, notCarried } = one({ subject: { type: 'Operation', property: 'operationId' }, assertions: { casing: 'camelCase' }, message: 'Ids are camel case', severity: 'warn' });
    expect(notCarried).toStrictEqual([]);
    expect(levels).toStrictEqual({ 'rule/r': 'warn' });
    expect(rules['rule/r']).toStrictEqual({
      description: 'Ids are camel case',
      given: { select: 'operation' },
      then: { function: 'casing', functionOptions: { type: 'camel' }, field: 'operationId' },
      fix: 'make it hold, as `rule/r` in redocly.yaml asks: Ids are camel case',
    });
    expect(findingsOn(rules['rule/r'] as Rule, contract)).toStrictEqual([{ pointer: '#/paths/~1pets/post', message: '`operationId` "AddPet" is not camel case' }]);
  });

  it('skips a message with {{…}} placeholders for the id', () => {
    expect((one({ subject: { type: 'Root' }, assertions: { defined: true }, message: '{{property}} is missing' }).rules['rule/r'] as Rule).description).toBe('rule/r');
  });

  it('is an error by default and takes its id as its description', () => {
    const { rules, levels } = one({ subject: { type: 'Root' }, assertions: { defined: true } });
    expect(levels).toStrictEqual({ 'rule/r': 'error' });
    expect(rules['rule/r']).toStrictEqual({ description: 'rule/r', given: { select: 'document' }, then: { function: 'defined' }, fix: 'make it hold, as `rule/r` in redocly.yaml asks: rule/r' });
  });

  it('checks every property against every assertion', () => {
    expect(on({ defined: true, nonEmpty: true }, ['summary', 'description']).then).toStrictEqual([
      { function: 'defined', field: 'summary' },
      { function: 'length', functionOptions: { min: 1 }, field: 'summary' },
      { function: 'defined', field: 'description' },
      { function: 'length', functionOptions: { min: 1 }, field: 'description' },
    ]);
    expect(findingsOn(on({ defined: true }, 'summary'), contract)).toStrictEqual([{ pointer: '#/paths/~1pets/post', message: '`summary` is missing' }]);
  });

  it('maps each assertion to the core function that means the same', () => {
    expect(then({ defined: true })).toStrictEqual({ function: 'defined', field: 'operationId' });
    expect(then({ defined: false })).toStrictEqual({ function: 'undefined', field: 'operationId' });
    expect(then({ nonEmpty: true })).toStrictEqual({ function: 'length', functionOptions: { min: 1 }, field: 'operationId' });
    expect(then({ pattern: '/^[a-z]/' })).toStrictEqual({ function: 'pattern', functionOptions: { match: '^[a-z]' }, field: 'operationId' });
    expect(then({ notPattern: '^x' })).toStrictEqual({ function: 'pattern', functionOptions: { notMatch: '^x' }, field: 'operationId' });
    expect(then({ enum: ['a', 'b'] })).toStrictEqual({ function: 'enumeration', functionOptions: { values: ['a', 'b'] }, field: 'operationId' });
    expect(then({ const: 'a' })).toStrictEqual({ function: 'enumeration', functionOptions: { values: ['a'] }, field: 'operationId' });
    expect(then({ minLength: 2 })).toStrictEqual({ function: 'length', functionOptions: { min: 2 }, field: 'operationId' });
    expect(then({ maxLength: 9 })).toStrictEqual({ function: 'length', functionOptions: { max: 9 }, field: 'operationId' });
    expect(findingsOn(on({ maxLength: 6 }), contract)).toStrictEqual([{ pointer: '#/paths/~1pets/get', message: '`operationId` has 8, more than 6' }]);
  });

  it('selects each subject type', () => {
    expect(['Root', 'Info', 'Operation', 'Parameter', 'Schema'].map((type) => given(type))).toStrictEqual([
      { select: 'document' },
      { select: 'path', path: '$.info' },
      { select: 'operation' },
      { select: 'parameter' },
      { select: 'schema' },
    ]);
    expect(findingsOn({ description: 'd', given: given('Info'), then: { function: 'defined', field: 'description' }, fix: 'f' }, contract)).toStrictEqual([{ pointer: '#/info', message: '`description` is missing' }]);
  });

  it('maps every casing', () => {
    expect(['camelCase', 'PascalCase', 'kebab-case', 'snake_case', 'MACRO_CASE', 'flatcase'].map((name) => casing(name))).toStrictEqual(
      ['camel', 'pascal', 'kebab', 'snake', 'macro', 'flat'].map((type) => ({ function: 'casing', functionOptions: { type }, field: 'operationId' })),
    );
  });
});

describe('readRedocly: what it does not carry', () => {
  it('names why, at the rule, with a fix', () => {
    expect(one({ subject: { type: 'Operation' }, where: [], assertions: { defined: true } }).notCarried).toStrictEqual([
      { id: 'rule/r', file: 'redocly.yaml', pointer: '#/rules/rule~1r', reason: '`where` is not carried', fix: 'rewrite it as a `rule/…` with a subject contractdiff selects and assertions it carries, or keep it in Redocly' },
    ]);
    expect(one({ assertions: {} }, 'rule/a~b').notCarried[0]?.pointer).toBe('#/rules/rule~1a~0b');
  });

  it('refuses each shape it cannot mean the same with', () => {
    const subject = { type: 'Operation' };
    const assertions = { defined: true };
    expect(reason({ subject, function: 'f', assertions })).toBe('`function` is not carried');
    expect(reason({ assertions })).toBe('it has no `subject`');
    expect(reason({ subject: { type: 'Tag' }, assertions })).toBe('subject type `Tag` is not one of Root, Info, Operation, Parameter, Schema');
    expect(reason({ subject: { type: 'Operation', filterInParentKeys: ['get'] }, assertions })).toBe('`subject.filterInParentKeys` is not carried');
    expect(reason({ subject: { type: 'Operation', property: 3 }, assertions })).toBe('`subject.property` is not a name or a list of names');
    expect(reason({ subject: { type: 'Operation', property: [] }, assertions })).toBe('`subject.property` is an empty list');
    expect(reason({ subject })).toBe('it has no `assertions`');
    expect(reason({ subject, assertions: {} })).toBe('it has no `assertions`');
    expect(reason({ subject, assertions: { ref: true } })).toBe('assertion `ref` has no core function that means the same');
    expect(reason({ subject, assertions: { casing: 'Train-Case' } })).toBe('casing `Train-Case` is not one of camelCase, PascalCase, kebab-case, snake_case, MACRO_CASE, flatcase');
    expect(reason({ subject, assertions: { enum: 'a' } })).toBe('`enum` is not a list');
    expect(reason({ subject, assertions: { minLength: '2' } })).toBe('`minLength` is not a number');
    expect(reason({ subject, assertions: { maxLength: '2' } })).toBe('`maxLength` is not a number');
    expect(reason({ subject, assertions: { pattern: '/x/i' } })).toBe("`pattern`'s `match` has the flags `i`, which are not carried");
    expect(reason({ subject, assertions: { notPattern: 3 } })).toBe("`pattern`'s `notMatch` is not a string");
    expect(reason({ subject, assertions, severity: 'info' })).toBe('severity `info` is not error, warn or off');
  });

  it('lists each key that holds no rules', () => {
    const { notCarried } = read({ plugins: [], decorators: {}, preprocessors: {}, apis: {}, 'configurable-rules': {}, theme: {} });
    expect(notCarried.map((entry) => [entry.id, entry.pointer, entry.reason])).toStrictEqual(
      ['plugins', 'decorators', 'preprocessors', 'apis', 'configurable-rules'].map((key) => [key, `#/${key}`, `\`${key}\` is not carried`]),
    );
    expect(notCarried[0]?.fix).toBe('keep `plugins` running in Redocly; lint reads `rules` and `extends`');
  });

  it('reads anything that is not an object as an empty config', () => {
    expect(readRedocly('rules', 'redocly.yaml', KNOWN)).toStrictEqual({ rules: {}, levels: {}, notCarried: [] });
    expect(readRedocly(null, 'redocly.yaml', KNOWN)).toStrictEqual({ rules: {}, levels: {}, notCarried: [] });
    expect(read({ rules: ['warn'] })).toStrictEqual({ rules: {}, levels: {}, notCarried: [] });
  });
});

describe('readRedocly: extends and built-in rules', () => {
  it('carries recommended at its levels and lists the rest of it once', () => {
    const { levels, notCarried } = read({ extends: ['recommended'] });
    expect(levels).toStrictEqual(Object.fromEntries(Object.values(REDOCLY_RECOMMENDED).map(({ id, level }) => [id, level])));
    expect(notCarried).toStrictEqual([
      {
        id: 'recommended',
        file: 'redocly.yaml',
        pointer: '#/extends/0',
        reason: `carries 10 of its rules as contractdiff equivalents (${Object.keys(REDOCLY_RECOMMENDED).join(', ')}); the others are not carried`,
        fix: 'write the others you rely on as `rule/…` assertions in this file, or run `contractdiff lint --ruleset recommended` for the built-in set',
      },
    ]);
  });

  it('lists another extends as not carried, and reads one name as a list', () => {
    expect(read({ extends: 'minimal' }).notCarried).toStrictEqual([
      { id: 'minimal', file: 'redocly.yaml', pointer: '#/extends/0', reason: 'extends `minimal`, which contractdiff does not read', fix: 'name the rules you need from `minimal` in redocly.yaml' },
    ]);
    expect(read({ extends: ['minimal', 'recommended'] }).notCarried.map((entry) => entry.pointer)).toStrictEqual(['#/extends/0', '#/extends/1']);
  });

  it('sets a built-in rule level by its contractdiff name, or a known rule by its own', () => {
    expect(read({ rules: { 'operation-2xx-response': 'off', 'operation-tags': { severity: 'warn' }, 'info-description': 'error' } })).toStrictEqual({
      rules: {},
      levels: { 'operation-success-response': 'off', 'operation-tags': 'warn', 'info-description': 'error' },
      notCarried: [],
    });
    expect(read({ rules: { 'operation-tags': {} } }).levels).toStrictEqual({ 'operation-tags': 'error' });
    expect(reason('warn', 'spec-components-invalid-map-name')).toBe('it sets the level of `spec-components-invalid-map-name`, which no carried ruleset defines');
    expect(reason({ subject: { type: 'Root' }, assertions: { defined: true } }, 'r')).toBe('it sets the level of `r`, which no carried ruleset defines');
    expect(reason('hint', 'operation-tags')).toBe('severity `hint` is not error, warn or off');
  });
});

describe('the tables', () => {
  it('maps each recommended rule to its contractdiff rule and level', () => {
    expect(REDOCLY_RECOMMENDED).toStrictEqual({
      'info-description': { id: 'info-description', level: 'warn' },
      'operation-description': { id: 'operation-description', level: 'warn' },
      'operation-operationId': { id: 'operation-operation-id', level: 'warn' },
      'operation-operationId-unique': { id: 'operation-operation-id-unique', level: 'error' },
      'operation-2xx-response': { id: 'operation-success-response', level: 'warn' },
      'parameter-description': { id: 'parameter-description', level: 'warn' },
      'no-path-trailing-slash': { id: 'path-no-trailing-slash', level: 'error' },
      'no-unresolved-refs': { id: 'no-unresolved-ref', level: 'error' },
      'no-unused-components': { id: 'no-unused-component', level: 'warn' },
      'no-invalid-media-type-examples': { id: 'example-valid', level: 'warn' },
    });
  });
});
