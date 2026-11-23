/**
 * MCP 2026-07-28 elicitation (`requestedSchema`). Read 2026-11-18 from
 * https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation.md: a flat object of
 * primitive properties. A string takes `minLength`, `maxLength` and `format` (`email`, `uri`, `date`,
 * `date-time`); a number `minimum` and `maximum`; any of them `default`; a choice `enum`, or
 * `oneOf` of `{ const, title }`; several choices an array whose `items` have `enum` or `anyOf`, with
 * `minItems` and `maxItems`. No nesting, so no `$ref` either.
 */
import { type Dialect } from './plugin-json-schema-dialect.js';

export const dialect: Dialect = {
  source: 'https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation.md',
  read: '2026-11-18',
  keywords: {
    type: 'keep',
    properties: 'keep',
    required: 'keep',
    title: 'keep',
    description: 'keep',
    minLength: 'keep',
    maxLength: 'keep',
    format: 'keep',
    minimum: 'keep',
    maximum: 'keep',
    default: 'keep',
    enum: 'keep',
    oneOf: 'keep',
    anyOf: 'keep',
    const: 'keep',
    items: 'keep',
    minItems: 'keep',
    maxItems: 'keep',
  },
  formats: ['email', 'uri', 'date', 'date-time'],
  rootMustBeObject: true,
  additionalPropertiesFalseRequired: false,
  allRequired: false,
  recursion: false,
  refs: 'inline',
  flat: true,
  limits: [],
};
