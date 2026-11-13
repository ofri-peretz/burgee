/**
 * References: reading a `$ref`, writing the pointer of the node being transformed, and turning a
 * pointer into the indexed access that names the same thing in the generated types.
 */
import { pointerGet } from './core/resolve.js';

import { type TypeNode, UNKNOWN, access, object, property, reference } from './gen-ts-ast.js';
import { type Dict, dict, isDict } from './gen-ts-dict.js';
import { quote } from './gen-ts-text.js';

const unescape = (token: string): string => decodeURIComponent(token.replaceAll('~1', '/').replaceAll('~0', '~'));

const escape = (token: string): string => token.replaceAll('~', '~0').replaceAll('/', '~1');

/** The tokens after `#/`. A string with no `#/` has none. */
export const pointerOf = (ref: string): string[] => {
  const [, pointer = ''] = ref.split('#/');
  return pointer
    .split('/')
    .map((token) => unescape(token))
    .filter((token) => token !== '');
};

/** Join parts into one pointer. A part that is itself a pointer contributes its tokens. */
export const createRef = (parts: readonly (string | number | undefined)[]): string => {
  let pointer = '#';
  for (const part of parts) {
    if (part === undefined || part === '') continue;
    const text = String(part);
    const tokens = pointerOf(text);
    pointer += tokens.length > 0 ? tokens.map((token) => `/${escape(token)}`).join('') : `/${escape(text)}`;
  }
  return pointer;
};

/** The last token of a pointer, with `/` escaped the way the next pointer segment would be. */
export const childPath = (path: string | undefined, token: string): string => `${path ?? '#'}/${escape(token)}`;

const NO_REFS: readonly string[] = [];

const follow = (document: unknown, ref: string): unknown => {
  try {
    const fragment = pointerOf(ref).map((token) => encodeURIComponent(escape(token)));
    // A falsy target is unresolved upstream, which walks with truthiness.
    return pointerGet(document, `#/${fragment.join('/')}`) || undefined;
  } catch {
    return undefined;
  }
};

/** What a local reference points at, following references to references; `undefined` when it leads nowhere. */
export const resolveRef = (document: unknown, ref: string, visited: readonly string[] = NO_REFS): unknown => {
  if (pointerOf(ref).length === 0) return undefined;
  const node = follow(document, ref);
  if (!isDict(node) || typeof node.$ref !== 'string' || node.$ref === '') return node;
  return visited.includes(node.$ref) ? undefined : resolveRef(document, node.$ref, [...visited, node.$ref]);
};

export interface RefOptions {
  /** Wrap the root in `FlattenedDeepRequired<>`. */
  readonly deep?: boolean;
  /** Segments to reach through `Extract<T, { segment: unknown }>`, for members only some variants have. */
  readonly extract?: readonly string[];
  /** The parameter a reference into a `parameters` array points at: it is indexed by location and name. */
  readonly parameter?: Dict | undefined;
}

const indexed = (type: TypeNode, segment: unknown): TypeNode =>
  access(type, typeof segment === 'number' ? String(segment) : quote(String(segment)));

const extracted = (type: TypeNode, segment: string): TypeNode =>
  indexed(reference('Extract', [type, object([property({ name: segment, type: UNKNOWN })])]), segment);

const ROOT_SEGMENTS = 3;

/** A reference as an indexed access, e.g. `components["schemas"]["Pet"]`. */
export const refType = (ref: string, options: RefOptions = {}): TypeNode => {
  const [root, ...segments] = pointerOf(ref);
  if (root === undefined) {
    throw new Error(`Error parsing $ref: ${ref}. Is this a valid $ref? fix: point it at a value inside the document, as \`#/…\``);
  }
  const parameter = dict(options.parameter);
  const isParameter = !parameter.$ref && Boolean(parameter.in);
  const extract = new Set(options.extract);
  let type: TypeNode = reference(options.deep === true ? `FlattenedDeepRequired<${root}>` : root);
  for (const [index, segment] of segments.entries()) {
    if (index < ROOT_SEGMENTS - 1) type = indexed(type, segment);
    else if (segment === 'properties') continue;
    else if (isParameter && index === segments.length - 1) type = indexed(indexed(type, parameter.in), parameter.name);
    else type = extract.has(segment) ? extracted(type, segment) : indexed(type, segment);
  }
  return type;
};
