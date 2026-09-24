/**
 * The error classes an author throws to name an exit code (E6, E7).
 *
 * Their own module, and a small one, so the commander and yargs façades can recognise an
 * `AuthError` without reaching `validate.ts` and the whole run-time validator behind it. Before
 * they could, both filed every handler failure as `runtime`, exit 1, and an `AuthError` thrown
 * from a commander-syntax action told the caller *read the message* where E6 promises *log in
 * and run it again* (D-140). `validate.ts` re-exports both, so no import path changed.
 */
/** A usage problem the caller can fix, carrying the flag that fixes it (E3). */
export class UsageError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

/**
 * E6 — the far side said no. Throw this and the run leaves with `ExitCode.AUTH`.
 *
 * The one error class whose *response* is unambiguous: not "read the message and decide" but
 * "get a credential and run it again". A handler that throws a bare `Error` for a 401 gets
 * `RUNTIME`, which is the code for everything, and a caller retrying on it retries forever.
 *
 * `fix` is the exact command that gets the credential, where the program knows it — `hint` is
 * prose a person reads and `fix` is a line a caller runs, which is the turn the field saves.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
    readonly fix?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
