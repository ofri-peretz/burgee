/** `enum` keywords: the union of literals, the TypeScript enum, and the exported array of values. */
import {
  type EnumMember,
  type EnumStatement,
  NEVER,
  NULL,
  STRING,
  type TypeNode,
  access,
  array,
  intersection,
  object,
  property,
  raw,
  record,
  reference,
  tuple,
  union,
  FALSE,
  TRUE,
  UNKNOWN,
} from './gen-ts-ast.js';
import { type Context, type TransformOptions, stateOf } from './gen-ts-context.js';
import { type Dict, list } from './gen-ts-dict.js';
import { FLATTENED_DEEP_REQUIRED, READONLY_ARRAY, requireHelper } from './gen-ts-helpers.js';
import { createRef, pointerOf, refType } from './gen-ts-ref.js';
import { type NameState, enumMemberName, memberName, propertyName } from './gen-ts-text.js';

const objectLiteral = (value: object): TypeNode => {
  const members = Object.entries(value).map(([key, member]) => property({ name: propertyName(key), type: literalType(member) }));
  return members.length > 0 ? object(members) : record(STRING, NEVER);
};

const SCALARS: Readonly<Record<string, (value: never) => TypeNode>> = {
  string: (value: string) => raw(JSON.stringify(value)),
  number: (value: number) => ({ kind: 'literal', text: String(value) }),
  boolean: (value: boolean) => (value ? TRUE : FALSE),
};

/** The type of exactly one value: a `const`, or one member of an `enum`. */
export function literalType(value: unknown): TypeNode {
  const scalar = SCALARS[typeof value];
  if (scalar !== undefined) return scalar(value as never);
  // eslint-disable-next-line secure-coding/no-unchecked-loop-condition -- the recursion is as deep as the JSON value it reads
  if (Array.isArray(value)) return value.length === 0 ? array(NEVER) : tuple(value.map((item) => literalType(item)));
  if (typeof value === 'object' && value !== null) return objectLiteral(value);
  return value === null ? NULL : UNKNOWN;
}

/** One member as the document gives it: its value, and the name and description `x-enum-*` add. */
export interface EnumEntry {
  readonly value: string | number;
  readonly name?: unknown;
  readonly description?: unknown;
}

const memberComment = (description: unknown): string | undefined => {
  const trimmed = typeof description === 'string' ? description.trim() : '';
  return trimmed === '' ? undefined : ` ${trimmed}`;
};

/** Upstream's key: the values sorted, each beside the metadata at its sorted position. */
const cacheKey = (entries: readonly EnumEntry[]): string => {
  // The default comparison, as upstream: the key has to match its key.
  const sorted = entries.map((entry) => entry.value).sort();
  return entries.map((entry, index) => `${String(entry.name ?? sorted[index])}:${String(entry.description || '')}`).join(',');
};

/** The first letter in the case `change` gives it. A name with nothing in it cannot be declared. */
const withFirst = (name: string, source: string, change: (letter: string) => string): string => {
  if (name === '') {
    throw new Error(`cannot name the enum at \`${source}\`: nothing is left of its path. fix: give the schema a path with letters or digits in it`);
  }
  return change(name.charAt(0)) + name.slice(1);
};

const upper = (letter: string): string => letter.toUpperCase();
const lower = (letter: string): string => letter.toLowerCase();

export interface EnumInit {
  readonly name: string;
  readonly entries: readonly EnumEntry[];
  /** The store to reuse an enum with the same members from, when deduplicating. */
  readonly cache?: Map<string, EnumStatement> | undefined;
}

/** A TypeScript enum with a sanitised name and members. */
export const enumStatement = (init: EnumInit, names: NameState): EnumStatement => {
  const name = withFirst(memberName(init.name, names), init.name, upper);
  const key = cacheKey(init.entries);
  const cached = init.cache?.get(key);
  if (cached !== undefined) return cached;
  const members = init.entries.map(
    ({ value, name: given, description }): EnumMember => ({
      name: enumMemberName(String(given ?? value), names),
      value,
      comment: memberComment(description),
    }),
  );
  const statement: EnumStatement = { kind: 'enum', name, members };
  init.cache?.set(key, statement);
  return statement;
};

const META_KEYS = ['x-enum-varnames', 'x-enumNames', 'x-enum-descriptions', 'x-enumDescriptions'] as const;

const isScalar = (value: unknown): value is string | number => typeof value === 'string' || typeof value === 'number';

const becomesTsEnum = (schema: Dict, ctx: Context): boolean => {
  if (!ctx.enum || !list(schema.enum).every((value) => isScalar(value))) return false;
  return !ctx.conditionalEnums || META_KEYS.some((key) => Array.isArray(schema[key]));
};

const SCHEMAS_PREFIX = 'components/schemas';

/** A name from where the schema sits; `#/components/schemas/X` is just `X`. */
const nameAt = (path: string | undefined): string =>
  pointerOf(path ?? '')
    .join('/')
    .replace(SCHEMAS_PREFIX, '');

const tsEnumType = (schema: Dict, options: TransformOptions): TypeNode => {
  const { ctx } = options;
  const [names, alternateNames, descriptions, alternateDescriptions] = META_KEYS.map((key) => list(schema[key]));
  const entries = (list(schema.enum) as (string | number)[]).map((value, index) => ({
    value,
    name: names?.[index] ?? alternateNames?.[index],
    description: descriptions?.[index] ?? alternateDescriptions?.[index],
  }));
  const state = stateOf(ctx);
  const cache = ctx.dedupeEnums ? state.enums : undefined;
  const statement = enumStatement({ name: nameAt(options.path), entries, cache }, state.names);
  if (!ctx.injectFooter.includes(statement)) ctx.injectFooter.push(statement);
  return reference(statement.name);
};

const UNION_KEYWORDS: ReadonlySet<string | undefined> = new Set(['anyOf', 'oneOf']);
const DIGITS = /^\d+$/;

const isUnionIndex = (pointer: readonly string[], index: number): boolean =>
  UNION_KEYWORDS.has(pointer[index]) && DIGITS.test(String(pointer[index + 1]));

const isPropertySegment = (segment: string): boolean => !UNION_KEYWORDS.has(segment) && !DIGITS.test(segment);

const UNION_STEP = 2;

/**
 * A pointer with its `anyOf/0` steps removed, and the property segments after any such step:
 * those are reached through `Extract<>`, since only some variants may have them.
 */
const withoutUnionSteps = (pointer: readonly string[]): { cleaned: string[]; extract: string[] } => {
  const cleaned: string[] = [];
  const extract: string[] = [];
  let resume = 0;
  for (const [index, segment] of pointer.entries()) {
    if (index < resume) continue;
    if (isUnionIndex(pointer, index)) {
      resume = index + UNION_STEP;
      extract.push(...pointer.slice(resume).filter((later) => isPropertySegment(later)));
    } else {
      cleaned.push(segment);
    }
  }
  return { cleaned, extract };
};

const declareValues = (schema: Dict, options: TransformOptions, fromAdditionalProperties: boolean): void => {
  const { ctx } = options;
  const { cleaned, extract } = withoutUnionSteps(pointerOf(options.path ?? ''));
  const name = withFirst(memberName(`${nameAt(options.path)}Values`, stateOf(ctx).names), 'Values', lower);
  requireHelper(ctx.injectFooter, FLATTENED_DEEP_REQUIRED);
  requireHelper(ctx.injectFooter, READONLY_ARRAY);
  const element = refType(createRef(cleaned), { deep: true, extract });
  ctx.injectFooter.push({
    kind: 'values',
    name,
    type: reference('ReadonlyArray', [fromAdditionalProperties ? access(element, 'string') : element]),
    values: list(schema.enum) as (string | number)[],
  });
};

/** An open string enum keeps its suggestions: `("a" | "b") | (string & {})`. */
const openEnded = (type: TypeNode, isOpen: boolean): TypeNode =>
  isOpen ? union([type, intersection([STRING, object([])])]) : type;

const literalUnion = (schema: Dict): TypeNode => {
  const members = list(schema.enum).map((value) => literalType(value));
  const isNullable = (Array.isArray(schema.type) && schema.type.includes('null')) || Boolean(schema.nullable);
  return union(isNullable ? [...members, NULL] : members);
};

/**
 * The type of a non-object `enum`, or nothing when the keyword does not apply here: object enums
 * are handled as `oneOf`, and an open enum only makes sense for strings.
 */
export const enumType = (schema: Dict, options: TransformOptions, fromAdditionalProperties: boolean): TypeNode | undefined => {
  if (!Array.isArray(schema.enum) || schema.type === 'object' || 'properties' in schema) return undefined;
  const isOpen = Boolean(schema.additionalProperties);
  if (isOpen && schema.type !== 'string') return undefined;
  if (becomesTsEnum(schema, options.ctx)) return openEnded(tsEnumType(schema, options), isOpen);
  const type = openEnded(literalUnion(schema), isOpen);
  if (options.ctx.enumValues && schema.enum.every((value) => isScalar(value))) {
    declareValues(schema, options, fromAdditionalProperties);
  }
  return type;
};
