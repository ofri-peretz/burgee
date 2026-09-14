/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `once(fn)` — a function that runs at most once and returns its first result thereafter
 * (design R5).
 *
 * Two packages, 262 M downloads a week between them, for this: `onetime` (162.3 M/wk) calls
 * `mimic-fn` (99.7 M/wk) so that the wrapper it returns still answers to the wrapped
 * function's `name` and `length`. Both are inside this layer's own incumbent tree —
 * `restore-cursor` → `onetime` → `mimic-fn` — so the drop-in recipe is incomplete without
 * it, which is the only reason a once-wrapper lives in a package about exiting.
 *
 * ## What "preserving" means here, and why each half is load-bearing
 *
 * **`name` and `length`.** Not cosmetics: a wrapper whose `name` is `''` turns every stack
 * frame and every deadline report into `(anonymous)`, and this package's own report names
 * handlers by `fn.name`. Wrapping a handler in `once()` must not be the reason a hang
 * becomes unattributable.
 *
 * **`this`.** A plain arrow would swallow the receiver, so `obj.method = once(obj.method)`
 * would call the method against `undefined` — the failure arrives later, somewhere else,
 * and looks nothing like the line that caused it. The wrapper is therefore a `function`
 * expression that forwards its own `this`, which is the one thing an arrow cannot do.
 *
 * Zero dependencies, and about as many lines as `mimic-fn`'s README.
 */

/** Any function, seen the way a wrapper has to see one: whatever it takes, whatever it returns. */
type AnyFunction = (...args: never[]) => unknown;

/**
 * Wrap `fn` so it runs at most once.
 *
 * Later calls do not run it again and do not throw: they return the first result, which is
 * what makes this safe on an exit path where two triggers race. The arguments of a second
 * call are ignored, deliberately and visibly — a "once" that quietly re-ran for different
 * arguments would be a memoiser, and a memoiser on a shutdown handler is a bug with a
 * friendly name.
 */
export function once<T extends AnyFunction>(fn: T): T {
  let called = false;
  let result: ReturnType<T>;

  // A `function` expression, not an arrow: this is where `this` is forwarded. Typed as `T`
  // at the point of creation rather than asserted twice on the way out — `as unknown as T`
  // is two claims where one will do, and the second of them is unreviewable.
  const wrapper = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    if (called) return result;
    called = true;
    result = fn.apply(this, args) as ReturnType<T>;
    return result;
  };

  /*
   * `name` and `length` are configurable-but-not-writable on every function, so they are
   * defined rather than assigned — an assignment fails silently in sloppy mode and throws
   * in strict, which is `mimic-fn`'s whole reason for existing.
   */
  Object.defineProperty(wrapper, 'name', { value: fn.name, configurable: true });
  Object.defineProperty(wrapper, 'length', { value: fn.length, configurable: true });

  return wrapper as T;
}
