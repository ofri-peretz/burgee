/**
 * How a payload's values are judged: the validator package's reading of its schema, in the
 * contract's dialect, with the definitions its references point into carried beside it.
 */
import { check, parse } from 'truefit';
import { fromJsonSchema, jsonSchemaReader, type JsonSchemaReader } from 'truefit/json-schema';

import { type Contract } from './core/model.js';
import { isDict } from './diff-normalise.js';
import { type Draft } from './props-generate.js';

/** What a payload's values are checked with. */
export interface Judge {
  readonly accepts: (value: unknown) => boolean;
  /** The JSON Pointers into the value of every place it is refused at; empty when it is accepted. */
  readonly paths: (value: unknown) => string[];
}

/** A schema the validator package read, as a judge. */
const judgeOf = (read: ReturnType<typeof fromJsonSchema>['schema']): Judge => ({
  accepts: (value) => check(read, value),
  paths: (value) => {
    const parsed = parse(read, value);
    return parsed.ok ? [] : parsed.issues.map((issue) => issue.path);
  },
});

/** The validator package's reading of a document, as a judge. */
export const validatorJudge = (document: unknown, draft: Draft): Judge => judgeOf(fromJsonSchema(document, { draft }).schema);

/**
 * One reader for each contract document and dialect: a definition is read once, for every payload that names it.
 * The readers' findings are never read here, so that they gather across runs on the same document changes nothing.
 */
const readers = new WeakMap<object, Map<Draft, JsonSchemaReader>>();

const readerFor = (document: Readonly<Record<string, unknown>>, draft: Draft): JsonSchemaReader => {
  const byDraft = readers.get(document) ?? new Map<Draft, JsonSchemaReader>();
  readers.set(document, byDraft);
  const known = byDraft.get(draft);
  if (known !== undefined) return known;
  const reader = jsonSchemaReader(rooted({}, document), { draft });
  byDraft.set(draft, reader);
  return reader;
};

/** Whether a `$ref` points into the payload rather than at the contract's definitions: `#` itself, or a pointer under any other key. */
const intoPayload = (ref: unknown): boolean => {
  if (typeof ref !== 'string') return false;
  if (ref === '#') return true;
  // Stryker disable next-line StringLiteral,ConditionalExpression,BooleanLiteral: equivalent, a reference that is not a pointer into the document is not followed, read alone or shared, so either path gives the same verdicts
  if (!ref.startsWith('#/')) return false;
  return !DEFINITIONS.includes(decodeURIComponent(ref.slice(2).split('/')[0] as string));
};

/** Whether any `$ref` in a schema points into the payload, stopping at the first that does. */
const refersInside = (schema: unknown): boolean => {
  if (Array.isArray(schema)) return schema.some(refersInside);
  if (!isDict(schema)) return false;
  return intoPayload(schema.$ref) || Object.values(schema).some(refersInside);
};

/** Whether a payload's references may point into the payload itself: at its own definitions, or at any other part of it. */
const selfReferent = (schema: Readonly<Record<string, unknown>>): boolean => DEFINITIONS.some((key) => key in schema) || refersInside(schema);

/**
 * A payload's judge: `validatorJudge` on `rooted(schema, document)`, with the contract's
 * definitions read once for every payload of the document rather than once for each. A payload
 * whose references may point into itself is read on its own, as it always was.
 */
export const payloadJudge = (schema: unknown, document: unknown, draft: Draft): Judge => {
  if (!isDict(document) || (isDict(schema) && selfReferent(schema))) return validatorJudge(rooted(schema, document), draft);
  return judgeOf(readerFor(document, draft).read(rooted(schema, null)));
};

/** The dialect a contract's schemas are written in. */
export const draftOf = (contract: Pick<Contract, 'document'>): Draft => {
  const document = isDict(contract.document) ? contract.document : {};
  if (typeof document.openapi === 'string' && document.openapi.startsWith('3.0')) return 'openapi-3.0';
  if (typeof document.$schema === 'string' && document.$schema.includes('draft-07')) return 'draft-07';
  return '2020-12';
};

/** Where definitions live in the documents adapters read: what a payload's `$ref`s point into. */
const DEFINITIONS = ['components', 'definitions', '$defs'];

/** A payload's schema as a document of its own: its references point into the contract's definitions, carried beside it. */
export const rooted = (schema: unknown, document: unknown): unknown => {
  if (schema === true) return {};
  if (!isDict(schema)) return { not: {} };
  const definitions = isDict(document) ? Object.fromEntries(DEFINITIONS.filter((key) => key in document).map((key) => [key, document[key]])) : {};
  return { ...definitions, ...schema };
};
