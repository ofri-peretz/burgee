/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/onetime` — the drop-in path for `onetime` 8 (`graded-override-targets` R3).
 *
 * `restore-cursor` → `onetime` → `mimic-function` is the chain `closeout/once`'s header says
 * the drop-in recipe is incomplete without, and this is its middle: onetime's default export,
 * its `callCount` and its `{ throw: true }`, graded by onetime's own suite in `compat-oracle`.
 *
 * **It is not `once()` renamed, and the difference is a case in that suite.** `once` marks the
 * function called before it runs, so a first call that throws leaves a wrapper that returns
 * `undefined` for ever — the right contract on an exit path, where a handler must never run
 * twice. onetime 8 drops the function only after it *returns*, so a first call that throws is
 * retried (`retries if the first call throws`). The two contracts serve different callers, so
 * `closeout/once` keeps its own and this file follows onetime's. What they share is the
 * wrapper's identity: `name` and `length` are the wrapped function's, as `mimic-function`
 * gives onetime's.
 */

/** Options onetime takes. */
export interface Options {
  /** Throw when called more than once, instead of returning the first result. */
  readonly throw?: boolean;
}

/** A function wrapped by onetime: the same signature, called through the wrapper. */
export type OnetimeFunction<ArgumentsType extends unknown[], ReturnType> = (...arguments_: ArgumentsType) => ReturnType;

/** How many times each wrapper has been called — onetime's `callCount` reads it. */
const calls = new WeakMap<object, number>();

function onceUntilReturned<ArgumentsType extends unknown[], ReturnType>(fn: (...arguments_: ArgumentsType) => ReturnType, options: Options = {}): OnetimeFunction<ArgumentsType, ReturnType> {
  if (typeof fn !== 'function') throw new TypeError('Expected a function');
  const { displayName } = fn as { displayName?: string };
  // onetime's own `||` chain: an empty `displayName` or `name` falls through to the next.
  const name = [displayName, fn.name].find((candidate) => candidate !== undefined && candidate !== '') ?? '<anonymous>';
  let pending: ((...arguments_: ArgumentsType) => ReturnType) | undefined = fn;
  let result: ReturnType;
  let count = 0;
  const wrapper = function (this: unknown, ...arguments_: ArgumentsType): ReturnType {
    count += 1;
    calls.set(wrapper, count);
    if (pending !== undefined) {
      // Dropped only once it has returned: a call that throws leaves it to be tried again.
      result = pending.apply(this, arguments_);
      pending = undefined;
    } else if (options.throw === true) {
      throw new Error(`Function \`${name}\` can only be called once`);
    }
    return result;
  };
  Object.defineProperty(wrapper, 'name', { value: fn.name, configurable: true });
  Object.defineProperty(wrapper, 'length', { value: fn.length, configurable: true });
  calls.set(wrapper, count);
  return wrapper;
}

/** The number of times a wrapper has been called. Throws for a function onetime did not wrap. */
function callCount(fn: (...arguments_: never[]) => unknown): number {
  const count = calls.get(fn);
  if (count === undefined) throw new Error(`The given function \`${fn.name}\` is not wrapped by the \`onetime\` package`);
  return count;
}

/** Ensure a function is called once; later calls return the first result. */
const onetime: typeof onceUntilReturned & { callCount: typeof callCount } = Object.assign(onceUntilReturned, { callCount });

// `import onetime from 'closeout/onetime'` is the drop-in, so the entry has to be a default —
// the incumbent's is.
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export, and it is the whole point of this file
export default onetime;
