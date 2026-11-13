/**
 * The type tree the generator builds before printing: the handful of node shapes openapi-typescript
 * creates with `ts.factory`, as plain data. Nothing here knows about TypeScript the compiler.
 */

export type KeywordName = 'boolean' | 'never' | 'number' | 'string' | 'undefined' | 'unknown';

export interface KeywordNode {
  readonly kind: 'keyword';
  readonly name: KeywordName;
}

/** `null`, `true`, `false` or a number, already in source form. */
export interface LiteralNode {
  readonly kind: 'literal';
  readonly text: string;
}

/** Text printed as it is: a quoted string literal or a bare name. Never parenthesised, never deduplicated. */
export interface RawNode {
  readonly kind: 'raw';
  readonly text: string;
}

export interface ListNode {
  readonly kind: 'union' | 'intersection' | 'tuple';
  readonly types: readonly TypeNode[];
}

export interface ObjectNode {
  readonly kind: 'object';
  readonly members: readonly Member[];
}

/** `T[]`, `readonly T` and `...T`. */
export interface WrapNode {
  readonly kind: 'array' | 'readonly' | 'rest';
  readonly type: TypeNode;
}

export interface ReferenceNode {
  readonly kind: 'reference';
  readonly name: string;
  readonly args: readonly TypeNode[];
}

/** `T[index]`, where `index` is already in source form. */
export interface AccessNode {
  readonly kind: 'access';
  readonly type: TypeNode;
  readonly index: string;
}

export type TypeNode =
  KeywordNode | LiteralNode | RawNode | ListNode | ObjectNode | WrapNode | ReferenceNode | AccessNode;

export interface Property {
  readonly kind: 'property';
  readonly readonly: boolean;
  /** In source form: an identifier, a number or a quoted string. */
  readonly name: string;
  readonly optional: boolean;
  readonly type: TypeNode;
  /** The comment's text between its opening and closing marks, when it has one. */
  readonly comment: string | undefined;
}

export interface IndexSignature {
  readonly kind: 'index';
  readonly readonly: boolean;
  readonly parameter: string;
  /** In source form: `string`, or a template literal type. */
  readonly parameterType: string;
  readonly type: TypeNode;
}

export type Member = Property | IndexSignature;

export interface EnumMember {
  readonly name: string;
  readonly value: string | number;
  readonly comment: string | undefined;
}

export interface InterfaceStatement {
  readonly kind: 'interface';
  readonly name: string;
  /** Grows while operations are hoisted into it. */
  readonly members: Member[];
}

export interface AliasStatement {
  readonly kind: 'alias';
  readonly name: string;
  readonly type: TypeNode;
}

export interface EnumStatement {
  readonly kind: 'enum';
  readonly name: string;
  readonly members: readonly EnumMember[];
}

/** `export const name: type = [values];` */
export interface ValuesStatement {
  readonly kind: 'values';
  readonly name: string;
  readonly type: TypeNode;
  readonly values: readonly (string | number)[];
}

/** A fixed helper type, printed as written. */
export interface HelperStatement {
  readonly kind: 'helper';
  readonly name: string;
  readonly text: string;
}

export type Statement = InterfaceStatement | AliasStatement | EnumStatement | ValuesStatement | HelperStatement;

const keyword = (name: KeywordName): KeywordNode => ({ kind: 'keyword', name });

// One node per keyword: `UNKNOWN` is compared by identity, as upstream compares its own constant.
export const BOOLEAN = keyword('boolean');
export const NEVER = keyword('never');
export const NUMBER = keyword('number');
export const STRING = keyword('string');
export const UNKNOWN = keyword('unknown');
export const NULL: LiteralNode = { kind: 'literal', text: 'null' };
export const TRUE: LiteralNode = { kind: 'literal', text: 'true' };
export const FALSE: LiteralNode = { kind: 'literal', text: 'false' };

export const raw = (text: string): RawNode => ({ kind: 'raw', text });
export const object = (members: readonly Member[]): ObjectNode => ({ kind: 'object', members });
export const tuple = (types: readonly TypeNode[]): ListNode => ({ kind: 'tuple', types });
export const array = (type: TypeNode): WrapNode => ({ kind: 'array', type });
export const readonlyOf = (type: TypeNode): WrapNode => ({ kind: 'readonly', type });
export const rest = (type: TypeNode): WrapNode => ({ kind: 'rest', type });
export const access = (type: TypeNode, index: string): AccessNode => ({ kind: 'access', type, index });
export const reference = (name: string, args: readonly TypeNode[] = []): ReferenceNode => ({
  kind: 'reference',
  name,
  args,
});
export const record = (key: TypeNode, value: TypeNode): ReferenceNode => reference('Record', [key, value]);

export interface PropertyInit {
  readonly name: string;
  readonly type: TypeNode;
  readonly readonly?: boolean;
  readonly optional?: boolean;
  readonly comment?: string | undefined;
}

export const property = (init: PropertyInit): Property => ({
  kind: 'property',
  readonly: init.readonly ?? false,
  name: init.name,
  optional: init.optional ?? false,
  type: init.type,
  comment: init.comment,
});

export const alias = (name: string, type: TypeNode): AliasStatement => ({ kind: 'alias', name, type });

/** Whether a node is one of the types upstream calls primitive: `unknown`, `true` and `false` are not. */
export const isPrimitive = (type: TypeNode): boolean =>
  type === NULL || (type.kind === 'keyword' && type !== UNKNOWN);

/**
 * Drop repeated primitives, keeping the first. Literals with text (strings, numbers), `true`,
 * `false`, `unknown` and every compound type are kept however often they appear.
 */
export const dedupe = (types: readonly TypeNode[]): TypeNode[] => {
  const seen = new Set<TypeNode>();
  return types.filter((type) => {
    if (!isPrimitive(type)) return true;
    if (seen.has(type)) return false;
    seen.add(type);
    return true;
  });
};

const list = (kind: 'union' | 'intersection', types: readonly TypeNode[]): TypeNode => {
  const [first] = types;
  if (first === undefined) return NEVER;
  return types.length === 1 ? first : { kind, types: dedupe(types) };
};

export const union = (types: readonly TypeNode[]): TypeNode => list('union', types);
export const intersection = (types: readonly TypeNode[]): TypeNode => list('intersection', types);

/** `T | null`, never deduplicated. */
export const nullable = (type: TypeNode): ListNode => ({ kind: 'union', types: [type, NULL] });
