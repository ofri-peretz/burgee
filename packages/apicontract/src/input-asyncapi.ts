/**
 * The AsyncAPI input format (apicontract-inputs R5): an AsyncAPI 2.x or 3.x document read into the
 * model. It imports only `apicontract/core`.
 *
 * - **3.x**: one operation per `operations.<id>`, named by that id. Directions are the document
 *   owner's: `action: send` is `publish` (the application sends it) and `action: receive` is
 *   `subscribe` (the application receives it). An operation's `reply` messages travel the other way
 *   and are named `reply:<message>`. With no `messages` list, an operation carries every message of
 *   its channel, as the specification says.
 * - **2.x**: one operation per `channels.<name>.publish` and `.subscribe`, named by its
 *   `operationId` or `<verb> <channel>`. The directions are the verbs as declared. AsyncAPI 2.x
 *   names them from the client's side (`publish` is what the application *receives*), so the
 *   reading carries one finding per document that says so.
 *
 * Each message is a payload (`message:<name>`), its headers another (`message:<name>:headers`), and
 * each channel parameter a third (`param:<name>`). Schemas are handed over as written, `$ref`s intact.
 * A message in another file, a schema in a format other than JSON Schema (Avro, RAML, protobuf),
 * traits and message bindings are not read, each with a finding.
 */
import { type Contract, type ContractFinding, type Direction, type Operation, type Payload } from './core/model.js';
import { pointerGet } from './core/resolve.js';

type Dict = Readonly<Record<string, unknown>>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

const dict = (value: unknown): Dict => (isDict(value) ? value : {});

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** The last key a local reference names, unescaped. */
const lastKey = (ref: string): string => ref.slice(ref.lastIndexOf('/') + 1).replaceAll('~1', '/').replaceAll('~0', '~');

/** Schema formats that are JSON Schema, or AsyncAPI's superset of it. */
const JSON_SCHEMA_FORMAT = /^application\/(?:vnd\.aai\.asyncapi(?:\+json|\+yaml)?|schema\+json|schema\+yaml)(?:;|$)/;

/** A document this adapter does not read. The message ends in a `fix:` line. */
export class AsyncApiError extends Error {
  constructor(reason: string, fix: string) {
    super(`not an AsyncAPI document: ${reason}. fix: ${fix}`);
    this.name = 'AsyncApiError';
  }
}

/** Whether `document` declares itself as AsyncAPI 2.x or 3.x (R2). */
export const detect = (document: unknown): boolean => isDict(document) && typeof document.asyncapi === 'string' && /^[23]\./.test(document.asyncapi);

type Report = (code: string, pointer: string, message: string, fix: string) => void;

interface Followed {
  readonly node: Dict;
  /** Where the value is declared: the last reference followed, or where it was written. */
  readonly where: string;
  /** The first reference followed, if the value was one. */
  readonly ref: string | undefined;
}

/** A message, channel, operation or parameter to read, where it is written, and the key it is listed under. */
interface Entry<Key extends string | undefined = string | undefined> {
  readonly value: unknown;
  readonly at: string;
  readonly key: Key;
  readonly index: number;
}

/** The members of a map, in document order. Anything else has none. */
const membersOf = (map: unknown, at: string): Entry<string>[] =>
  Object.entries(dict(map)).map(([key, value], index) => ({ value, at: `${at}/${token(key)}`, key, index }));

/** The items of a list. */
const itemsOf = (list: readonly unknown[], at: string): Entry<undefined>[] =>
  list.map((value, index) => ({ value, at: `${at}/${String(index)}`, key: undefined, index }));

const opposite = (direction: Direction): Direction => (direction === 'publish' ? 'subscribe' : 'publish');

/** A schema holder's schema and its format: 3.x writes `{ schemaFormat, schema }`, 2.x puts the format on the message. */
const schemaOf = (holder: unknown, format: unknown): { schema: unknown; format: unknown } =>
  isDict(holder) && 'schemaFormat' in holder && 'schema' in holder ? { schema: holder.schema, format: holder.schemaFormat } : { schema: holder, format };

/** No schema means any value. */
const anyIfMissing = (schema: unknown): Payload['schema'] => (schema === undefined ? true : (schema as Payload['schema']));

const createReader = (root: Dict, report: Report) => {
  /** Follow references to the object they name; a reference this document cannot follow is reported and read as nothing. */
  const follow = (value: unknown, at: string): Followed | undefined => {
    let node = value;
    let where = at;
    let ref: string | undefined;
    const seen = new Set<string>();
    while (isDict(node) && typeof node.$ref === 'string' && !seen.has(node.$ref)) {
      const next = node.$ref;
      seen.add(next);
      ref ??= next;
      if (!next.startsWith('#')) {
        report('ref-external', `${where}/$ref`, `\`${next}\` is in another file and is not read`, 'bundle the document into one file first');
        return undefined;
      }
      try {
        node = pointerGet(root, next);
      } catch (error) {
        report('ref-broken', `${where}/$ref`, (error as Error).message.replace(/\. fix: .*/, ''), 'point the reference at a value the document defines');
        return undefined;
      }
      where = next;
    }
    return { node: dict(node), where, ref };
  };

  const notApplied = (node: Dict, where: string): void => {
    if (node.traits !== undefined) {
      report(
        'traits-not-applied',
        `${where}/traits`,
        'traits are not merged into what they apply to, so what they add is not read',
        'write what the traits add on the operation or message itself',
      );
    }
  };

  const partsOf = (node: Dict, where: string, name: string, direction: Direction): Payload[] => {
    const payloads: Payload[] = [];
    for (const [part, suffix] of [
      ['payload', ''],
      ['headers', ':headers'],
    ] as const) {
      if (part === 'headers' && node.headers === undefined) continue;
      const { schema, format } = schemaOf(node[part], node.schemaFormat);
      if (typeof format === 'string' && !JSON_SCHEMA_FORMAT.test(format)) {
        report(
          'schema-format-unsupported',
          `${where}/${part}`,
          `the ${part} is written in \`${format}\`, not JSON Schema, so it is not read`,
          "convert the schema to JSON Schema, or generate from the format's own tools",
        );
        continue;
      }
      payloads.push({ name: `${name}${suffix}`, direction, schema: anyIfMissing(schema), required: true });
    }
    return payloads;
  };

  /** A message's payload and headers; a 2.x `oneOf` of messages is each of them. */
  const messagePayloads = (entry: Entry, direction: Direction, prefix: string): Payload[] => {
    const followed = follow(entry.value, entry.at);
    if (followed === undefined) return [];
    const { node, where, ref } = followed;
    if (Array.isArray(node.oneOf)) return itemsOf(node.oneOf, `${where}/oneOf`).flatMap((item) => messagePayloads(item, direction, prefix));
    notApplied(node, where);
    if (node.bindings !== undefined) {
      report(
        'bindings-not-read',
        `${where}/bindings`,
        'message bindings (a Kafka key schema, say) are not read',
        'describe what the binding carries in the message headers or payload, if a generator needs it',
      );
    }
    const named = [entry.key, ref === undefined ? undefined : lastKey(ref), node.messageId, node.name].find((name) => typeof name === 'string');
    return partsOf(node, where, `${prefix}:${named ?? String(entry.index)}`, direction);
  };

  return { follow, notApplied, messagePayloads };
};

type Reader = ReturnType<typeof createReader>;

const readV2 = (root: Dict, reader: Reader, report: Report): Operation[] => {
  report(
    'asyncapi2-directions',
    '#/asyncapi',
    "AsyncAPI 2.x names operations from the client's side: `publish` is what this application receives and `subscribe` what it sends. The directions are read as declared",
    "read `publish` as received and `subscribe` as sent, or move to AsyncAPI 3.0, whose `action: send | receive` is the application's side",
  );
  const operations: Operation[] = [];
  for (const channel of membersOf(root.channels, '#/channels')) {
    const item = reader.follow(channel.value, channel.at);
    if (item === undefined) continue;
    for (const verb of ['publish', 'subscribe'] as const) {
      const declared = item.node[verb];
      if (!isDict(declared)) continue;
      const source = `${item.where}/${verb}`;
      reader.notApplied(declared, source);
      const parameters = membersOf(item.node.parameters, `${item.where}/parameters`).flatMap((entry): Payload[] => {
        const parameter = reader.follow(entry.value, entry.at);
        return parameter === undefined ? [] : [{ name: `param:${entry.key}`, direction: verb, schema: anyIfMissing(parameter.node.schema), required: true }];
      });
      const message = { value: declared.message, at: `${source}/message`, key: undefined, index: 0 };
      const payloads = declared.message === undefined ? [] : reader.messagePayloads(message, verb, 'message');
      const id = typeof declared.operationId === 'string' ? declared.operationId : `${verb} ${channel.key}`;
      operations.push({ id, source, payloads: [...parameters, ...payloads] });
    }
  }
  return operations;
};

const ACTIONS: ReadonlyMap<unknown, Direction> = new Map([
  ['send', 'publish'],
  ['receive', 'subscribe'],
]);

/** A 3.x channel's parameters: each has no schema, only `enum`, `default`, `description` and `examples`, so one is synthesised. */
const parametersV3 = (channel: Followed, direction: Direction, reader: Reader, report: Report): Payload[] =>
  membersOf(channel.node.parameters, `${channel.where}/parameters`).flatMap((entry): Payload[] => {
    const parameter = reader.follow(entry.value, entry.at);
    if (parameter === undefined) return [];
    report(
      'parameter-synthesised',
      parameter.where,
      `parameter \`${entry.key}\` has no schema; it is read as a string with its \`enum\`, \`default\`, \`description\` and \`examples\``,
      'nothing to do: AsyncAPI 3 parameters are strings',
    );
    const keywords = Object.entries(parameter.node).filter(([key]) => ['enum', 'default', 'description', 'examples'].includes(key));
    return [{ name: `param:${entry.key}`, direction, schema: { type: 'string', ...Object.fromEntries(keywords) }, required: true }];
  });

/** The channel an operation or a reply names (none reads as an empty one), unless it cannot be followed. */
const channelOf = (holder: Dict, where: string, reader: Reader): Followed | undefined => reader.follow(holder.channel, `${where}/channel`);

/** The messages an operation or a reply lists, or, when it lists none, every message of its channel. */
const messagesOf = (holder: Dict, where: string, channel: Followed | undefined): Entry[] =>
  Array.isArray(holder.messages) ? itemsOf(holder.messages, `${where}/messages`) : membersOf(channel?.node.messages, `${channel?.where ?? where}/messages`);

const readV3 = (root: Dict, reader: Reader, report: Report): Operation[] => {
  const operations: Operation[] = [];
  for (const entry of membersOf(root.operations, '#/operations')) {
    const followed = reader.follow(entry.value, entry.at);
    if (followed === undefined) continue;
    const { node: declared, where } = followed;
    const direction = ACTIONS.get(declared.action);
    if (direction === undefined) {
      report(
        'action-unknown',
        `${where}/action`,
        `operation \`${entry.key}\` has no \`action: send\` or \`action: receive\`, so it is not read`,
        'say whether the application sends or receives it',
      );
      continue;
    }
    reader.notApplied(declared, where);
    const channel = channelOf(declared, where, reader);
    const payloads = [
      ...(channel === undefined ? [] : parametersV3(channel, direction, reader, report)),
      ...messagesOf(declared, where, channel).flatMap((message) => reader.messagePayloads(message, direction, 'message')),
    ];
    const reply = reader.follow(declared.reply, `${where}/reply`);
    if (reply !== undefined) {
      const answered = messagesOf(reply.node, reply.where, channelOf(reply.node, reply.where, reader));
      payloads.push(...answered.flatMap((message) => reader.messagePayloads(message, opposite(direction), 'reply')));
    }
    operations.push({ id: entry.key, source: where, payloads });
  }
  return operations;
};

/** Read an AsyncAPI 2.x or 3.x document into the model. */
export const read = (document: unknown): Contract => {
  if (!detect(document)) {
    throw new AsyncApiError('it has no `asyncapi: 2.x` or `asyncapi: 3.x` member', 'pass an AsyncAPI 2.6 or 3.0 document');
  }
  const root = document as Dict & { asyncapi: string };
  const findings = new Map<string, ContractFinding>();
  // A component read by several operations is reported once, where it is written.
  const report: Report = (code, pointer, message, fix) => {
    findings.set(`${code} ${pointer}`, { code, pointer, message, fix });
  };
  const reader = createReader(root, report);
  const operations = root.asyncapi.startsWith('2.') ? readV2(root, reader, report) : readV3(root, reader, report);
  return { format: 'asyncapi', document, operations, findings: [...findings.values()] };
};

/** The adapter as the plugin host registers it (spec.md R-PL1). */
export const adapter = Object.freeze({
  name: 'asyncapi',
  description: 'AsyncAPI 2.x and 3.x documents: channels, operations and messages',
  detect,
  read,
});
