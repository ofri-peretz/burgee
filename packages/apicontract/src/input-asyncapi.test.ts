import { readdirSync, readFileSync } from 'node:fs';

import { parse } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { adapter, AsyncApiError, detect, read } from './input-asyncapi.js';

const FIXTURES = new URL('__fixtures__/inputs/asyncapi/', import.meta.url);

/** Every document in `asyncapi/spec/examples` at v2.6.0 and v3.0.0; `common/` holds what they reference. */
const fixtures: { file: string; document: Record<string, unknown> }[] = (readdirSync(FIXTURES, { recursive: true }) as string[])
  .filter((file) => /\.ya?ml$/.test(file) && !file.includes('common'))
  .toSorted()
  .map((file) => ({ file, document: parse(readFileSync(new URL(file, FIXTURES), 'utf8')) as Record<string, unknown> }));

const ids = (document: unknown): string[] => read(document).operations.map(({ id }) => id);
const payloads = (document: unknown): string[][] =>
  read(document).operations.map(({ payloads: list }) => list.map(({ name, direction }) => `${direction} ${name}`));
const codes = (document: unknown): string[] => (read(document).findings ?? []).map(({ code, pointer }) => `${code} ${pointer}`);

const INVERSION = 'asyncapi2-directions #/asyncapi';

describe('detect', () => {
  it('accepts AsyncAPI 2.x and 3.x, and nothing else, without throwing', () => {
    for (const asyncapi of ['2.0.0', '2.6.0', '3.0.0', '3.1.0']) expect(detect({ asyncapi })).toBe(true);
    for (const other of [{ asyncapi: '1.2.0' }, { asyncapi: 'x3.0.0' }, { asyncapi: 3 }, { asyncapi: 2.6 }, { openapi: '3.1.0' }, {}, [], null, 'asyncapi: 3.0.0']) {
      expect(detect(other)).toBe(false);
    }
  });

  it('refuses to read anything else, with a fix', () => {
    expect(() => read({ asyncapi: '1.2.0' })).toThrow(new AsyncApiError('it has no `asyncapi: 2.x` or `asyncapi: 3.x` member', 'pass an AsyncAPI 2.6 or 3.0 document'));
    expect(new AsyncApiError('r', 'f')).toMatchObject({ name: 'AsyncApiError', message: 'not an AsyncAPI document: r. fix: f' });
  });
});

describe('AsyncAPI 3', () => {
  const Signup = { payload: { type: 'object' }, headers: { type: 'object', properties: { id: { type: 'string' } } } };
  const document = {
    asyncapi: '3.0.0',
    channels: {
      'user/signedup': {
        address: 'user/{id}',
        parameters: { id: { enum: ['a', 'b'], default: 'a', description: 'who', examples: ['b'], location: '$message.payload#/id' } },
        messages: { Signup: { $ref: '#/components/messages/Signup' }, Bare: {} },
      },
      replies: { messages: { Ack: { payload: { const: 'ok' } } } },
    },
    operations: {
      sendSignup: {
        action: 'send',
        channel: { $ref: '#/channels/user~1signedup' },
        messages: [{ $ref: '#/channels/user~1signedup/messages/Signup' }],
        reply: { channel: { $ref: '#/channels/replies' } },
      },
      onSignup: { action: 'receive', channel: { $ref: '#/channels/user~1signedup' } },
      shared: { $ref: '#/components/operations/shared' },
    },
    components: {
      messages: { Signup },
      operations: { shared: { action: 'receive', messages: [{ $ref: '#/channels/replies/messages/Ack' }], reply: { messages: [{ payload: { type: 'string' } }] } } },
    },
  };

  it('reads one operation per `operations.<id>`, send as publish and receive as subscribe, replies the other way', () => {
    const contract = read(document);
    expect(contract.format).toBe('asyncapi');
    expect(contract.document).toBe(document);
    expect(contract.operations.map(({ id, source }) => [id, source])).toEqual([
      ['sendSignup', '#/operations/sendSignup'],
      ['onSignup', '#/operations/onSignup'],
      ['shared', '#/components/operations/shared'],
    ]);
    expect(payloads(document)).toEqual([
      ['publish param:id', 'publish message:Signup', 'publish message:Signup:headers', 'subscribe reply:Ack'],
      ['subscribe param:id', 'subscribe message:Signup', 'subscribe message:Signup:headers', 'subscribe message:Bare'],
      ['subscribe message:Ack', 'publish reply:0'],
    ]);
  });

  it('passes schemas as written, and reads a message without a payload as any value', () => {
    const [send, receive] = read(document).operations;
    expect(send?.payloads[1]).toEqual({ name: 'message:Signup', direction: 'publish', schema: Signup.payload, required: true });
    expect(send?.payloads[1]?.schema).toBe(Signup.payload);
    expect(send?.payloads[2]?.schema).toBe(Signup.headers);
    expect(receive?.payloads[3]).toEqual({ name: 'message:Bare', direction: 'subscribe', schema: true, required: true });
  });

  it('synthesises a string schema for each channel parameter, and says so', () => {
    const contract = read(document);
    expect(contract.operations[0]?.payloads[0]).toEqual({
      name: 'param:id',
      direction: 'publish',
      schema: { type: 'string', enum: ['a', 'b'], default: 'a', description: 'who', examples: ['b'] },
      required: true,
    });
    expect(contract.findings?.[0]).toEqual({
      code: 'parameter-synthesised',
      pointer: '#/channels/user~1signedup/parameters/id',
      message: 'parameter `id` has no schema; it is read as a string with its `enum`, `default`, `description` and `examples`',
      fix: 'nothing to do: AsyncAPI 3 parameters are strings',
    });
    expect(read({ asyncapi: '3.0.0', channels: { c: { parameters: { p: {} } } }, operations: { o: { action: 'send', channel: { $ref: '#/channels/c' } } } }).operations[0]?.payloads).toEqual([
      { name: 'param:p', direction: 'publish', schema: { type: 'string' }, required: true },
    ]);
  });

  it('skips an operation without a known action, with a finding', () => {
    const contract = read({ asyncapi: '3.0.0', operations: { a: { action: 'publish' }, b: {}, c: { action: 'send' }, d: { action: ['send'] }, e: { action: 'toString' } } });
    expect(contract.operations).toEqual([{ id: 'c', source: '#/operations/c', payloads: [] }]);
    expect(contract.findings).toEqual(
      ['a', 'b', 'd', 'e'].map((name) => ({
        code: 'action-unknown',
        pointer: `#/operations/${name}/action`,
        message: `operation \`${name}\` has no \`action: send\` or \`action: receive\`, so it is not read`,
        fix: 'say whether the application sends or receives it',
      })),
    );
  });

  it('reads a multi-format schema, and declines one that is not JSON Schema', () => {
    const avro = { schemaFormat: 'application/vnd.apache.avro;version=1.9.0', schema: { type: 'record' } };
    const contract = read({
      asyncapi: '3.0.0',
      channels: {
        c: {
          messages: {
            json: { payload: { schemaFormat: 'application/schema+json;version=draft-07', schema: { type: 'string' } } },
            yaml: { payload: { schemaFormat: 'application/schema+yaml', schema: { type: 'number' } } },
            aai: { payload: { schemaFormat: 'application/vnd.aai.asyncapi+json;version=3.0.0', schema: { type: 'boolean' } } },
            plain: { payload: { schemaFormat: 'application/vnd.aai.asyncapi', schema: { type: 'null' } } },
            avro: { payload: avro, headers: { type: 'object' } },
            schemaFormatIsAProperty: { payload: { type: 'object', properties: { schemaFormat: {} } } },
          },
        },
      },
      operations: { o: { action: 'receive', channel: { $ref: '#/channels/c' } } },
    });
    expect(contract.operations[0]?.payloads.map(({ name, schema }) => [name, schema])).toEqual([
      ['message:json', { type: 'string' }],
      ['message:yaml', { type: 'number' }],
      ['message:aai', { type: 'boolean' }],
      ['message:plain', { type: 'null' }],
      ['message:avro:headers', { type: 'object' }],
      ['message:schemaFormatIsAProperty', { type: 'object', properties: { schemaFormat: {} } }],
    ]);
    expect(contract.findings).toEqual([
      {
        code: 'schema-format-unsupported',
        pointer: '#/channels/c/messages/avro/payload',
        message: 'the payload is written in `application/vnd.apache.avro;version=1.9.0`, not JSON Schema, so it is not read',
        fix: "convert the schema to JSON Schema, or generate from the format's own tools",
      },
    ]);
    for (const format of ['application/schema+jsonx', 'xapplication/schema+json', 'application/raml+yaml;version=1.0']) {
      expect(codes({ asyncapi: '3.0.0', operations: { o: { action: 'send', messages: [{ payload: { schemaFormat: format, schema: {} } }] } } })).toEqual([
        'schema-format-unsupported #/operations/o/messages/0/payload',
      ]);
    }
  });

  it('reads nothing from a channel or reply it cannot find, and reports why', () => {
    expect(payloads({ asyncapi: '3.0.0', operations: { o: { action: 'send' } } })).toEqual([[]]);
    const contract = read({
      asyncapi: '3.0.0',
      operations: {
        external: { action: 'send', channel: { $ref: 'other.yaml#/channels/a' } },
        broken: { action: 'send', channel: { $ref: '#/channels/missing' }, reply: { $ref: '#/nowhere' } },
      },
    });
    expect(contract.operations.map(({ payloads: list }) => list)).toEqual([[], []]);
    expect(contract.findings).toEqual([
      {
        code: 'ref-external',
        pointer: '#/operations/external/channel/$ref',
        message: '`other.yaml#/channels/a` is in another file and is not read',
        fix: 'bundle the document into one file first',
      },
      {
        code: 'ref-broken',
        pointer: '#/operations/broken/channel/$ref',
        message: 'cannot resolve `#/channels/missing`: nothing is at `channels`',
        fix: 'point the reference at a value the document defines',
      },
      {
        code: 'ref-broken',
        pointer: '#/operations/broken/reply/$ref',
        message: 'cannot resolve `#/nowhere`: nothing is at `nowhere`',
        fix: 'point the reference at a value the document defines',
      },
    ]);
  });

  it('names a message by the key its reference ends in, unescaped, and points into escaped keys', () => {
    const document = {
      asyncapi: '3.0.0',
      channels: { 'a~b': { messages: { 'm/n~o': { payload: { $ref: 'x.yaml' } }, bad: { $ref: 'x.yaml' } } } },
      operations: { 'op~1': { action: 'send', messages: [{ $ref: '#/channels/a~0b/messages/m~1n~0o' }, { oneOf: [{ $ref: 'y.yaml' }] }] } },
    };
    expect(read(document).operations).toEqual([
      { id: 'op~1', source: '#/operations/op~01', payloads: [{ name: 'message:m/n~o', direction: 'publish', schema: { $ref: 'x.yaml' }, required: true }] },
    ]);
    expect(codes(document)).toEqual(['ref-external #/operations/op~01/messages/1/oneOf/0/$ref']);
    expect(codes({ ...document, operations: { o: { action: 'send', channel: { $ref: '#/channels/a~0b' } } } })).toEqual(['ref-external #/channels/a~0b/messages/bad/$ref']);
  });

  it('skips an operation kept in another file, with a finding', () => {
    expect(ids({ asyncapi: '3.0.0', operations: { o: { $ref: 'ops.yaml#/o' } } })).toEqual([]);
    expect(codes({ asyncapi: '3.0.0', operations: { o: { $ref: 'ops.yaml#/o' } } })).toEqual(['ref-external #/operations/o/$ref']);
  });

  it('stops at a reference cycle instead of looping', () => {
    const contract = read({ asyncapi: '3.0.0', operations: { o: { $ref: '#/x' } }, x: { $ref: '#/y' }, y: { $ref: '#/x' } });
    expect(contract.operations).toEqual([]);
    expect(codes({ asyncapi: '3.0.0', operations: { o: { $ref: '#/x' } }, x: { $ref: '#/y' }, y: { $ref: '#/x' } })).toEqual(['action-unknown #/y/action']);
  });

  it('reports traits and message bindings it does not read', () => {
    const contract = read({
      asyncapi: '3.0.0',
      operations: { o: { action: 'send', traits: [{}], messages: [{ name: 'm', traits: [{}], bindings: { kafka: { key: { type: 'string' } } } }] } },
    });
    expect(contract.operations[0]?.payloads.map(({ name }) => name)).toEqual(['message:m']);
    expect(contract.findings).toEqual([
      {
        code: 'traits-not-applied',
        pointer: '#/operations/o/traits',
        message: 'traits are not merged into what they apply to, so what they add is not read',
        fix: 'write what the traits add on the operation or message itself',
      },
      {
        code: 'traits-not-applied',
        pointer: '#/operations/o/messages/0/traits',
        message: 'traits are not merged into what they apply to, so what they add is not read',
        fix: 'write what the traits add on the operation or message itself',
      },
      {
        code: 'bindings-not-read',
        pointer: '#/operations/o/messages/0/bindings',
        message: 'message bindings (a Kafka key schema, say) are not read',
        fix: 'describe what the binding carries in the message headers or payload, if a generator needs it',
      },
    ]);
  });
});

describe('AsyncAPI 2', () => {
  it('reads each publish and subscribe as declared, named by operationId or verb and channel, and says the verbs are inverted', () => {
    const document = {
      asyncapi: '2.6.0',
      channels: {
        'light/{id}': {
          parameters: { id: { schema: { type: 'integer' } }, zone: { $ref: '#/components/parameters/zone' }, gone: { $ref: 'x.yaml' } },
          publish: { operationId: 'measured', message: { $ref: '#/components/messages/Lumens' } },
          subscribe: { message: { oneOf: [{ $ref: '#/components/messages/Lumens' }, { messageId: 'byId' }, { name: 'byName' }, {}] } },
        },
        shared: { $ref: '#/components/channels/shared' },
        empty: { description: 'no operations' },
        missing: { $ref: '#/components/channels/missing' },
      },
      components: {
        messages: { Lumens: { payload: { type: 'number' }, schemaFormat: 'application/vnd.aai.asyncapi;version=2.6.0' } },
        parameters: { zone: {} },
        channels: { shared: { subscribe: { traits: [{}], message: { $ref: '#/components/messages/Many' } } } },
      },
    };
    (document.components.messages as Record<string, unknown>).Many = { oneOf: [{ payload: { type: 'string' } }] };
    const contract = read(document);
    expect(contract.operations.map(({ id, source }) => [id, source])).toEqual([
      ['measured', '#/channels/light~1{id}/publish'],
      ['subscribe light/{id}', '#/channels/light~1{id}/subscribe'],
      ['subscribe shared', '#/components/channels/shared/subscribe'],
    ]);
    expect(payloads(document)).toEqual([
      ['publish param:id', 'publish param:zone', 'publish message:Lumens'],
      ['subscribe param:id', 'subscribe param:zone', 'subscribe message:Lumens', 'subscribe message:byId', 'subscribe message:byName', 'subscribe message:3'],
      ['subscribe message:0'],
    ]);
    expect(contract.operations[0]?.payloads.map(({ schema }) => schema)).toEqual([{ type: 'integer' }, true, { type: 'number' }]);
    expect(contract.findings?.[0]).toEqual({
      code: 'asyncapi2-directions',
      pointer: '#/asyncapi',
      message:
        "AsyncAPI 2.x names operations from the client's side: `publish` is what this application receives and `subscribe` what it sends. The directions are read as declared",
      fix: "read `publish` as received and `subscribe` as sent, or move to AsyncAPI 3.0, whose `action: send | receive` is the application's side",
    });
    expect(codes(document)).toEqual([
      INVERSION,
      'ref-external #/channels/light~1{id}/parameters/gone/$ref',
      'traits-not-applied #/components/channels/shared/subscribe/traits',
      'ref-broken #/channels/missing/$ref',
    ]);
  });

  it('reads an operation without a message as no payloads, and a 2.x schemaFormat it cannot read as none', () => {
    expect(payloads({ asyncapi: '2.6.0', channels: { c: { publish: {} } } })).toEqual([[]]);
    expect(read({ asyncapi: '2.6.0', channels: { c: { parameters: { p: {} }, publish: { message: { payload: {} } } } } }).operations[0]?.payloads).toEqual([
      { name: 'param:p', direction: 'publish', schema: true, required: true },
      { name: 'message:0', direction: 'publish', schema: {}, required: true },
    ]);
    const avro = { asyncapi: '2.6.0', channels: { c: { publish: { message: { schemaFormat: 'application/vnd.apache.avro;version=1.9.0', payload: {} } } } } };
    expect(payloads(avro)).toEqual([[]]);
    expect(codes(avro)).toEqual([INVERSION, 'schema-format-unsupported #/channels/c/publish/message/payload']);
  });
});

describe('every example in asyncapi/spec at v2.6.0 and v3.0.0', () => {
  it('reads at least 20 documents without throwing', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
    expect(fixtures.map(({ document }) => String(document.asyncapi).slice(0, 1))).toEqual([...Array.from({ length: 21 }, () => '2'), ...Array.from({ length: 24 }, () => '3')]);
    for (const { document } of fixtures) {
      expect(detect(document)).toBe(true);
      expect(() => read(document)).not.toThrow();
    }
  });

  it('maps 3.0 send to publish and receive to subscribe, and every reply the other way', () => {
    const SENT: Readonly<Record<string, string>> = { send: 'publish', receive: 'subscribe' };
    const REPLIED: Readonly<Record<string, string>> = { send: 'subscribe', receive: 'publish' };
    const seen = fixtures
      .filter(({ document }) => document.asyncapi === '3.0.0')
      .flatMap(({ file, document }) =>
        read(document).operations.flatMap(({ id, payloads: list }) => {
          const action = (document.operations as Record<string, { action: string }>)[id]?.action ?? '';
          return list.map(({ name, direction }) => [`${file} ${id} ${name}`, direction, (name.startsWith('reply:') ? REPLIED : SENT)[action]]);
        }),
      );
    expect(seen.length).toBe(127);
    for (const [where, direction, expected] of seen) expect(direction, where).toBe(expected);
  });

  it('says once per 2.x document that its verbs are the client’s', () => {
    for (const { file, document } of fixtures.filter(({ document: d }) => String(d.asyncapi).startsWith('2.'))) {
      expect(codes(document).filter((code) => code === INVERSION), file).toEqual([INVERSION]);
    }
  });

  it('reports what it could not read, by kind', () => {
    const tally: Record<string, number> = {};
    for (const { document } of fixtures) for (const { code } of read(document).findings ?? []) tally[code] = (tally[code] ?? 0) + 1;
    expect(tally).toEqual({
      'asyncapi2-directions': 21,
      'bindings-not-read': 7,
      'parameter-synthesised': 13,
      // The social-media examples keep their messages in `common/`, one file per kind.
      'ref-external': 22,
      // adeo's Avro payloads.
      'schema-format-unsupported': 2,
      'traits-not-applied': 42,
    });
  });
});

describe('adapter', () => {
  it('is the host shape, under its own name', () => {
    expect(adapter).toMatchObject({ name: 'asyncapi', detect, read });
    expect(adapter.description).toContain('AsyncAPI 2.x and 3.x');
    expect(Object.isFrozen(adapter)).toBe(true);
    expect(ids({ asyncapi: '3.0.0' })).toEqual([]);
  });
});
