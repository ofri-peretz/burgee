import { describe, expect, it } from 'vitest';

import { lastRef } from './gen-ts-ref.js';
import { createHost } from './host.js';
import { builtinAdapters } from './inputs.js';
import { plugin } from './plugin-types.js';

/**
 * Which `$ref`s print as the indexed access upstream writes and which are declared once as an alias
 * (plugin-types-corpus.test.ts type-checks the corpus shapes; these pin each rule on its own).
 */

const host = createHost();
host.register({ name: 'contractdiff', adapters: builtinAdapters });
host.register(plugin);

const types = async (document: unknown): Promise<string> => (await host.run('types', document)).files[0]?.content ?? '';

const doc = (schemas: Record<string, unknown>, rest: Record<string, unknown> = {}): unknown => ({
  openapi: '3.0.3',
  info: { title: 't', version: '1' },
  paths: {},
  ...rest,
  components: { ...(rest.components as object | undefined), schemas },
});

/** `B.x` pointing at `ref`, beside `A`. */
const through = (a: unknown, ref: string): unknown => doc({ A: a, B: { type: 'object', properties: { x: { $ref: ref } } } });

const STRING = { type: 'string' };
const base = '#/components/schemas/A';

describe('a reference into a schema structure is declared once as an alias', () => {
  it.each([
    ['allOf', { allOf: [STRING] }, `${base}/allOf/0`, 'Ref_components_schemas_A_allOf_0'],
    ['anyOf', { anyOf: [STRING] }, `${base}/anyOf/0`, 'Ref_components_schemas_A_anyOf_0'],
    ['oneOf', { oneOf: [STRING] }, `${base}/oneOf/0`, 'Ref_components_schemas_A_oneOf_0'],
    ['not', { not: STRING }, `${base}/not`, 'Ref_components_schemas_A_not'],
    ['items', { type: 'array', items: STRING }, `${base}/items`, 'Ref_components_schemas_A_items'],
    ['prefixItems', { type: 'array', prefixItems: [STRING] }, `${base}/prefixItems/0`, 'Ref_components_schemas_A_prefixItems_0'],
    ['additionalProperties', { type: 'object', additionalProperties: STRING }, `${base}/additionalProperties`, 'Ref_components_schemas_A_additionalProperties'],
    ['patternProperties', { type: 'object', patternProperties: { x: STRING } }, `${base}/patternProperties/x`, 'Ref_components_schemas_A_patternProperties_x'],
    ['if', { if: STRING }, `${base}/if`, 'Ref_components_schemas_A_if'],
    ['then', { then: STRING }, `${base}/then`, 'Ref_components_schemas_A_then'],
    ['else', { else: STRING }, `${base}/else`, 'Ref_components_schemas_A_else'],
    ['definitions', { definitions: { D: STRING } }, `${base}/definitions/D`, 'Ref_components_schemas_A_definitions_D'],
    ['two properties', { type: 'object', properties: { p: { type: 'object', properties: { q: STRING } } } }, `${base}/properties/p/properties/q`, 'Ref_components_schemas_A_properties_p_properties_q'],
  ])('through %s', async (_, a, ref, name) => {
    const text = await types(through(a, ref));
    expect(text).toContain(`x?: ${name};`);
    expect(text).toContain(`export type ${name} = string;`);
  });

  it.each([
    ['a parameter', { parameters: { Id: { name: 'id', in: 'query', schema: STRING } } }, '#/components/parameters/Id/schema', 'Ref_components_parameters_Id_schema'],
    ['a header', { headers: { H: { schema: STRING } } }, '#/components/headers/H/schema', 'Ref_components_headers_H_schema'],
  ])('past %s, printed as its value', async (_, components, ref, name) => {
    const text = await types(doc({ B: { type: 'object', properties: { x: { $ref: ref } } } }, { components }));
    expect(text).toContain(`x?: ${name};`);
  });

  it('past a request body, which may be absent', async () => {
    const paths = { '/a': { post: { requestBody: { content: { 'application/json': { schema: STRING } } }, responses: { '204': { description: 'ok' } } } } };
    const text = await types(doc({ B: { type: 'object', properties: { x: { $ref: '#/paths/~1a/post/requestBody/content/application~1json/schema' } } } }, { paths }));
    expect(text).toContain('x?: Ref_paths__a_post_requestBody_content_application_json_schema;');
  });

  it('once per reference, and apart when two names sanitise alike', async () => {
    const text = await types(
      doc({
        'A-x': { allOf: [STRING] },
        A_x: { allOf: [{ type: 'number' }] },
        B: { type: 'object', properties: { x: { $ref: '#/components/schemas/A-x/allOf/0' }, y: { $ref: '#/components/schemas/A_x/allOf/0' }, z: { $ref: '#/components/schemas/A-x/allOf/0' } } },
      }),
    );
    expect(text).toContain('x?: Ref_components_schemas_A_x_allOf_0;');
    expect(text).toContain('y?: Ref_components_schemas_A_x_allOf_0_2;');
    expect(text).toContain('z?: Ref_components_schemas_A_x_allOf_0;');
    expect(text.match(/export type Ref_components_schemas_A_x_allOf_0 = string;/gu)).toHaveLength(1);
    expect(text).toContain('export type Ref_components_schemas_A_x_allOf_0_2 = number;');
  });

  it('counting up past every name already taken', async () => {
    const text = await types(
      doc({
        'A-x': { allOf: [STRING] },
        A_x: { allOf: [STRING] },
        'A.x': { allOf: [STRING] },
        B: { type: 'object', properties: { x: { $ref: '#/components/schemas/A-x/allOf/0' }, y: { $ref: '#/components/schemas/A_x/allOf/0' }, z: { $ref: '#/components/schemas/A.x/allOf/0' } } },
      }),
    );
    expect(text).toContain('z?: Ref_components_schemas_A_x_allOf_0_3;');
  });
});

describe('a reference upstream indexes stays an indexed access', () => {
  it('to a component, and to one property of it', async () => {
    const text = await types(doc({ A: { type: 'object', properties: { p: STRING } }, B: { type: 'object', properties: { x: { $ref: base }, y: { $ref: `${base}/properties/p` } } } }));
    expect(text).toContain('x?: components["schemas"]["A"];');
    expect(text).toContain('y?: components["schemas"]["A"]["p"];');
    expect(text).not.toContain('Ref_');
  });

  it('to a schema named like a keyword', async () => {
    const text = await types(doc({ allOf: STRING, B: { type: 'object', properties: { x: { $ref: '#/components/schemas/allOf' } } } }));
    expect(text).toContain('x?: components["schemas"]["allOf"];');
  });

  it('to a schema named like an object printed as its value', async () => {
    const text = await types(doc({ parameters: STRING, B: { type: 'object', properties: { x: { $ref: '#/components/schemas/parameters' } } } }));
    expect(text).toContain('x?: components["schemas"]["parameters"];');
  });

  it('to a pointer whose first token is such a name', async () => {
    const text = await types({ ...(doc({ B: { type: 'object', properties: { x: { $ref: '#/parameters/A/b' } } } }) as object), parameters: { A: { b: STRING } } });
    expect(text).toContain('x?: parameters["A"]["b"];');
  });
});

describe('a schema that reaches itself', () => {
  it('with no object in between is an alias, the recursive type tsc accepts', async () => {
    // An alias's own body may name the alias: `behindObject` is reset there.
    const text = await types(doc({ V: { oneOf: [STRING, { type: 'array', items: { $ref: '#/components/schemas/V' } }] } }));
    expect(text).toContain('V: string | Ref_components_schemas_V[];');
    expect(text).toContain('export type Ref_components_schemas_V = string | Ref_components_schemas_V[];');
  });

  it.each([
    ['a property', { type: 'object', properties: { next: { $ref: '#/components/schemas/N' } } }, 'next?: components["schemas"]["N"];'],
    ['additionalProperties', { type: 'object', additionalProperties: { $ref: '#/components/schemas/N' } }, '[key: string]: components["schemas"]["N"];'],
    ['patternProperties', { type: 'object', patternProperties: { x: { $ref: '#/components/schemas/N' } } }, '[key: string]: components["schemas"]["N"];'],
  ])('through %s stays indexed', async (_, n, line) => {
    expect(await types(doc({ N: n }))).toContain(line);
  });

  it('from a property of it, even inside a union there', async () => {
    const text = await types(doc({ X: { type: 'object', properties: { a: { oneOf: [{ $ref: '#/components/schemas/X' }, STRING] } } } }));
    expect(text).toContain('a?: components["schemas"]["X"] | string;');
  });

  it('is not one a sibling whose name starts the same reaches', async () => {
    const text = await types(doc({ X: STRING, XY: { type: 'array', items: { $ref: '#/components/schemas/X' } } }));
    expect(text).toContain('XY: components["schemas"]["X"][];');
  });
});

const wrapped = (target: unknown, ref = '#/components/schemas/E'): unknown => doc({ E: target, W: { allOf: [{ $ref: ref }], required: ['code'] } });

describe('required keys of a referenced allOf member', () => {
  const object = { type: 'object', properties: { code: STRING } };

  it('are checked against a target that may be null without its null', async () => {
    expect(await types(wrapped({ ...object, nullable: true }))).toContain('WithRequired<NonNullable<components["schemas"]["E"]>, "code">');
    expect(await types(wrapped({ ...object, type: ['object', 'null'] }))).toContain('WithRequired<NonNullable<components["schemas"]["E"]>, "code">');
  });

  it('are checked against an optional property without its undefined', async () => {
    const text = await types(doc({ H: { type: 'object', properties: { e: object } }, W: { allOf: [{ $ref: '#/components/schemas/H/properties/e' }], required: ['code'] } }));
    expect(text).toContain('WithRequired<NonNullable<components["schemas"]["H"]["e"]>, "code">');
  });

  it('are checked against a target that is never null as upstream writes it', async () => {
    expect(await types(wrapped(object))).toContain('WithRequired<components["schemas"]["E"], "code">');
  });
});

describe('`type: null` beside a composition', () => {
  it('reads as "or null"', async () => {
    expect(await types(doc({ U: { type: 'null', anyOf: [STRING, { type: 'number' }] } }))).toContain('U: (string | number) | null;');
    expect(await types(doc({ U: { type: 'null', oneOf: [STRING, { type: 'number' }] } }))).toContain('U: (string | number) | null;');
  });

  it('alone is null', async () => {
    expect(await types(doc({ U: { type: 'null' } }))).toContain('U: null;');
  });
});

const op = (parameters: unknown[]): unknown => ({ parameters, responses: { '204': { description: 'ok' } } });

const reused = (parameters: unknown[], components: Record<string, unknown> = {}): unknown => ({
  openapi: '3.0.3',
  info: { title: 't', version: '1' },
  components,
  paths: { '/a/{id}': { get: op(parameters) }, '/b/{id}': { get: op([{ $ref: '#/paths/~1a~1{id}/get/parameters/0' }]) } },
});

describe('a parameter reused from another operation', () => {
  it('is read through its group, as written, when something in the group is required', async () => {
    const text = await types(
      reused([{ name: 'q', in: 'query', schema: STRING }, { $ref: '#/components/parameters/R' }], { parameters: { R: { name: 'r', in: 'query', required: true, schema: STRING } } }),
    );
    expect(text).toContain('q?: paths["/a/{id}"]["get"]["parameters"]["query"]["q"];');
  });

  it('is read through `NonNullable` when nothing in its group is required', async () => {
    const text = await types(reused([{ name: 'q', in: 'query', schema: STRING }]));
    expect(text).toContain('q?: NonNullable<paths["/a/{id}"]["get"]["parameters"]["query"]>["q"];');
  });

  it('in the path is never optional', async () => {
    const text = await types(reused([{ name: 'id', in: 'path', schema: STRING }]));
    expect(text).toContain('id: paths["/a/{id}"]["get"]["parameters"]["path"]["id"];');
  });
});

describe('a reference past a component that lands on another `$ref` (upstream "$defs are respected")', () => {
  it('names where the chain ends', async () => {
    const text = await types(
      doc({
        Target: STRING,
        Holder: { type: 'object', $defs: { d: { $ref: '#/components/schemas/Target' }, e: { $ref: '#/components/schemas/Holder/$defs/d' } } },
        B: { type: 'object', properties: { x: { $ref: '#/components/schemas/Holder/$defs/d' }, y: { $ref: '#/components/schemas/Holder/$defs/e' } } },
      }),
    );
    expect(text).toContain('x?: components["schemas"]["Target"];');
    expect(text).toContain('y?: components["schemas"]["Target"];');
  });

  it('keeps a reference to a component that is itself a `$ref`, as upstream writes it', async () => {
    const text = await types(doc({ Target: STRING, Alias: { $ref: '#/components/schemas/Target' }, B: { type: 'object', properties: { x: { $ref: '#/components/schemas/Alias' } } } }));
    expect(text).toContain('x?: components["schemas"]["Alias"];');
  });

  it('stops where the next reference leaves the document', () => {
    const document = { a: { $ref: 'other.json#/b' }, b: { $ref: '#/c' }, c: 1 };
    expect(lastRef(document, '#/a')).toBe('#/a');
    expect(lastRef(document, '#/b')).toBe('#/c');
  });

  it('stops at a chain that circles', async () => {
    const text = await types(
      doc({
        Holder: { type: 'object', $defs: { a: { $ref: '#/components/schemas/Holder/$defs/b' }, b: { $ref: '#/components/schemas/Holder/$defs/a' } } },
        B: { type: 'object', properties: { x: { $ref: '#/components/schemas/Holder/$defs/a' } } },
      }),
    );
    expect(text).toContain('x?: components["schemas"]["Holder"]["$defs"]["b"];');
  });
});
