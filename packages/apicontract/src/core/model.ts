/**
 * The one model every input format is read into (spec.md R1): a contract is a set of operations,
 * and an operation is a set of payloads, each a JSON Schema travelling in one direction.
 */

/** A JSON Schema as it appears in a document: `true`, `false`, or an object of keywords. */
export type JsonSchema = boolean | { readonly [keyword: string]: unknown };

export const DIRECTIONS = ['request', 'response', 'publish', 'subscribe', 'tool-call', 'tool-result', 'argv'] as const;

/** Who sends a payload. Compatibility is decided per direction (spec.md R3), so it lives here. */
export type Direction = (typeof DIRECTIONS)[number];

export interface Payload {
  /** Stable within its operation, e.g. `body:application/json` or `response:200:application/json`. */
  readonly name: string;
  readonly direction: Direction;
  readonly schema: JsonSchema;
  readonly required: boolean;
}

export interface Operation {
  /** Stable across runs: the spec's own id where it has one. */
  readonly id: string;
  /** JSON Pointer to where the operation is declared in the source document. */
  readonly source: string;
  readonly payloads: readonly Payload[];
}

export interface Contract {
  /** The input format's name, e.g. `openapi`. */
  readonly format: string;
  /** The parsed source, untouched: a generator that must reproduce an incumbent's output reads it. */
  readonly document: unknown;
  readonly operations: readonly Operation[];
}
