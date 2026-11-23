/**
 * The protobuf input format (apicontract-protobuf R1): a buf image in its JSON form
 * (`buf build -o image.json`, the proto3 JSON of a `FileDescriptorSet`) read into the model. It
 * imports only `apicontract/core`; `.proto` sources reach it compiled by the user's own buf.
 *
 * - One operation per RPC method of a file that is not an import, named `<package>.<Service>.<Method>`.
 *   Its input message is the `request` payload, its output message the `response`.
 * - Messages are JSON Schemas in the shape the proto3 JSON mapping writes them: properties by their
 *   JSON name, 64-bit integers as strings (numbers accepted), bytes as base64, enums by value name,
 *   maps as objects, well-known types as the mapping spells them. Each property keeps its field number
 *   as `x-protobuf-field`. A payload is a `$ref` into the contract's document, which is the image
 *   with a `$defs` beside it holding every message and enum a payload reaches.
 * - What the model cannot carry is a finding: a streaming method, `google.protobuf.Any`'s payload, a
 *   proto2 group, a type the image does not hold.
 */
import { type Contract, type ContractFinding, type JsonSchema, type Operation } from './core/model.js';

type Dict = Readonly<Record<string, unknown>>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): readonly Dict[] => (Array.isArray(value) ? value.filter(isDict) : []);
/** The objects of a list, each with its position in the list, which a pointer names. */
const indexed = (value: unknown): (readonly [number, Dict])[] => (Array.isArray(value) ? value.flatMap((each: unknown, index) => (isDict(each) ? [[index, each] as const] : [])) : []);
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** A document this adapter does not read. The message ends in a `fix:` line. */
export class ProtobufError extends Error {
  constructor(reason: string, fix: string) {
    super(`not a buf image: ${reason}. fix: ${fix}`);
    this.name = 'ProtobufError';
  }
}

const isFile = (file: unknown): boolean => isDict(file) && text(file.name)?.endsWith('.proto') === true;

/** A buf image as JSON: a non-empty `file` list, each a `.proto` file descriptor. */
export const detect = (document: unknown): boolean => isDict(document) && Array.isArray(document.file) && document.file.length > 0 && document.file.every(isFile);

const INT = { type: 'integer' };
const LONG = { type: ['string', 'integer'] };
const SCALARS: Readonly<Record<string, JsonSchema>> = {
  TYPE_DOUBLE: { type: 'number' },
  TYPE_FLOAT: { type: 'number' },
  TYPE_INT32: INT,
  TYPE_SINT32: INT,
  TYPE_SFIXED32: INT,
  TYPE_UINT32: INT,
  TYPE_FIXED32: INT,
  TYPE_INT64: LONG,
  TYPE_SINT64: LONG,
  TYPE_SFIXED64: LONG,
  TYPE_UINT64: LONG,
  TYPE_FIXED64: LONG,
  TYPE_BOOL: { type: 'boolean' },
  TYPE_STRING: { type: 'string' },
  TYPE_BYTES: { type: 'string', contentEncoding: 'base64' },
};

const nullable = (type: string | readonly string[]): JsonSchema => ({ type: [...(typeof type === 'string' ? [type] : type), 'null'] });

/** The well-known types, as the proto3 JSON mapping writes them. `Any` carries a finding where it is used. */
const WELL_KNOWN: Readonly<Record<string, JsonSchema>> = {
  '.google.protobuf.Timestamp': { type: 'string', format: 'date-time' },
  '.google.protobuf.Duration': { type: 'string', pattern: String.raw`^-?\d+(\.\d+)?s$` },
  '.google.protobuf.FieldMask': { type: 'string' },
  '.google.protobuf.Struct': { type: 'object' },
  '.google.protobuf.Value': {},
  '.google.protobuf.ListValue': { type: 'array' },
  '.google.protobuf.NullValue': { type: 'null' },
  '.google.protobuf.Empty': { type: 'object' },
  '.google.protobuf.Any': { type: 'object', properties: { '@type': { type: 'string' } }, required: ['@type'] },
  '.google.protobuf.DoubleValue': nullable('number'),
  '.google.protobuf.FloatValue': nullable('number'),
  '.google.protobuf.Int32Value': nullable('integer'),
  '.google.protobuf.UInt32Value': nullable('integer'),
  '.google.protobuf.Int64Value': nullable(['string', 'integer']),
  '.google.protobuf.UInt64Value': nullable(['string', 'integer']),
  '.google.protobuf.BoolValue': nullable('boolean'),
  '.google.protobuf.StringValue': nullable('string'),
  '.google.protobuf.BytesValue': { type: ['string', 'null'], contentEncoding: 'base64' },
};

/** A message, and where it is declared, or an enum; each by its full name with the leading dot (`.pets.v1.Pet`). */
type Declared = { readonly isEnum: false; readonly node: Dict; readonly pointer: string } | { readonly isEnum: true; readonly node: Dict };

/** Every message and enum the image declares, nested ones included. */
const declarationsOf = (files: readonly Dict[]): Map<string, Declared> => {
  const found = new Map<string, Declared>();
  const walk = (scope: string, node: Dict, pointer: string, messages: 'messageType' | 'nestedType'): void => {
    for (const each of list(node.enumType)) found.set(`${scope}.${String(each.name)}`, { isEnum: true, node: each });
    for (const [index, each] of indexed(node[messages])) {
      const name = `${scope}.${String(each.name)}`;
      const at = `${pointer}/${messages}/${index}`;
      found.set(name, { isEnum: false, node: each, pointer: at });
      walk(name, each, at, 'nestedType');
    }
  };
  for (const [index, file] of files.entries()) {
    const pkg = text(file.package);
    walk(pkg === undefined || pkg === '' ? '' : `.${pkg}`, file, `/file/${index}`, 'messageType');
  }
  return found;
};

/** The `$defs` key of a full name: the name without its leading dot. */
const defKey = (name: string): string => name.slice(1);
const refTo = (name: string): JsonSchema => ({ $ref: `#/$defs/${defKey(name)}` });

/** Reads the messages the payloads reach into schemas, each once, so each finding is reported once. */
class Schemas {
  readonly findings: ContractFinding[] = [];
  private readonly reached = new Set<string>();

  constructor(private readonly declared: ReadonlyMap<string, Declared>) {}

  /** The schema a payload of type `name` has: a well-known type inline, else a reference into the document's `$defs`. */
  payload(name: string, pointer: string): JsonSchema {
    return this.typeOf(name, pointer, this.reached);
  }

  /** Every message and enum a payload reaches, as `$defs`, each read once. */
  defs(): Readonly<Record<string, JsonSchema>> {
    const defs = new Map<string, JsonSchema>();
    const todo = [...this.reached];
    for (let next = todo.pop(); next !== undefined; next = todo.pop()) {
      const def = this.definition(next);
      defs.set(defKey(next), def.schema);
      todo.push(...[...def.refs].filter((ref) => !defs.has(defKey(ref))));
    }
    return Object.fromEntries(defs);
  }

  /** A type by full name: well-known inline, declared as a reference, else anything with a finding. */
  private typeOf(name: string, pointer: string, refs: Set<string>): JsonSchema {
    const known = WELL_KNOWN[name];
    if (known !== undefined) {
      if (name === '.google.protobuf.Any') this.finding('any-payload-unread', pointer, `\`${defKey(name)}\` is read as its \`@type\` only: the message it wraps is not known from the contract`, 'name the wrapped type in a field of its own, or accept that it is not checked');
      return known;
    }
    if (!this.declared.has(name)) {
      this.finding('type-not-found', pointer, `\`${defKey(name)}\` is not in the image, so it is read as anything`, 'build the image with its imports (`buf build` includes them unless `--exclude-imports` is given)');
      return {};
    }
    refs.add(name);
    return refTo(name);
  }

  private definition(name: string): { readonly schema: JsonSchema; readonly refs: ReadonlySet<string> } {
    const declared = this.declared.get(name) as Declared;
    const refs = new Set<string>();
    const schema = declared.isEnum ? { enum: list(declared.node.value).map((value) => String(value.name)) } : this.message(name, declared, refs);
    return { schema, refs };
  }

  private message(name: string, { node, pointer }: { readonly node: Dict; readonly pointer: string }, refs: Set<string>): JsonSchema {
    const properties = new Map<string, JsonSchema>();
    const required: string[] = [];
    const oneofs = new Map<number, string[]>();
    for (const [index, field] of indexed(node.field)) {
      const key = text(field.jsonName) ?? String(field.name);
      properties.set(key, { ...(this.field(field, `${pointer}/field/${index}`, refs) as object), 'x-protobuf-field': field.number });
      if (field.label === 'LABEL_REQUIRED') required.push(key);
      // A proto3 `optional` field sits in a oneof of its own, which is no choice.
      if (typeof field.oneofIndex === 'number' && field.proto3Optional !== true) oneofs.set(field.oneofIndex, [...(oneofs.get(field.oneofIndex) ?? []), key]);
    }
    // Open, as protobuf evolves: a field added is the change every protobuf API makes safely.
    return { type: 'object', properties: Object.fromEntries(properties), ...(required.length === 0 ? {} : { required }), ...this.oneofsOf(name, node, pointer, oneofs) };
  }

  /** The message's oneofs, as `x-protobuf-oneof`, each with the finding that the schema does not enforce it. */
  private oneofsOf(name: string, node: Dict, pointer: string, oneofs: ReadonlyMap<number, readonly string[]>): object {
    const decls = new Map(indexed(node.oneofDecl));
    const groups = [...oneofs].map(([index, members]) => {
      const group = String(decls.get(index)?.name);
      this.finding('oneof-not-enforced', `${pointer}/oneofDecl/${index}`, `\`${defKey(name)}.${group}\` holds at most one of ${members.map((member) => `\`${member}\``).join(', ')}; the schema does not enforce that`, 'check the choice in code, or read the group from `x-protobuf-oneof`');
      return [group, members] as const;
    });
    return groups.length === 0 ? {} : { 'x-protobuf-oneof': Object.fromEntries(groups) };
  }

  private field(field: Dict, pointer: string, refs: Set<string>): JsonSchema {
    const repeated = field.label === 'LABEL_REPEATED';
    const entry = this.mapEntry(field);
    if (repeated && entry !== undefined) {
      const value = list(entry.field).find((each) => each.number === 2) ?? {};
      return { type: 'object', additionalProperties: this.single(value, pointer, refs) };
    }
    const one = this.single(field, pointer, refs);
    return repeated ? { type: 'array', items: one } : one;
  }

  /** The map entry message a field's type names, if it names one. */
  private mapEntry(field: Dict): Dict | undefined {
    const node = this.declared.get(String(field.typeName))?.node;
    const options = node?.options;
    return isDict(options) && options.mapEntry === true ? node : undefined;
  }

  /** One value of a field: a scalar, an enum or a message. */
  private single(field: Dict, pointer: string, refs: Set<string>): JsonSchema {
    const scalar = SCALARS[String(field.type)];
    if (scalar !== undefined) return scalar;
    if (field.type === 'TYPE_GROUP') this.finding('group-read-as-message', pointer, `\`${String(field.name)}\` is a proto2 group, read as the message it declares`, 'replace the group with a message field; groups are deprecated');
    return this.typeOf(String(field.typeName), pointer, refs);
  }

  private finding(code: string, pointer: string, message: string, fix: string): void {
    this.findings.push({ code, pointer, message, fix });
  }
}

/** The finding for a streaming side of a method: the model reads one message where the RPC sends many. */
const streamFinding = (id: string, side: 'request' | 'response', pointer: string): ContractFinding => ({
  code: 'stream-read-as-message',
  pointer,
  message: `\`${id}\` streams its ${side}: one message of it is read`,
  fix: 'diff and lint judge the message; a change to streaming itself is buf\'s to judge (`diff --level`)',
});

/** The operations of one file that is the user's, not an import. */
const operationsOf = (file: Dict, index: number, schemas: Schemas, findings: ContractFinding[]): Operation[] => {
  const pkg = text(file.package);
  return indexed(file.service).flatMap(([at, service]) =>
    indexed(service.method).map(([position, method]): Operation => {
      const id = [pkg, service.name, method.name].filter((part) => part !== undefined && part !== '').join('.');
      const source = `/file/${index}/service/${at}/method/${position}`;
      if (method.clientStreaming === true) findings.push(streamFinding(id, 'request', source));
      if (method.serverStreaming === true) findings.push(streamFinding(id, 'response', source));
      return {
        id,
        source,
        payloads: [
          { name: 'request', direction: 'request', required: true, schema: schemas.payload(String(method.inputType), `${source}/inputType`) },
          { name: 'response', direction: 'response', required: true, schema: schemas.payload(String(method.outputType), `${source}/outputType`) },
        ],
      };
    }),
  );
};

const isImport = (file: Dict): boolean => isDict(file.bufExtension) && file.bufExtension.isImport === true;

export const read = (document: unknown): Contract => {
  if (!detect(document)) throw new ProtobufError('it has no `file` list of `.proto` file descriptors', 'pass the JSON image `buf build -o image.json` writes, or a `.proto` file for buf to build');
  const files = list((document as Dict).file);
  const schemas = new Schemas(declarationsOf(files));
  const findings: ContractFinding[] = [];
  const operations = files.flatMap((file, index) => (isImport(file) ? [] : operationsOf(file, index, schemas, findings)));
  // The messages are JSON Schemas only once read, so the document is the image with them beside it, where the payloads' `$ref`s point.
  const withDefs = { ...(document as Dict), $defs: schemas.defs() };
  if (operations.length === 0) findings.push({ code: 'no-service', pointer: '', message: 'the image declares no service, so there is no operation to read', fix: 'build the image from the files that declare your services' });
  return { format: 'protobuf', document: withDefs, operations, findings: [...findings, ...schemas.findings] };
};

export const adapter = Object.freeze({
  name: 'protobuf',
  description: 'protobuf, as the JSON image `buf build -o image.json` writes: one operation per RPC method',
  detect,
  read,
});
