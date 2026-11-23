/**
 * How a payload's values are judged: the validator package's reading of its schema, in the
 * contract's dialect, with the definitions its references point into carried beside it.
 */
import { check, parse } from 'loadline';
import { fromJsonSchema } from 'loadline/json-schema';

import { type Contract } from './core/model.js';
import { isDict } from './diff-normalise.js';
import { type Draft } from './props-generate.js';

/** What a payload's values are checked with. */
export interface Judge {
  readonly accepts: (value: unknown) => boolean;
  /** The JSON Pointers into the value of every place it is refused at; empty when it is accepted. */
  readonly paths: (value: unknown) => string[];
}

/** The validator package's reading of a document, as a judge. */
export const validatorJudge = (document: unknown, draft: Draft): Judge => {
  const read = fromJsonSchema(document, { draft }).schema;
  return {
    accepts: (value) => check(read, value),
    paths: (value) => {
      const parsed = parse(read, value);
      return parsed.ok ? [] : parsed.issues.map((issue) => issue.path);
    },
  };
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
