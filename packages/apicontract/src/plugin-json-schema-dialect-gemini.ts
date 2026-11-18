/**
 * Gemini structured output and function declarations (`responseJsonSchema`, `parametersJsonSchema`).
 * Read 2026-11-18 from https://aistudio.google.com/docs/structured-output (types, the keywords per
 * type, the formats `date-time`, `date` and `time`, recursion through `$ref`) and
 * https://blog.google/technology/developers/gemini-api-structured-outputs/ (`anyOf`, `$ref`).
 * `minLength`, `maxLength`, `minProperties`, `maxProperties`, `uniqueItems`, `contains`,
 * `minContains` and `maxContains` are "stripped and ignored" by the server: dropped here, with a
 * finding, so the narrowed schema says only what is enforced.
 */
import { type Dialect } from './plugin-json-schema-dialect.js';

export const dialect: Dialect = {
  source: 'https://aistudio.google.com/docs/structured-output',
  read: '2026-11-18',
  keywords: {
    type: 'keep',
    properties: 'keep',
    required: 'keep',
    additionalProperties: 'keep',
    enum: 'keep',
    format: 'keep',
    minimum: 'keep',
    maximum: 'keep',
    items: 'keep',
    prefixItems: 'keep',
    minItems: 'keep',
    maxItems: 'keep',
    anyOf: 'keep',
    title: 'keep',
    description: 'keep',
  },
  formats: ['date-time', 'date', 'time'],
  rootMustBeObject: false,
  additionalPropertiesFalseRequired: false,
  allRequired: false,
  recursion: true,
  refs: 'keep',
  flat: false,
  limits: [],
};
