/**
 * One operation as `explain` prints it and `gen markdown` writes it: the model's payloads with
 * every schema resolved (R2), what the source document says about it, and the size cap (R3).
 */
import { bytesOf, cap } from './command-explain-cap.js';
import { explainInline } from './command-explain-inline.js';
import { type Contract, type Direction, type Operation } from './core/model.js';
import { pointerGet } from './core/resolve.js';

export interface ExplainedPayload {
  readonly name: string;
  readonly direction: Direction;
  readonly required: boolean;
  readonly schema: unknown;
}

export interface Explanation {
  readonly id: string;
  readonly format: string;
  /** JSON Pointer to the operation in the source document. */
  readonly source: string;
  /** The HTTP method and path, for an operation read from `paths`. */
  readonly method?: string;
  readonly path?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly payloads: readonly ExplainedPayload[];
  /** References cut as cycles: each became `{ "$comment": "cycle: <pointer>" }`. */
  readonly cycles?: readonly string[];
  /** References to other documents, left as `$ref`. */
  readonly external?: readonly string[];
  /** Present only when the cap cut something: the budget, and every pointer emptied. */
  readonly truncated?: { readonly maxBytes: number; readonly cut: readonly string[] };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const untoken = (token: string): string => token.replaceAll('~1', '/').replaceAll('~0', '~');

const HTTP_TOKENS = 4;

/** `{ method, path }` when the operation sits under `#/paths/<path>/<method>` (or `…/additionalOperations/<method>`). */
const http = (source: string): { method: string; path: string } | undefined => {
  const tokens = source.split('/');
  // `#`, `paths`, the path, the method: four tokens at least.
  if (tokens[1] !== 'paths' || tokens.length < HTTP_TOKENS) return undefined;
  return { method: untoken(tokens.at(-1) as string).toUpperCase(), path: untoken(tokens[2] as string) };
};

/** What the source document declares at the operation's pointer, when that is an object. */
const declared = (contract: Contract, operation: Operation): Record<string, unknown> => {
  try {
    const node = pointerGet(contract.document, operation.source);
    return isObject(node) ? node : {};
  } catch {
    return {};
  }
};

/** `{ [key]: value }` when the source declares `key` as non-empty text, else nothing. */
const prose = (source: Record<string, unknown>, key: 'summary' | 'description'): { summary?: string; description?: string } => {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? { [key]: value } : {};
};

/** The operation's tags as the source declares them: strings only. */
export const tagsOf = (contract: Contract, operation: Operation): string[] => {
  const { tags } = declared(contract, operation);
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
};

/** The operation, fully resolved, before any cap. */
export const describe = (contract: Contract, operation: Operation): Explanation => {
  const cycles = new Set<string>();
  const external = new Set<string>();
  const payloads = operation.payloads.map((payload): ExplainedPayload => {
    const resolved = explainInline(contract.document, payload.schema);
    for (const ref of resolved.cycles) cycles.add(ref);
    for (const ref of resolved.external) external.add(ref);
    return { name: payload.name, direction: payload.direction, required: payload.required, schema: resolved.value };
  });
  const source = declared(contract, operation);
  const tags = tagsOf(contract, operation);
  return {
    id: operation.id,
    format: contract.format,
    source: operation.source,
    ...http(operation.source),
    ...prose(source, 'summary'),
    ...prose(source, 'description'),
    ...(tags.length === 0 ? {} : { tags }),
    payloads,
    ...(cycles.size === 0 ? {} : { cycles: [...cycles] }),
    ...(external.size === 0 ? {} : { external: [...external] }),
  };
};

/** The refusal when no cut makes an explanation fit: exit 2, with the budget that would. */
export class BudgetError extends Error {
  readonly code = 'USAGE';

  constructor(id: string, max: number, smallest: number) {
    super(`"${id}" does not fit in ${String(max)} bytes even with every schema emptied (${String(smallest)} bytes). fix: pass --max-bytes ${String(smallest)} or more`);
    this.name = 'BudgetError';
  }
}

/** The depth of a payload's schema in an explanation: `/payloads/<n>/schema`. Nothing above it is cut. */
const SCHEMA_DEPTH = 3;

/** The budget `result` fits under when that budget is what its `truncated` record names: the figure is part of the text it measures. */
const smallest = (result: Explanation & { truncated: { maxBytes: number } }): number => {
  let size = bytesOf(result);
  while (bytesOf({ ...result, truncated: { ...result.truncated, maxBytes: size } }) !== size) {
    size = bytesOf({ ...result, truncated: { ...result.truncated, maxBytes: size } });
  }
  return size;
};

/**
 * The explanation under a budget of `max` bytes of compact JSON, `truncated` included. The cap
 * runs on a budget that leaves room for the `truncated` record and shrinks by whatever the record
 * overshoots, down to every schema emptied; if even that does not fit, the refusal names its size,
 * which is a budget that always works.
 */
export const capped = (explanation: Explanation, max: number | undefined): Explanation => {
  if (max === undefined || bytesOf(explanation) <= max) return explanation;
  let budget = max;
  for (;;) {
    const { value, cut } = cap(explanation, Math.max(budget, 0), SCHEMA_DEPTH);
    const result = { ...(value as Explanation), truncated: { maxBytes: max, cut } };
    const over = bytesOf(result) - max;
    if (over <= 0) return result;
    if (budget <= 0) throw new BudgetError(explanation.id, max, smallest(result));
    budget -= over;
  }
};
