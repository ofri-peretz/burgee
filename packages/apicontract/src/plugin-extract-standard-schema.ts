/**
 * `apicontract extract --from standard-schema` (apicontract-extract R3): the exports of a module,
 * as one JSON Schema document with a `$defs` entry per export.
 *
 * Any value implementing Standard JSON Schema is read the same way, so one extractor covers every
 * conforming library. A value that does not is reported, by library, in the document's
 * `x-findings`: the extractor host has no other place to put a finding, and dropping the schema
 * without a word is the one thing an extractor must not do.
 */
import { optional, number, object, string } from 'validator';
import { standardJson } from 'validator/json-schema';

import { definitions, escape, isStandard, type Json, loadModule, placeAt, relocate, sideOf, toJsonSchema } from './extract-standard.js';
import { type Extractor, type Options, type Plugin } from './host.js';

export const DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** The key the findings are kept under, at the root of the document. */
export const FINDINGS = 'x-findings';

/** Every export, by name, that is a schema; or the one named, whatever it is. */
export const exportsOf = (namespace: Json, wanted: unknown): string[] => {
  if (wanted === undefined || wanted === '*') return Object.keys(namespace).filter((name) => isStandard(namespace[name])).toSorted();
  if (typeof wanted !== 'string' || !Object.keys(namespace).includes(wanted)) {
    throw new TypeError(`the module has no export ${JSON.stringify(wanted)}. fix: name one of ${Object.keys(namespace).toSorted().join(', ') || 'its exports'}, or write "*"`);
  }
  return [wanted];
};

/** The document for some exports of a module already loaded. */
export const extractSchemas = (namespace: Json, options: Options): Json => {
  const side = sideOf(options.side);
  const place = placeAt('#/$defs/');
  for (const name of exportsOf(namespace, options.export)) {
    const result = toJsonSchema(namespace[name], side, `/${escape(name)}`);
    if ('finding' in result) place.findings.push(result.finding);
    else place.defs.set(name, relocate(result.schema, name, place));
  }
  return { $schema: DIALECT, $defs: definitions(place), ...(place.findings.length === 0 ? {} : { [FINDINGS]: place.findings }) };
};

const Pet = standardJson(object({ id: number(), name: optional(string()) }));

const extractor: Extractor = {
  description: 'Every Standard JSON Schema export of a module (Zod 4, Valibot, ArkType, validator) as one JSON Schema document',
  options: {
    module: { type: 'string', description: 'the module to import, relative to the working folder; its code runs' },
    export: { type: 'string', description: 'the export to read, or "*" for every schema it exports (default)' },
    side: { type: 'string', description: '"input" (default): what parse reads; "output": what it hands out' },
  },
  sample: {
    options: { module: { Pet } },
    document: {
      $schema: DIALECT,
      $defs: { Pet: { type: 'object', properties: { id: { type: 'number' }, name: { type: 'string' } }, required: ['id'] } },
    },
  },
  run: async (options) => extractSchemas(await loadModule(options.module), options),
};

export const plugin: Plugin = { name: 'extract-standard-schema', extractors: { 'standard-schema': extractor } };
