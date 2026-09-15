/**
 * The slice of the world caique needs, and the one file here that names `process` (Y9) —
 * the same seam `paratext/src/runtime.ts` declares. `decide()` already took the fields it
 * reads and `createIo()` already took its streams; this is the other half, so a program can
 * get a real one without writing `process.stdin` itself.
 *
 * A **function**, for paratext's reason: a runtime built at import freezes the environment
 * as it was when the module graph loaded, which is before a test can say what it wants.
 * `runtime.test.ts` asks twice across a change, so a captured constant cannot pass.
 */

/**
 * Declared structurally, not imported: burgee's `Runtime` satisfies it, so does a literal in
 * a test. `decide.ts` names the narrower pair it reads for the same reason; this satisfies it.
 */
export interface Runtime {
  /** `decide()` reads `CI`: set means nobody is there to type (R6). */
  env: Record<string, string | undefined>;
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  stdout: NodeJS.WritableStream & { isTTY?: boolean };
  /** `stdin` decides whether a person can be asked at all; `stdout`, whether anything is drawn. */
  isTTY: { stdin: boolean; stdout: boolean };
}

/** What a real process looks like. Callers that have not got one pass their own. */
export const processRuntime = (): Runtime => ({
  env: process.env,
  stdin: process.stdin,
  stdout: process.stdout,
  isTTY: { stdin: process.stdin.isTTY === true, stdout: process.stdout.isTTY === true },
});
