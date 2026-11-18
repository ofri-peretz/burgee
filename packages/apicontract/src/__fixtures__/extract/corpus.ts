/**
 * The round-trip corpus for the Standard Schema route (apicontract-extract R2, R6): JSON Schema
 * documents, one `$defs` entry per schema, covering the keywords a contract's payloads use. The
 * corpus lane's documents replace this list once it lands; until then these are the fixture set.
 */
export const corpus: Readonly<Record<string, unknown>> = {
  scalars: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: {
      Name: { type: 'string', minLength: 1, maxLength: 64 },
      Code: { type: 'string', pattern: '^[A-Z]{3}$' },
      Count: { type: 'integer', minimum: 0, maximum: 100 },
      Ratio: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1, multipleOf: 0.25 },
      Flag: { type: 'boolean' },
      Nothing: { type: 'null' },
    },
  },
  objects: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: {
      Pet: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string', description: 'what it answers to' }, tag: { type: 'string' } }, required: ['id', 'name'] },
      Closed: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false },
      Map: { type: 'object', additionalProperties: { type: 'number' } },
    },
  },
  collections: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: {
      Tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10, uniqueItems: true },
      Pair: { type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }], items: false },
    },
  },
  choices: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: {
      Status: { type: 'string', enum: ['open', 'paid', 'shipped'] },
      Answer: { const: 42 },
      Either: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      Maybe: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
  },
  formats: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $defs: {
      Email: { type: 'string', format: 'email' },
      Id: { type: 'string', format: 'uuid' },
      When: { type: 'string', format: 'date-time' },
    },
  },
};
