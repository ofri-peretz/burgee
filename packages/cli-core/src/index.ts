/**
 * @interlace/cli-core — the shared contract behind the commander-* and yargs-*
 * extensions. Design: docs/intents/agent-native-cli-layer/design.md. Nothing here
 * parses argv or imports a parser; the extensions do, each in its host's idiom.
 *
 * First requirement landed: E1, the exit-code contract. Everything an agent
 * branches on starts here.
 */

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
