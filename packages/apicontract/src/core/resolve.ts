/**
 * The `$ref` resolver (spec.md R-Q3, modelled in `.sdlc/intents/apicontract/adapter.qnt`).
 *
 * A depth-first walk that inlines references. A reference whose target is already on the open path
 * is a cycle: it is kept as a `$ref` and never entered, so the walk is never deeper than the
 * document has distinct references. The rule is per occurrence, never per reference: the same
 * reference is inlined on one path and kept on another.
 */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOwn = (value: unknown, key: string): boolean =>
  // eslint-disable-next-line conventions/consistent-existence-index-check -- Own members only: `#/toString` must not resolve to an inherited function
  typeof value === 'object' && value !== null && Object.hasOwn(value, key);

/** A reference that cannot be followed. The message ends in a `fix:` line. */
export class RefError extends Error {
  readonly ref: string;

  constructor(ref: string, reason: string, fix: string) {
    super(`cannot resolve \`${ref}\`: ${reason}. fix: ${fix}`);
    this.name = 'RefError';
    this.ref = ref;
  }
}

const decode = (ref: string): string => {
  try {
    return decodeURIComponent(ref.slice(1));
  } catch {
    throw new RefError(ref, 'it is not a valid URI fragment', 'percent-encode the reference correctly');
  }
};

/** The value a local reference (`#`, `#/a/b`) points at, by RFC 6901. */
export const pointerGet = (document: unknown, ref: string): unknown => {
  if (!ref.startsWith('#')) {
    throw new RefError(ref, 'it points outside this document', 'bundle the document first, or use a `#/…` reference');
  }
  const fragment = decode(ref);
  if (fragment === '') return document;
  if (!fragment.startsWith('/')) {
    throw new RefError(ref, 'a JSON Pointer starts with `/`', `write \`#/${fragment}\``);
  }
  let node = document;
  for (const token of fragment.slice(1).split('/')) {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!hasOwn(node, key)) {
      throw new RefError(ref, `nothing is at \`${key}\``, 'point it at a value the document defines');
    }
    node = (node as Record<string, unknown>)[key];
  }
  return node;
};

export interface Inlined {
  /** A copy of the input with every followed reference replaced by its target. */
  readonly value: unknown;
  /** References kept because their target was already open: the cycles. */
  readonly cycles: readonly string[];
  /** References kept because they point outside the document. */
  readonly external: readonly string[];
}

/**
 * Inline every local reference under `node`.
 *
 * Keywords beside a `$ref` are kept and the target moves under `allOf`, which means the same thing
 * in JSON Schema 2020-12. An OpenAPI 3.0 reader, where such keywords are ignored, drops them first.
 *
 * ponytail: the walk does not know which keywords hold schemas, so a `{ "$ref": "#/…" }` written
 * as data inside `example`, `const` or `enum` is followed too. Make the walk keyword-aware when a
 * fixture needs it.
 */
export const inline = (document: unknown, node: unknown): Inlined => {
  const cycles = new Set<string>();
  const external = new Set<string>();

  const walk = (value: unknown, open: readonly string[]): unknown => {
    if (Array.isArray(value)) return value.map((item) => walk(item, open));
    if (!isObject(value)) return value;
    const walked = (entries: [string, unknown][]): Record<string, unknown> =>
      Object.fromEntries(entries.map(([key, child]) => [key, walk(child, open)]));
    const ref = value.$ref;
    // A property that happens to be named `$ref` holds a schema, not a string.
    if (typeof ref !== 'string') return walked(Object.entries(value));
    const siblings = walked(Object.entries(value).filter(([key]) => key !== '$ref'));
    if (!ref.startsWith('#')) {
      external.add(ref);
      return { ...siblings, $ref: ref };
    }
    if (open.includes(ref)) {
      cycles.add(ref);
      return { ...siblings, $ref: ref };
    }
    const target = walk(pointerGet(document, ref), [...open, ref]);
    if (Object.keys(siblings).length === 0) return target;
    const rest = Array.isArray(siblings.allOf) ? (siblings.allOf as unknown[]) : [];
    return { ...siblings, allOf: [target, ...rest] };
  };

  const value = walk(node, []);
  return { value, cycles: [...cycles], external: [...external] };
};
