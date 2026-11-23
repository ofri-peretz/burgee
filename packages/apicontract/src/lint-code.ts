/**
 * `lint`'s rules on code (apicontract-lint spec.md R14, R15, kind 3): a rule whose `given` says
 * `implementation: true` reads, for each operation it selects, the handler the user owns, found
 * through `apicontract.map.json`. The handler is read once, statically, into a `HandlerSummary`
 * (`lint-code-read.ts`); the functions here judge that summary, pure and total, as the value
 * functions judge a document.
 *
 * - `calls` (`{ name }`): the handler calls `name`, as `name(…)` or `x.name(…)`.
 * - `validates-input` (`{ with? }`): the request reaches the handler validated. A target whose
 *   generated layer validates every request (`nest`, `hono`, `fastify`, `express`) holds it;
 *   otherwise the handler passes its input to one of `with` (default `parse`, `safeParse`,
 *   `validate`, `assert`).
 * - `returns-error-shape` (`{ ref }`): every `return { status, body }` with a status of 400 or
 *   more has a literal `body` with every property the schema at `ref` requires. A body built
 *   elsewhere cannot be read statically and is not judged.
 */
import { type Contract } from './core/model.js';
import { pointerGet } from './core/resolve.js';
import { type CodeFunctionName } from './lint-names.js';

/** One `return { … }` in a handler: its literal status, and its literal body's keys. */
export interface Returned {
  readonly status?: number;
  /** The property names of a literal `body`; absent when the body is not an object literal or there is none. */
  readonly bodyKeys?: readonly string[];
  /** Whether the object has a `body` member at all. */
  readonly hasBody: boolean;
}

/** What a rule on code reads of one handler. */
export interface HandlerSummary {
  /** The name of every function the handler calls, the last name of a member call. */
  readonly calls: readonly string[];
  /** The functions the handler itself passes its input, or a member of it, to; a nested function's calls are not counted. */
  readonly inputCalls: readonly string[];
  readonly returns: readonly Returned[];
}

/** One handler of an operation, as the map names it and the source holds it. */
export interface Handler {
  readonly file: string;
  readonly symbol: string;
  /** The target that wrote it. */
  readonly target: string;
  /** Where it starts, 1-based; absent when it was not found. */
  readonly line?: number;
  readonly summary?: HandlerSummary;
  /** Why it could not be read, when it could not. */
  readonly missing?: string;
}

/** A handler that was found and read: its line and its summary are there. */
export type ReadHandler = Handler & { readonly line: number; readonly summary: HandlerSummary };

/** Whether a handler was found and read, rather than missing. */
export const isRead = (handler: Handler): handler is ReadHandler => handler.summary !== undefined;

/** The handlers of each operation, as `lint` reads them for a run. */
export interface CodeIndex {
  readonly handlersOf: (operation: string) => readonly Handler[];
}

/** The targets whose generated layer validates every request before the handler sees it. */
export const VALIDATING = new Set(['nest', 'hono', 'fastify', 'express']);
const VALIDATORS = ['parse', 'safeParse', 'validate', 'assert'];
const ERROR = 400;

const strings = (value: unknown): string[] | undefined => (Array.isArray(value) && value.every((each) => typeof each === 'string') ? (value as string[]) : undefined);

const callsOf = (summary: HandlerSummary, options: Readonly<Record<string, unknown>>): string | undefined => {
  const { name } = options;
  if (typeof name !== 'string' || name === '') return '`calls` needs `functionOptions.name`, the function to call';
  return summary.calls.includes(name) ? undefined : `does not call \`${name}\``;
};

const validatesOf = (handler: Handler, summary: HandlerSummary, options: Readonly<Record<string, unknown>>): string | undefined => {
  if (VALIDATING.has(handler.target)) return undefined;
  const names = strings(options.with) ?? VALIDATORS;
  return summary.inputCalls.some((name) => names.includes(name)) ? undefined : `does not pass its input to ${names.map((name) => `\`${name}\``).join(', ')}`;
};

/** What `ref` points at in the document, or `undefined` where it points at nothing. */
const schemaAt = (contract: Contract, ref: string): unknown => {
  // Stryker disable next-line BlockStatement: an emptied catch returns `undefined` all the same.
  try { return pointerGet(contract.document, ref); } catch { return undefined; }
};

/** The properties the schema at `ref` requires, or why there is no schema there. */
const requiredAt = (contract: Contract, ref: unknown): string[] | string => {
  if (typeof ref !== 'string' || ref === '') return '`returns-error-shape` needs `functionOptions.ref`, a pointer to the error schema';
  const schema = schemaAt(contract, ref);
  if (typeof schema !== 'object' || schema === null) return `\`${ref}\` names no schema in the document`;
  return strings((schema as Record<string, unknown>).required) ?? [];
};

const errorShapeOf = (contract: Contract, summary: HandlerSummary, options: Readonly<Record<string, unknown>>): string | undefined => {
  const required = requiredAt(contract, options.ref);
  if (typeof required === 'string') return required;
  const problems = summary.returns.flatMap((returned) => {
    if (returned.status === undefined || returned.status < ERROR) return [];
    if (!returned.hasBody) return [`returns ${String(returned.status)} with no body`];
    const missing = required.filter((key) => returned.bodyKeys !== undefined && !returned.bodyKeys.includes(key));
    return missing.length === 0 ? [] : [`returns ${String(returned.status)} without ${missing.map((key) => `\`${key}\``).join(', ')} (${options.ref as string})`];
  });
  return problems.length === 0 ? undefined : problems.join('; ');
};

/** One code function on one handler: `undefined` when it holds, else what is wrong. */
export const applyCode = (name: CodeFunctionName, handler: ReadHandler, contract: Contract, options: Readonly<Record<string, unknown>> = {}): string | undefined => {
  const { summary } = handler;
  switch (name) {
    case 'calls': {
      return callsOf(summary, options);
    }
    case 'validates-input': {
      return validatesOf(handler, summary, options);
    }
    case 'returns-error-shape': {
      return errorShapeOf(contract, summary, options);
    }
  }
};

/** The fix for an operation the map has no handler for (R15). */
export const NO_HANDLER_FIX = 'generate a server for it with `apicontract gen` (targets nest, hono, fastify or express record the handler you own in apicontract.map.json), or drop `implementation` from the rule';
/** The fix for a handler the map names and the source does not hold. */
export const NOT_FOUND_FIX = 'keep the name apicontract generated for it (the generated code requires it), or run `apicontract gen` to write the map again';
