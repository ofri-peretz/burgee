/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * clispec-conformance — the keys The CLI Spec v0.3 (https://clispec.dev) defines, added to the
 * one `--schema` document beside burgee's own (`schemaVersion` stays 1: every key is new, none
 * changes meaning). Each is read from what the program already declares, never typed twice.
 *
 * Read by `schema-surface.js` only, which `--schema` alone loads (M2): no run that does not ask
 * for the schema loads a byte of this. The commander and yargs façades build their document in
 * `schema.ts` synchronously, and `./yargs` and `./schema` have 21 and 34 bytes of their weight
 * budgets to spare (`weight.test.ts`), so their documents do not carry these keys.
 */
import { definedErrors, type ErrorRow, kindOf } from './error-kinds.js';
import { ExitCode } from './exit-code.js';
import { EXIT_ADVICE } from './root-help.js';

/**
 * R2 — `errors`: every kind the program can fail with and the exit code it leaves with. The
 * contract's rows come from `ExitCode` (all but `OK`), described by the advice root help prints
 * under `Exit codes:`; the program's own follow, from the classes `defineError` registered.
 * `retryable` is true for `timeout` (run it again with more time) and for a class that says so.
 */
export function errorsOf(): ErrorRow[] {
  const contract = Object.entries(ExitCode)
    .filter(([name]) => name !== 'OK')
    .map(([name, code]) => ({ kind: kindOf(code) as string, exit_code: code, retryable: code === ExitCode.TIMEOUT, description: EXIT_ADVICE[name as keyof typeof ExitCode] }));
  return [...contract, ...definedErrors()];
}
