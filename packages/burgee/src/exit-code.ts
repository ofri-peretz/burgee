/** E1 — exit codes are a contract. No other literal may reach `process.exitCode`. */
export const ExitCode = {
  /** Command completed. */
  OK: 0,
  /** The command ran and failed. Never accompanied by help text (E2). */
  RUNTIME: 1,
  /** Bad arguments, unknown command, missing flag, prompt needed in a non-TTY (P2). */
  USAGE: 2,
  /** Config file or environment could not be loaded or validated (V1). */
  CONFIG: 3,
  /** The user or caller cancelled. */
  CANCELLED: 4,
  /**
   * E6 — the far side said no: a credential is missing, expired, or refused.
   *
   * Its own code because it is the most actionable one in the survey. `RUNTIME` means *it
   * failed, read the message*; `AUTH` means *log in and run it again*, and a script or an
   * agent can branch on that without parsing prose. `USAGE` says fix the script, `CONFIG`
   * says fix the runner, and this says fix the credential — three different responses that
   * collapsed into one code before it existed.
   *
   * **5, where `gh` uses 4.** Four is `CANCELLED` here and has been since the contract was
   * written, and moving a published code to match another tool's is a breaking change for
   * every consumer that already branches on it. The survey's other citation, `aws` v2, uses
   * 252/253/254 and agrees with nobody either; what matters is that the code is stable and
   * documented, not that it matches a particular neighbour.
   */
  AUTH: 5,
  /**
   * agent-lint-conformance R3 — the deadline `--timeout` set has passed: retry with more time.
   *
   * Its own code because a caller that cancelled and a deadline that passed want different
   * responses, one a decision and the other a retry. **6, where GNU `timeout` uses 124**: 124 is
   * inside the 7–125 range `defineError` hands to authors, and 6 is the one number the contract
   * had reserved and nobody could hold (D-20261011-timeout-exit-code).
   */
  TIMEOUT: 6,
  /** SIGINT after the terminal was restored (E5). */
  SIGINT: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

const CODES: ReadonlySet<number> = new Set(Object.values(ExitCode));

/**
 * True for the eight codes in the contract and nothing else. The set holds numbers only, so it
 * answers `false` for `'2'` or any other non-number by itself; the `typeof` guard this used to
 * carry was the 27 bytes that paid for `TIMEOUT` on every entry that reaches this file.
 */
export function isExitCode(n: unknown): n is ExitCode {
  return CODES.has(n as number);
}
