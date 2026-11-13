/**
 * Schema Objects to types: the port of openapi-typescript's `transformSchemaObject`. Each rule
 * here is upstream's, in upstream's order, because the order decides the output.
 */
import {
  BOOLEAN,
  type Member,
  NEVER,
  NULL,
  NUMBER,
  STRING,
  type TypeNode,
  UNKNOWN,
  array,
  intersection,
  isPrimitive,
  nullable,
  object,
  property,
  readonlyOf,
  record,
  reference,
  rest,
  tuple,
  union,
} from './gen-ts-ast.js';
import { jsDoc } from './gen-ts-comment.js';
import { type Context, type Discriminator, type TransformOptions } from './gen-ts-context.js';
import { type Dict, dict, entries, isDict, list, size } from './gen-ts-dict.js';
import { enumType, literalType } from './gen-ts-enums.js';
import { WITH_REQUIRED, requireHelper } from './gen-ts-helpers.js';
import { createRef, pointerOf, refType } from './gen-ts-ref.js';
import { propertyName } from './gen-ts-text.js';

const SCALAR_TYPES: ReadonlyMap<unknown, TypeNode> = new Map<unknown, TypeNode>([
  ['null', NULL],
  ['string', STRING],
  ['number', NUMBER],
  ['integer', NUMBER],
  ['boolean', BOOLEAN],
]);

const repeated = (type: TypeNode, count: number): TypeNode[] => Array.from({ length: count }, () => type);

/** Past this many tuple elements in total, TypeScript struggles to infer; upstream stops at the same number. */
const TUPLE_BUDGET = 30;

const count = (value: unknown): number | undefined => (typeof value === 'number' && value >= 0 ? value : undefined);

/** `minItems`/`maxItems` as tuples, or nothing when the bounds are absent or too wide to spell out. */
const boundedArray = (schema: Dict, itemType: TypeNode): TypeNode | undefined => {
  const min = count(schema.minItems) ?? 0;
  const declaredMax = count(schema.maxItems);
  const max = declaredMax !== undefined && min <= declaredMax ? declaredMax : undefined;
  const size = max === undefined ? min : (max * (max + 1) - min * (min - 1)) / 2;
  if ((min === 0 && max === undefined) || size >= TUPLE_BUDGET) return undefined;
  if (min === max) return tuple(repeated(itemType, min));
  if ((schema.maxItems as number) > 0) {
    const lengths = Array.from({ length: (max ?? 0) - min + 1 }, (_unused, extra) => extra);
    return union(lengths.map((extra) => tuple(repeated(itemType, extra))));
  }
  return tuple([...repeated(itemType, min), rest(array(itemType))]);
};

const itemsType = (schema: Dict, options: TransformOptions): TypeNode => {
  const { items, prefixItems } = schema;
  if (prefixItems || Array.isArray(items)) {
    return tuple(list(prefixItems ?? items).map((item) => transformSchemaObject(item, options)));
  }
  if (!items) return UNKNOWN;
  const type = transformSchemaObject(items, options);
  return dict(items).type === 'array' ? array(type) : type;
};

const arrayType = (schema: Dict, options: TransformOptions): TypeNode => {
  const itemType = itemsType(schema, options);
  const bounded = options.ctx.arrayLength ? boundedArray(schema, itemType) : undefined;
  if (bounded !== undefined) return bounded;
  // An item that is already a tuple or an array is the array.
  const type = itemType.kind === 'tuple' || itemType.kind === 'array' ? itemType : array(itemType);
  return options.ctx.immutable ? readonlyOf(type) : type;
};

const ONE_OF_SCALARS: ReadonlySet<unknown> = new Set(['boolean', 'string', 'number', 'integer', 'null']);

/** `type: [a, b]`: one transform per type, skipping a primitive the schema's own `oneOf` already lists. */
const polymorphicType = (schema: Dict, types: readonly unknown[], options: TransformOptions): TypeNode => {
  const listed = new Set(list(schema.oneOf).map((item) => dict(item).type));
  // The members of `oneOf` are transformed once, by the caller: they are not stacked on each type.
  const override = Array.isArray(schema.oneOf) ? { oneOf: undefined } : {};
  return union(
    types
      .filter((type) => !(ONE_OF_SCALARS.has(type) && listed.has(type)))
      .map((type) => (type === 'null' || type === null ? NULL : transformSchemaObject({ ...schema, type, ...override }, options))),
  );
};

/** The type a `type` keyword alone decides, or nothing when the schema reads as an object. */
const typedCore = (schema: Dict, options: TransformOptions): TypeNode | undefined => {
  const { type } = schema;
  if (type === 'array') return arrayType(schema, options);
  if (Array.isArray(type)) return polymorphicType(schema, type, options);
  return SCALAR_TYPES.get(type);
};

/** The property a discriminator adds: its name, typed as this schema's own value. */
export const discriminatorProperty = (discriminator: Discriminator, path: string, readonly: boolean): Member => {
  const inferred = pointerOf(path).pop();
  const mapped = Object.entries(discriminator.mapping ?? {}).find(([, target]) =>
    target.startsWith('#') ? pointerOf(target).pop() === inferred : target === inferred,
  );
  return property({
    readonly,
    name: propertyName(discriminator.propertyName),
    type: literalType(mapped?.[0] ?? inferred),
  });
};

const marked = (type: TypeNode, schema: Dict, ctx: Context): TypeNode => {
  const readOnly = Boolean(schema.readOnly);
  const writeOnly = Boolean(schema.writeOnly);
  if (!ctx.readWriteMarkers || readOnly === writeOnly) return type;
  return reference(readOnly ? '$Read' : '$Write', [type]);
};

const isReadonly = (schema: Dict, ctx: Context): boolean => ctx.immutable || (!ctx.readWriteMarkers && Boolean(schema.readOnly));

const REQUEST_PATHS = ['parameters', 'requestBody', 'requestBodies'] as const;

/** A default makes a property present in what the server sends, never in what the client must send. */
const defaultsApply = (schema: Dict, options: TransformOptions): boolean => {
  const path = options.path ?? '';
  return schema.default !== undefined && options.ctx.defaultNonNullable && !REQUEST_PATHS.some((part) => path.includes(part));
};

const isRequired = (parent: Dict, key: string, ctx: Context): boolean =>
  list(parent.required).includes(key) || (parent.required === undefined && ctx.propertiesRequiredByDefault);

const isExcluded = (schema: Dict, ctx: Context): boolean => {
  if (!ctx.excludeDeprecated) return false;
  const resolved = schema.$ref ? ctx.resolve(String(schema.$ref)) : schema;
  return Boolean(dict(resolved).deprecated);
};

const describeKind = (value: unknown): string => {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'Array' : typeof value;
};

const propertyMember = (parent: Dict, entry: readonly [string, unknown], options: TransformOptions): Member[] => {
  const [key, value] = entry;
  if (typeof value !== 'boolean' && !isDict(value)) {
    throw new Error(
      `${String(options.path)}: invalid property ${key}. Expected Schema Object or boolean, got ${describeKind(value)}. fix: make \`${key}\` a schema object or a boolean`,
    );
  }
  const schema = dict(value);
  const { ctx } = options;
  if (isExcluded(schema, ctx)) return [];
  const type = schema.$ref
    ? refType(String(schema.$ref))
    :  
      transformSchemaObject(value, { ...options, path: createRef([options.path, key]) });
  return [
    property({
      readonly: isReadonly(schema, ctx),
      name: propertyName(key),
      optional: !(isRequired(parent, key, ctx) || defaultsApply(schema, options)),
      type: marked(type, schema, ctx),
      comment: jsDoc(value),
    }),
  ];
};

const definitionsMember = (definitions: unknown, options: TransformOptions): Member[] => {
  const members = Object.entries(dict(definitions)).map(([key, value]) => {
    const schema = dict(value);
    const type = transformSchemaObject(value, { ...options, path: createRef([options.path, '$defs', key]) });
    return property({
      readonly: isReadonly(schema, options.ctx),
      name: propertyName(key),
      type: marked(type, schema, options.ctx),
      comment: jsDoc(value),
    });
  });
  return members.length > 0 ? [property({ name: '$defs', type: object(members) })] : [];
};

/** What an unnamed key may hold: `additionalProperties`, then `unknown` for an open object, then each pattern. */
const indexTypes = (schema: Dict, options: TransformOptions): TypeNode[] => {
  const { additionalProperties, patternProperties } = schema;
  const declared = size(additionalProperties);
  const types: TypeNode[] = [];
  if (declared !== undefined && declared > 0) types.push(transformSchemaObject(additionalProperties, options, true));
  if (additionalProperties === true || declared === 0 || (!additionalProperties && options.ctx.additionalProperties)) {
    types.push(UNKNOWN);
  }
  for (const [, pattern] of entries(patternProperties, options.ctx)) {
    types.push(transformSchemaObject(pattern, options));
  }
  return types;
};

const inheritedDiscriminator = (schema: Dict, options: TransformOptions): Member[] => {
  const path = options.path ?? '';
  const { discriminators } = options.ctx;
  const isChild = Boolean(schema.allOf || schema.anyOf) && !schema.discriminator;
  const discriminator = isChild && !discriminators.refsHandled.includes(path) ? discriminators.objects[path] : undefined;
  return discriminator === undefined ? [] : [discriminatorProperty(discriminator, path, options.ctx.immutable)];
};

/** The object a schema describes by itself: properties, `$defs` and an index signature. */
const objectCore = (schema: Dict, options: TransformOptions): TypeNode | undefined => {
  const hasProperties = (size(schema.properties) ?? 0) > 0;
  const members = [
    ...inheritedDiscriminator(schema, options),
    ...(hasProperties ? entries(schema.properties, options.ctx) : []).flatMap((entry) => propertyMember(schema, entry, options)),
    ...definitionsMember(schema.$defs, options),
  ];
  const isObjectLike = hasProperties || schema.additionalProperties || schema.patternProperties || schema.$defs;
  const named = members.length > 0 ? [object(members)] : [];
  const index = isObjectLike ? indexTypes(schema, options) : [];
  if (index.length === 0) return named[0];
  const signature: Member = { kind: 'index', readonly: options.ctx.immutable, parameter: 'key', parameterType: 'string', type: union(index) };
  return intersection([...named, object([signature])]);
};

const unionMembers = (items: unknown, key: 'anyOf' | 'oneOf', options: TransformOptions): TypeNode[] =>
  list(items).map((item, index) =>
    // The index keeps names generated for nested enums apart.
    transformSchemaObject(item, { ...options, path: createRef([options.path, key, String(index)]) }),
  );

/** A referenced `allOf` member, with the keys the parent requires of it made required. */
const referencedMember = (item: Dict, required: readonly unknown[], options: TransformOptions): TypeNode => {
  const { ctx } = options;
  const ref = String(item.$ref);
  const type = refType(ref);
  const resolved = ctx.resolve(ref);
  if (!isDict(resolved) || !('properties' in resolved) || ctx.discriminators.refsHandled.includes(ref)) return type;
  const properties = dict(resolved.properties);
  const keys = required.filter((key) => Boolean(properties[String(key)]));
  if (keys.length === 0) return type;
  requireHelper(ctx.injectFooter, WITH_REQUIRED);
  return reference('WithRequired', [type, union(keys.map((key) => literalType(key)))]);
};

const allOfMember = (item: unknown, required: readonly unknown[], options: TransformOptions): TypeNode => {
  if (!isDict(item)) return transformSchemaObject(item, options);
  const isReference = '$ref' in item;
  const type = isReference
    ? referencedMember(item, required, options)
    :  
      transformSchemaObject({ ...item, required: [...required, ...list(item.required)] }, options);
  const inherited = isReference ? options.ctx.discriminators.objects[String(item.$ref)] : undefined;
  const discriminator = inherited ?? item.discriminator;
  // The child states the discriminator property itself, so the parent's is dropped.
  return discriminator ? reference('Omit', [type, literalType(dict(discriminator).propertyName)]) : type;
};

const withAnyOf = (type: TypeNode | undefined, schema: Dict, options: TransformOptions): TypeNode | undefined => {
  const anyOf = unionMembers(schema.anyOf, 'anyOf', options);
  return anyOf.length > 0 ? union([...(type ? [type] : []), ...anyOf]) : type;
};

const withOneOf = (type: TypeNode | undefined, schema: Dict, options: TransformOptions): TypeNode | undefined => {
  // An object's `enum` lists whole objects: it reads as `oneOf`.
  const items = schema.oneOf || (schema.type === 'object' && schema.enum);
  const oneOf = unionMembers(items, 'oneOf', options);
  if (oneOf.length === 0) return type;
  const before = type ? [type] : [];
  // Only a `oneOf` of primitives joins the union; anything else is intersected with what came before.
  return oneOf.every((member) => isPrimitive(member)) ? union([...before, ...oneOf]) : intersection([...before, union(oneOf)]);
};

const composed = (schema: Dict, options: TransformOptions): TypeNode => {
  const typed = schema.type ? typedCore(schema, options) : undefined;
  const core = typed ?? objectCore(schema, options);
  const allOf = list(schema.allOf).map((item) => allOfMember(item, list(schema.required), options));
  const base = [...(core ? [core] : []), ...(allOf.length > 0 ? [intersection(allOf)] : [])];
  const start = base.length > 0 ? intersection(base) : undefined;
  const type = withOneOf(withAnyOf(start, schema, options), schema, options);
  if (type !== undefined) return type !== UNKNOWN && schema.nullable ? nullable(type) : type;
  if (!('type' in schema)) return UNKNOWN;
  const empty = record(STRING, options.ctx.emptyObjectsUnknown ? UNKNOWN : NEVER);
  return schema.nullable ? nullable(empty) : empty;
};

/** A Schema Object (or a reference to one, or `true`/`false`) as a type. */
export function transformSchemaObject(schema: unknown, options: TransformOptions, fromAdditionalProperties = false): TypeNode {
  if (!schema) return NEVER;
  if (schema === true) return UNKNOWN;
  if (!isDict(schema)) {
    throw new Error(
      `Expected SchemaObject, received ${Array.isArray(schema) ? 'Array' : typeof schema} at ${String(options.path)}. fix: write a schema object, \`true\` or \`false\` there`,
    );
  }
  if ('$ref' in schema) return refType(String(schema.$ref));
  if (schema.const !== null && schema.const !== undefined) return literalType(schema.const);
  return enumType(schema, options, fromAdditionalProperties) ?? composed(schema, options);
}
