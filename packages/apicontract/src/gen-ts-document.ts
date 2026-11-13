/** The whole file: components, then every root in upstream's order, then what the transforms hoisted. */
import {
  type AliasStatement,
  type Member,
  NEVER,
  STRING,
  type Statement,
  type TypeNode,
  alias,
  object,
  property,
  record,
  reference,
} from './gen-ts-ast.js';
import { jsDoc } from './gen-ts-comment.js';
import { type Context, type TransformOptions } from './gen-ts-context.js';
import { dict, entries, isDict } from './gen-ts-dict.js';
import { READ_WRITE_MARKERS } from './gen-ts-helpers.js';
import {
  pathsEnum,
  transformHeaderObject,
  transformPathItemObject,
  transformPathsObject,
  transformRequestBodyObject,
  transformResponseObject,
  transformWebhooksObject,
} from './gen-ts-operations.js';
import { createRef } from './gen-ts-ref.js';
import { transformSchemaObject } from './gen-ts-schema.js';
import { pascalCase, propertyName } from './gen-ts-text.js';

/**
 * Whether a schema is an enum that `enum: true` turns into a TypeScript enum of its own, so that
 * `rootTypes` must not also export an alias under the same name.
 */
export const isEnumSchema = (schema: unknown): boolean =>
  isDict(schema) &&
  Array.isArray(schema.enum) &&
  schema.type !== 'object' &&
  !('properties' in schema) &&
  !('additionalProperties' in schema);

type Transform = (node: unknown, options: TransformOptions) => TypeNode;

/** A Parameter Object: its schema, or a string without one. */
const parameterType: Transform = (parameter, options) => {
  const { schema } = dict(parameter);
  return schema ? transformSchemaObject(schema, options) : STRING;
};

const COMPONENTS: readonly (readonly [key: string, singular: string, transform: Transform])[] = [
  ['schemas', 'schema', transformSchemaObject],
  ['responses', 'response', transformResponseObject],
  ['parameters', 'parameter', parameterType],
  ['requestBodies', 'requestBody', transformRequestBodyObject],
  ['headers', 'header', transformHeaderObject],
  ['pathItems', 'pathItem', transformPathItemObject],
];

interface RootAlias {
  readonly key: string;
  readonly singular: string;
  readonly name: string;
}

/** `SchemaPet = components['schemas']['Pet']`, numbered when two components come to the same name. */
const rootAlias = ({ key, singular, name }: RootAlias, taken: ReadonlyMap<string, AliasStatement>, ctx: Context): AliasStatement => {
  const isSchema = key === 'schemas';
  const prefix = pascalCase(singular);
  const base = prefix + (ctx.rootTypesKeepCasing && isSchema ? name : pascalCase(name));
  let aliasName = base;
  for (let counter = 2; taken.has(aliasName); counter++) aliasName = `${base}_${counter}`;
  if (ctx.rootTypesNoSchemaPrefix && isSchema) aliasName = aliasName.replace(prefix, '');
  return alias(aliasName, reference(`components['${key}']['${name}']`));
};

/** The Components Object as one type, followed by the root aliases when asked for. */
export const transformComponentsObject = (components: unknown, ctx: Context): (TypeNode | AliasStatement)[] => {
  const declared = dict(components);
  const aliases = new Map<string, AliasStatement>();
  const groups = COMPONENTS.map(([key, singular, transform]) => {
    const members = entries(declared[key], ctx).map(([name, item]): Member => {
      const type = transform(item, { path: createRef(['components', key, name]), ctx });
      if (ctx.rootTypes && !(ctx.enum && key === 'schemas' && isEnumSchema(item))) {
        const statement = rootAlias({ key, singular, name }, aliases, ctx);
        aliases.set(statement.name, statement);
      }
      return property({ readonly: ctx.immutable, name: propertyName(name), type, comment: jsDoc(item) });
    });
    return property({ name: key, type: members.length > 0 ? object(members) : NEVER });
  });
  return [object(groups), ...aliases.values()];
};

const ROOTS: readonly (readonly [root: string, transform: (node: unknown, ctx: Context) => readonly (TypeNode | AliasStatement)[]])[] = [
  ['paths', (node, ctx) => [transformPathsObject(node, ctx)]],
  ['webhooks', (node, ctx) => [transformWebhooksObject(node, ctx)]],
  ['components', transformComponentsObject],
  ['$defs', (node, ctx) => [transformSchemaObject(node, { path: createRef(['$defs']), ctx })]],
];

const empty = (name: string): AliasStatement => alias(name, record(STRING, NEVER));

/** A root as a statement: an interface (or alias) of its members, or `Record<string, never>` without any. */
const rootStatement = (root: string, node: TypeNode | AliasStatement, ctx: Context): Statement => {
  if (node.kind === 'alias') return node;
  if (node.kind !== 'object' || node.members.length === 0) return empty(root);
  return ctx.exportType ? alias(root, node) : { kind: 'interface', name: root, members: [...node.members] };
};

/** Every statement of the generated file, for a document whose discriminators are already in `ctx`. */
export const transformSchema = (document: unknown, ctx: Context): Statement[] => {
  const declared = dict(document);
  const statements: Statement[] = ctx.readWriteMarkers ? [READ_WRITE_MARKERS] : [];
  for (const [root, transform] of ROOTS) {
    const node = declared[root];
    const nodes = node && typeof node === 'object' ? transform(node, ctx) : [];
    statements.push(...(nodes.length > 0 ? nodes.map((item) => rootStatement(root, item, ctx)) : [empty(root)]));
  }
  statements.push(...ctx.injectFooter);
  const hasOperations = ctx.injectFooter.some((statement) => statement.kind === 'interface' && statement.name === 'operations');
  if (!hasOperations) statements.push(empty('operations'));
  if (ctx.makePathsEnum && declared.paths) statements.push(pathsEnum(declared.paths));
  return statements;
};
