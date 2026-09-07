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
  /** SIGINT after the terminal was restored (E5). */
  SIGINT: 130,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

const CODES: ReadonlySet<number> = new Set(Object.values(ExitCode));

/** True for the six codes in the contract and nothing else. */
export function isExitCode(n: unknown): n is ExitCode {
  return typeof n === 'number' && CODES.has(n);
}
