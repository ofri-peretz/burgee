/**
 * The generator at its edges: boundaries, defaults, and the pointer each nested transform is handed.
 * Every expectation was read against openapi-typescript 7.13.0's source, rule by rule; where that
 * source is surprising, the case says so.
 */
import { describe, expect, it } from 'vitest';

import { type Statement } from './gen-ts-ast.js';
import { transformSchema as documentStatements } from './gen-ts-document.js';
import {
  type Context,
  type Discriminators,
  GenerateError,
  type GenerateOptions,
  createContext,
  createRef,
  generate,
  makeApiPathsEnum,
  resolveRef,
  scanDiscriminators,
  transformHeaderObject,
  transformOperationObject,
  transformPathItemObject,
  transformPathsObject,
  transformRequestBodyObject,
  transformResponseObject,
  transformSchema,
  transformSchemaObject,
  transformWebhooksObject,
} from './gen-ts-index.js';

const text = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join('');

const SUBJECT = '#/components/schemas/Subject';

const schemaText = (given: unknown, options: GenerateOptions = {}, path: string | undefined = SUBJECT): string =>
  transformSchemaObject(given, { path, ctx: createContext({}, options) });

const footerNames = (ctx: Context): string[] => ctx.injectFooter.map((statement: Statement) => statement.name);

const enums = (): Context => createContext({}, { enum: true });

/** The values array a lone enum at `path` declares, as it is printed. */
const declared = (path: string): string => {
  const ctx = createContext({}, { enumValues: true });
  transformSchemaObject({ enum: ['x'] }, { path, ctx });
  const file = transformSchema({}, ctx);
  return file.slice(file.indexOf('export const'), file.indexOf('export type operations'));
};

/** The enums a document with these schemas declares when it deduplicates them. */
const enumsOf = (schemas: unknown): string => {
  const file = generate({ openapi: '3.1.0', components: { schemas } }, { enum: true, dedupeEnums: true });
  return file.slice(file.indexOf('export enum'), file.indexOf('export type operations'));
};

const operation = (parameters: unknown, options: GenerateOptions, path: string | undefined = '#/x'): string =>
  transformOperationObject({ parameters }, { path, ctx: createContext({}, options) });

/** The key a path is printed under when path parameters are types. */
const key = (url: string, parameters: unknown): string | undefined =>
  transformPathsObject({ [url]: { parameters } }, createContext({}, { pathParamsAsTypes: true })).split('\n')[1];

const thrownBy = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

const EMPTY_ROOTS = [
  'export type paths = Record<string, never>;',
  'export type webhooks = Record<string, never>;',
  'export type components = Record<string, never>;',
  'export type $defs = Record<string, never>;',
  'export type operations = Record<string, never>;',
];

const NO_COMPONENTS = [
  'export interface components {',
  '    schemas: never;',
  '    responses: never;',
  '    parameters: never;',
  '    requestBodies: never;',
  '    headers: never;',
  '    pathItems: never;',
  '}',
];

describe('unions', () => {
  it('keeps a repeated `unknown` and a repeated `true`: only primitives are deduplicated', () => {
    expect(schemaText({ oneOf: [{}, {}] })).toBe('unknown | unknown\n');
    expect(schemaText({ oneOf: [{ const: true }, { const: true }, { type: 'string' }, { type: 'string' }] })).toBe('true | true | string\n');
  });

  it('parenthesises an intersection that is an array element', () => {
    const given = { type: 'array', items: { allOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }] } };
    expect(schemaText(given)).toBe('(components["schemas"]["A"] & components["schemas"]["B"])[]\n');
  });

  it.each([
    ['boolean', 'string | boolean'],
    ['number', 'string | number'],
    ['integer', 'string | number'],
    ['null', 'string | null'],
  ])('leaves `%s` to the `oneOf` that already lists it', (type, expected) => {
    expect(schemaText({ type: [type, 'string'], oneOf: [{ type }] })).toBe(`${expected}\n`);
  });

  it('reads a `null` among the types as null, written as a word or as the value', () => {
    expect(schemaText({ type: ['string', null] })).toBe('string | null\n');
    // The word is `null` outright: the schema's other keywords are not applied to it.
    expect(schemaText({ type: ['null', 'string'], anyOf: [{ type: 'number' }] })).toBe('(null | (string | number)) | number\n');
  });

  it('adds null to an enum that is nullable, in either spelling', () => {
    expect(schemaText({ type: 'string', enum: ['a'] })).toBe('"a"\n');
    expect(schemaText({ type: 'string', nullable: true, enum: ['a'] })).toBe('"a" | null\n');
    expect(schemaText({ type: ['string', 'null'], enum: ['a'] })).toBe('"a" | null\n');
  });
});

describe('array lengths', () => {
  const strings = { type: 'array', items: { type: 'string' } };
  const pair = ['[', '    string,', '    string,', '    ...string[]', ']'];

  it('are left alone unless `arrayLength` is on', () => {
    expect(schemaText({ ...strings, minItems: 1, maxItems: 2 })).toBe('string[]\n');
  });

  it.each([
    ['a minimum of 30, where the tuple budget ends', { minItems: 30 }, ['string[]']],
    ['a minimum that is not a number', { minItems: '2' }, ['string[]']],
    ['bounds that sum to 30 elements exactly', { minItems: 4, maxItems: 8 }, ['string[]']],
    ['a minimum past the budget with a maximum below it', { minItems: 40, maxItems: 1 }, ['string[]']],
    ['a maximum of zero under a minimum: the maximum is ignored', { minItems: 2, maxItems: 0 }, pair],
    ['a maximum of one', { maxItems: 1 }, ['[', '] | [', '    string', ']']],
    ['a positive maximum below the minimum: no length is left', { minItems: 3, maxItems: 2 }, ['never']],
    // Upstream counts the tuples from zero elements, not from the minimum: reproduced, 17 elements being under the budget.
    ['a maximum above a positive minimum, as upstream counts it', { minItems: 8, maxItems: 9 }, ['[', '] | [', '    string', ']']],
  ])('%s', (_, bounds, want) => {
    expect(schemaText({ ...strings, ...bounds }, { arrayLength: true })).toBe(text(want));
  });
});

describe('comments', () => {
  it('trims a default and an example, and spells a null out', () => {
    const given = {
      type: 'object',
      properties: {
        padded: { type: 'string', default: '  x  ', example: ' y ', examples: [' z '] },
        none: { type: 'string', default: null, example: null, examples: [null] },
      },
    };
    expect(schemaText(given)).toBe(
      text([
        '{',
        '    /**',
        '     * @default x',
        '     * @example y',
        '     * @example z',
        '     */',
        '    padded: string;',
        '    /**',
        '     * @default null',
        '     * @example null',
        '     * @example null',
        '     */',
        '    none: string;',
        '}',
      ]),
    );
  });

  // A line separator ends a comment line for the printer but not for the comment's own layout, so
  // what follows it is re-indented by its own leading blanks: a tab reaches the next stop of four.
  it('re-indents the lines a line separator starts, each by its own leading blanks', () => {
    const given = { type: 'object', properties: { a: { type: 'string', title: 'a  Very', description: 'x \vb  \tc \td' } } };
    expect(schemaText(given)).toBe(
      text(['{', '    /**', '     * a', '    Very', '     * @description x', '     b', '        c', '        d', '     */', '    a?: string;', '}']),
    );
  });

  it('trims the first line of a comment that a line separator splits', () => {
    const given = { type: 'object', properties: { a: { type: 'string', title: 'a  Very' } } };
    expect(schemaText(given)).toBe(text(['{', '    /** a', '    Very */', '    a?: string;', '}']));
  });
});

describe('discriminators in a schema', () => {
  const child = { allOf: [{ type: 'object' }] };

  it('finds the value a mapping gives a schema named without a pointer, wherever it stands in the mapping', () => {
    const discriminators: Discriminators = {
      objects: { '#/components/schemas/Dog': { propertyName: 'kind', mapping: { cat: 'Cat', dog: 'Dog' } } },
      refsHandled: [],
    };
    const ctx = createContext({}, {}, discriminators);
    expect(transformSchemaObject(child, { path: '#/components/schemas/Dog', ctx })).toBe(text(['{', '    kind: "dog";', '} & Record<string, never>']));
  });

  // Upstream looks a schema with no path up under the empty string, where a caller's own context may hold one.
  it('looks a schema with no path up under the empty pointer', () => {
    const ctx = createContext({}, {}, { objects: { '': { propertyName: 'kind' } }, refsHandled: [] });
    expect(transformSchemaObject(child, { ctx })).toBe(text(['{', '    kind: unknown;', '} & Record<string, never>']));
  });
});

describe('the pointer a nested transform is handed, read from the enum it names', () => {
  const named = { schema: { enum: ['x'] } };
  const query = [{ in: 'query', name: 'q', ...named }];

  it('a definition under `$defs`, a single one included', () => {
    const ctx = enums();
    expect(transformSchemaObject({ $defs: { Color: { enum: ['a'] } } }, { path: SUBJECT, ctx })).toBe(
      text(['{', '    $defs: {', '        /** @enum {unknown} */', '        Color: Subject$defsColor;', '    };', '}']),
    );
    expect(footerNames(ctx)).toEqual(['Subject$defsColor']);
  });

  it('the `$defs` root of a document', () => {
    const given = { openapi: '3.1.0', $defs: { $defs: { Color: { type: 'string', enum: ['a'] } } } };
    expect(generate(given, { enum: true })).toBe(
      text([
        ...EMPTY_ROOTS.slice(0, 2),
        ...NO_COMPONENTS,
        'export interface $defs {',
        '    $defs: {',
        '        /** @enum {string} */',
        '        Color: $defs$defsColor;',
        '    };',
        '}',
        'export enum $defs$defsColor {',
        '    a = "a"',
        '}',
        'export type operations = Record<string, never>;',
      ]),
    );
  });

  it('a media type of a header, under the header and under no path at all', () => {
    const header = { content: { 'a/b': named } };
    expect(transformHeaderObject(header, { path: '#/components/headers/H', ctx: enums() })).toBe(text(['{', '    "a/b": ComponentsHeadersHAB;', '}']));
    expect(transformHeaderObject(header, { ctx: enums() })).toBe(text(['{', '    "a/b": AB;', '}']));
  });

  it('a media type of a request body', () => {
    expect(transformRequestBodyObject({ content: { 'a/b': named } }, { path: '#/x', ctx: enums() })).toBe(
      text(['{', '    content: {', '        "a/b": XContentAB;', '    };', '}']),
    );
  });

  it('a header of a response', () => {
    expect(transformResponseObject({ headers: { 'X-A': named } }, { path: '#/x', ctx: enums() })).toBe(
      text(['{', '    headers: {', '        "X-A"?: XHeadersXA;', '        [name: string]: unknown;', '    };', '    content?: never;', '}']),
    );
  });

  it('a parameter a path item shares, in paths and in webhooks', () => {
    const pathCtx = enums();
    transformPathItemObject({ parameters: query }, { path: '#/paths/~1a', ctx: pathCtx });
    expect(footerNames(pathCtx)).toEqual(['PathsAParametersParametersQueryQ']);
    const hookCtx = enums();
    transformWebhooksObject({ hook: { parameters: query } }, hookCtx);
    expect(footerNames(hookCtx)).toEqual(['WebhooksHookParametersParametersQueryQ']);
  });
});

describe('enum values', () => {

  it('steps over a union index of several digits, and reaches a name that only starts or ends with one through Extract', () => {
    expect(declared('#/components/schemas/S/oneOf/10/properties/1a/properties/b2')).toBe(
      text([
        'export const sOneOf10Properties1aPropertiesB2Values: ReadonlyArray<Extract<Extract<FlattenedDeepRequired<components>["schemas"]["S"], {',
        '    1a: unknown;',
        '}>["1a"], {',
        '    b2: unknown;',
        '}>["b2"]> = ["x"];',
      ]),
    );
  });

  it('indexes a property called `0` or `oneOf` plainly, after a union step too', () => {
    expect(declared('#/components/schemas/S/oneOf/0/properties/0/properties/oneOf/properties/a')).toBe(
      text([
        'export const sOneOf0Properties0PropertiesOneOfPropertiesAValues: ReadonlyArray<Extract<FlattenedDeepRequired<components>["schemas"]["S"]["0"]["oneOf"], {',
        '    a: unknown;',
        '}>["a"]> = ["x"];',
      ]),
    );
  });
});

describe('deduplicated enums', () => {

  it('keeps apart enums whose members are described differently', () => {
    const schemas = {
      A: { enum: ['a'], 'x-enum-descriptions': ['x'] },
      B: { enum: ['a'], 'x-enum-descriptions': ['y'] },
      C: { enum: ['a'], 'x-enum-descriptions': ['x'] },
    };
    expect(enumsOf(schemas)).toBe(text(['export enum A {', '    // x', '    a = "a"', '}', 'export enum B {', '    // y', '    a = "a"', '}']));
  });

  it('keeps apart two members and one member spelled like both', () => {
    expect(enumsOf({ A: { enum: ['a', 'b'] }, B: { enum: ['a:b'] } })).toBe(
      text(['export enum A {', '    a = "a",', '    b = "b"', '}', 'export enum B {', '    a_b = "a:b"', '}']),
    );
  });
});

describe('a document', () => {
  it.each([['text'], [null]])('prints a root that is %j as empty', (components) => {
    expect(transformSchema({ components }, createContext({}))).toBe(text(EMPTY_ROOTS));
  });

  it('leaves deprecated components out when asked to', () => {
    const schemas = { Old: { type: 'string', deprecated: true }, New: { type: 'string' } };
    expect(generate({ openapi: '3.1.0', components: { schemas } }, { excludeDeprecated: true })).toBe(
      text([
        ...EMPTY_ROOTS.slice(0, 2),
        'export interface components {',
        '    schemas: {',
        '        New: string;',
        '    };',
        ...NO_COMPONENTS.slice(2),
        ...EMPTY_ROOTS.slice(3),
      ]),
    );
  });

  // Only a schema becomes a TypeScript enum, so only a schema's root alias would repeat one.
  it('gives a component that merely looks like an enum its root alias, unless it is a schema', () => {
    const components = { headers: { Kind: { enum: ['a'] } }, schemas: { Color: { enum: ['a'] } } };
    const file = generate({ openapi: '3.1.0', components }, { enum: true, rootTypes: true });
    expect(file.split('\n').filter((line) => line.startsWith('export type '))).toEqual([
      'export type paths = Record<string, never>;',
      'export type webhooks = Record<string, never>;',
      "export type HeaderKind = components['headers']['Kind'];",
      'export type $defs = Record<string, never>;',
      'export type operations = Record<string, never>;',
    ]);
  });

  it('finds the operations interface behind an enum that was hoisted before it', () => {
    const shared = [{ in: 'query', name: 'q', schema: { enum: ['x'] } }];
    const file = generate({ openapi: '3.1.0', paths: { '/a': { parameters: shared, get: { operationId: 'getA' } } } }, { enum: true });
    expect(file.slice(file.indexOf('export type $defs'))).toBe(
      text([
        'export type $defs = Record<string, never>;',
        'export enum PathsAParametersParametersQueryQ {',
        '    x = "x"',
        '}',
        'export interface operations {',
        '    getA: {',
        '        parameters: {',
        '            query?: {',
        '                q?: PathsAGetParametersQueryQ;',
        '            };',
        '            header?: never;',
        '            path?: never;',
        '            cookie?: never;',
        '        };',
        '        requestBody?: never;',
        '        responses: never;',
        '    };',
        '}',
        'export enum PathsAGetParametersQueryQ {',
        '    x = "x"',
        '}',
      ]),
    );
  });

  it('names each helper it declares', () => {
    const ctx = createContext({ A: { properties: { a: {} } } });
    expect(transformSchemaObject({ required: ['a'], allOf: [{ $ref: '#/A' }] }, { path: '#/x', ctx })).toBe('WithRequired<A, "a">\n');
    expect(footerNames(ctx)).toEqual(['WithRequired']);
    const statements = documentStatements({}, createContext({}, { readWriteMarkers: true }));
    expect(statements.map((statement) => statement.name)).toEqual(['$Read', 'paths', 'webhooks', 'components', '$defs', 'operations']);
  });

  it('fails with an error that carries its own name', () => {
    const failure = thrownBy(() => generate('text'));
    expect(failure).toBeInstanceOf(GenerateError);
    expect((failure as Error).name).toBe('GenerateError');
  });
});

describe('createContext', () => {
  it('starts with no discriminators and every option at its default', () => {
    const ctx = createContext({});
    expect(ctx.discriminators).toStrictEqual({ objects: {}, refsHandled: [] });
    expect(ctx.arrayLength).toBe(false);
    expect(ctx.defaultNonNullable).toBe(true);
  });

  it('drops an option it does not know, and keeps the default of one given as undefined', () => {
    const options = { silent: true, immutable: undefined, defaultNonNullable: undefined } as unknown as GenerateOptions;
    const ctx = createContext({}, options);
    expect(Object.keys(ctx).toSorted()).toEqual(Object.keys(createContext({})).toSorted());
    expect(ctx.immutable).toBe(false);
    expect(ctx.defaultNonNullable).toBe(true);
  });
});

describe('parameters', () => {
  const never = ['    header?: never;', '    path?: never;', '    cookie?: never;', '};', 'requestBody?: never;', 'responses: never;'];

  it('keeps a deprecated parameter unless told to leave it out', () => {
    expect(operation([{ in: 'query', name: 'old', deprecated: true }], {})).toBe(
      text(['parameters: {', '    query?: {', '        /** @deprecated */', '        old?: string;', '    };', ...never]),
    );
  });

  it.each([
    ['first', [{ in: 'query' }, { in: 'query', name: 'b' }]],
    ['last', [{ in: 'query', name: 'b' }, { in: 'query' }]],
  ])('sorts a parameter with no name before the named ones, given %s', (_, parameters) => {
    expect(operation(parameters, { alphabetize: true })).toBe(
      text(['parameters: {', '    query?: {', '        "undefined"?: string;', '        b?: string;', '    };', ...never]),
    );
  });

  it('adds the path parameter a URL names when only a query parameter has that name', () => {
    expect(operation([{ in: 'query', name: 'id' }], { generatePathParams: true }, '#/paths/~1a~1{id}/get')).toBe(
      text([
        'parameters: {',
        '    query?: {',
        '        id?: string;',
        '    };',
        '    header?: never;',
        '    path: {',
        '        id: string;',
        '    };',
        '    cookie?: never;',
        '};',
        'requestBody?: never;',
        'responses: never;',
      ]),
    );
  });

  it('has no URL to read path parameters from when it is given no path', () => {
    expect(transformOperationObject({}, { ctx: createContext({}, { generatePathParams: true }) })).toBe(text(['parameters: {', '    query?: never;', ...never]));
  });

  it('indexes a referenced parameter by location and name only at the end of a long pointer', () => {
    const document = { paths: { '/a': { get: { parameters: [{ in: 'query', name: 'q', required: true }] } } } };
    const ctx = createContext(document);
    expect(transformOperationObject({ parameters: [{ $ref: '#/paths/~1a/get/parameters/0' }] }, { path: '#/paths/~1b/get', ctx })).toBe(
      text(['parameters: {', '    query: {', '        q: paths["/a"]["get"]["parameters"]["query"]["q"];', '    };', ...never]),
    );
  });
});

describe('paths as template literal types', () => {

  it.each([
    ['integer', 'number'],
    ['number', 'number'],
    ['boolean', 'boolean'],
    ['string', 'string'],
  ])('a path parameter of type %s is `${%s}`', (type, expected) => {
    expect(key('/a/{id}', [{ in: 'path', name: 'id', schema: { type } }])).toBe(`    [path: \`/a/\${${expected}}\`]: {`);
  });

  it('reads the type from the path parameter, not from a query parameter of the same name', () => {
    const parameters = [
      { in: 'path', name: 'id', schema: { type: 'integer' } },
      { in: 'query', name: 'id', schema: { type: 'boolean' } },
    ];
    expect(key('/a/{id}', parameters)).toBe('    [path: `/a/${number}`]: {');
  });

  it('takes a parameter nothing declares for a string', () => {
    expect(key('/a/{id}', [])).toBe('    [path: `/a/${string}`]: {');
  });

  // What `/\{[^}]+\}/g` matched, now found by index: read once however many braces a path has.
  it.each([
    ['/a/{}/{id}', '    [path: `/a/{}/${string}`]: {'],
    ['/a/{', '    "/a/{": {'],
    ['/a/{{{{', '    "/a/{{{{": {'],
    ['/a/{x}/{', '    [path: `/a/${string}/{`]: {'],
    ['/a/{x{y}', '    [path: `/a/${string}`]: {'],
  ])('reads the braces of %s as the pattern upstream uses would', (url, expected) => {
    expect(key(url, [])).toBe(expected);
  });

  it.each(['/a', '/a/{'])('keeps %s, which names no parameter, as a plain key', (url) => {
    expect(key(url, [])).toBe(`    "${url}": {`);
  });
});

describe('makeApiPathsEnum', () => {
  it('drops a whole run of characters a name cannot hold', () => {
    expect(makeApiPathsEnum({ '/a--b': { get: {} } })).toBe(text(['export enum ApiPaths {', '    GetAb = "/a--b"', '}']));
  });
});

describe('references', () => {
  it('joins a part that is a pointer of one token', () => {
    expect(createRef(['#/a', 'b'])).toBe('#/a/b');
  });

  it('resolves a reference with no tokens to nothing, even in a document with an empty key', () => {
    expect(resolveRef({ '': { x: 1 } }, '#')).toBeUndefined();
  });

  it.each([
    ['through a null', '#/none/x'],
    ['through text, to a member only its prototype has', '#/word/length'],
    ['to a member the document only inherits', '#/constructor'],
  ])('resolves a reference %s to nothing', (_, ref) => {
    expect(resolveRef({ none: null, word: 'text' }, ref)).toBeUndefined();
  });

  it('resolves a reference to itself to nothing', () => {
    expect(resolveRef({ a: { $ref: '#/a' } }, '#/a')).toBeUndefined();
  });
});

describe('scanDiscriminators at its edges', () => {
  const added = { type: 'string', description: 'discriminator enum property added by openapi-typescript' };

  it('walks into arrays, and adds the property to a mapped schema that is an `allOf`', () => {
    const document = {
      components: {
        schemas: {
          A: { anyOf: [{ oneOf: [{ $ref: '#/components/schemas/Cat' }], discriminator: { propertyName: 'kind' } }] },
          Cat: { allOf: [{ type: 'object' }] },
        },
      },
    };
    expect(scanDiscriminators(document)).toEqual({
      objects: { '#/components/schemas/A/anyOf/0': { propertyName: 'kind' } },
      refsHandled: ['#/components/schemas/Cat'],
    });
    expect(document.components.schemas.Cat.allOf).toEqual([
      { type: 'object' },
      { type: 'object', required: ['kind'], properties: { kind: { ...added, enum: ['Cat'] } } },
    ]);
  });

  it('leaves alone a mapped schema that is not an object, one that is missing, and a key already required', () => {
    const document = {
      Pet: { oneOf: [{ $ref: '#/Cat' }, { $ref: '#/Dog' }, { $ref: '#/Gone' }], discriminator: { propertyName: 'kind' } },
      Cat: { type: 'string' },
      Dog: { type: 'object', required: ['kind'] },
    };
    expect(scanDiscriminators(document)).toEqual({ objects: { '#/Pet': { propertyName: 'kind' } }, refsHandled: ['#/Dog'] });
    expect(document.Cat).toEqual({ type: 'string' });
    expect(document.Dog).toEqual({ type: 'object', required: ['kind'], properties: { kind: { ...added, enum: ['Dog'] } } });
  });

  it('ignores a discriminator with an empty property name', () => {
    const document = { A: { discriminator: { propertyName: '' }, oneOf: [{ $ref: '#/Cat' }] }, Cat: { type: 'object' } };
    expect(scanDiscriminators(document)).toEqual({ objects: {}, refsHandled: [] });
    expect(document.Cat).toEqual({ type: 'object' });
  });

  it('skips a `oneOf` member whose reference is not text, or names nothing', () => {
    const document = { A: { discriminator: { propertyName: 'k' }, oneOf: [{ $ref: 5 }, { $ref: '#/Cat/' }, {}] }, Cat: { type: 'object' } };
    expect(scanDiscriminators(document)).toEqual({ objects: { '#/A': { propertyName: 'k' } }, refsHandled: [] });
    expect(document.Cat).toEqual({ type: 'object' });
  });

  it('writes what it finds as ordinary members: listed, writable and deletable', () => {
    const { objects } = scanDiscriminators({ A: { discriminator: { propertyName: 'k' } } });
    expect(Object.getOwnPropertyDescriptor(objects, '#/A')).toEqual({ value: { propertyName: 'k' }, enumerable: true, writable: true, configurable: true });
  });
});
