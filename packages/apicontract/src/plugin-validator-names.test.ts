import { describe, expect, it } from 'vitest';

import { type Contract, type Operation } from './core/model.js';
import { baseName, namedPayloads } from './plugin-validator-names.js';

const operation = (id: string, ...names: string[]): Operation => ({
  id,
  source: `#/${id}`,
  payloads: names.map((name) => ({ name, direction: 'request', schema: true, required: true })),
});

const contract = (...operations: Operation[]): Contract => ({ format: 'openapi', document: {}, operations });

describe('payload names', () => {
  it('is the operation id and the payload name in PascalCase, without the JSON media type', () => {
    expect(baseName('listPets', 'response:200:application/json')).toBe('ListPetsResponse200');
    expect(baseName('listPets', 'body:application/json')).toBe('ListPetsBody');
    expect(baseName('get /pets/{id}', 'param:path:id')).toBe('GetPetsIdParamPathId');
    expect(baseName('upload', 'body:multipart/form-data')).toBe('UploadBodyMultipartFormData');
    expect(baseName('a', 'application/json')).toBe('AApplicationJson');
  });

  it('starts with `_` where it would start with a digit, and is `Payload` where nothing is left', () => {
    expect(baseName('2fa', 'value')).toBe('_2faValue');
    expect(baseName('', ':application/json')).toBe('Payload');
    expect(baseName('x', '')).toBe('X');
  });

  it('is sorted by operation id, payloads in their own order', () => {
    const named = namedPayloads(contract(operation('b', 'value'), operation('a', 'second', 'first'), operation('c', 'value')));
    expect(named.map(({ name, operation: { id }, payload }) => [name, id, payload.name])).toEqual([
      ['ASecond', 'a', 'second'],
      ['AFirst', 'a', 'first'],
      ['BValue', 'b', 'value'],
      ['CValue', 'c', 'value'],
    ]);
  });

  it('suffixes a collision `2`, `3`, … in that order, past a name a suffix already took', () => {
    const named = namedPayloads(contract(operation('a-b', 'value'), operation('aB', 'value', 'value'), operation('aBValue2', '')));
    expect(named.map(({ name }) => name)).toEqual(['ABValue', 'ABValue2', 'ABValue3', 'ABValue22']);
  });

  it('orders ids that only differ in case by code unit, the same on every machine', () => {
    expect(namedPayloads(contract(operation('b', 'v'), operation('B', 'v'))).map(({ name }) => name)).toEqual(['BV', 'BV2']);
    expect(namedPayloads(contract(operation('a', 'v'), operation('a', 'w'))).map(({ name }) => name)).toEqual(['AV', 'AW']);
  });
});
