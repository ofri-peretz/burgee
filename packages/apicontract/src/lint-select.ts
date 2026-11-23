/**
 * `lint`'s model selectors (apicontract-lint spec.md R4, "model selectors first"): the nodes a
 * rule's `given` picks out of a contract. A selector reads the model, so it works the same on
 * every format the adapters read, and reads the source document only for what the model does not
 * carry (an operation's `operationId`, `tags`, `description`; a parameter's own `description`).
 *
 * Every node has a pointer. A schema reached through a local `$ref` is visited once, at its target's
 * pointer, so a shared component's finding is reported once, where it can be fixed. An inline
 * schema's pointer is logical: the operation's pointer, the payload's name, then the path inside it.
 */
import { tagsOf } from './command-explain-operation.js';
import { type Contract, type Operation } from './core/model.js';
import { pointerGet } from './core/resolve.js';

export const SELECTS = ['document', 'operation', 'parameter', 'property', 'schema'] as const;
export type Select = (typeof SELECTS)[number];

export interface Given {
  readonly select: Select;
  /** Only these input formats, e.g. `["openapi", "swagger2"]`. */
  readonly formats?: readonly string[];
  /** Only operations, or members of operations, carrying this tag. */
  readonly tag?: string;
  /** Only operations, or members of operations, with this HTTP method, upper case. */
  readonly method?: string;
}

export interface LintNode {
  /** A JSON Pointer into the source document, or a logical one for an inline payload schema. */
  readonly pointer: string;
  readonly value: Readonly<Record<string, unknown>>;
  /** The operation the node belongs to; absent for the document. */
  readonly operation?: Operation;
  /** A property's or parameter's name. */
  readonly name?: string;
}

/** A value's own members, read as a record: `{}` for null and undefined, so a missing member reads as `undefined`. */
const membersOf = (value: unknown): Record<string, unknown> => Object(value) as Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** What a pointer names in the document, or `undefined` when it names nothing. */
const at = (document: unknown, pointer: string): unknown => {
  try {
    return pointerGet(document, pointer);
    // Stryker disable next-line BlockStatement: equivalent, an empty handler returns the same undefined
  } catch {
    return undefined;
  }
};

/** A local `$ref` followed to its target, with its target's pointer; anything else as it is. */
const follow = (document: unknown, node: unknown, pointer: string, seen = new Set<string>()): { node: unknown; pointer: string } => {
  const ref = membersOf(node).$ref;
  // A reference to another file is not followed: `at` finds nothing for it, as `pointerGet` refuses it.
  // Stryker disable next-line ConditionalExpression: equivalent, `at` finds nothing for a `$ref` that is not a string
  if (typeof ref !== 'string' || seen.has(ref)) return { node, pointer };
  seen.add(ref);
  const target = at(document, ref);
  return target === undefined ? { node, pointer } : follow(document, target, ref, seen);
};

const METHOD_TOKENS = 4;

/** The HTTP method of an operation read from `#/paths/<path>/<method>`, upper case. */
export const methodOf = (operation: Operation): string | undefined => {
  const tokens = operation.source.split('/');
  return tokens[1] === 'paths' && tokens.length >= METHOD_TOKENS ? (tokens.at(-1) as string).toUpperCase() : undefined;
};

const operationsOf = (contract: Contract, given: Given): Operation[] =>
  contract.operations.filter(
    (operation) => (given.tag === undefined || tagsOf(contract, operation).includes(given.tag)) && (given.method === undefined || methodOf(operation) === given.method.toUpperCase()),
  );

const operationNodes = (contract: Contract, given: Given): LintNode[] =>
  operationsOf(contract, given).map((operation) => ({ pointer: operation.source, value: membersOf(at(contract.document, operation.source)), operation }));

/** An OpenAPI or Swagger operation's parameters, its path item's first: each once, at its own pointer. */
const parameterNodes = (contract: Contract, given: Given): LintNode[] => {
  const seen = new Set<string>();
  return operationsOf(contract, given).flatMap((operation) => {
    const item = operation.source.split('/').slice(0, -1).join('/');
    return [item, operation.source].flatMap((owner) => {
      const list = membersOf(at(contract.document, owner)).parameters;
      if (!Array.isArray(list)) return [];
      return list.flatMap((parameter, index): LintNode[] => {
        const found = follow(contract.document, parameter, `${owner}/parameters/${String(index)}`);
        if (seen.has(found.pointer) || !isRecord(found.node)) return [];
        seen.add(found.pointer);
        return [{ pointer: found.pointer, value: found.node, operation, name: String(found.node.name) }];
      });
    });
  });
};

/** The keywords whose values are schemas, and those whose values are lists or maps of them. */
const ONE = ['items', 'additionalProperties', 'not', 'contains', 'if', 'then', 'else', 'propertyNames', 'unevaluatedItems', 'unevaluatedProperties'] as const;
const LIST = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const;
const MAP = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'] as const;

interface Walk {
  readonly document: unknown;
  readonly seen: Set<string>;
  readonly schemas: LintNode[];
  readonly properties: LintNode[];
}

/** A schema's sub-schemas, each with its pointer and, for a property, its name. */
const childrenOf = (schema: Readonly<Record<string, unknown>>, pointer: string): { node: unknown; pointer: string; name?: string }[] => [
  ...ONE.map((keyword) => ({ node: schema[keyword], pointer: `${pointer}/${keyword}` })),
  ...LIST.flatMap((keyword) => {
    const list = schema[keyword];
    // Stryker disable next-line ArrayDeclaration: equivalent, `walk` skips anything that is not a schema
    return Array.isArray(list) ? list.map((item: unknown, index) => ({ node: item, pointer: `${pointer}/${keyword}/${String(index)}` })) : [];
  }),
  ...MAP.flatMap((keyword) => {
    const map = schema[keyword];
    // Stryker disable next-line ArrayDeclaration: equivalent, `walk` skips anything that is not a schema
    if (!isRecord(map)) return [];
    return Object.entries(map).map(([key, item]) => ({ node: item, pointer: `${pointer}/${keyword}/${token(key)}`, ...(keyword === 'properties' ? { name: key } : {}) }));
  }),
];

interface At {
  readonly node: unknown;
  readonly pointer: string;
  readonly name?: string;
}

/** Every schema under `at.node`, depth first, each once; a property also as a property node. */
const walk = (state: Walk, at: At, operation: Operation): void => {
  const found = follow(state.document, at.node, at.pointer);
  if (state.seen.has(found.pointer) || !isRecord(found.node)) return;
  state.seen.add(found.pointer);
  const schema = found.node;
  // A reference's own keywords (a `description` beside the `$ref`) are read with its target's.
  const value = { ...schema, ...(at.node as Readonly<Record<string, unknown>>) };
  state.schemas.push({ pointer: found.pointer, value, operation });
  if (at.name !== undefined) state.properties.push({ pointer: found.pointer, value, operation, name: at.name });
  for (const child of childrenOf(schema, found.pointer)) walk(state, child, operation);
};

const schemaWalk = (contract: Contract, given: Given): Walk => {
  const state: Walk = { document: contract.document, seen: new Set(), schemas: [], properties: [] };
  for (const operation of operationsOf(contract, given)) {
    for (const payload of operation.payloads) walk(state, { node: payload.schema, pointer: `${operation.source} ${payload.name}` }, operation);
  }
  return state;
};

/** The nodes a `given` selects in a contract. */
export const select = (contract: Contract, given: Given): LintNode[] => {
  if (given.formats !== undefined && !given.formats.includes(contract.format)) return [];
  switch (given.select) {
    case 'document': {
      return [{ pointer: '#', value: membersOf(contract.document) }];
    }
    case 'operation': {
      return operationNodes(contract, given);
    }
    case 'parameter': {
      return parameterNodes(contract, given);
    }
    case 'property': {
      return schemaWalk(contract, given).properties;
    }
    case 'schema': {
      return schemaWalk(contract, given).schemas;
    }
  }
};
