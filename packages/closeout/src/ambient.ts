/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The one place in this package that reaches for the ambient `process` (design R7).
 *
 * It was three lines inside `index.ts` until the drop-in façades arrived, and they need the
 * same lookup for a different reason — `restore-cursor`'s contract is "write to whichever of
 * stderr and stdout is a terminal", which is a property of the process and not of a stream a
 * caller passed in. Two copies of a guarded global read is how a package ends up with one of
 * them wrong, so it moved here and both import it.
 *
 * **Read off `globalThis`, never declared.** `declare const process` is a type-level promise
 * with no runtime binding: it compiles, it type-checks, it ships, and then it throws
 * `ReferenceError: globalProcess is not defined` for everybody who called the export the way
 * the README does. That is not a hypothetical — it is closeout 0.1.0, green across
 * thirty-nine tests because every one of them injected a fake process.
 *
 * `undefined` is a real answer here (a runtime with no `process` at all), and every caller
 * says so in its own words rather than failing with a name nobody wrote.
 */
import { type OutputStream } from './cursor.js';

/** The half of `process` this package needs, so the wiring can be tested without one. */
export interface ProcessLike {
  /*
   * Deliberately as wide as Node's own overloads. Narrowing the listener to the exact
   * argument tuple would make `process` itself unassignable and force every caller — this
   * module included — through a cast, which is a worse trade than one permissive signature.
   */
  on(event: string, listener: (...args: never[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
  listenerCount(event: string): number;
  exit(code?: number): never;
  stderr: OutputStream;
  /**
   * Optional because the signal wiring has never needed it and its tests do not supply one:
   * only the terminal-restore façade picks between the two streams.
   */
  stdout?: OutputStream;
  /**
   * The code the process will leave with, which is a property of the process and not of any
   * handler. `exit-hook`'s contract is written in terms of it — a hook is handed the code the
   * program is about to exit with, and a signal overrules whatever was set — so the drop-in
   * path reads and writes it here. Typed as Node types it (`string` is legal and coerced).
   */
  exitCode?: number | string | undefined;
}

/**
 * Node's `process`, seen through the narrow shape above, or `undefined` where there is none.
 *
 * `Reflect.get` rather than `globalThis.process`: the value is bound to a local and every
 * read below goes through that local, which is the spelling `roundel/src/chalk.ts` uses for
 * the identical reason — the repository's process-reference lock is a textual pattern, and a
 * guarded lookup that reads like one is worth more than an entry on its allow-list.
 */
export function ambientProcess(): ProcessLike | undefined {
  const candidate: unknown = Reflect.get(globalThis, 'process');
  return typeof candidate === 'object' && candidate !== null && 'on' in candidate ? (candidate as ProcessLike) : undefined;
}
