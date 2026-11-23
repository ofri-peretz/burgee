/**
 * `explain`'s resolver (apicontract-agents R2): core's {@link inline}, with each cycle it keeps
 * turned into a marker an agent can read without a document to look the reference up in.
 *
 * Core keeps a cycle as `$ref`, which is right for a schema that is still part of its document. An
 * `explain` page is read on its own, and a `$ref` there points at nothing, so the reference becomes
 * `{ "$comment": "cycle: <pointer>" }`: the schema loosens to "anything" at that one spot, and the
 * comment says which schema repeats. Keywords written beside the reference are kept.
 */
import { inline } from './core/resolve.js';

export interface Explained {
  /** The schema with every local reference inlined and every cycle replaced by its marker. */
  readonly value: unknown;
  /** The references cut as cycles, each once, in the order the walk met them. */
  readonly cycles: readonly string[];
  /** References to other documents, kept as `$ref`: `explain` never fetches. */
  readonly external: readonly string[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The marker for a kept local reference. After core's walk, a local `$ref` string is always a cycle. */
const mark = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => mark(item));
  if (!isObject(value)) return value;
  const entries = Object.entries(value).map(([key, child]): [string, unknown] => [key, mark(child)]);
  const ref = value.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#')) return Object.fromEntries(entries);
  return { ...Object.fromEntries(entries.filter(([key]) => key !== '$ref')), $comment: `cycle: ${ref}` };
};

/** `schema` with every local `$ref` in `document` inlined, cycles marked. Throws core's `RefError` on a reference to nothing. */
export const explainInline = (document: unknown, schema: unknown): Explained => {
  const { value, cycles, external } = inline(document, schema);
  return { value: mark(value), cycles, external };
};
