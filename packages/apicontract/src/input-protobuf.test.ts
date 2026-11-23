import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type Contract } from './core/model.js';
import { compareContracts } from './diff-contract.js';
import { adapter, detect, ProtobufError, read } from './input-protobuf.js';
import { builtinAdapters } from './inputs.js';
import { generateValidators } from './plugin-validator.js';

const IMAGE = JSON.parse(readFileSync(new URL('__fixtures__/inputs/protobuf/pets.image.json', import.meta.url), 'utf8')) as unknown;

/** An image of one file, `p.proto` in package `p`, with these messages and one service. */
const image = (file: object): object => ({ file: [{ name: 'p.proto', package: 'p', ...file }] });
const method = (name: string, extra: object = {}): object => ({ name, inputType: '.p.M', outputType: '.p.M', ...extra });
const field = (name: string, number: number, extra: object): object => ({ name, number, label: 'LABEL_OPTIONAL', ...extra });

/** The property schema without its field number. */
const strip = (schema: Record<string, unknown>): unknown => Object.fromEntries(Object.entries(schema).filter(([key]) => key !== 'x-protobuf-field'));

/** The fixture with the `Pet` message's fields changed. */
const changed = (fields: (list: Record<string, unknown>[]) => Record<string, unknown>[]): Contract => {
  const copy = structuredClone(IMAGE) as { file: { messageType: { field: Record<string, unknown>[] }[] }[] };
  const pet = copy.file[1]?.messageType[0] as { field: Record<string, unknown>[] };
  pet.field = fields(pet.field);
  return read(copy);
};

describe('detect', () => {
  it('recognises a buf image as JSON', () => {
    expect(detect(IMAGE)).toBe(true);
    expect(detect({ file: [{ name: 'a.proto' }] })).toBe(true);
  });

  it('declines anything else, and never throws', () => {
    for (const other of [null, [], {}, { file: [] }, { file: {} }, { file: [{ name: 'a.json' }] }, { file: [{ name: 1 }] }, { file: [null] }, { file: [{ name: 'a.proto' }, 'b.proto'] }]) {
      expect(detect(other)).toBe(false);
    }
  });

  it('comes before JSON Schema, which reads almost any object', () => {
    const names = Object.keys(builtinAdapters);
    expect(names.indexOf('protobuf')).toBeLessThan(names.indexOf('jsonschema'));
    expect(adapter).toMatchObject({ name: 'protobuf', detect, read });
  });
});

describe('read', () => {
  it('refuses what is not an image, naming how to make one', () => {
    expect(() => read({ openapi: '3.1.0' })).toThrow(ProtobufError);
    expect(() => read({})).toThrow(expect.objectContaining({ name: 'ProtobufError' }));
    expect(() => read({})).toThrow('not a buf image: it has no `file` list of `.proto` file descriptors. fix: pass the JSON image `buf build -o image.json` writes, or a `.proto` file for buf to build');
  });

  it('reads each method of the files that are not imports as an operation with a request and a response', () => {
    const contract = read(IMAGE);
    expect(contract.format).toBe('protobuf');
    // The document is the image, untouched, with the messages read as JSON Schemas beside it.
    expect(contract.document).toMatchObject(IMAGE as object);
    expect(IMAGE).not.toHaveProperty('$defs');
    expect(contract.operations.map((operation) => [operation.id, operation.source])).toStrictEqual([
      ['pets.v1.PetService.GetPet', '/file/1/service/0/method/0'],
      ['pets.v1.PetService.WatchPets', '/file/1/service/0/method/1'],
      ['pets.v1.PetService.Ping', '/file/1/service/0/method/2'],
    ]);
    const [get] = contract.operations;
    expect(get?.payloads.map(({ name, direction, required }) => [name, direction, required])).toStrictEqual([
      ['request', 'request', true],
      ['response', 'response', true],
    ]);
    expect(get?.payloads.map((payload) => payload.schema)).toStrictEqual([{ $ref: '#/$defs/pets.v1.GetPetRequest' }, { $ref: '#/$defs/pets.v1.Pet' }]);
  });

  it('writes each message a payload reaches as the proto3 JSON mapping does, recursion included, and no other', () => {
    expect((read(IMAGE).document as { $defs: unknown }).$defs).toStrictEqual({
        'pets.v1.WatchPetsRequest': { type: 'object', properties: {}},
        'pets.v1.GetPetRequest': { type: 'object', properties: { id: { type: ['string', 'integer'], 'x-protobuf-field': 1 } }},
        'pets.v1.Pet': {
          type: 'object',
          properties: {
            id: { type: ['string', 'integer'], 'x-protobuf-field': 1 },
            displayName: { type: 'string', 'x-protobuf-field': 2 },
            kind: { $ref: '#/$defs/pets.v1.Pet.Kind', 'x-protobuf-field': 3 },
            tags: { type: 'array', items: { type: 'string' }, 'x-protobuf-field': 4 },
            born: { type: 'string', format: 'date-time', 'x-protobuf-field': 5 },
            labels: { type: 'object', additionalProperties: { type: 'integer' }, 'x-protobuf-field': 6 },
            parent: { $ref: '#/$defs/pets.v1.Pet', 'x-protobuf-field': 7 },
            photo: { type: 'string', contentEncoding: 'base64', 'x-protobuf-field': 8 },
            weight: { type: 'number', 'x-protobuf-field': 9 },
            age: { type: 'integer', 'x-protobuf-field': 10 },
            alive: { type: 'boolean', 'x-protobuf-field': 11 },
          },
                  },
        'pets.v1.Pet.Kind': { enum: ['KIND_UNSPECIFIED', 'KIND_DOG'] },
    });
  });

  it('writes a well-known type inline, as a payload too', () => {
    expect(read(IMAGE).operations[2]?.payloads[0]?.schema).toStrictEqual({ type: 'object'});
  });

  it('says what the model cannot carry: a stream, Any, a group, a type the image lacks', () => {
    expect(read(IMAGE).findings).toStrictEqual([
      {
        code: 'stream-read-as-message',
        pointer: '/file/1/service/0/method/1',
        message: '`pets.v1.PetService.WatchPets` streams its response: one message of it is read',
        fix: "diff and lint judge the message; a change to streaming itself is buf's to judge (`diff --level`)",
      },
    ]);
    const contract = read(
      image({
        messageType: [
          {
            name: 'M',
            field: [
              field('any', 1, { type: 'TYPE_MESSAGE', typeName: '.google.protobuf.Any' }),
              field('gone', 2, { type: 'TYPE_MESSAGE', typeName: '.q.Gone' }),
              field('legacy', 3, { type: 'TYPE_GROUP', typeName: '.p.M.Legacy' }),
              field('must', 4, { type: 'TYPE_STRING', label: 'LABEL_REQUIRED' }),
            ],
            nestedType: [{ name: 'Legacy' }],
          },
        ],
        service: [{ name: 'S', method: [method('Up', { clientStreaming: true })] }],
      }),
    );
    expect(contract.findings?.map(({ code, pointer }) => [code, pointer])).toStrictEqual([
      ['stream-read-as-message', '/file/0/service/0/method/0'],
      ['any-payload-unread', '/file/0/messageType/0/field/0'],
      ['type-not-found', '/file/0/messageType/0/field/1'],
      ['group-read-as-message', '/file/0/messageType/0/field/2'],
    ]);
    expect(contract.findings?.slice(1).map(({ message, fix }) => [message, fix])).toStrictEqual([
      ['`google.protobuf.Any` is read as its `@type` only: the message it wraps is not known from the contract', 'name the wrapped type in a field of its own, or accept that it is not checked'],
      ['`q.Gone` is not in the image, so it is read as anything', 'build the image with its imports (`buf build` includes them unless `--exclude-imports` is given)'],
      ['`legacy` is a proto2 group, read as the message it declares', 'replace the group with a message field; groups are deprecated'],
    ]);
    expect(contract.findings?.[0]?.message).toBe('`p.S.Up` streams its request: one message of it is read');
    // Each message is read once, so a finding in one reached by both payloads is reported once.
    const schema = contract.document as { $defs: Record<string, { properties: object; required?: string[] }> };
    expect(schema.$defs['p.M']?.required).toStrictEqual(['must']);
    expect(Object.keys(schema.$defs)).toStrictEqual(['p.M', 'p.M.Legacy']);
    expect(schema.$defs['p.M']?.properties).toMatchObject({ any: { required: ['@type'] }, gone: { 'x-protobuf-field': 2 }, legacy: { $ref: '#/$defs/p.M.Legacy' } });
  });

  it('names an operation without a package by its service, and keys a field by its name when it has no JSON name', () => {
    const contract = read({ file: [{ name: 'p.proto', messageType: [{ name: 'M', field: [field('raw_name', 1, { type: 'TYPE_INT32' })] }], service: [{ name: 'S', method: [{ name: 'Do', inputType: '.M', outputType: '.M' }] }] }] });
    expect(contract.operations[0]?.id).toBe('S.Do');
    expect(contract.operations[0]?.payloads[0]?.schema).toStrictEqual({ $ref: '#/$defs/M' });
    expect((contract.document as { $defs: unknown }).$defs).toStrictEqual({ M: { type: 'object', properties: { raw_name: { type: 'integer', 'x-protobuf-field': 1 } }} });
    const empty = read({ file: [{ name: 'p.proto', package: '', messageType: [{ name: 'M' }], service: [{ name: 'S', method: [{ name: 'Do', inputType: '.M', outputType: '.M' }] }] }] });
    expect([empty.operations[0]?.id, empty.operations[0]?.payloads[0]?.schema, Object.keys((empty.document as { $defs: object }).$defs)]).toStrictEqual(['S.Do', { $ref: '#/$defs/M' }, ['M']]);
  });

  it('reads every well-known type as the mapping spells it', () => {
    const names = ['Timestamp', 'Duration', 'FieldMask', 'Struct', 'Value', 'ListValue', 'NullValue', 'Empty', 'Any', 'DoubleValue', 'FloatValue', 'Int32Value', 'UInt32Value', 'Int64Value', 'UInt64Value', 'BoolValue', 'StringValue', 'BytesValue'];
    const contract = read(image({ messageType: [{ name: 'M', field: names.map((name, index) => field(name, index + 1, { type: 'TYPE_MESSAGE', typeName: `.google.protobuf.${name}`, jsonName: name })) }], service: [{ name: 'S', method: [method('Do')] }] }));
    const properties = (contract.document as { $defs: { 'p.M': { properties: Record<string, Record<string, unknown>> } } }).$defs['p.M'].properties;
    expect(Object.fromEntries(Object.entries(properties).map(([key, schema]) => [key, strip(schema)]))).toStrictEqual({
      Timestamp: { type: 'string', format: 'date-time' },
      Duration: { type: 'string', pattern: String.raw`^-?\d+(\.\d+)?s$` },
      FieldMask: { type: 'string' },
      Struct: { type: 'object' },
      Value: {},
      ListValue: { type: 'array' },
      NullValue: { type: 'null' },
      Empty: { type: 'object' },
      Any: { type: 'object', properties: { '@type': { type: 'string' } }, required: ['@type'] },
      DoubleValue: { type: ['number', 'null'] },
      FloatValue: { type: ['number', 'null'] },
      Int32Value: { type: ['integer', 'null'] },
      UInt32Value: { type: ['integer', 'null'] },
      Int64Value: { type: ['string', 'integer', 'null'] },
      UInt64Value: { type: ['string', 'integer', 'null'] },
      BoolValue: { type: ['boolean', 'null'] },
      StringValue: { type: ['string', 'null'] },
      BytesValue: { type: ['string', 'null'], contentEncoding: 'base64' },
    });
  });

  it('reads every scalar type, and a repeated message', () => {
    const types = ['FLOAT', 'INT32', 'SINT32', 'SFIXED32', 'FIXED32', 'INT64', 'SINT64', 'SFIXED64', 'UINT64', 'FIXED64', 'STRING'];
    const fields = [...types.map((type, index) => field(type, index + 1, { type: `TYPE_${type}`, jsonName: type })), field('many', 20, { type: 'TYPE_MESSAGE', typeName: '.p.N', label: 'LABEL_REPEATED', jsonName: 'many' })];
    const contract = read(image({ messageType: [{ name: 'M', field: fields }, { name: 'N', options: { deprecated: true } }], service: [{ name: 'S', method: [method('Do')] }] }));
    const properties = (contract.document as { $defs: { 'p.M': { properties: Record<string, { type?: unknown; items?: unknown }> } } }).$defs['p.M'].properties;
    expect(Object.fromEntries(Object.entries(properties).map(([key, schema]) => [key, schema.type]))).toStrictEqual({
      FLOAT: 'number',
      INT32: 'integer',
      SINT32: 'integer',
      SFIXED32: 'integer',
      FIXED32: 'integer',
      INT64: ['string', 'integer'],
      SINT64: ['string', 'integer'],
      SFIXED64: ['string', 'integer'],
      UINT64: ['string', 'integer'],
      FIXED64: ['string', 'integer'],
      STRING: 'string',
      many: 'array',
    });
    expect(properties.many?.items).toStrictEqual({ $ref: '#/$defs/p.N' });
  });

  it('says when the image holds no service, and reads a map whose entry has no value field as anything-valued', () => {
    expect(read({ file: [{ name: 'p.proto', messageType: [{ name: 'M' }] }] })).toMatchObject({
      operations: [],
      findings: [{ code: 'no-service', pointer: '', message: 'the image declares no service, so there is no operation to read', fix: 'build the image from the files that declare your services' }],
    });
    const contract = read(
      image({
        messageType: [{ name: 'M', field: [field('m', 1, { type: 'TYPE_MESSAGE', typeName: '.p.M.E', label: 'LABEL_REPEATED' })], nestedType: [{ name: 'E', options: { mapEntry: true } }] }],
        service: [{ name: 'S', method: [method('Do')] }],
      }),
    );
    expect((contract.document as { $defs: { 'p.M': { properties: { m: unknown } } } }).$defs['p.M'].properties.m).toMatchObject({ type: 'object', additionalProperties: {} });
  });
});

describe('a protobuf contract, downstream', () => {
  it('generates a validator for every payload, its references resolved in the document', () => {
    const result = generateValidators(read(IMAGE));
    expect(result.files.map((file) => file.path)).toStrictEqual(['validators.ts']);
    expect(result.files[0]?.content).toContain('PetsV1PetServiceGetPet');
  });

  it('diffs two images on the JSON shape: a field whose type changes is breaking, one added is not, a deleted one is buf\'s to judge', () => {
    const old = read(IMAGE);
    const breaking = (nu: Contract): string[] => compareContracts(old, nu).findings.filter((finding) => finding.verdict === 'breaking').map((finding) => finding.operation);
    expect(breaking(changed((list) => list.map((each) => (each.name === 'alive' ? { ...each, type: 'TYPE_STRING' } : each))))).toContain('pets.v1.PetService.GetPet');
    expect(breaking(changed((list) => [...list, { name: 'nick', number: 12, label: 'LABEL_OPTIONAL', type: 'TYPE_STRING', jsonName: 'nick' }]))).toStrictEqual([]);
    // Every proto3 field is optional in JSON, so a deletion reads as compatible here; `diff --level` asks buf about the wire.
    expect(breaking(changed((list) => list.filter((each) => each.name !== 'alive')))).toStrictEqual([]);
  });

  it('points a payload\'s finding at its type, and skips anything in a list that is not an object', () => {
    const contract = read(image({ messageType: [{ name: 'M', field: [null, field('a', 1, { type: 'TYPE_BOOL' })] }], service: [null, { name: 'S', method: [{ name: 'Do', inputType: '.q.Gone', outputType: '.google.protobuf.Any' }] }] }));
    expect(contract.findings?.map(({ code, pointer }) => [code, pointer])).toStrictEqual([
      ['type-not-found', '/file/0/service/1/method/0/inputType'],
      ['any-payload-unread', '/file/0/service/1/method/0/outputType'],
    ]);
    expect(contract.operations[0]?.payloads.map((payload) => payload.schema)).toStrictEqual([{}, { type: 'object', properties: { '@type': { type: 'string' } }, required: ['@type'] }]);
    expect(contract.operations.map((operation) => operation.id)).toStrictEqual(['p.S.Do']);
    expect(read(image({ messageType: [{ name: 'M', field: [null, field('a', 1, { type: 'TYPE_BOOL' })] }], service: [{ name: 'S', method: [method('Do')] }] })).document).toMatchObject({ $defs: { 'p.M': { properties: { a: { type: 'boolean', 'x-protobuf-field': 1 } } } } });
    expect(Object.keys((read(image({ messageType: [{ name: 'M', field: [null] }], service: [{ name: 'S', method: [method('Do')] }] })).document as { $defs: { 'p.M': { properties: object } } }).$defs['p.M'].properties)).toStrictEqual([]);
  });

  it('reads the services of the files buf built, not of their imports', () => {
    const service = { name: 'S', method: [method('Do')] };
    const files = [
      { name: 'dep.proto', package: 'dep', service: [service], bufExtension: { isImport: true } },
      { name: 'own.proto', package: 'own', service: [service], bufExtension: { isImport: false } },
      { name: 'bare.proto', package: 'bare', service: [service], bufExtension: 'x' },
      { name: 'p.proto', package: 'p', messageType: [{ name: 'M' }] },
    ];
    expect(read({ file: files }).operations.map((operation) => operation.id)).toStrictEqual(['own.S.Do', 'bare.S.Do']);
  });

  it('keeps a oneof as a group of optional properties, says the schema does not enforce it, and passes over proto3 optional', () => {
    const contract = read(
      image({
        messageType: [
          {
            name: 'M',
            field: [field('cat', 1, { type: 'TYPE_STRING', oneofIndex: 0 }), field('dog', 2, { type: 'TYPE_STRING', oneofIndex: 0, jsonName: 'dogName' }), field('maybe', 3, { type: 'TYPE_INT32', oneofIndex: 1, proto3Optional: true }), field('lost', 4, { type: 'TYPE_BOOL', oneofIndex: 7 })],
            oneofDecl: [{ name: 'pet' }, { name: '_maybe' }],
          },
        ],
        service: [{ name: 'S', method: [method('Do')] }],
      }),
    );
    expect((contract.document as { $defs: Record<string, unknown> }).$defs['p.M']).toStrictEqual({
      type: 'object',
      properties: { cat: { type: 'string', 'x-protobuf-field': 1 }, dogName: { type: 'string', 'x-protobuf-field': 2 }, maybe: { type: 'integer', 'x-protobuf-field': 3 }, lost: { type: 'boolean', 'x-protobuf-field': 4 } },
      'x-protobuf-oneof': { pet: ['cat', 'dogName'], undefined: ['lost'] },
    });
    expect(contract.findings).toStrictEqual([
      { code: 'oneof-not-enforced', pointer: '/file/0/messageType/0/oneofDecl/0', message: '`p.M.pet` holds at most one of `cat`, `dogName`; the schema does not enforce that', fix: 'check the choice in code, or read the group from `x-protobuf-oneof`' },
      expect.objectContaining({ pointer: '/file/0/messageType/0/oneofDecl/7' }),
    ]);
  });

  it('reads a list that is not one as empty, and skips what in it is not an object', () => {
    const contract = read(image({ messageType: [{ name: 'M', field: 'x', enumType: [{ name: 'E', value: [null, { name: 'A' }] }, { name: 'F', value: 'x' }] }], enumType: 'x', service: [{ name: 'S', method: [method('Do')] }] }));
    expect((contract.document as { $defs: unknown }).$defs).toStrictEqual({ 'p.M': { type: 'object', properties: {} } });
    const enums = read(image({ messageType: [{ name: 'M', field: [field('e', 1, { type: 'TYPE_ENUM', typeName: '.p.M.E' }), field('f', 2, { type: 'TYPE_ENUM', typeName: '.p.M.F' })], enumType: [{ name: 'E', value: [null, { name: 'A' }] }, { name: 'F', value: 'x' }] }], service: [{ name: 'S', method: [method('Do')] }] }));
    expect((enums.document as { $defs: Record<string, unknown> }).$defs).toMatchObject({ 'p.M.E': { enum: ['A'] }, 'p.M.F': { enum: [] } });
  });
});
