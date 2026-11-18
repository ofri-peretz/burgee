/**
 * The fixture set for `gen validator` and `gen json-schema` (apicontract-gen-validator J1, J2):
 * three documents that between them use every keyword the validator reads, in the three ways a
 * source writes a schema (2020-12, OpenAPI 3.0, draft-07), and for each payload the values its
 * verdicts are compared on. Each payload has at least one value that passes and one that fails.
 *
 * `multipleOf` is an integer here on purpose: for a fraction the validator reads within one rounding
 * error and ajv does not, which the validator reports as a finding (`validator-not-read`).
 */

const order = {
  type: 'object',
  required: ['id', 'email', 'qty', 'status'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email', 'x-internal': true },
    qty: { type: 'integer', minimum: 1, maximum: 100, multipleOf: 5 },
    price: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1000 },
    status: { enum: ['open', 'paid'], example: 'open' },
    kind: { const: 'order' },
    note: { type: ['string', 'null'], maxLength: 10, minLength: 1 },
    sku: { type: 'string', pattern: '^[A-Z]{3}-\\d+$' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 3, uniqueItems: true },
    placed: { type: 'string', format: 'date-time' },
    due: { type: 'string', format: 'date' },
    point: { type: 'array', prefixItems: [{ type: 'number' }, { type: 'number' }], items: false },
    counts: { type: 'array', contains: { const: 0 }, minContains: 1, maxContains: 2 },
    meta: { type: 'object', additionalProperties: { type: 'integer' }, propertyNames: { pattern: '^[a-z]+$' }, minProperties: 1, maxProperties: 3 },
    payment: { $ref: '#/components/schemas/Payment' },
    tree: { $ref: '#/components/schemas/Tree' },
    either: { anyOf: [{ type: 'integer' }, { type: 'string', minLength: 2 }] },
    both: { allOf: [{ type: 'string' }, { minLength: 2 }] },
    neither: { not: { type: 'string' } },
    shaped: { if: { type: 'string' }, then: { minLength: 3 }, else: { type: 'integer' } },
  },
  dependentRequired: { price: ['qty'] },
  dependentSchemas: { note: { required: ['sku'] } },
  additionalProperties: false,
};

export const shop = {
  openapi: '3.1.0',
  info: { title: 'Shop', version: '1' },
  paths: {
    '/orders': {
      post: {
        operationId: 'createOrder',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } },
      },
    },
    '/trees': {
      get: {
        operationId: 'listTrees',
        parameters: [{ name: 'depth', in: 'query', schema: { type: 'integer', minimum: 0 } }],
        responses: { '200': { description: 'Trees', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Tree' } } } } } },
      },
    },
  },
  components: {
    schemas: {
      Order: order,
      Payment: {
        oneOf: [
          { type: 'object', required: ['kind', 'last4'], properties: { kind: { const: 'card' }, last4: { type: 'string', pattern: '^\\d{4}$' } } },
          { type: 'object', required: ['kind', 'iban'], properties: { kind: { const: 'bank' }, iban: { type: 'string', minLength: 15 } } },
        ],
      },
      Tree: { type: 'object', required: ['value'], properties: { value: { type: 'integer' }, children: { type: 'array', items: { $ref: '#/components/schemas/Tree' } } } },
    },
  },
};

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const valid = { id: uuid, email: 'a@b.co', qty: 5, status: 'open' };

const orders: readonly unknown[] = [
  valid,
  { ...valid, price: 10, kind: 'order', note: null, sku: 'ABC-1', tags: ['a', 'b'], placed: '2026-11-18T10:00:00Z', due: '2026-11-18' },
  { ...valid, point: [1, 2], counts: [0, 1], meta: { a: 1 }, payment: { kind: 'card', last4: '1234' }, tree: { value: 1, children: [{ value: 2 }] } },
  { ...valid, either: 3, both: 'ab', neither: 4, shaped: 'abc' },
  { ...valid, either: 'ab', shaped: 7, payment: { kind: 'bank', iban: 'DE89370400440532013000' } },
  { ...valid, id: 'nope' },
  { ...valid, email: 'not an email' },
  { ...valid, qty: 7 },
  { ...valid, qty: 105 },
  { ...valid, price: 0 },
  { ...valid, price: 1000 },
  { ...valid, status: 'lost' },
  { ...valid, kind: 'other' },
  { ...valid, note: '' },
  { ...valid, note: 'far too long for it' },
  { ...valid, sku: 'abc-1' },
  { ...valid, tags: ['a', 'a'] },
  { ...valid, tags: ['a', 'b', 'c', 'd'] },
  { ...valid, placed: '2026-11-18' },
  { ...valid, due: '2026-02-30' },
  { ...valid, point: [1, 2, 3] },
  { ...valid, point: [1, 'x'] },
  { ...valid, counts: [1, 2] },
  { ...valid, counts: [0, 0, 0] },
  { ...valid, meta: {} },
  { ...valid, meta: { A: 1 } },
  { ...valid, meta: { a: 1.5 } },
  { ...valid, payment: { kind: 'card', last4: '12' } },
  { ...valid, payment: { kind: 'cash' } },
  { ...valid, tree: { value: 1, children: [{ value: 'x' }] } },
  { ...valid, either: 'a' },
  { ...valid, both: 'a' },
  { ...valid, neither: 'x' },
  { ...valid, shaped: 'ab' },
  { ...valid, shaped: 1.5 },
  { ...valid, price: 5, qty: undefined },
  { ...valid, note: 'hi' },
  { ...valid, extra: 1 },
  { id: uuid },
  null,
  'order',
];

/** The values each payload is checked on, by the name the targets give it. */
export const shopCases: Readonly<Record<string, readonly unknown[]>> = {
  CreateOrderBody: orders,
  CreateOrderResponse201: orders,
  ListTreesParamQueryDepth: [0, 3, -1, 1.5, '1', null],
  ListTreesResponse200: [[], [{ value: 1 }], [{ value: 1, children: [{ value: 2, children: [] }] }], [{ value: 'x' }], [{ children: [] }], {}, null],
};

/** OpenAPI 3.0: `nullable`, boolean exclusive bounds, `example`, a `$ref` with a keyword beside it. */
export const legacy = {
  openapi: '3.0.3',
  info: { title: 'Legacy', version: '1' },
  paths: {
    '/items': {
      put: {
        operationId: 'putItem',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['size'],
                properties: {
                  size: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 10, exclusiveMaximum: false, example: 3 },
                  label: { type: 'string', nullable: true },
                  owner: { $ref: '#/components/schemas/Owner', description: 'ignored beside a $ref in 3.0' },
                },
              },
            },
          },
        },
        responses: { '204': { description: 'Done' } },
      },
    },
  },
  components: { schemas: { Owner: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
};

export const legacyCases: Readonly<Record<string, readonly unknown[]>> = {
  PutItemBody: [{ size: 1 }, { size: 10, label: null }, { size: 2, label: 'x', owner: { name: 'n' } }, { size: 0 }, { size: 11 }, { size: 1, label: 3 }, { size: 1, owner: {} }, {}],
};

/** Draft-07 JSON Schema: a tuple `items` with `additionalItems`, both forms of `dependencies`, `definitions`. */
export const draft07 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    pair: { type: 'array', items: [{ type: 'string' }, { type: 'integer' }], additionalItems: false },
    card: { type: 'string' },
    cvv: { $ref: '#/definitions/Cvv' },
    bill: { type: 'string' },
  },
  dependencies: { card: ['cvv'], bill: { required: ['card'] } },
  definitions: { Cvv: { type: 'string', pattern: '^\\d{3}$' } },
};

export const draft07Cases: Readonly<Record<string, readonly unknown[]>> = {
  SchemaValue: [{}, { pair: ['a', 1] }, { card: 'c', cvv: '123' }, { card: 'c', cvv: '123', bill: 'b' }, { pair: ['a', 1, 2] }, { pair: [1, 'a'] }, { card: 'c' }, { bill: 'b' }, { cvv: '12' }],
  CvvValue: ['123', '12', 3],
};
