/**
 * Anthropic structured outputs and strict tool use (`output_config.format`, a tool's
 * `input_schema` with `strict: true`). Read 2026-11-18 from
 * https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations:
 * no recursion, no `minimum`, `maximum`, `multipleOf`, `minLength` or `maxLength` (the SDKs move
 * them into `description`, as this table does), `minItems` of 0 or 1 only,
 * `additionalProperties: false` on every object. Per request, across every strict schema: at most
 * 24 optional parameters and 16 parameters with a union type (`anyOf` or a type list).
 */
import { type Dialect } from './plugin-json-schema-dialect.js';

const SAID = { rewrite: 'description' } as const;

export const dialect: Dialect = {
  source: 'https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations',
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
    allOf: 'keep',
    default: 'keep',
    pattern: 'keep',
    format: 'keep',
    minItems: { atMost: 1 },
    title: 'keep',
    description: 'keep',
    minimum: SAID,
    maximum: SAID,
    exclusiveMinimum: SAID,
    exclusiveMaximum: SAID,
    multipleOf: SAID,
    minLength: SAID,
    maxLength: SAID,
    maxItems: SAID,
  },
  formats: ['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid'],
  rootMustBeObject: true,
  additionalPropertiesFalseRequired: true,
  allRequired: false,
  recursion: false,
  refs: 'inline',
  flat: false,
  limits: [
    { measure: 'optional', max: 24, per: 'request' },
    { measure: 'unions', max: 16, per: 'request' },
  ],
};
