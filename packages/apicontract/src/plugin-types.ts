/**
 * The built-in `types` target (apicontract-types R1): the compiler-free generator in `gen-ts-*.ts`,
 * registered as a plugin so `gen types` reaches it. This file is the only new import edge.
 *
 * It reads the source document the OpenAPI adapter keeps on the contract, because the output has
 * to be byte for byte what openapi-typescript 7.13.0 prints, and the model drops what that needs
 * (member order, `$ref` names, comments). The body carries no header: the writer adds it.
 */
import { generate, type GenerateOptions } from './gen-ts-index.js';
import { type Generator, type Options, type Plugin } from './host.js';

/** The file the target writes, relative to the output folder. */
export const TYPES_FILE = 'types.ts';

/** The sample: one operation, one required query parameter, one response and the schema it names. */
const document = {
  openapi: '3.1.0',
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        parameters: [{ name: 'limit', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Pets', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } } },
      },
    },
  },
  components: { schemas: { Pet: { required: ['id'], properties: { id: { type: 'string' }, name: { type: 'string' } } } } },
};

const SAMPLE_TYPES = `export interface paths {
    "/pets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listPets"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Pet: {
            id: string;
            name?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listPets: {
        parameters: {
            query: {
                limit: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Pets */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Pet"][];
                };
            };
        };
    };
}
`;

const types: Generator = {
  description: 'TypeScript types for every path, operation and schema, as openapi-typescript 7.13.0 writes them',
  inputs: ['openapi'],
  sample: { document, files: [{ path: TYPES_FILE, owner: 'generated', content: SAMPLE_TYPES }] },
  run: (contract, options: Options) => [{ path: TYPES_FILE, owner: 'generated', content: generate(contract.document, options as GenerateOptions) }],
};

export const plugin: Plugin = { name: 'types', generators: { types } };
