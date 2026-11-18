/**
 * OpenAI structured outputs, strict mode (`response_format: json_schema` and `strict: true` tools).
 * Read 2026-11-18 from https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas:
 * the root is an object, every property is required (an optional one is a union with `null`),
 * `additionalProperties: false` on every object; `allOf`, `not`, `dependentRequired`,
 * `dependentSchemas`, `if`, `then` and `else` are refused, and `oneOf` is not listed. Up to 5000
 * properties, 10 levels of nesting and 1000 enum values.
 */
import { type Dialect } from './plugin-json-schema-dialect.js';

export const dialect: Dialect = {
  source: 'https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas',
  read: '2026-11-18',
  keywords: {
    type: 'keep',
    properties: 'keep',
    required: 'keep',
    additionalProperties: 'keep',
    items: 'keep',
    enum: 'keep',
    const: 'keep',
    anyOf: 'keep',
    pattern: 'keep',
    format: 'keep',
    multipleOf: 'keep',
    maximum: 'keep',
    exclusiveMaximum: 'keep',
    minimum: 'keep',
    exclusiveMinimum: 'keep',
    minItems: 'keep',
    maxItems: 'keep',
    title: 'keep',
    description: 'keep',
  },
  formats: ['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'ipv4', 'ipv6', 'uuid'],
  rootMustBeObject: true,
  additionalPropertiesFalseRequired: true,
  allRequired: true,
  recursion: true,
  refs: 'inline',
  flat: false,
  limits: [
    { measure: 'properties', max: 5000, per: 'schema' },
    { measure: 'depth', max: 10, per: 'schema' },
    { measure: 'enum', max: 1000, per: 'schema' },
  ],
};
