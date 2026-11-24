/**
 * `contractdiff extract --from standard-schema` (apicontract-extract R3): the exports of a module,
 * as one JSON Schema document with a `$defs` entry per export.
 *
 * Any value implementing Standard JSON Schema is read the same way, so one extractor covers every
 * conforming library; a truefit schema, plain or wrapped by `truefit/standard`, is read through
 * `truefit/json-schema`. A value that does not is reported, by library, as a finding beside the
 * document (`{ document, findings }`): dropping the schema without a word is the one thing an
 * extractor must not do, and the finding is not the user's spec, so it stays out of it.
 */
import { optional, number, object, string } from 'truefit';
import { standardJson } from 'truefit/json-schema';

import { asStandard, definitions, escape, finding, isStandard, type Json, loadModule, placeAt, relocate, sideOf, toJsonSchema } from './extract-standard.js';
import { type Extractor, type ExtractorResult, type Options, type Plugin } from './host.js';

export const DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** Every export, by name, that is a schema; or the one named, whatever it is. */
export const exportsOf = (namespace: Json, wanted: unknown): string[] => {
  if (wanted === undefined || wanted === '*') return Object.keys(namespace).filter((name) => isStandard(asStandard(namespace[name]))).toSorted();
  if (!Object.keys(namespace).includes(wanted as string)) {
    throw new TypeError(`the module has no export ${JSON.stringify(wanted)}. fix: name one of ${Object.keys(namespace).toSorted().join(', ') || 'its exports'}, or write "*"`);
  }
  return [wanted as string];
};

/** The document for some exports of a module already loaded, and what it could not read. */
export const extractSchemas = (namespace: Json, options: Options): ExtractorResult => {
  const side = sideOf(options.side);
  const place = placeAt('#/$defs/');
  const names = exportsOf(namespace, options.export);
  if (names.length === 0) {
    // An empty document with nothing said would read as a module with nothing to describe.
    const exported = Object.keys(namespace).toSorted();
    place.findings.push(
      finding(
        'no-schemas',
        '',
        `the module exports no schema this extractor reads${exported.length === 0 ? '' : ` (its exports: ${exported.join(', ')})`}`,
        'export schemas of a Standard Schema library (Zod 4, Valibot, ArkType) or truefit, or name the export to read with `"export"`',
      ),
    );
  }
  for (const name of names) {
    const result = toJsonSchema(namespace[name], side, `/${escape(name)}`);
    if ('finding' in result) place.findings.push(result.finding);
    else place.defs.set(name, relocate(result.schema, name, place));
  }
  return { document: { $schema: DIALECT, $defs: definitions(place) }, findings: place.findings };
};

const Pet = standardJson(object({ id: number(), name: optional(string()) }));

const extractor: Extractor = {
  description: 'Every Standard JSON Schema export of a module (Zod 4, Valibot, ArkType, truefit) as one JSON Schema document',
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
