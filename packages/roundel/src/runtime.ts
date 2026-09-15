/**
 * The slice of the world this package needs, and the one file in it that names the process
 * (Y9). The same seam `paratext/src/runtime.ts` and `burgee/src/runtime.ts` declare, for
 * the same reason: `policy.ts` answers "where is this output going?" from a `Runtime`, so a
 * test declares a terminal in two lines and a host can lie about one on purpose.
 *
 * The guarded cast below moved here whole from `chalk.ts`, unchanged. It is guarded because
 * `process` is not a given where a bundle runs, and it is bound to a local because a
 * textual lock cannot tell `proc?.env` from any other local — the exemption is recorded in
 * burgee's `process-reference-lock.test.ts` against this file, so a reader looking for it
 * finds it, but it is the cast and not the entry that keeps roundel honest.
 *
 * Nothing is cached here. `./chalk` calls `processRuntime()` twice at import because
 * chalk's contract is "detect the terminal at import" (R6); every other caller in the
 * family passes its own `Runtime` and never reaches this file at all.
 */

/**
 * The slice of a runtime the policy needs. burgee's `processRuntime` satisfies it, so does
 * a two-line literal in a test; nothing here imports a type from anywhere.
 */
export interface Runtime {
  env: Record<string, string | undefined>;
  isTTY: { stdout: boolean };
  /**
   * The process arguments, when the caller owns them: `--color`, `--no-color` and
   * `--color=…` are read in `policy.ts` and nowhere else. A test literal leaves it out.
   */
  argv?: readonly string[];
}

/** The whole of the global this package is willing to read. Written out, so it is a list. */
interface Proc {
  env: Runtime['env'];
  argv?: string[];
  stdout?: { isTTY?: boolean };
  stderr?: { isTTY?: boolean };
}

const proc = (globalThis as { process?: Proc }).process;

/**
 * The real process. `stream` names the stream this output is going to — `chalkStderr` and
 * `supportsColorStderr` detect against stderr, as chalk does — and its `isTTY` lands in
 * `isTTY.stdout`, which is the policy's name for "the stream this output goes to" rather
 * than for fd 1 in particular.
 *
 * `argv` defaults to empty rather than absent: `exactOptionalPropertyTypes` makes an
 * optional `argv` mean "the key may be missing", not "the value may be undefined".
 */
// prettier-ignore — one line for the reason `policy.ts` gives: `./chalk` reaches this file
// and R8 caps that whole graph at chalk 6's own 9,370 bytes, which tsc's indentation spends.
export const processRuntime = (stream: 'stdout' | 'stderr' = 'stdout'): Runtime => ({ env: proc?.env ?? {}, argv: proc?.argv ?? [], isTTY: { stdout: proc?.[stream]?.isTTY === true } });
