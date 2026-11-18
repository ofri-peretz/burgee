import { describe, expect, it } from 'vitest';

import { read } from './openapi.js';
import { baseFile, controllerFile, moduleFile } from './plugin-nest-code.js';
import { type Controller, routesOf } from './plugin-server-routes.js';

const IMPORTS = { validators: './validators.js', types: './types.js' };

const controller = (paths: unknown): Controller => routesOf(read({ openapi: '3.1.0', paths }), 'NestJS').controllers[0] as Controller;

describe('baseFile', () => {
  it('types headers, an optional body and ranged responses, and reads headers lower-cased', () => {
    const text = baseFile(
      controller({
        '/items/{item-id}': {
          patch: {
            operationId: 'patchItem',
            parameters: [
              { name: 'item-id', in: 'path', schema: { type: 'string' }, example: 'x' },
              { name: 'X-Trace', in: 'header', schema: { type: 'string' }, example: 't' },
            ],
            requestBody: { content: { 'application/json': { schema: { type: 'object' }, example: {} } } },
            responses: { '4XX': { description: 'no', content: { 'application/problem+json': { schema: { type: 'object' } } } }, default: { description: 'any' } },
          },
        },
      }),
      IMPORTS,
    );
    expect(text).toContain("import { Body, Headers, Param, Patch, Res } from '@nestjs/common';\n");
    expect(text).toContain("import { coerce, invalid, problem, type Reply, send } from './contract-runtime.js';\n");
    expect(text).toContain(
      [
        'export interface PatchItemInput {',
        '  readonly path: NonNullable<PatchItemOperation["parameters"]["path"]>;',
        '  readonly header: NonNullable<PatchItemOperation["parameters"]["header"]>;',
        '  readonly body?: NonNullable<PatchItemOperation["requestBody"]>["content"]["application/json"];',
        '}',
        '',
        '/** What `patchItem` answers: one member per response the spec declares. */',
        'export type PatchItemOutput =',
        '  | { readonly status: number; readonly body: PatchItemOperation["responses"]["4XX"]["content"]["application/problem+json"]; readonly headers?: Readonly<Record<string, string>> }',
        '  | { readonly status: number; readonly body?: undefined; readonly headers?: Readonly<Record<string, string>> };',
      ].join('\n'),
    );
    expect(text).toContain('  @Patch("/items/:item_id")\n');
    expect(text).toContain(
      '  async handlePatchItem(@Param() path: Record<string, unknown>, @Headers() header: Record<string, unknown>, @Body() body: unknown, @Res({ passthrough: true }) reply: Reply): Promise<unknown> {\n',
    );
    expect(text).toContain('      path: { "item-id": coerce(path["item_id"], "string") },\n      header: { "X-Trace": coerce(header["x-trace"], "string") },\n      body,\n');
    expect(text).toContain('      { pointer: "/header/X-Trace", value: input.header["X-Trace"], required: false, check: validators["patchItem"]["param:header:X-Trace"] },\n');
    expect(text).toContain('      { pointer: "/body", value: input.body, required: false, check: validators["patchItem"]["body:application/json"] },\n');
    expect(text).toContain('      "4XX": { media: "application/problem+json", check: validators["patchItem"]["response:4XX:application/problem+json"] },\n      "default": {},\n');
  });

  it('imports neither coerce nor the validators when nothing is read or checked, and answers never without responses', () => {
    const text = baseFile(
      controller({
        '/a': { delete: { operationId: 'a', responses: { '204': { description: 'gone' } } } },
        '/b': { head: { operationId: 'b', responses: {} } },
      }),
      IMPORTS,
    );
    expect(text.split('\n\n')[0]).toBe("import { Delete, Head, Res } from '@nestjs/common';");
    expect(text).toContain("\n\nimport { invalid, problem, type Reply, send } from './contract-runtime.js';\nimport { type paths } from \"./types.js\";\n\ntype AOperation");
    expect(text).toContain('export type BOutput =\n  never;\n');
    expect(text).toContain('    const input = {\n    };\n    const errors = invalid([\n    ]);\n');
  });

  it('imports the validators for a body alone, and for a response alone', () => {
    const body = baseFile(controller({ '/a': { post: { operationId: 'a', requestBody: { content: { 'application/json': { example: 1 } } }, responses: {} } } }), IMPORTS);
    expect(body).toContain('import { operations as validators } from "./validators.js";\n');
    const response = baseFile(controller({ '/a': { get: { operationId: 'a', responses: { '200': { description: 'a', content: { 'text/plain': { example: 'a' } } } } } } }), IMPORTS);
    expect(response).toContain('import { operations as validators } from "./validators.js";\n');
  });
});

describe('baseFile, per method and part', () => {
  it('decorates PUT and OPTIONS, and imports only the decorators it uses', () => {
    const text = baseFile(controller({ '/a': { put: { operationId: 'a', responses: {} }, options: { operationId: 'b', responses: {} } } }), IMPORTS);
    expect(text.split('\n')[0]).toBe("import { Options, Put, Res } from '@nestjs/common';");
    expect(text).toContain('  @Put("/a")\n');
    expect(text).toContain('  @Options("/a")\n');
  });

  it('reads query parameters under their own names, and imports Query without Param', () => {
    const text = baseFile(
      controller({
        '/a': {
          get: {
            operationId: 'a',
            parameters: [
              { name: 'page-size', in: 'query', schema: { type: 'integer' }, example: 1 },
              { name: 'q', in: 'query', example: 'x' },
            ],
            responses: {},
          },
        },
      }),
      IMPORTS,
    );
    expect(text.split('\n')[0]).toBe("import { Get, Query, Res } from '@nestjs/common';");
    expect(text).toContain('      query: { "page-size": coerce(query["page-size"], "number"), "q": coerce(query["q"], "string") },\n');
  });

  it('imports the validators when any one route checks something', () => {
    const text = baseFile(
      controller({ '/a': { post: { operationId: 'a', requestBody: { content: { 'application/json': { example: 1 } } }, responses: {} }, get: { operationId: 'b', responses: {} } } }),
      IMPORTS,
    );
    expect(text).toContain('import { operations as validators } from "./validators.js";\n');
  });
});

describe('controllerFile and moduleFile', () => {
  const pets = controller({
    '/pets': {
      get: { operationId: 'listPets', tags: ['pets'], responses: { '200': { description: 'a', content: { 'application/json': { example: [] } } } } },
      delete: { operationId: 'clearPets', tags: ['pets'], responses: { '204': { description: 'gone' } } },
    },
  });

  it('writes one stub per operation into the user’s class', () => {
    expect(controllerFile(pets)).toBe(`/**
 * The \`pets\` routes. apicontract wrote this file once and never rewrites it: change it freely.
 * \`PetsControllerBase\` (pets.controller.base.ts, regenerated) declares one method per
 * operation and validates every request and response; each method here answers the spec's example until you replace it.
 */
import { Controller } from '@nestjs/common';

import { PetsControllerBase, type ClearPetsInput, type ClearPetsOutput, type ListPetsInput, type ListPetsOutput } from './pets.controller.base.js';

@Controller()
export class PetsController extends PetsControllerBase {
  /** DELETE /pets. */
  clearPets(_input: ClearPetsInput): ClearPetsOutput {
    return { status: 204 };
  }

  /** GET /pets. */
  listPets(_input: ListPetsInput): ListPetsOutput {
    return { status: 200, body: [] };
  }
}
`);
  });

  it('lists every controller in the module', () => {
    expect(moduleFile([pets, { file: 'pet-store', name: 'PetStore', routes: [] }])).toBe(`import { Module } from '@nestjs/common';

import { PetsController } from './pets.controller.js';
import { PetStoreController } from './pet-store.controller.js';

/** Every controller generated from the spec. Import it into your application's module. */
@Module({ controllers: [PetsController, PetStoreController] })
export class ApiModule {}
`);
  });
});
