/**
 * `@inquirer/core`'s five error classes, re-stated.
 *
 * They are part of the façade's *identity*, not its decoration: `core.test.ts` asserts
 * `rejects.toThrow(AbortPromptError)` and `rejects.toBeInstanceOf(ValidationError)`, so a
 * caller that catches by class has to catch ours by the same class. Each carries the name
 * and the default message the incumbent gives it, because `toThrowErrorMatchingInlineSnapshot`
 * prints `[HookError: …]` — the class name and the message, together.
 *
 * caique's own error envelope (`CliError`, `CANCELLED`, `USAGE`) is unchanged and lives in
 * `binding.ts`. This file is the incumbent's vocabulary, spoken at the compatibility subpath
 * and nowhere else.
 */

/** Thrown when the `AbortSignal` handed to a prompt aborts. */
export class AbortPromptError extends Error {
  override name = 'AbortPromptError';
  override message = 'Prompt was aborted';

  constructor(options?: { cause?: unknown }) {
    super();
    this.cause = options?.cause;
  }
}

/** Thrown when a caller calls `.cancel()` on the returned promise. */
export class CancelPromptError extends Error {
  override name = 'CancelPromptError';
  override message = 'Prompt was canceled';
}

/** Thrown when the process is going away under the prompt — Ctrl-C, or a signalled exit. */
export class ExitPromptError extends Error {
  override name = 'ExitPromptError';
}

/** Thrown when a hook is called outside a prompt render, where there is no store to read. */
export class HookError extends Error {
  override name = 'HookError';
}

/** Thrown when a hook is called correctly but handed something it cannot use. */
export class ValidationError extends Error {
  override name = 'ValidationError';
}
