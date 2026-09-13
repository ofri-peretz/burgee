/**
 * The slice of a runtime this package needs — the same seam `roundel/policy.ts` declares,
 * for the same reason: nothing here reads `process` directly, so a test is a two-line
 * literal and a host can lie about the terminal on purpose.
 */
export interface Runtime {
  env: Record<string, string | undefined>;
  isTTY: { stdout: boolean };
}

/** What a real process looks like. Callers that have not got one pass their own. */
export const processRuntime = (): Runtime => ({
  env: process.env,
  isTTY: { stdout: process.stdout.isTTY === true },
});
