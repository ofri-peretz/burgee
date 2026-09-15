/**
 * The slice of the world this package needs, and the one file in it that names the process
 * (Y9). The seam `paratext/src/runtime.ts` and `burgee/src/runtime.ts` declare, for the same
 * reason — nothing else reads `process`, so a test substitutes the world — but a different
 * shape, because what flagstaff needs of the world is different.
 *
 * **Why this one hands back the real process rather than a literal.** paratext's seam can
 * answer `isTTY` once and be done: its callers want a decision. The four façades here are
 * ports graded by their incumbents' own suites, and for those incumbents the process *is*
 * part of the contract, at call time:
 *
 *   - boxen reads `stdout.columns` every time a box is drawn, so a box drawn after a resize
 *     uses the new width. Cache that number at import and the resize silently stops working.
 *   - ora hooks `stdout.write` and `stderr.write` — it mutates the stream objects — and
 *     re-signals a swallowed Ctrl+C through `kill`, which ora's own suite swaps out.
 *   - `cursor.ts` installs and removes signal listeners on the process, because the cursor
 *     belongs to the terminal rather than to whichever stream a caller passed in.
 *
 * So `processRuntime()` returns the process itself, narrowed to the interface below. That is
 * not a shortcut: it is the only shape that leaves *when* and *how often* every read happens
 * exactly where the ports put it, which is what the incumbents' suites grade. The seam is
 * the `Runtime` type — every other file in the package takes one and names no global — and
 * a test still substitutes the world by passing an object of its own.
 *
 * **What the textual lock can and cannot see.** `process-reference-lock.test.ts` matches
 * `process.` followed by one of eight member names. Neither line below is that — one is an
 * import specifier, which the lock strips as a string, and the other hands the binding on
 * without reading a member — so this file would stay green whether or not it were on the
 * allow-list. Its entry there is a statement of where the process is allowed to be named,
 * not a thing the pattern enforces; roundel's `runtime.ts` is invisible for the same reason
 * and says so too. What actually keeps the package honest is that every other file takes a
 * `Runtime` and has no way to name a global, and `subpath-isolation.test.ts` locks which
 * modules may reach this one.
 *
 * `loop.ts` exports a different `Runtime`: the world a *program* hands `hoist()`, which is
 * the way forward and reaches no process at all. This one is the way in, for four ports
 * whose hosts already decided.
 */
import process from 'node:process';

/** The events `cursor.ts` puts a listener on: the three terminations, and `'exit'`. */
export type ExitEvent = NodeJS.Signals | 'exit';

/**
 * Only the members this package actually reads. Anything not named here — `process.exit`,
 * `cwd`, `chdir`, `emit` — is unreachable through the seam by construction, because the
 * declared type is this and not `NodeJS.Process`.
 */
export interface Runtime {
  readonly env: NodeJS.ProcessEnv;
  readonly argv: string[];
  readonly platform: NodeJS.Platform;
  readonly pid: number;
  readonly stdin: NodeJS.ReadStream & { fd: 0 };
  readonly stdout: NodeJS.WriteStream & { fd: 1 };
  readonly stderr: NodeJS.WriteStream & { fd: 2 };
  /** Set by `cli.ts` on the way out. Typed as node types it, string included. */
  exitCode?: number | string | null | undefined;
  kill(pid: number, signal: NodeJS.Signals): void;
  on(event: ExitEvent, listener: () => void): void;
  once(event: ExitEvent, listener: () => void): void;
  removeListener(event: ExitEvent, listener: () => void): void;
  listenerCount(event: ExitEvent): number;
}

/**
 * The real process, narrowed. Nothing is read here: every access through the returned
 * `Runtime` reaches the live process at the moment the caller makes it, which is what keeps
 * `boxen`'s width lazy and lets ora's suite swap `process.kill` under a running spinner.
 */
export const processRuntime = (): Runtime => process;
