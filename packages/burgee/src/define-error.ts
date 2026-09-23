/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * E7 / D-118 — an author's own error classes, each with a stable exit code.
 *
 * `defineError({ name: 'QuotaError', code: 10 })` returns a class. Throw it from a handler
 * and the program leaves with 10, printing the message, and `hint` and `fix` when the
 * instance carries them — the same rendering `UsageError` gets. A script or an agent can
 * branch on the code without parsing prose, which is the whole of E7.
 *
 * **A reused code is a startup failure.** The class is registered when `defineError` runs,
 * which is when the module declaring it loads; a second class claiming a code, or a class
 * claiming one of the contract's own seven, throws there. Codes are 7–125: below is the
 * contract, and 126 and up mean *not executable*, *not found* and *killed by signal* to
 * every shell.
 */
const MIN = 7;
const MAX = 125;

/** What an author declares. */
export interface ErrorDefinition {
  /** The class name, shown as the error's `name`. */
  name: string;
  /** The exit code, 7–125, owned by this class alone. */
  code: number;
}

/** What `new` takes: the message, and optionally the E3 `hint` and exact `fix`. */
export interface DefinedErrorOptions {
  hint?: string;
  fix?: string;
}

/** An author-defined error class; `exitCode` is the code it leaves with. */
export interface DefinedErrorClass {
  new (message: string, options?: DefinedErrorOptions): Error & DefinedErrorOptions;
  readonly exitCode: number;
}

/**
 * Where the engine reads the code: a registered symbol on the class, so `execute.ts` finds it
 * without importing this module — only a program that defines an error pays for defining one.
 * A subclass inherits it the way statics are inherited.
 */
export const EXIT_CODE = Symbol.for('burgee.exitCode');

const owners = new Map<number, string>();

export function defineError(definition: ErrorDefinition): DefinedErrorClass {
  const { name, code } = definition;
  if (!Number.isInteger(code) || code < MIN || code > MAX) {
    throw new RangeError(`burgee: defineError "${name}" claims exit code ${String(code)}; use an integer from ${String(MIN)} to ${String(MAX)} — 0–6 and 130 are the contract's own`);
  }
  const owner = owners.get(code);
  if (owner !== undefined) throw new Error(`burgee: defineError "${name}" claims exit code ${String(code)}, which "${owner}" already owns; one code, one class (E7)`);
  owners.set(code, name);
  const Defined = class extends Error {
    static readonly exitCode = code;
    static readonly [EXIT_CODE] = code;
    hint?: string;
    fix?: string;
    constructor(message: string, options: DefinedErrorOptions = {}) {
      super(message);
      this.name = name;
      if (options.hint !== undefined) this.hint = options.hint;
      if (options.fix !== undefined) this.fix = options.fix;
    }
  };
  return Defined;
}
