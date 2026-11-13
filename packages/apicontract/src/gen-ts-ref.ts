/**
 * References: reading a `$ref`, writing the pointer of the node being transformed, and turning a
 * pointer into the indexed access that names the same thing in the generated types.
 */
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

/** The tokens of the pointer a transform stands at; a transform given no path stands nowhere. */
export const pathTokens = (path: string | undefined): string[] => (path === undefined ? [] : pointerOf(path));

/** An own member of an object or array, by RFC 6901: `#/toString` must not resolve to an inherited function. */
const memberAt = (node: unknown, token: string): unknown =>
  // eslint-disable-next-line conventions/consistent-existence-index-check -- Own members only, as `core/resolve.ts` reads a pointer
  typeof node === 'object' && node !== null && Object.hasOwn(node, token) ? (node as Dict)[token] : undefined;

const follow = (document: unknown, ref: string): unknown => {
  let node = document;
  for (const token of pointerOf(ref)) node = memberAt(node, token);
  // A falsy target is unresolved upstream, which walks with truthiness.
  return node || undefined;
};

/** What a local reference points at, following references to references; `undefined` when it leads nowhere. */
export const resolveRef = (document: unknown, ref: string, visited: ReadonlySet<string> = new Set()): unknown => {
  if (pointerOf(ref).length === 0) return undefined;
  const node = follow(document, ref);
  if (!isDict(node) || typeof node.$ref !== 'string' || node.$ref === '') return node;
  return visited.has(node.$ref) ? undefined : resolveRef(document, node.$ref, new Set([...visited, node.$ref]));
};

export interface RefOptions {
  /** Wrap the root in `FlattenedDeepRequired<>`. */
  readonly deep?: boolean;
  /** Segments to reach through `Extract<T, { segment: unknown }>`, for members only some variants have. */
  readonly extract?: ReadonlySet<string>;
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
  let type: TypeNode = reference(options.deep === true ? `FlattenedDeepRequired<${root}>` : root);
  for (const [index, segment] of segments.entries()) {
    if (index < ROOT_SEGMENTS - 1) type = indexed(type, segment);
    else if (segment === 'properties') continue;
    else if (isParameter && index === segments.length - 1) type = indexed(indexed(type, parameter.in), parameter.name);
    else type = options.extract?.has(segment) ? extracted(type, segment) : indexed(type, segment);
  }
  return type;
};
