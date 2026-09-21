/**
 * The slice of a runtime this package needs — the same seam `roundel/policy.ts` declares,
 * for the same reason: nothing here reads `process` directly, so a test is a two-line
 * literal and a host can lie about the terminal on purpose.
 */
export interface Runtime {
  env: Record<string, string | undefined>;
  /**
   * `stderr` is optional and falls back to `stdout` when absent.
   *
   * Only `paratext/terminal-link` reads it — its whole surface is a pair, `terminalLink`
   * against stdout and `terminalLink.stderr` against stderr, and a façade that decided both
   * from one stream would answer the wrong question for half of its API. Optional because a
   * two-line test literal should not have to carry a stream it is not asking about, and
   * because every existing caller of this type predates the field.
   */
  isTTY: { stdout: boolean; stderr?: boolean };
  /**
   * The working directory, for the one capability that has to name it.
   *
   * Optional, because nothing that decides *support* reads it and a two-line test literal
   * should not have to carry it. `setCwd()` with no argument is the only caller, and it is
   * the reason this is here at all: `ansi-escapes`' `setCwd` defaults to `process.cwd()`
   * (R8), and a compatible default that read `process` itself would put a second process
   * reference in the package and break R5.
   */
  cwd?: string;
}

/** What a real process looks like. Callers that have not got one pass their own. */
export const processRuntime = (): Runtime => ({
  env: process.env,
  isTTY: { stdout: process.stdout.isTTY === true, stderr: process.stderr.isTTY === true },
  cwd: process.cwd(),
});
