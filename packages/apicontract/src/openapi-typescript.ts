/**
 * The `openapi-typescript` drop-in: the names a program imports from `openapi-typescript` 7, over
 * our own generator. It uses no TypeScript compiler, so it runs under TypeScript 7.
 *
 * Two differences from the incumbent, both forced by having no compiler. `openapiTS` resolves to
 * the generated text, not to compiler nodes, and `astToString` hands that text back; and the
 * options that take or return compiler nodes (`transform`, `postTransform`, `transformProperty`,
 * `inject`) are refused with a `fix:` line. Documents are read from this machine only: a remote
 * address is refused rather than fetched, and `$ref`s to other files are not bundled.
 */
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { text as textOf } from 'node:stream/consumers';

import { parse as parseYaml } from 'seniority/yaml';

import { generate, type GenerateOptions } from './gen-ts-index.js';

/** What `openapiTS` reads: a parsed document, YAML or JSON text, a `file:` address, or a stream of text. */
export type Source = string | URL | Buffer | Readable | object;

/** Prints what `openapiTS` returned. It is already text. */
export const astToString = (value: unknown): string => String(value);

const remote = (address: string): never => {
  throw new Error(`\`${address}\` is a remote address, and this package does not fetch.\nfix: download the document and pass its text, its parsed value or a \`file:\` URL`);
};

const parse = (source: string): unknown => {
  const trimmed = source.trimStart();
  if (/^https?:\/\//u.test(trimmed)) return remote(trimmed);
  return trimmed.startsWith('{') ? (JSON.parse(source) as unknown) : parseYaml(source);
};

const read = async (source: Source): Promise<unknown> => {
  if (typeof source === 'string') return parse(source);
  if (source instanceof URL) return source.protocol === 'file:' ? parse(readFileSync(source, 'utf8')) : remote(source.href);
  if (Buffer.isBuffer(source)) return parse(source.toString('utf8'));
  return source instanceof Readable ? parse(await textOf(source)) : source;
};

/** Converts an OpenAPI 3.x document to TypeScript, as the text `openapi-typescript` 7.13.0 writes. */
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export, and matching it is the point of this file
export default async function openapiTS(source: Source, options: GenerateOptions = {}): Promise<string> {
  if ((source as unknown) === undefined || source === null || source === '') {
    throw new Error('Empty schema.\nfix: pass a document, its YAML or JSON text, or a `file:` URL');
  }
  return generate(await read(source), options);
}

export {
  COMMENT_HEADER,
  createRef,
  isEnumSchema,
  makeApiPathsEnum,
  resolveRef,
  scanDiscriminators,
  transformComponentsObject,
  transformHeaderObject,
  transformOperationObject,
  transformPathItemObject,
  transformPathsObject,
  transformRequestBodyObject,
  transformResponseObject,
  transformSchema,
  transformSchemaObject,
  transformWebhooksObject,
  type GenerateOptions as OpenAPITSOptions,
} from './gen-ts-index.js';
