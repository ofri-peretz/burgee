/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * clispec-conformance R2 — every failure names its kind: a word a consumer branches on, beside
 * the number it already branches on. The contract's kinds are derived from `ExitCode`'s own
 * names, never typed beside them, so a code added to the contract has a kind the day it lands.
 *
 * Off the startup path: the failure chunk (`failure.js`) and the `--schema` surface (`clispec.js`)
 * read it, and a run that succeeds and asks for no schema loads none of it.
 *
 * snake_case, because clispec v0.3 requires a kind to match `^[a-z][a-z0-9_]*$` (its
 * `$defs.error.kind`); the spec first wrote kebab case, which the published schema refuses.
 */
import { definitions } from './define-error.js';
import { ExitCode } from './exit-code.js';

/** What a kind must look like: clispec v0.3's own pattern. */
const KIND = /^[a-z][a-z0-9_]*$/;

/** A defined error as `--schema`'s `errors` lists it: clispec v0.3's `$defs.error`. */
export interface ErrorRow {
  kind: string;
  exit_code: number;
  retryable: boolean;
  description?: string;
}

/** The kind a contract code means: its `ExitCode` name lower-cased, `SIGINT` as `interrupted`, and none for `OK`. */
export function kindOf(code: number): string | undefined {
  const name = Object.keys(ExitCode).find((key) => ExitCode[key as keyof typeof ExitCode] === code);
  if (name === 'SIGINT') return 'interrupted';
  return name === undefined || name === 'OK' ? undefined : name.toLowerCase();
}

/** A class name as a kind: `QuotaExceededError` → `quota_exceeded`, `HTTPGatewayError` → `http_gateway`. */
export const kindFromName = (name: string): string =>
  name
    .replaceAll(/([a-z\d])([A-Z])/g, '$1_$2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replaceAll(/[^A-Za-z\d]+/g, '_')
    .toLowerCase()
    .replace(/_?error$/, '');

/**
 * The program's own rows, one per `defineError` class in the order defined, each with its kind
 * settled. A kind is the class's declared one, else its name's (`kindFromName`), else `error` for
 * a name with no letters to make one from. A kind the contract or an earlier class already holds
 * is told apart by the class's code (`timeout_12`): a class named `TimeoutError` was valid before
 * kinds existed and must still define, and the contract's `timeout` cannot mean two things.
 */
export function definedErrors(): ErrorRow[] {
  const held = new Set(Object.values(ExitCode).map(kindOf));
  return definitions().map(({ name, code, kind, retryable, description }) => {
    const derived = kind ?? kindFromName(name);
    const base = KIND.test(derived) ? derived : 'error';
    const settled = held.has(base) ? `${base}_${String(code)}` : base;
    held.add(settled);
    return { kind: settled, exit_code: code, retryable: retryable === true, ...(description === undefined ? {} : { description }) };
  });
}
