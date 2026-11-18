import { readdirSync, readFileSync } from 'node:fs';

import { parse } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { adapter, convert, detect, read, Swagger2Error } from './input-swagger2.js';
import { read as readOpenApi } from './openapi.js';

const FIXTURES = new URL('__fixtures__/inputs/swagger2/', import.meta.url);

/** The files a multi-file example references, read only through it. */
const REFERENCED = /petstore-separate\/(?:common\/|spec\/(?:NewPet|Pet|parameters)\.yaml)/;

const fixtures: { file: string; document: Record<string, unknown> }[] = (readdirSync(FIXTURES, { recursive: true }) as string[])
  // Windows separates with `\\`; the patterns below are written with `/`.
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => /\.(?:ya?ml|json)$/.test(file) && !REFERENCED.test(file))
  .toSorted()
  .map((file) => {
    const text = readFileSync(new URL(file, FIXTURES), 'utf8');
    return { file, document: (file.endsWith('.json') ? JSON.parse(text) : parse(text)) as Record<string, unknown> };
  });

const codes = (document: unknown): string[] => (read(document).findings ?? []).map(({ code, pointer }) => `${code} ${pointer}`);

/** A one-operation document; `operation` is `paths./pets.post`. */
const one = (operation: object, rest: object = {}): Record<string, unknown> => ({ swagger: '2.0', paths: { '/pets': { post: operation } }, ...rest });

/** An array parameter of strings. */
const parameter = (name: string, location: string, extra: object = {}): object => ({ name, in: location, type: 'array', items: { type: 'string' }, ...extra });

const converted = (document: unknown): Record<string, any> => convert(document).document as Record<string, any>;

describe('detect', () => {
  it('accepts Swagger 2.0, quoted or not, and nothing else, without throwing', () => {
    expect(detect({ swagger: '2.0' })).toBe(true);
    expect(detect({ swagger: 2 })).toBe(true);
    for (const other of [{ swagger: '1.2' }, { swagger: '2.0.0' }, { swagger: 3 }, { openapi: '3.0.0' }, {}, [], null, 'swagger: "2.0"']) {
      expect(detect(other)).toBe(false);
    }
  });

  it('refuses to read anything else, with a fix', () => {
    expect(() => read({ openapi: '3.1.0' })).toThrow(
      new Swagger2Error('it has no `swagger: "2.0"` member', 'pass a Swagger 2.0 document, or read an OpenAPI 3 one with the `openapi` adapter'),
    );
    expect(new Swagger2Error('r', 'f')).toMatchObject({ name: 'Swagger2Error', message: 'not a Swagger 2.0 document: r. fix: f' });
  });
});

describe('convert', () => {
  it('writes the document as OpenAPI 3.1: servers, components, and every other member as it was', () => {
    const document = {
      swagger: '2.0',
      info: { title: 'Pets', version: '1' },
      host: 'api.example.com',
      basePath: '/v1',
      schemes: ['https', 'wss', 3],
      tags: [{ name: 'pets' }],
      'x-logo': 'logo.png',
      security: [{ key: [] }],
      paths: { '/pets': { summary: 'all pets', get: { responses: { 204: { description: 'none' } } }, 'x-internal': true } },
      definitions: { Pet: { type: 'object' } },
      securityDefinitions: { key: { type: 'apiKey', name: 'k', in: 'header' } },
    };
    expect(converted(document)).toStrictEqual({
      openapi: '3.1.0',
      info: { title: 'Pets', version: '1' },
      tags: [{ name: 'pets' }],
      'x-logo': 'logo.png',
      security: [{ key: [] }],
      servers: [{ url: 'https://api.example.com/v1' }, { url: 'wss://api.example.com/v1' }],
      paths: { '/pets': { summary: 'all pets', 'x-internal': true, get: { responses: { 204: { description: 'none' } } } } },
      components: { schemas: { Pet: { type: 'object' } }, securitySchemes: { key: { type: 'apiKey', name: 'k', in: 'header' } } },
    });
  });

  it('writes servers from what the document says, scheme-relative when it names no scheme', () => {
    expect(converted({ swagger: '2.0', host: 'h' }).servers).toStrictEqual([{ url: '//h' }]);
    expect(converted({ swagger: '2.0', host: 'h', basePath: '/b', schemes: [] }).servers).toStrictEqual([{ url: '//h/b' }]);
    expect(converted({ swagger: '2.0', host: 'h', schemes: 'https' }).servers).toStrictEqual([{ url: '//h' }]);
    expect(converted({ swagger: '2.0', basePath: '/b' }).servers).toStrictEqual([{ url: '/b' }]);
    expect(converted({ swagger: '2.0', basePath: 3 })).toStrictEqual({ openapi: '3.1.0', paths: {} });
    const moved = { host: 3, schemes: ['http'], consumes: ['a/b'], produces: ['a/b'], definitions: {}, parameters: {}, responses: {}, securityDefinitions: {} };
    expect(converted({ swagger: '2.0', ...moved })).toStrictEqual({ openapi: '3.1.0', paths: {} });
  });

  it('writes each security definition as an OpenAPI 3 security scheme', () => {
    const schemes = converted({
      swagger: '2.0',
      securityDefinitions: {
        basic: { type: 'basic', description: 'b' },
        implicit: { type: 'oauth2', flow: 'implicit', authorizationUrl: 'https://a', scopes: { read: 'r' } },
        password: { type: 'oauth2', flow: 'password', tokenUrl: 'https://t' },
        application: { type: 'oauth2', flow: 'application', tokenUrl: 'https://t', scopes: {} },
        accessCode: { type: 'oauth2', flow: 'accessCode', authorizationUrl: 'https://a', tokenUrl: 'https://t', scopes: {} },
        odd: { type: 'oauth2', flow: 'device' },
        key: { type: 'apiKey', in: 'query', name: 'k', scopes: { x: 'y' } },
        empty: 'not an object',
      },
    }).components.securitySchemes;
    expect(schemes).toStrictEqual({
      basic: { type: 'http', scheme: 'basic', description: 'b' },
      implicit: { type: 'oauth2', flows: { implicit: { authorizationUrl: 'https://a', scopes: { read: 'r' } } } },
      password: { type: 'oauth2', flows: { password: { tokenUrl: 'https://t', scopes: {} } } },
      application: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://t', scopes: {} } } },
      accessCode: { type: 'oauth2', flows: { authorizationCode: { authorizationUrl: 'https://a', tokenUrl: 'https://t', scopes: {} } } },
      odd: { type: 'oauth2', flows: { device: { scopes: {} } } },
      key: { type: 'apiKey', in: 'query', name: 'k', scopes: { x: 'y' } },
      empty: { type: undefined },
    });
  });

  it('rewrites `#/definitions/` references, and leaves every other one as written', () => {
    const document = one(
      { responses: { 200: { description: 'ok', schema: { $ref: '#/definitions/Pet' } } } },
      {
        produces: ['application/json'],
        definitions: { Pet: { properties: { tags: { items: { $ref: '#/definitions/a~1b' } }, other: { $ref: 'other.yaml#/definitions/X' } } } },
      },
    );
    const out = converted(document);
    expect(out.paths['/pets'].post.responses['200'].content['application/json'].schema).toStrictEqual({ $ref: '#/components/schemas/Pet' });
    expect(out.components.schemas.Pet.properties).toStrictEqual({ tags: { items: { $ref: '#/components/schemas/a~1b' } }, other: { $ref: 'other.yaml#/definitions/X' } });
    // Not rewritten to a local-looking `#/components/schemas/X`, which this document lacks, and said.
    expect(codes(document)).toContain('ref-external #/definitions/Pet/properties/other/$ref');
    expect(read(document).findings).toContainEqual({
      code: 'ref-external',
      pointer: '#/definitions/Pet/properties/other/$ref',
      message: '`other.yaml#/definitions/X` is in another file and is not read',
      fix: 'bundle the document into one file first',
    });
    expect(codes(document).filter((code) => code.includes('tags'))).toEqual([]);
    const local = one({ responses: { 200: { description: 'ok', schema: { $ref: '#/parameters/P' } } } }, { produces: ['application/json'] });
    expect(codes(local).filter((code) => code.startsWith('ref-external'))).toEqual([]);
  });

  it('converts every subschema: items, additionalProperties, allOf and the rest', () => {
    const file = { type: 'file' };
    const schema = converted({
      swagger: '2.0',
      definitions: {
        S: { items: file, additionalProperties: file, allOf: [file], anyOf: [file], oneOf: [file], not: file, example: file, properties: 'x' },
        T: { additionalProperties: true, items: [false] },
      },
    }).components.schemas.S;
    const string = { type: 'string', contentMediaType: 'application/octet-stream' };
    expect(converted({ swagger: '2.0', definitions: { T: { additionalProperties: true, items: [false] } } }).components.schemas.T).toStrictEqual({
      additionalProperties: true,
      items: [false],
    });
    expect(schema).toStrictEqual({ items: string, additionalProperties: string, allOf: [string], anyOf: [string], oneOf: [string], not: string, example: file, properties: {} });
  });
});

describe('the constructs 2.0 states another way, each with a finding', () => {
  it('x-nullable: a null type, null in the enum, or anyOf beside a reference', () => {
    const document = {
      swagger: '2.0',
      definitions: {
        A: { type: 'string', enum: ['a'], 'x-nullable': true },
        B: { $ref: '#/definitions/A', 'x-nullable': true },
        C: { type: 'string', 'x-nullable': false },
      },
    };
    expect(converted(document).components.schemas).toStrictEqual({
      A: { type: ['string', 'null'], enum: ['a', null] },
      B: { anyOf: [{ $ref: '#/components/schemas/A' }, { type: 'null' }] },
      C: { type: 'string' },
    });
    expect(read(document).findings?.[0]).toStrictEqual({
      code: 'x-nullable',
      pointer: '#/definitions/A/x-nullable',
      message: '`x-nullable: true` is written as a `null` type',
      fix: 'nothing to do: OpenAPI 3.1 states nullability in `type`',
    });
    expect(codes(document)).toStrictEqual(['x-nullable #/definitions/A/x-nullable', 'x-nullable #/definitions/B/x-nullable', 'x-nullable #/definitions/C/x-nullable']);
  });

  it('type: file, and a string discriminator', () => {
    const document = { swagger: '2.0', definitions: { F: { type: 'file' }, D: { discriminator: 'kind' }, O: { discriminator: { propertyName: 'kind' } } } };
    expect(converted(document).components.schemas).toStrictEqual({
      F: { type: 'string', contentMediaType: 'application/octet-stream' },
      D: { discriminator: { propertyName: 'kind' } },
      O: { discriminator: { propertyName: 'kind' } },
    });
    expect(read(document).findings).toStrictEqual([
      {
        code: 'file-type',
        pointer: '#/definitions/F/type',
        message: '`type: file` is written as `type: string, contentMediaType: application/octet-stream`',
        fix: 'nothing to do: OpenAPI 3.1 has no file type',
      },
      {
        code: 'discriminator',
        pointer: '#/definitions/D/discriminator',
        message: 'a string `discriminator` is written as `{ propertyName }`',
        fix: 'nothing to do: OpenAPI 3 names the property in an object',
      },
    ]);
  });

  it('boolean exclusive bounds become the bound they exclude', () => {
    const document = {
      swagger: '2.0',
      definitions: {
        Max: { maximum: 10, exclusiveMaximum: true, minimum: 1, exclusiveMinimum: false },
        Lone: { exclusiveMinimum: true },
        Numeric: { exclusiveMaximum: 5 },
      },
    };
    expect(converted(document).components.schemas).toStrictEqual({ Max: { exclusiveMaximum: 10, minimum: 1 }, Lone: {}, Numeric: { exclusiveMaximum: 5 } });
    expect(read(document).findings).toStrictEqual([
      {
        code: 'exclusive-bound',
        pointer: '#/definitions/Max/exclusiveMaximum',
        message: '`exclusiveMaximum: true` is written as `exclusiveMaximum: 10`',
        fix: 'nothing to do: OpenAPI 3.1 states the excluded bound as a number',
      },
      {
        code: 'exclusive-bound',
        pointer: '#/definitions/Max/exclusiveMinimum',
        message: '`exclusiveMinimum: false` without a `minimum` excludes nothing, and is dropped',
        fix: 'nothing to do: OpenAPI 3.1 states the excluded bound as a number',
      },
      {
        code: 'exclusive-bound',
        pointer: '#/definitions/Lone/exclusiveMinimum',
        message: '`exclusiveMinimum: true` without a `minimum` excludes nothing, and is dropped',
        fix: 'nothing to do: OpenAPI 3.1 states the excluded bound as a number',
      },
    ]);
  });

  it('collectionFormat: a style for each array parameter, none for a nested one', () => {
    const document = one({
      parameters: [
        parameter('a', 'query'),
        parameter('b', 'query', { collectionFormat: 'ssv' }),
        parameter('c', 'query', { collectionFormat: 'pipes' }),
        parameter('d', 'query', { collectionFormat: 'multi' }),
        parameter('e', 'query', { collectionFormat: 'tsv' }),
        parameter('f', 'path', { collectionFormat: 'csv', required: true }),
        parameter('g', 'header', { items: { type: 'array', collectionFormat: 'pipes' } }),
        { name: 'h', in: 'query', type: 'string', description: 'plain', 'x-hint': 1 },
      ],
      responses: {},
    });
    const parameters = converted(document).paths['/pets'].post.parameters as Record<string, unknown>[];
    expect(parameters.map(({ name, style, explode }) => [name, style, explode])).toStrictEqual([
      ['a', 'form', false],
      ['b', 'spaceDelimited', false],
      ['c', 'pipeDelimited', false],
      ['d', 'form', true],
      ['e', 'form', false],
      ['f', 'simple', false],
      ['g', 'simple', false],
      ['h', undefined, undefined],
    ]);
    expect(parameters[5]).toStrictEqual({ name: 'f', in: 'path', required: true, style: 'simple', explode: false, schema: { type: 'array', items: { type: 'string' } } });
    expect(parameters[6]).toMatchObject({ schema: { type: 'array', items: { type: 'array' } } });
    expect(parameters[7]).toStrictEqual({ name: 'h', in: 'query', description: 'plain', 'x-hint': 1, schema: { type: 'string' } });
    const findings = read(document).findings ?? [];
    expect(findings.map(({ message }) => message)).toStrictEqual([
      '`collectionFormat: csv` is written as `style: form, explode: false`',
      '`collectionFormat: ssv` is written as `style: spaceDelimited, explode: false`',
      '`collectionFormat: pipes` is written as `style: pipeDelimited, explode: false`',
      '`collectionFormat: multi` is written as `style: form, explode: true`',
      '`collectionFormat: tsv` is written as `style: form, explode: false`',
      '`collectionFormat: csv` is written as `style: simple, explode: false`',
      '`collectionFormat: pipes` here has no OpenAPI 3 equivalent, and is dropped',
      '`collectionFormat: csv` is written as `style: simple, explode: false`',
    ]);
    expect(findings.map(({ pointer }) => pointer)).toStrictEqual([
      ...[0, 1, 2, 3, 4, 5].map((index) => `#/paths/~1pets/post/parameters/${String(index)}/collectionFormat`),
      '#/paths/~1pets/post/parameters/6/items/collectionFormat',
      '#/paths/~1pets/post/parameters/6/collectionFormat',
    ]);
    expect(findings[6]).toStrictEqual({
      code: 'collection-format',
      pointer: '#/paths/~1pets/post/parameters/6/items/collectionFormat',
      message: '`collectionFormat: pipes` here has no OpenAPI 3 equivalent, and is dropped',
      fix: 'describe the nested format in `description`',
    });
    expect(findings[4]?.fix).toBe('tab-separated values have no OpenAPI 3 style: use `ssv`, `pipes`, `csv` or `multi`');
    expect(findings[0]?.fix).toBe('nothing to do: OpenAPI 3 states the array format in `style`');
    expect(findings[0]?.code).toBe('collection-format');
  });

  it('moves every value keyword of a parameter into its schema, and keeps the rest beside it', () => {
    const value = {
      type: 'number',
      format: 'double',
      default: 2,
      maximum: 9,
      minimum: 1,
      maxLength: 3,
      minLength: 1,
      pattern: 'x',
      maxItems: 2,
      minItems: 1,
      uniqueItems: true,
      enum: [2, 3],
      multipleOf: 1,
    };
    const document = one({ parameters: [{ name: 'n', in: 'query', required: true, allowEmptyValue: true, ...value, 'x-nullable': false }], responses: {} });
    expect(converted(document).paths['/pets'].post.parameters).toStrictEqual([{ name: 'n', in: 'query', required: true, allowEmptyValue: true, schema: value }]);
    const bounds = one({ parameters: [{ name: 'n', in: 'query', type: 'number', maximum: 9, exclusiveMaximum: true, minimum: 1, exclusiveMinimum: true }], responses: {} });
    expect(converted(bounds).paths['/pets'].post.parameters[0].schema).toStrictEqual({ type: 'number', exclusiveMaximum: 9, exclusiveMinimum: 1 });
  });

  it('points each finding at the subschema it is about', () => {
    const file = { type: 'file' };
    const query = { name: 's', in: 'query', type: 'string', collectionFormat: 'csv' };
    const document = {
      swagger: '2.0',
      consumes: ['a/b'],
      produces: ['a/b'],
      paths: {
        '/pets': {
          post: {
            parameters: [{ name: 'b', in: 'body', schema: { allOf: [file] } }],
            responses: { 200: { schema: { properties: { 'p/q': file } }, headers: { 'X-A': { type: 'string', 'x-nullable': true } } } },
          },
        },
        '/a~b': { get: { parameters: [query], responses: {} } },
      },
    };
    expect(codes(document)).toStrictEqual([
      'file-type #/paths/~1pets/post/parameters/0/schema/allOf/0/type',
      'x-nullable #/paths/~1pets/post/responses/200/headers/X-A/x-nullable',
      'file-type #/paths/~1pets/post/responses/200/schema/properties/p~1q/type',
      'collection-format #/paths/~1a~0b/get/parameters/0/collectionFormat',
    ]);
    expect(converted(document).paths['/a~b'].get.parameters[0]).toStrictEqual({ name: 's', in: 'query', style: 'form', explode: false, schema: { type: 'string' } });
  });

  it('reads every 2.0 method, and keeps what else a path item holds', () => {
    const operation = { consumes: ['a/b'], responses: {} };
    const methods = Object.fromEntries(['get', 'put', 'post', 'delete', 'options', 'head', 'patch'].map((method) => [method, operation]));
    const document = { swagger: '2.0', paths: { '/a': { ...methods, 'x-meta': { a: 1 } }, '/b': { get: 'not an operation' } } };
    expect(read(document).operations.map(({ id }) => id)).toStrictEqual(Object.keys(methods).map((method) => `${method} /a`));
    const written = Object.fromEntries(Object.keys(methods).map((method) => [method, { responses: {} }]));
    expect(converted(document).paths).toStrictEqual({ '/a': { 'x-meta': { a: 1 }, ...written }, '/b': {} });
  });

  it('formData: one form request body object, multipart when a field is a file', () => {
    const fields = [
      { name: 'name', in: 'formData', type: 'string', required: true, description: 'Pet name' },
      { name: 'photo', in: 'formData', type: 'file' },
    ];
    const document = one({ parameters: fields, responses: {} });
    expect(converted(document).paths['/pets'].post.requestBody).toStrictEqual({
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Pet name' }, photo: { type: 'string', contentMediaType: 'application/octet-stream' } },
            required: ['name'],
          },
        },
      },
    });
    expect(read(document).findings?.find(({ code }) => code === 'form-data')).toStrictEqual({
      code: 'form-data',
      pointer: '#/paths/~1pets/post/parameters',
      message: 'the `in: formData` parameters `name`, `photo` are written as one `multipart/form-data` request body object',
      fix: 'nothing to do: OpenAPI 3 sends form fields as a request body',
    });
    const urlencoded = one({ parameters: [{ name: 'q', in: 'formData', type: 'string' }], responses: {} });
    expect(converted(urlencoded).paths['/pets'].post.requestBody).toStrictEqual({
      required: false,
      content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { q: { type: 'string' } }, required: [] } } },
    });
    const declared = one({ parameters: [{ name: 'q', in: 'formData', type: 'string' }], responses: {} }, { consumes: ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded'] });
    expect(Object.keys(converted(declared).paths['/pets'].post.requestBody.content)).toStrictEqual(['multipart/form-data', 'application/x-www-form-urlencoded']);
    const own = one({ consumes: ['application/x-www-form-urlencoded'], parameters: [{ name: 'q', in: 'formData', type: 'file' }], responses: {} }, { consumes: ['multipart/form-data'] });
    expect(Object.keys(converted(own).paths['/pets'].post.requestBody.content)).toStrictEqual(['application/x-www-form-urlencoded']);
    expect(read(own).findings?.find(({ code }) => code === 'form-data')?.message).toBe(
      'the `in: formData` parameters `q` are written as one `application/x-www-form-urlencoded` request body object',
    );
    const two = one({ parameters: [{ name: 'q', in: 'formData' }], responses: {} }, { consumes: ['multipart/form-data', 'application/x-www-form-urlencoded'] });
    expect(read(two).findings?.find(({ code }) => code === 'form-data')?.message).toBe(
      'the `in: formData` parameters `q` are written as one `multipart/form-data`, `application/x-www-form-urlencoded` request body object',
    );
  });

  it('a body beside formData wins, and the fields are reported', () => {
    const document = one({
      consumes: ['application/json'],
      parameters: [
        { name: 'pet', in: 'body', schema: { type: 'object' } },
        { name: 'q', in: 'formData', type: 'string' },
      ],
      responses: {},
    });
    expect(converted(document).paths['/pets'].post.requestBody).toStrictEqual({ required: false, content: { 'application/json': { schema: { type: 'object' } } } });
    expect(read(document).findings).toStrictEqual([
      {
        code: 'form-data',
        pointer: '#/paths/~1pets/post/parameters',
        message: 'an operation with a `body` parameter cannot also have `formData` ones; they are not read',
        fix: 'send the fields in the body schema',
      },
    ]);
  });

  it('consumes and produces: the operation’s, else the document’s, else JSON with a finding', () => {
    const body = { name: 'pet', in: 'body', required: true, description: 'the pet', schema: { $ref: '#/definitions/Pet' } };
    const document = one({ parameters: [body], responses: { 200: { description: 'ok', schema: { type: 'string' } }, 204: { description: 'none' } } });
    const operation = converted(document).paths['/pets'].post;
    expect(operation.requestBody).toStrictEqual({ description: 'the pet', required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } });
    expect(operation.responses).toStrictEqual({ 200: { description: 'ok', content: { 'application/json': { schema: { type: 'string' } } } }, 204: { description: 'none' } });
    expect(read(document).findings).toStrictEqual([
      {
        code: 'consumes-assumed',
        pointer: '#/paths/~1pets/post',
        message: 'no `consumes` is declared here or for the document, so `application/json` is assumed',
        fix: 'declare `consumes` on the operation or the document',
      },
      {
        code: 'produces-assumed',
        pointer: '#/paths/~1pets/post/responses/200',
        message: 'no `produces` is declared here or for the document, so `application/json` is assumed',
        fix: 'declare `produces` on the operation or the document',
      },
    ]);
    const declared = one({ produces: [], consumes: ['text/plain', 4], parameters: [body], responses: { 200: { schema: {} } } }, { produces: ['application/xml'] });
    const out = converted(declared).paths['/pets'].post;
    expect(Object.keys(out.requestBody.content)).toStrictEqual(['text/plain']);
    expect(out.responses['200']).toStrictEqual({ description: '', content: { 'application/xml': { schema: {} } } });
    expect(read(declared).findings).toStrictEqual([]);
  });

  it('responses: headers into schemas, shared ones written where used, and examples reported', () => {
    const document = one(
      {
        produces: ['application/json'],
        responses: {
          200: { description: 'ok', headers: { 'X-Rate': { type: 'integer', description: 'left' } }, examples: { 'application/json': {} } },
          404: { $ref: '#/responses/Missing' },
          500: { $ref: 'errors.yaml#/500' },
          default: 'not a response',
        },
      },
      { responses: { Missing: { description: 'gone', schema: { type: 'string' } } } },
    );
    expect(converted(document).paths['/pets'].post.responses).toStrictEqual({
      200: { description: 'ok', headers: { 'X-Rate': { description: 'left', schema: { type: 'integer' } } } },
      404: { description: 'gone', content: { 'application/json': { schema: { type: 'string' } } } },
    });
    expect(codes(document)).toStrictEqual(['examples-not-read #/paths/~1pets/post/responses/200/examples', 'ref-external #/paths/~1pets/post/responses/500/$ref']);
    expect(read(document).findings?.[0]).toMatchObject({ message: 'response `examples` are not read', fix: 'move them into the schema as `examples`' });
  });

  it("an operation's own schemes are reported, and the rest of the operation is kept", () => {
    const document = one({ operationId: 'addPet', schemes: ['http'], tags: ['pets'], consumes: ['a/b'], produces: ['a/b'], responses: {} });
    expect(converted(document).paths['/pets'].post).toStrictEqual({ operationId: 'addPet', tags: ['pets'], responses: {} });
    expect(read(document).findings).toStrictEqual([
      {
        code: 'schemes-not-read',
        pointer: '#/paths/~1pets/post/schemes',
        message: "an operation's own `schemes` are not read; the document's servers apply",
        fix: 'declare a server per scheme on the document',
      },
    ]);
  });
});

describe('parameters', () => {
  it("merges the path item's parameters with the operation's, the operation's winning, references followed", () => {
    const document = {
      swagger: '2.0',
      parameters: { limit: { name: 'limit', in: 'query', type: 'integer' } },
      paths: {
        '/pets/{id}': {
          parameters: [
            { name: 'id', in: 'path', required: true, type: 'string' },
            { name: 'trace', in: 'header', type: 'string' },
          ],
          get: {
            parameters: [{ $ref: '#/parameters/limit' }, { name: 'trace', in: 'header', type: 'integer' }, { $ref: 'shared.yaml#/x' }, { $ref: '#/parameters/none' }, 'x'],
            responses: {},
          },
        },
      },
    };
    expect(converted(document).paths['/pets/{id}']).toStrictEqual({
      get: {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'trace', in: 'header', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {},
      },
    });
    expect(read(document).findings).toStrictEqual([
      {
        code: 'ref-external',
        pointer: '#/paths/~1pets~1{id}/get/parameters/2/$ref',
        message: '`shared.yaml#/x` is in another file and is not read',
        fix: 'bundle the document into one file first',
      },
      {
        code: 'ref-broken',
        pointer: '#/paths/~1pets~1{id}/get/parameters/3/$ref',
        message: 'cannot resolve `#/parameters/none`: nothing is at `none`',
        fix: 'point the reference at a value the document defines',
      },
    ]);
  });

  it('reports a shared parameter once, where it is written, and skips a path item in another file', () => {
    const shared = { name: 'tags', in: 'query', type: 'array', items: { type: 'string' } };
    const document = { swagger: '2.0', paths: { '/a': { parameters: [shared], get: { responses: {} }, put: { responses: {} } }, '/b': { $ref: 'b.yaml' } } };
    expect(Object.keys(converted(document).paths)).toStrictEqual(['/a']);
    expect(codes(document)).toStrictEqual(['collection-format #/paths/~1a/parameters/0/collectionFormat', 'ref-external #/paths/~1b/$ref']);
  });
});

describe('read', () => {
  it('reads the 3.1 form with the OpenAPI reader, and keeps that form as the document', () => {
    const document = one(
      { operationId: 'addPet', consumes: ['application/json'], parameters: [{ name: 'pet', in: 'body', required: true, schema: { $ref: '#/definitions/Pet' } }], responses: { 201: { description: 'made' } } },
      { definitions: { Pet: { type: 'object' } } },
    );
    const contract = read(document);
    expect(contract.format).toBe('swagger2');
    expect(contract.document).toStrictEqual(convert(document).document);
    expect(contract.operations).toStrictEqual(readOpenApi(convert(document).document).operations);
    expect(contract.operations).toStrictEqual([
      {
        id: 'addPet',
        source: '#/paths/~1pets/post',
        payloads: [
          { name: 'body:application/json', direction: 'request', schema: { $ref: '#/components/schemas/Pet' }, required: true },
          { name: 'response:201', direction: 'response', schema: false, required: true },
        ],
      },
    ]);
  });
});

describe('the Swagger 2.0 examples and swagger-codegen 2.0 test documents', () => {
  it('reads at least 20 documents without throwing', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
    expect(fixtures.length).toBe(28);
    for (const { file, document } of fixtures) {
      expect(detect(document), file).toBe(true);
      expect(() => read(document), file).not.toThrow();
    }
  });

  it('reads the Petstore: every operation, with the formData, file and collectionFormat it carries reported', () => {
    const petstore = fixtures.find(({ file }) => file === 'swagger-codegen/petstore.yaml')?.document;
    const contract = read(petstore);
    expect(contract.operations).toHaveLength(20);
    expect(contract.operations.find(({ id }) => id === 'uploadFile')?.payloads.map(({ name }) => name)).toStrictEqual([
      'param:path:petId',
      'body:multipart/form-data',
      'response:200:application/json',
    ]);
    expect([...new Set((contract.findings ?? []).map(({ code }) => code))].toSorted()).toStrictEqual(['collection-format', 'consumes-assumed', 'file-type', 'form-data']);
  });

  it('every operation the 2.0 document declares is read, and nothing is left in 2.0 form', () => {
    let operations = 0;
    for (const { file, document } of fixtures) {
      const declared = Object.values(document.paths as Record<string, Record<string, unknown>>).flatMap((item) =>
        Object.keys(item).filter((key) => ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'].includes(key)),
      );
      const contract = read(document);
      const text = JSON.stringify(contract.document);
      expect(text, file).not.toContain('#/definitions/');
      expect(text, file).not.toContain('"in":"body"');
      expect(text, file).not.toContain('"in":"formData"');
      expect(text, file).not.toContain('"collectionFormat"');
      expect(text, file).not.toContain('"x-nullable"');
      expect(contract.operations.length, file).toBe(declared.length);
      operations += declared.length;
    }
    expect(operations).toBe(71);
  });

  it('reports what it translated or could not read, by kind', () => {
    const tally: Record<string, number> = {};
    for (const { document } of fixtures) for (const { code } of read(document).findings ?? []) tally[code] = (tally[code] ?? 0) + 1;
    expect(tally).toStrictEqual({
      'collection-format': 5,
      'consumes-assumed': 6,
      discriminator: 3,
      'examples-not-read': 4,
      'file-type': 2,
      'form-data': 4,
      'produces-assumed': 2,
      // petstore-separate keeps its shared parameters in `parameters.yaml` (2) and its schemas in
      // `Pet.yaml`, `NewPet.yaml` and `../common/Error.yaml` (8): each schema `$ref` is kept as written, and said.
      'ref-external': 10,
    });
  });
});

describe('adapter', () => {
  it('is the host shape, under its own name', () => {
    expect(adapter).toMatchObject({ name: 'swagger2', detect, read });
    expect(adapter.description).toContain('Swagger 2.0');
    expect(Object.isFrozen(adapter)).toBe(true);
  });
});

const at = (document: Record<string, any>, name: string): unknown => document.paths['/lexeme'].get.responses['200'].content['application/json'].schema.properties[name];

describe('a reference into a response schema (bethmardutho, 2026-11-18 corpus)', () => {
  const response = { description: 'ok', schema: { type: 'object', properties: { person: { type: 'string' } } } };
  const swagger = (refs: Record<string, unknown>, produces = ['application/json']): Record<string, unknown> => ({
    swagger: '2.0',
    info: { title: 't', version: '1' },
    produces,
    paths: {
      '/word/{id}': { get: { responses: { '200': response, '204': { description: 'empty' } } } },
      '/lexeme': { get: { responses: { '200': { description: 'ok', schema: { type: 'object', properties: refs } } } } },
    },
  });

  it('follows the schema under its media type, with or without a pointer past it', () => {
    const { document, findings } = convert(
      swagger({
        whole: { $ref: '#/paths/~1word~1%7Bid%7D/get/responses/200/schema' },
        part: { allOf: [{ $ref: '#/paths/~1word~1%7Bid%7D/get/responses/200/schema/properties/person' }] },
      }),
    );
    expect(at(document, 'whole')).toEqual({ $ref: '#/paths/~1word~1%7Bid%7D/get/responses/200/content/application~1json/schema' });
    expect(at(document, 'part')).toEqual({ allOf: [{ $ref: '#/paths/~1word~1%7Bid%7D/get/responses/200/content/application~1json/schema/properties/person' }] });
    expect(findings.filter((f) => f.code === 'ref-response-schema')).toEqual([
      {
        code: 'ref-response-schema',
        pointer: '#/paths/~1lexeme/get/responses/200/content/application~1json/schema/properties/whole/$ref',
        message: '`#/paths/~1word~1%7Bid%7D/get/responses/200/schema` is written as `#/paths/~1word~1%7Bid%7D/get/responses/200/content/application~1json/schema`',
        fix: 'nothing to do: OpenAPI 3 keeps a response schema under its media type',
      },
      {
        code: 'ref-response-schema',
        pointer: '#/paths/~1lexeme/get/responses/200/content/application~1json/schema/properties/part/allOf/0/$ref',
        message: '`#/paths/~1word~1%7Bid%7D/get/responses/200/schema/properties/person` is written as `#/paths/~1word~1%7Bid%7D/get/responses/200/content/application~1json/schema/properties/person`',
        fix: 'nothing to do: OpenAPI 3 keeps a response schema under its media type',
      },
    ]);
  });

  it('leaves a reference it cannot follow as written', () => {
    const refs = {
      external: { $ref: 'other.json#/paths/~1word~1%7Bid%7D/get/responses/200/schema' },
      noSchema: { $ref: '#/paths/~1word~1%7Bid%7D/get/responses/204/schema' },
      noResponse: { $ref: '#/paths/~1nowhere/get/responses/200/schema' },
      lookalike: { $ref: '#/paths/~1word~1%7Bid%7D/get/responses/200/schemas' },
    };
    const { document, findings } = convert(swagger(refs));
    for (const [name, ref] of Object.entries(refs)) expect(at(document, name)).toEqual(ref);
    expect(findings.filter((f) => f.code === 'ref-response-schema')).toEqual([]);
  });
});
