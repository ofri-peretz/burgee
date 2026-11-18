import { readFileSync } from 'node:fs';

import { parse } from 'seniority/yaml';
import { describe as group, expect, it } from 'vitest';

import { bytesOf } from './command-explain-cap.js';
import { BudgetError, capped, describe, type Explanation, tagsOf } from './command-explain-operation.js';
import { toMarkdown } from './command-explain-text.js';
import { type Contract } from './core/model.js';
import { openapi } from './openapi.js';

const contract = openapi.read(parse(readFileSync(new URL('__fixtures__/agents/pets.openapi.yaml', import.meta.url), 'utf8')));
const operation = (id: string) => contract.operations.find((candidate) => candidate.id === id) as Contract['operations'][number];

group('describe', () => {
  it('resolves every payload and carries what the document says about the operation', () => {
    expect(describe(contract, operation('listPets'))).toEqual({
      id: 'listPets',
      format: 'openapi',
      source: '#/paths/~1pets/get',
      method: 'GET',
      path: '/pets',
      summary: 'List pets',
      tags: ['pets'],
      payloads: [
        { name: 'param:query:limit', direction: 'request', required: false, schema: { type: 'integer' } },
        {
          name: 'response:200:application/json',
          direction: 'response',
          required: true,
          schema: {
            type: 'array',
            items: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, name: { type: 'string' }, owner: { $ref: 'https://example.com/owner.json' } } },
          },
        },
      ],
      external: ['https://example.com/owner.json'],
    });
  });

  it('reports a cycle once across payloads, and the description', () => {
    const tree = describe(contract, operation('getTree'));
    expect(tree.cycles).toEqual(['#/components/schemas/Node']);
    expect(tree.summary).toBeUndefined();
    expect(describe(contract, operation('createPet')).description).toBe('Adds a pet to the store.');
  });

  it('has no method or path outside `paths`, and survives a source pointer that is not an object', () => {
    const odd: Contract = { format: 'x', document: { a: [1] }, operations: [{ id: 'o', source: '#/a/0', payloads: [] }] };
    expect(describe(odd, odd.operations[0] as Contract['operations'][number])).toEqual({ id: 'o', format: 'x', source: '#/a/0', payloads: [] });
    const missing: Contract = { format: 'x', document: {}, operations: [{ id: 'o', source: '#/paths/nope', payloads: [] }] };
    expect(describe(missing, missing.operations[0] as Contract['operations'][number])).toEqual({ id: 'o', format: 'x', source: '#/paths/nope', payloads: [] });
  });

  it('reads an escaped path and an additional operation', () => {
    const document = { openapi: '3.2.0', paths: { '/a~b/{c}': { additionalOperations: { COPY: { operationId: 'copy', tags: ['t', 3] } } } } };
    const read = openapi.read(document);
    const copy = read.operations[0] as Contract['operations'][number];
    expect(describe(read, copy)).toMatchObject({ method: 'COPY', path: '/a~b/{c}', tags: ['t'] });
    expect(tagsOf(read, copy)).toEqual(['t']);
  });

  it('drops prose that is not text, and survives a source pointer at null', () => {
    const read = openapi.read({ openapi: '3.1.0', paths: { '/x': { get: { operationId: 'x', summary: 5, responses: {} } } } });
    expect(describe(read, read.operations[0] as Contract['operations'][number]).summary).toBeUndefined();
    const nil: Contract = { format: 'x', document: { a: null }, operations: [{ id: 'o', source: '#/a', payloads: [] }] };
    expect(describe(nil, nil.operations[0] as Contract['operations'][number])).toEqual({ id: 'o', format: 'x', source: '#/a', payloads: [] });
  });

  it('drops empty prose and a tags member that is not a list', () => {
    const document = { openapi: '3.1.0', paths: { '/x': { get: { operationId: 'x', summary: '', tags: 'no', responses: {} } } } };
    const read = openapi.read(document);
    expect(describe(read, read.operations[0] as Contract['operations'][number])).toEqual({ id: 'x', format: 'openapi', source: '#/paths/~1x/get', method: 'GET', path: '/x', payloads: [] });
  });
});

group('capped', () => {
  const pet = describe(contract, operation('createPet'));

  it('leaves an explanation that fits, or when there is no budget', () => {
    expect(capped(pet, undefined)).toBe(pet);
    expect(capped(pet, bytesOf(pet))).toBe(pet);
  });

  it('cuts schemas deepest first until the JSON, `truncated` included, fits', () => {
    for (const max of [bytesOf(pet) - 1, bytesOf(pet) - 100, 520]) {
      const result = capped(pet, max);
      expect(bytesOf(result)).toBeLessThanOrEqual(max);
      expect(result.truncated?.maxBytes).toBe(max);
      expect(result.truncated?.cut.length).toBeGreaterThan(0);
      expect(result.id).toBe('createPet');
      expect(result.payloads.map((payload) => payload.name)).toEqual(pet.payloads.map((payload) => payload.name));
    }
    const cut = capped(pet, bytesOf(pet) - 1).truncated?.cut ?? [];
    expect(cut.every((pointer) => /^\/payloads\/\d+\/schema/u.test(pointer))).toBe(true);
    expect(cut.some((pointer) => cut.some((other) => other.startsWith(`${pointer}/`)))).toBe(false);
  });

  it('fits every budget from the smallest that works up to the whole, and refuses every one below', () => {
    const whole = bytesOf(pet);
    let fits = 0;
    for (let max = 300; max < whole; max++) {
      try {
        const result = capped(pet, max);
        expect(bytesOf(result)).toBeLessThanOrEqual(max);
        fits++;
      } catch (error) {
        expect(error).toBeInstanceOf(BudgetError);
        expect(fits).toBe(0);
      }
    }
    expect(fits).toBeGreaterThan(0);
  });

  it('refuses a budget no cut can meet, naming the smallest that works', () => {
    const smallest = (() => {
      try {
        capped(pet, 10);
      } catch (error) {
        return error as BudgetError;
      }
      return undefined;
    })();
    expect(smallest).toBeInstanceOf(BudgetError);
    expect(smallest?.code).toBe('USAGE');
    expect(smallest?.name).toBe('BudgetError');
    const needed = Number(/--max-bytes (\d+)/u.exec(smallest?.message ?? '')?.[1]);
    expect(smallest?.message).toContain('"createPet" does not fit in 10 bytes');
    expect(bytesOf(capped(pet, needed))).toBeLessThanOrEqual(needed);
  });
});

group('toMarkdown', () => {
  it('renders the title, the route, prose, tags, each payload as JSON and the cycles', () => {
    const text = toMarkdown(describe(contract, operation('createPet')));
    expect(text.split('\n').slice(0, 8)).toEqual(['# createPet', '', '`POST /pets` · openapi `#/paths/~1pets/post`', '', 'Adds a pet to the store.', '', 'Tags: `pets`, `admin`', '']);
    expect(text).toContain('## body:application/json\n\nrequest, required\n\n```json\n{\n  "type": "object",');
    expect(text).toContain('External references, not followed: `https://example.com/owner.json`');
    expect(text.endsWith('```\n\nExternal references, not followed: `https://example.com/owner.json`\n')).toBe(true);
    expect(toMarkdown(describe(contract, operation('getTree')))).toContain('Cycles, each cut to `{ "$comment": "cycle: <pointer>" }`: `#/components/schemas/Node`');
  });

  it('shows the summary, an optional payload, a source without a route, and what was cut', () => {
    expect(toMarkdown(describe(contract, operation('listPets')))).toContain('List pets\n\n');
    expect(toMarkdown(describe(contract, operation('listPets')))).toContain('request, optional');
    const bare: Explanation = { id: 'o', format: 'asyncapi', source: '#/operations/o', payloads: [], truncated: { maxBytes: 9, cut: ['/a'] } };
    expect(toMarkdown(bare)).toBe('# o\n\nasyncapi `#/operations/o`\n\nTruncated to 9 bytes; emptied: `/a`\n');
  });
});
