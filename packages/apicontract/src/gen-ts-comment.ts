/** The JSDoc block openapi-typescript writes above a member, from the schema keywords that feed it. */
import { type Dict, isDict } from './gen-ts-dict.js';

const LINE_BREAK = /\r?\n/g;
const CONTINUATION = '\n *     ';
const JSON_INDENT = 2;

const inline = (value: unknown): string => {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value, null, JSON_INDENT) : value;
  return String(text).trim().replaceAll(LINE_BREAK, CONTINUATION);
};

const heading = (value: unknown): string[] =>
  typeof value === 'string' && value !== '' ? [value.trim().replaceAll(LINE_BREAK, CONTINUATION)] : [];

const tagged = (schema: Dict, field: 'description' | 'default' | 'example'): string[] => {
  const value = schema[field];
  if (value === undefined || (value === '' && field === 'description')) return [];
  return [`@${field} ${inline(value)}`];
};

const examples = (schema: Dict): string[] =>
  Array.isArray(schema.examples) ? (schema.examples as unknown[]).map((example) => `@example ${inline(example)}`) : [];

const enumTag = (schema: Dict): string[] => {
  if (!schema.enum) return [];
  let type = 'unknown';
  if (Array.isArray(schema.type)) type = schema.type.join('|');
  else if (typeof schema.type === 'string') type = schema.type;
  return [`@enum {${type}${schema.nullable ? '|null' : ''}}`];
};

const lines = (schema: Dict): string[] => [
  ...heading(schema.title),
  ...heading(schema.summary),
  ...(schema.format ? [`Format: ${String(schema.format)}`] : []),
  ...(schema.deprecated ? ['@deprecated'] : []),
  ...tagged(schema, 'description'),
  ...tagged(schema, 'default'),
  ...tagged(schema, 'example'),
  ...examples(schema),
  ...('const' in schema ? ['@constant'] : []),
  ...enumTag(schema),
];

/** The comment's text between its opening and closing marks, or nothing when no keyword contributes. */
export const jsDoc = (schema: unknown): string | undefined => {
  if (!isDict(schema)) return undefined;
  const output = lines(schema);
  const [only] = output;
  if (only === undefined) return undefined;
  const text = output.length === 1 && !only.includes('\n') ? `* ${only} ` : `*\n * ${output.join('\n * ')}\n `;
  return text.replaceAll('*/', String.raw`*\/`);
};
