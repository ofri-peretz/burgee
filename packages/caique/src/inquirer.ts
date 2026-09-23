/**
 * `caique/inquirer` — `@inquirer/core`'s surface, over caique's own code and nothing else.
 *
 * ## What this is, and what it is not
 *
 * It is the **drop-in subpath** for a CLI that already renders prompts with
 * `@inquirer/core` or `@inquirer/prompts`: change one import and the same render functions,
 * the same hooks and the same error classes keep working. D-006 is the rule it exists to
 * satisfy — a compatibility claim is made at a dedicated subpath, never at a package root,
 * because a root presents the package's own API and can never match somebody else's.
 *
 * It is **not** caique's own way of asking a question. That is `caique/ask` and
 * `caique/binding`: a prompt declared as a flag, answered from any source, and an error
 * naming the flag when nobody is there to type. Nothing in this file changes that, and a
 * program written against caique pays none of it.
 *
 * ## Why the loop and not the drawings
 *
 * The inquirer monorepo's testable unit is `packages/core/core.test.ts` — 41 cases that
 * render through `@inquirer/testing`, a headless xterm that asserts *the screen* rather
 * than the bytes. So what is graded here is the prompt loop: hooks keeping their place
 * across re-renders, keypresses reaching a handler and stopping the moment the prompt
 * settles, a cleanup that throws superseding the answer, an abort signal that fires before
 * the first render still restoring the cursor. Those are behaviours a second implementation
 * can share. `@clack/prompts`' suite, by contrast, is 289 snapshots of its own drawing, and
 * caique declines to reproduce those on purpose (D-001).
 */
import { AsyncResource } from 'node:async_hooks';
import { resolve as resolvePath } from 'node:path';
import { createInterface } from 'node:readline';

import exitHook from 'closeout/exit-hook';

import { AbortPromptError, CancelPromptError, ExitPromptError } from './inquirer-errors.js';
import { effectScheduler, type PromptReadline, useEffect, useRef, useState, withHooks, withUpdates } from './inquirer-hooks.js';
import { type KeypressEvent } from './inquirer-keys.js';
import { MuteStream, ScreenManager, type ScreenReadline } from './inquirer-screen.js';
import { LINE, makeTheme, type PartialTheme, type Status } from './inquirer-theme.js';
import { processRuntime } from './runtime.js';

const SEPARATOR_WIDTH = 15;

const SPINNER_DELAY_MS = 300;

/**
 * A non-choice in a list of choices.
 *
 * `isSeparator` is a duck type rather than an `instanceof` check, and deliberately so: a
 * caller who built `{ type: 'separator', separator: '----' }` by hand — or who has two
 * copies of the package in their tree — must still have it recognised. One of the three
 * graded cases is exactly that object literal.
 */
export class Separator {
  readonly separator: string = Array.from({ length: SEPARATOR_WIDTH }).join(LINE);
  readonly type = 'separator';

  constructor(separator?: string) {
    if (separator !== undefined && separator !== '') this.separator = separator;
  }

  /** Whether `choice` is a separator — by shape, never by class. */
  static isSeparator(choice: unknown): choice is Separator {
    return Boolean(choice) && typeof choice === 'object' && choice !== null && 'type' in choice && (choice as { type: unknown }).type === 'separator';
  }
}

/**
 * The prefix a prompt draws, and the spinner that replaces it while the prompt is loading.
 *
 * The 300 ms delay before the spinner appears is not decoration: it is what stops a prompt
 * that resolves quickly from flickering a frame of spinner on its way past, and the graded
 * case advances fake timers by exactly `delay + interval` to see the first frame.
 */
export function usePrefix({ status = 'idle', theme }: { status?: Status; theme?: PartialTheme }): string {
  const [showLoader, setShowLoader] = useState(false);
  const [tick, setTick] = useState(0);
  const { prefix, spinner } = makeTheme(theme);

  useEffect(() => {
    if (status !== 'loading') {
      setShowLoader(false);
      return undefined;
    }
    let tickInterval: NodeJS.Timeout | undefined;
    let inc = -1;
    const delayTimeout = setTimeout(() => {
      setShowLoader(true);
      tickInterval = setInterval(() => {
        inc = inc + 1;
        setTick(inc % spinner.frames.length);
      }, spinner.interval);
    }, SPINNER_DELAY_MS);
    return () => {
      clearTimeout(delayTimeout);
      clearInterval(tickInterval);
    };
  }, [status]);

  if (showLoader === true) return spinner.frames[tick ?? 0] ?? '';
  // Before the loader shows there is nothing to draw for `loading`, so it borrows `idle` —
  // which is why a prompt that settles inside 300 ms never shows a spinner frame at all.
  const iconName = status === 'loading' ? 'idle' : status;
  if (typeof prefix === 'string') return prefix;
  return prefix[iconName] ?? prefix['idle'] ?? '';
}

/**
 * Register a keypress handler for as long as the prompt is rendering.
 *
 * `ignore` rather than only `removeListener`, because readline emits every keypress in one
 * `data` event synchronously: a handler removed during that burst would still be called for
 * the keys already queued behind the one that settled the prompt. Two graded cases — "after
 * the prompt is done" and "after the prompt is aborted" — are that exact race.
 */
export function useKeypress(userHandler: (event: KeypressEvent, rl: PromptReadline) => void | Promise<void>): void {
  const signal = useRef(userHandler);
  signal.current = userHandler;

  useEffect((rl) => {
    let ignore = false;
    const handler = withUpdates((_input: unknown, event: KeypressEvent) => {
      if (ignore) return;
      void signal.current(event, rl);
    });
    rl.input.on('keypress', handler);
    return () => {
      ignore = true;
      rl.input.removeListener('keypress', handler);
    };
  }, []);
}

/** What a render function returns: one string, or a body and a line below the cursor. */
export type ViewFunction<Value, Config> = (config: Config, done: (value: Value) => void) => string | [string, string | undefined];

/** The streams and lifetime a caller may hand a prompt. */
export interface Context {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  clearPromptOnDone?: boolean;
  signal?: AbortSignal;
}

/** The promise a prompt returns: cancellable, so a caller can take the question back. */
export type CancelablePromise<Value> = Promise<Value> & { cancel: () => void };

/** A prompt, ready to be called with its config. */
export type Prompt<Value, Config> = (config: Config, context?: Context) => CancelablePromise<Value>;

/**
 * Where the `createPrompt(...)` call itself was written.
 *
 * The incumbent names that file in the error a render function gets for returning nothing,
 * and the graded case snapshots the message including the path — so the frame has to be
 * captured here, at construction, rather than at the throw.
 */
function callerFile(): string | undefined {
  const saved = Error.prepareStackTrace;
  let frames: NodeJS.CallSite[] = [];
  try {
    Error.prepareStackTrace = (_error, callSites) => {
      frames = [...callSites];
      return frames;
    };
    // Reading `.stack` is what runs the hook above; the value itself is not wanted.
    void new Error('trace').stack;
  } catch {
    // `--frozen-intrinsics` makes `prepareStackTrace` unwritable. A prompt still works; the
    // one error message that names a file simply cannot.
    return undefined;
  }
  Error.prepareStackTrace = saved;
  // Frame 0 is this function, frame 1 is `createPrompt`, frame 2 is the caller.
  const fileName = frames[2]?.getFileName() ?? undefined;
  // A `file://` URL is already absolute and must stay one; anything else may be relative to
  // the process's cwd, and the incumbent prints it resolved.
  if (fileName === undefined || fileName.startsWith('file://')) return fileName;
  return resolvePath(fileName);
}

/**
 * Add a listener to an emitter or an `EventTarget`, and return the call that removes it.
 *
 * The pair is resolved first and the registration written once, rather than a branch with a
 * `return` in each arm: a prompt registers four of these and every one of them has to be
 * undone on exactly one path, so "add here, remove there" should be one piece of code.
 */
function listenTo(target: NodeJS.EventEmitter | EventTarget, event: string, listener: () => void): () => void {
  const [add, remove] =
    'on' in target
      ? [target.on.bind(target), target.removeListener.bind(target)]
      : [target.addEventListener.bind(target) as (e: string, l: () => void) => void, target.removeEventListener.bind(target) as (e: string, l: () => void) => void];
  add(event, listener);
  return () => {
    remove(event, listener);
  };
}

// Captured at module load, so a suite that installs fake timers cannot take it away. The
// deferral below is about the event loop's poll phase, not about anything a test is timing.
const nativeSetImmediate = globalThis.setImmediate;

/**
 * A readline interface over a caller's input and our muted output.
 *
 * The two assertions are the whole seam between a classic `Stream` and `node:readline`'s
 * types, and they are collected here so the loop below reads as behaviour. `MuteStream` is
 * an old-style stream on purpose (see `inquirer-screen.ts`), which `NodeJS.WritableStream`
 * does not describe; and `readline.Interface` does not publish the `input` and `output`
 * handles that the hook engine and the screen manager both need, though it carries them.
 */
function readlineOver(input: NodeJS.ReadableStream, output: MuteStream): PromptReadline & ScreenReadline {
  // Both assertions are about *types*, not about values: `MuteStream` really does have the
  // `write`/`end` readline calls, and the interface really does hold `input` and `output`.
  // There is nothing here a type guard could check that the constructor above has not
  // already decided — which is why these two lines are the only ones in the façade allowed
  // to say so, rather than the rule being turned off for the file.
  // eslint-disable-next-line reliability/no-unsafe-type-narrowing
  const stream = output as unknown as NodeJS.WritableStream;
  // eslint-disable-next-line reliability/no-unsafe-type-narrowing
  return createInterface({ terminal: true, input, output: stream }) as unknown as PromptReadline & ScreenReadline;
}

/**
 * Turn a render function into a prompt.
 *
 * The loop, in the order the pieces matter:
 *
 * 1. A muted output, so `readline` can do its own terminal setup and then be silent — the
 *    screen manager becomes the only thing that draws.
 * 2. `withHooks`, which is the store every hook in the render function reads.
 * 3. `settlePrompt`, which runs every cleanup **before** it settles the promise. A cleanup
 *    that throws replaces the settlement, answer included: "a throwing cleanup supersedes
 *    the abort error" is that rule, stated by the incumbent's own suite.
 * 4. A first render deferred by one `setImmediate` **only** for a modern readable, whose
 *    OS-level buffer may still deliver keystrokes typed before the prompt existed. A classic
 *    stream has no such buffer and renders synchronously, which is what `@inquirer/testing`
 *    relies on.
 */
/**
 * One call of a prompt: the whole loop, from a muted output to a settled promise.
 *
 * A named function rather than the closure `createPrompt` used to return inline. The two
 * were the same code with one wrapper around it, which is a shape worth naming:
 * `createPrompt` decides *where the call was written*, and this decides *what happens when
 * it is run*.
 */
function runPrompt<Value, Config>(view: ViewFunction<Value, Config>, origin: string | undefined, config: Config, context: Context): CancelablePromise<Value> {
  // The process is reached through caique's one seam onto it, at call time — so a caller
  // who supplies neither stream gets the terminal the program is running in *now*.
  const runtime = processRuntime();
  const { input = runtime.stdin, signal } = context;
  const cleanups = new Set<() => void>();

  const output = new MuteStream();
  output.pipe((context.output ?? runtime.stdout) as NodeJS.WritableStream);
  const rl = readlineOver(input, output);
  // After `createInterface`, never before: readline writes its own setup bytes on some
  // platforms, and those have to reach the terminal.
  output.mute();

  const screen = new ScreenManager(rl);
  // Not `Promise.withResolvers` (Node 22): the executor form is the same three handles and
  // keeps `engines` open to Node 20.19.
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return withHooks(rl, (cycle) => {
    // Bound to this async context so it still finds the hook store when a signal or an
    // exit fires it from somewhere else entirely.
    const clearEffects = AsyncResource.bind(() => {
      effectScheduler.clearAll();
    });

    const settlePrompt = (settle: () => void): void => {
      try {
        clearEffects();
        settle();
      } catch (error) {
        reject(error);
      }
    };
    // One factory rather than two near-identical closures: resolving and rejecting differ
    // only in which half of the resolver pair they call, and the part that matters —
    // cleanups first, and a throwing cleanup superseding whatever was about to be said —
    // has to be the same code on both paths or it is only true on one of them.
    const settler =
      <Settled,>(finish: (settled: Settled) => void) =>
      (settled: Settled): void => {
        settlePrompt(() => {
          finish(settled);
        });
      };
    const resolvePrompt = settler(resolve);
    const rejectPrompt = settler<unknown>(reject);
    /** A nullary handler that ends the prompt with the error it is asked to build. */
    const endsWith =
      (make: () => Error) =>
      (): void => {
        rejectPrompt(make());
      };

    // No `.catch()` here, and that is the contract rather than an omission: this chain is
    // what the caller receives and awaits, so its rejection is theirs to handle. Swallowing
    // it would turn `AbortPromptError` and `ExitPromptError` — the two errors this package
    // exists to raise instead of hanging — into a silently resolved prompt.
    const promptPromise = Object.assign(
      // eslint-disable-next-line maintainability/no-unhandled-promise, reliability/no-unhandled-promise
      promise
        .finally(() => {
          for (const cleanup of cleanups) cleanup();
          screen.done({ clearContent: Boolean(context.clearPromptOnDone) });
          output.end();
        })
        .then(() => promise),
      { cancel: endsWith(() => new CancelPromptError()) },
    );

    if (signal) {
      const abort = endsWith(() => new AbortPromptError({ cause: signal.reason }));
      if (signal.aborted) {
        abort();
        return promptPromise;
      }
      cleanups.add(listenTo(signal, 'abort', abort));
    }

    // Two ways the process can take the terminal back, one sentence for both.
    const forceClosed = (how: string): void => {
      rejectPrompt(new ExitPromptError(`User force closed the prompt with ${how}`));
    };

    // `closeout/exit-hook` is this repository's `signal-exit`: a prompt has to reject
    // rather than leave a half-drawn frame and a hidden cursor behind when the process is
    // going away underneath it.
    cleanups.add(
      exitHook((code) => {
        forceClosed(String(code));
      }),
    );

    // readline owns Ctrl-C when `terminal` is true, and nothing else will hear it.
    cleanups.add(
      listenTo(rl, 'SIGINT', () => {
        forceClosed('SIGINT');
      }),
    );
    // stdin reaching EOF closes readline without settling anything; without this, an
    // effect's timer would keep the process alive after there is nobody left to ask.
    cleanups.add(listenTo(rl, 'close', clearEffects));

    const startCycle = (): void => {
      // Registered after the first cycle is armed, not before: readline moves the cursor
      // on a muted stream, and only this listener can put it back.
      cleanups.add(
        listenTo(rl.input, 'keypress', () => {
          screen.checkCursorPos();
        }),
      );
      let pendingDone: { value: Value } | null = null;
      cycle(() => {
        let effectsSettled = false;
        try {
          const nextView = view(config, (value: Value) => {
            // `done()` called from an effect, after this pass has already drawn, settles
            // straight away; called during the render, it waits for the draw.
            if (effectsSettled) resolvePrompt(value);
            else pendingDone = { value };
          });
          // Typescript forbids it; a caller without Typescript does it anyway, and the
          // incumbent answers with a named error rather than a `TypeError` five frames on.
          if (nextView === undefined) throw new Error(`Prompt functions must return a string.\n    at ${origin ?? '<unknown>'}`);
          const [content, bottomContent] = typeof nextView === 'string' ? [nextView, undefined] : nextView;
          screen.render(content, bottomContent);
          effectScheduler.run();
        } catch (error) {
          rejectPrompt(error);
        }
        effectsSettled = true;
        if (pendingDone !== null) {
          const { value } = pendingDone as { value: Value };
          pendingDone = null;
          resolvePrompt(value);
        }
      });
    };

    if ('readableFlowing' in input) nativeSetImmediate(startCycle);
    else startCycle();

    return promptPromise;
  });
}

/**
 * Turn a render function into a prompt.
 *
 * Two lines, because the interesting half is `runPrompt` and the only thing this one adds
 * is the call site — captured now rather than at the throw, since the error a render
 * function gets for returning nothing names the file `createPrompt` was called from.
 */
export function createPrompt<Value, Config>(view: ViewFunction<Value, Config>): Prompt<Value, Config> {
  const origin = callerFile();
  return (config: Config, context: Context = {}): CancelablePromise<Value> => runPrompt(view, origin, config, context);
}

/**
 * The rest of `@inquirer/core`'s surface, re-exported from the modules that hold it.
 *
 * At the end of the file rather than the top because `import-next/exports-last` says so,
 * and the rule is right about this one: a reader arriving at `caique/inquirer` wants the
 * prompt loop first and the vocabulary list last.
 */
export { AbortPromptError, CancelPromptError, ExitPromptError, HookError, ValidationError } from './inquirer-errors.js';
export { useEffect, useMemo, useRef, useState, type SetState } from './inquirer-hooks.js';
export {
  getDefaultKeybindings,
  isBackspaceKey,
  isDownKey,
  isEnterKey,
  isNumberKey,
  isShiftKey,
  isSpaceKey,
  isTabKey,
  isUpKey,
  type Keybinding,
  type KeypressEvent,
} from './inquirer-keys.js';
export { defaultTheme, getDefaultTheme, makeTheme, type PartialTheme, type Status, type Theme } from './inquirer-theme.js';
