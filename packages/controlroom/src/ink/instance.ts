/**
 * One mounted app: the root host node, React's container over it, and the loop that turns a
 * commit into bytes — ink 8's `Ink`, decision for decision. `debug` writes every frame whole;
 * a non-interactive run (CI, a pipe) writes `<Static>` output as it arrives and the last frame
 * once; a screen reader gets plain text, erased and rewritten; everything else is the live
 * frame, throttled to `maxFps`, with new `<Static>` output written above it, a full clear when
 * a frame overflows or leaves the viewport, the alternate screen on request, and the terminal
 * handed to a child process and back on `suspendTerminal`. Layout is `flex.ts` at the
 * stream's width.
 */
import { Stream } from 'node:stream';
import { types } from 'node:util';

import { onExit } from 'closeout';
import { wrap } from 'linegauge';

import { AccessibilityContext, App, RootNodeContext, type SuspendTerminal, type TerminalSuspension } from './components.js';
import { createNode, type DOMElement, emitLayoutListeners, syncFlexTree } from './dom.js';
import { calculateLayout } from './flex.js';
import { createContainer, flushPassiveEffects, flushSyncWork, updateContainer, updateContainerNow } from './host.js';
import { type KittyFlagName, resolveFlags } from './keypress.js';
import { defaultStreams, isInCi, isWindowsConsole, onceBeforeExit, patchConsole, screenReaderByDefault, windowSize } from './process.js';
import { React } from './react.js';
import { renderer } from './render.js';
import {
  alternateScreenEnter,
  alternateScreenLeave,
  bsu,
  createLogUpdate,
  type CursorPosition,
  enterAlternateScreen,
  eraseFromCursor,
  esu,
  homeAndEraseDown,
  type InkStream,
  kittyPop,
  kittyPushSequence,
  kittyQuery,
  leaveAlternateScreen,
  type LogUpdate,
  shouldSynchronize,
  write,
  writeBestEffort,
} from './terminal.js';

const DEFAULT_FPS = 30;
const MS_PER_SECOND = 1000;
/** How long `auto` mode waits for the terminal to answer the kitty query, as ink does. */
const KITTY_WAIT = 200;
const DEFAULT_COLUMNS = 80;

export interface RenderMetrics {
  renderTime: number;
}

export interface KittyKeyboardOptions {
  mode?: 'auto' | 'enabled' | 'disabled';
  flags?: KittyFlagName[];
}

export interface InkOptions {
  stdout: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  stderr: NodeJS.WriteStream;
  debug: boolean;
  exitOnCtrlC: boolean;
  patchConsole: boolean;
  maxFps?: number;
  incrementalRendering?: boolean;
  concurrent?: boolean;
  isScreenReaderEnabled?: boolean | undefined;
  onRender?: ((metrics: RenderMetrics) => void) | undefined;
  kittyKeyboard?: KittyKeyboardOptions | undefined;
  interactive?: boolean | undefined;
  alternateScreen?: boolean | undefined;
}

interface Throttled<A extends unknown[]> {
  (...args: A): void;
  flush(): void;
  cancel(): void;
}

/**
 * es-toolkit's compat `throttle` (leading and trailing), which ink renders through: a debounce
 * of `wait` whose calls also run outright once `wait` has passed since the first unanswered one.
 */
function throttle<A extends unknown[]>(fn: (...args: A) => void, wait: number): Throttled<A> {
  let pendingArgs: A | null = null;
  let timer: NodeJS.Timeout | null = null;
  let pendingAt: number | null = null;
  const run = (args: A): void => {
    fn(...args);
    pendingAt = null;
  };
  const invoke = (): void => {
    if (pendingArgs === null) return;
    const args = pendingArgs;
    pendingArgs = null;
    run(args);
  };
  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      invoke();
      cancel();
    }, wait);
  };
  const debounced = (args: A): void => {
    pendingArgs = args;
    const isFirstCall = timer === null;
    schedule();
    if (isFirstCall) invoke();
  };
  const throttled = ((...args: A) => {
    pendingAt ??= Date.now();
    if (Date.now() - pendingAt >= wait) {
      fn(...args);
      pendingAt = Date.now();
      cancel();
      schedule();
      return;
    }
    debounced(args);
  }) as Throttled<A>;
  throttled.flush = invoke;
  throttled.cancel = cancel;
  return throttled;
}

/** Settle a throttle at a boundary: run what it holds while the stream can take it, else drop it. */
function settle(throttled: unknown, canWrite: boolean): void {
  const value = throttled as Partial<Throttled<never[]>> | undefined | null;
  if (value === undefined || value === null || typeof value.flush !== 'function') return;
  if (canWrite) value.flush();
  else value.cancel?.();
}

const isError = (value: unknown): value is Error => value instanceof Error || Object.prototype.toString.call(value) === '[object Error]';
const canWriteTo = (stream: InkStream): boolean => stream.destroyed !== true && stream.writableEnded !== true && (stream.writable ?? true);
const yieldImmediate = async (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

interface FrameClear {
  isTty: boolean;
  viewportRows: number;
  previousViewportRows: number;
  previousOutputHeight: number;
  nextOutputHeight: number;
  isUnmounting: boolean;
}

/** ink's `shouldClearTerminalForFrame`: when the cursor-relative erase no longer lines up with the screen. */
function shouldClearTerminalForFrame({ isTty, viewportRows, previousViewportRows, previousOutputHeight, nextOutputHeight, isUnmounting }: FrameClear): boolean {
  if (!isTty) return false;
  const wasFullscreen = previousOutputHeight >= viewportRows;
  if (isWindowsConsole && (wasFullscreen || nextOutputHeight >= viewportRows)) return true;
  const wasOverflowing = previousOutputHeight > viewportRows;
  const isOverflowing = nextOutputHeight > viewportRows;
  const isLeavingFullscreen = wasFullscreen && nextOutputHeight < viewportRows;
  const isViewportShrinking = viewportRows < previousViewportRows;
  return wasOverflowing || (isOverflowing && previousOutputHeight > 0) || isLeavingFullscreen || (isViewportShrinking && wasFullscreen) || (isUnmounting && wasFullscreen);
}

export class Ink {
  readonly isConcurrent: boolean;
  /** The root host node; ink's suite reads it through `instances`. */
  readonly rootNode: DOMElement;
  readonly #options: InkOptions;
  readonly #stdout: InkStream;
  readonly #log: LogUpdate;
  readonly #throttledLog: Throttled<[string]> | LogUpdate;
  readonly #throttledOnRender: Throttled<[]> | undefined;
  readonly #container: unknown;
  readonly #interactive: boolean;
  readonly #renderThrottleMs: number;
  readonly isScreenReaderEnabled: boolean;
  #alternateScreen = false;
  #cursorPosition: CursorPosition | undefined;
  #isUnmounted = false;
  #isUnmounting = false;
  #lastOutput = '';
  #lastOutputToRender = '';
  #lastOutputHeight = 0;
  #lastTerminalWidth: number;
  #lastTerminalHeight: number;
  #fullStaticOutput = '';
  #hasRenderedStaticOutput = false;
  readonly #exitPromise: Promise<unknown>;
  #exitResult: unknown;
  #resolveExit: (value: unknown) => void = () => undefined;
  #rejectExit: (reason: unknown) => void = () => undefined;
  #offBeforeExit: (() => void) | undefined;
  #restoreConsole: (() => void) | undefined;
  #unsubscribeResize: (() => void) | undefined;
  readonly #unsubscribeExit: () => void;
  #hasPendingThrottledRender = false;
  #kittyProtocolEnabled = false;
  #kittyFlags: KittyFlagName[] | undefined;
  #finishKittyDetection: ((supported: boolean) => void) | undefined;
  #nextRenderCommit: { promise: Promise<void>; resolve: () => void } | undefined;
  #isSuspended = false;
  #pauseInput: (() => void) | undefined;
  #resumeInput: (() => void) | undefined;

  constructor(options: InkOptions) {
    this.#options = options;
    this.#stdout = options.stdout as unknown as InkStream;
    this.rootNode = createNode('ink-root');
    this.rootNode.onComputeLayout = this.calculateLayout;
    this.isScreenReaderEnabled = options.isScreenReaderEnabled ?? screenReaderByDefault();
    // CI decides first: even a terminal in CI is not interactive unless asked.
    this.#interactive = options.interactive ?? (!isInCi() && this.#stdout.isTTY === true);
    const unthrottled = options.debug || this.isScreenReaderEnabled;
    const maxFps = options.maxFps ?? DEFAULT_FPS;
    const renderThrottleMs = maxFps > 0 ? Math.max(1, Math.ceil(MS_PER_SECOND / maxFps)) : 0;
    this.#renderThrottleMs = unthrottled ? 0 : renderThrottleMs;
    if (unthrottled) {
      this.rootNode.onRender = this.onRender;
      this.#throttledOnRender = undefined;
    } else {
      const throttled = throttle(this.onRender, renderThrottleMs);
      this.rootNode.onRender = () => {
        this.#hasPendingThrottledRender = true;
        throttled();
      };
      this.#throttledOnRender = throttled;
    }
    this.rootNode.onImmediateRender = this.onRender;
    this.rootNode.onStaticChange = this.handleStaticChange;
    this.#log = createLogUpdate(this.#stdout, { incremental: options.incrementalRendering === true });
    this.#throttledLog = unthrottled
      ? this.#log
      : throttle((output: string) => {
          const shouldWrite = this.#log.willRender(output);
          const sync = this.#shouldSync();
          if (sync && shouldWrite) write(this.#stdout, bsu);
          this.#log(output);
          if (sync && shouldWrite) write(this.#stdout, esu);
        }, 0);
    this.isConcurrent = options.concurrent ?? false;
    const { columns, rows } = windowSize(this.#stdout);
    this.#lastTerminalWidth = columns;
    this.#lastTerminalHeight = rows;
    this.#container = createContainer(this.rootNode, this.isConcurrent);
    this.#unsubscribeExit = onExit(() => this.unmount(0));
    this.#setAlternateScreen(options.alternateScreen === true);
    if (options.patchConsole) this.#patchConsole();
    if (this.#interactive) {
      this.#stdout.on?.('resize', this.resized);
      this.#unsubscribeResize = () => this.#stdout.off?.('resize', this.resized);
    }
    this.#initKittyKeyboard();
    this.#exitPromise = new Promise((resolve, reject) => {
      this.#resolveExit = resolve;
      this.#rejectExit = reject;
    });
    // An app that exits with an error and never awaits the exit must not crash the process.
    this.#exitPromise.catch(() => undefined);
  }

  #shouldSync(): boolean {
    return shouldSynchronize(this.#stdout, this.#interactive);
  }

  #setAlternateScreen(enabled: boolean): void {
    this.#alternateScreen = enabled && this.#interactive && this.#stdout.isTTY === true;
    if (this.#alternateScreen) enterAlternateScreen(this.#stdout);
  }

  /**
   * The kitty keyboard protocol, opt-in through `kittyKeyboard`: pushed at once in `enabled`
   * mode on two terminals; in `auto` mode, on an interactive pair of terminals, once the
   * terminal answers the query, which `App` reads off the input it already owns.
   */
  #initKittyKeyboard(): void {
    const opts = this.#options.kittyKeyboard;
    if (opts === undefined) return;
    const mode = opts.mode ?? 'auto';
    if (mode === 'disabled') return;
    const flags = opts.flags ?? ['disambiguateEscapeCodes'];
    const ttys = this.#options.stdin.isTTY === true && this.#stdout.isTTY === true;
    if (mode === 'enabled') {
      if (ttys) this.#enableKittyProtocol(flags);
      return;
    }
    if (!this.#interactive || !ttys) return;
    const finish = (supported: boolean): void => {
      this.#finishKittyDetection = undefined;
      clearTimeout(timer);
      if (supported && !this.#isUnmounted) this.#enableKittyProtocol(flags);
    };
    // Listening before asking, so an immediate answer is not missed.
    const timer = setTimeout(() => finish(false), KITTY_WAIT);
    this.#finishKittyDetection = finish;
    kittyQuery(this.#stdout);
  }

  #enableKittyProtocol(flags: KittyFlagName[]): void {
    write(this.#stdout, kittyPushSequence(resolveFlags(flags)));
    this.#kittyProtocolEnabled = true;
    // Kept, so a suspension can turn the same protocol back on.
    this.#kittyFlags = flags;
  }

  // Must stay stable across renders: it feeds `App`'s raw-mode identity.
  readonly handleKittyQueryResponse = (): void => {
    this.#finishKittyDetection?.(true);
  };

  readonly resized = (): void => {
    const { columns, rows } = windowSize(this.#stdout);
    // Narrower, or shorter with a cursor shown: the frame on screen no longer lines up.
    if (columns < this.#lastTerminalWidth || (rows < this.#lastTerminalHeight && this.#log.getCursorPosition() !== undefined)) {
      this.#log.clear();
      this.#lastOutput = '';
      this.#lastOutputToRender = '';
      this.#lastOutputHeight = 0;
    }
    this.calculateLayout();
    emitLayoutListeners(this.rootNode);
    this.onRender();
    this.#lastTerminalWidth = columns;
    this.#lastTerminalHeight = rows;
  };

  readonly handleAppExit = (errorOrResult?: unknown): void => {
    if (this.#isUnmounted || this.#isUnmounting) return;
    if (isError(errorOrResult)) {
      this.unmount(errorOrResult);
      return;
    }
    this.#exitResult = errorOrResult;
    this.unmount();
  };

  readonly setCursorPosition = (position: CursorPosition | undefined): void => {
    this.#cursorPosition = position;
    this.#log.setCursorPosition(position);
  };

  readonly registerInputControl = (pauseInput: () => void, resumeInput: () => void): void => {
    this.#pauseInput = pauseInput;
    this.#resumeInput = resumeInput;
  };

  readonly calculateLayout = (): void => {
    // An exit from an effect unmounts at once, so a teardown commit can land after the root is freed.
    if (this.rootNode.yogaNode === undefined) return;
    syncFlexTree(this.rootNode);
    calculateLayout(this.rootNode.yogaNode, windowSize(this.#stdout).columns);
  };

  /** A replaced `<Static>` resets what has been written of the previous one. */
  readonly handleStaticChange = (): void => {
    this.#fullStaticOutput = '';
    this.#hasRenderedStaticOutput = false;
  };

  readonly onRender = (): void => {
    this.#hasPendingThrottledRender = false;
    if (this.#isUnmounted) return;
    // While suspended the terminal is a child's: drop the frame, and release anyone waiting on one.
    if (this.#isSuspended) {
      this.#nextRenderCommit?.resolve();
      this.#nextRenderCommit = undefined;
      return;
    }
    this.#nextRenderCommit?.resolve();
    this.#nextRenderCommit = undefined;
    // After `clear()` the recorded frame is off the screen, so the next is drawn even when unchanged.
    if (this.#lastOutputHeight === 0 && this.#lastOutput !== '' && !this.#isUnmounting) this.#lastOutputToRender = '';
    const started = performance.now();
    const { output, outputHeight, staticOutput } = renderer(this.rootNode, this.isScreenReaderEnabled);
    const renderTime = performance.now() - started;
    this.#renderFrame(output, outputHeight, staticOutput);
    this.#options.onRender?.({ renderTime });
  };

  #renderFrame(output: string, outputHeight: number, staticOutput: string): void {
    const hasStaticOutput = staticOutput !== '';
    const stdout = this.#stdout;
    if (this.#options.debug) {
      if (hasStaticOutput) {
        this.#fullStaticOutput += staticOutput;
        this.#hasRenderedStaticOutput = true;
      }
      this.#lastOutput = output;
      this.#lastOutputToRender = output;
      this.#lastOutputHeight = outputHeight;
      write(stdout, this.#fullStaticOutput + output);
      return;
    }
    if (!this.#interactive) {
      if (hasStaticOutput) write(stdout, staticOutput);
      this.#lastOutput = output;
      this.#lastOutputToRender = `${output}\n`;
      this.#lastOutputHeight = outputHeight;
      return;
    }
    if (this.isScreenReaderEnabled) {
      this.#renderForScreenReader(output, staticOutput, hasStaticOutput);
      return;
    }
    if (hasStaticOutput) {
      this.#hasRenderedStaticOutput = true;
      if (this.#alternateScreen) this.#fullStaticOutput += staticOutput;
    }
    this.#renderInteractiveFrame(output, outputHeight, hasStaticOutput ? staticOutput : '');
  }

  #renderForScreenReader(output: string, staticOutput: string, hasStaticOutput: boolean): void {
    const stdout = this.#stdout;
    const sync = this.#shouldSync();
    if (sync) write(stdout, bsu);
    const wrapped = wrap(output, windowSize(stdout).columns, { trim: false, hard: true });
    if (!hasStaticOutput && wrapped === this.#lastOutputToRender) {
      if (sync) write(stdout, esu);
      return;
    }
    // Erase the frame before new static output or a replacement; log-update tracks the real rows.
    this.#log.clear();
    this.#lastOutputHeight = 0;
    if (hasStaticOutput) {
      write(stdout, staticOutput);
      if (this.#alternateScreen) this.#fullStaticOutput += staticOutput;
    }
    write(stdout, wrapped);
    this.#lastOutput = output;
    this.#lastOutputToRender = wrapped;
    this.#lastOutputHeight = wrapped === '' ? 0 : wrapped.split('\n').length;
    // Screen-reader output places no cursor of its own.
    this.#log.setCursorPosition(undefined);
    this.#log.sync(wrapped);
    if (sync) write(stdout, esu);
  }

  #renderInteractiveFrame(output: string, outputHeight: number, staticOutput: string): void {
    const stdout = this.#stdout;
    const hasStaticOutput = staticOutput !== '';
    const isTty = stdout.isTTY === true;
    // Fullscreen only on a real terminal: piped output always gets its trailing newline.
    const viewportRows = isTty ? windowSize(stdout).rows : 24;
    const isFullscreen = isTty && outputHeight >= viewportRows;
    const outputToRender = isFullscreen ? output : `${output}\n`;
    const previousViewportRows = this.#lastTerminalHeight;
    const shouldClear = shouldClearTerminalForFrame({ isTty, viewportRows, previousViewportRows, previousOutputHeight: this.#lastOutputHeight, nextOutputHeight: outputHeight, isUnmounting: this.#isUnmounting });
    this.#lastTerminalHeight = viewportRows;
    if (!shouldClear && !hasStaticOutput && outputToRender === this.#lastOutputToRender && !this.#log.isCursorDirty()) return;
    // The committed cursor position stands when its component skips rendering.
    this.#log.setCursorPosition(this.#cursorPosition);
    if (shouldClear) {
      const sync = this.#shouldSync();
      if (sync) write(stdout, bsu);
      if (this.#alternateScreen) {
        // No scrollback: replay the static output, this frame's included, ahead of the frame.
        write(stdout, homeAndEraseDown + this.#fullStaticOutput + outputToRender);
      } else if (this.#lastOutputHeight >= viewportRows) {
        // The previous frame filled the viewport; when the terminal just lost rows under a
        // shown cursor, walk up from it instead of homing onto rows ink does not own.
        let erase = homeAndEraseDown;
        const previousCursor = this.#log.getCursorPosition();
        if (!isWindowsConsole && previousCursor !== undefined && viewportRows < previousViewportRows) erase = eraseFromCursor(previousCursor.y);
        write(stdout, erase + staticOutput + outputToRender);
      } else {
        // The previous frame covers only the bottom of the viewport: erase it relative to the cursor.
        this.#log.clear();
        write(stdout, staticOutput + outputToRender);
      }
      this.#lastOutput = output;
      this.#lastOutputToRender = outputToRender;
      this.#lastOutputHeight = outputHeight;
      this.#log.sync(outputToRender);
      if (sync) write(stdout, esu);
      return;
    }
    if (hasStaticOutput) {
      const sync = this.#shouldSync();
      if (sync) write(stdout, bsu);
      this.#log.clear();
      write(stdout, staticOutput);
      this.#log(outputToRender);
      if (sync) write(stdout, esu);
    } else {
      // The throttled log writes its own synchronized block, when it writes.
      this.#throttledLog(outputToRender);
    }
    this.#lastOutput = output;
    this.#lastOutputToRender = outputToRender;
    this.#lastOutputHeight = outputHeight;
  }

  render(node: React.ReactNode): void {
    const tree = React.createElement(
      AccessibilityContext.Provider,
      { value: { isScreenReaderEnabled: this.isScreenReaderEnabled } },
      React.createElement(
        App,
        {
          stdin: this.#options.stdin,
          stdout: this.#options.stdout,
          stderr: this.#options.stderr,
          exitOnCtrlC: this.#options.exitOnCtrlC,
          interactive: this.#interactive,
          renderThrottleMs: this.#renderThrottleMs,
          writeToStdout: this.writeToStdout,
          writeToStderr: this.writeToStderr,
          setCursorPosition: this.setCursorPosition,
          onExit: this.handleAppExit,
          onWaitUntilRenderFlush: this.waitUntilRenderFlush,
          onSuspendTerminal: this.suspendTerminal,
          onRegisterInputControl: this.registerInputControl,
          onKittyQueryResponse: this.handleKittyQueryResponse,
        },
        React.createElement(RootNodeContext.Provider, { value: this.rootNode }, node),
      ),
    );
    updateContainer(tree, this.#container, this.isConcurrent);
  }

  readonly writeToStdout = (data: string): void => {
    // While suspended the terminal is a child's: the redraw on resume restores the screen.
    if (this.#isUnmounted || this.#isSuspended) return;
    const stdout = this.#stdout;
    if (this.#options.debug) {
      write(stdout, data + this.#fullStaticOutput + this.#lastOutput);
      return;
    }
    if (!this.#interactive) {
      write(stdout, data);
      return;
    }
    const sync = this.#shouldSync();
    if (sync) write(stdout, bsu);
    this.#log.clear();
    write(stdout, data);
    this.#restoreLastOutput();
    if (sync) write(stdout, esu);
  };

  readonly writeToStderr = (data: string): void => {
    if (this.#isUnmounted || this.#isSuspended) return;
    const stderr = this.#options.stderr as unknown as InkStream;
    if (this.#options.debug) {
      write(stderr, data);
      write(this.#stdout, this.#fullStaticOutput + this.#lastOutput);
      return;
    }
    if (!this.#interactive) {
      write(stderr, data);
      return;
    }
    const sync = this.#shouldSync();
    if (sync) write(this.#stdout, bsu);
    this.#log.clear();
    write(stderr, data);
    this.#restoreLastOutput();
    if (sync) write(this.#stdout, esu);
  };

  #restoreLastOutput(): void {
    if (!this.#interactive) return;
    // A screen-reader frame bypasses log-update's render, so it is restored the same way.
    if (this.isScreenReaderEnabled) {
      write(this.#stdout, this.#lastOutputToRender);
      this.#log.setCursorPosition(undefined);
      this.#log.sync(this.#lastOutputToRender);
      return;
    }
    // `clear()` reset the cursor state; replay the latest intent before restoring the frame.
    this.#log.setCursorPosition(this.#cursorPosition);
    this.#log(this.#lastOutputToRender === '' ? `${this.#lastOutput}\n` : this.#lastOutputToRender);
  }

  readonly unmount = (error?: unknown): void => {
    if (this.#isUnmounted || this.#isUnmounting) return;
    this.#isUnmounting = true;
    this.#offBeforeExit?.();
    this.#offBeforeExit = undefined;
    const stdout = this.#stdout;
    const canWrite = canWriteTo(stdout);
    settle(this.#throttledOnRender, canWrite);
    if (canWrite) {
      // A pending throttled frame was just flushed; and once `<Static>` output exists, rendering
      // again would write its children twice (ink#397).
      const renderFinal = this.#throttledOnRender === undefined || (!this.#hasPendingThrottledRender && !this.#hasRenderedStaticOutput);
      if (renderFinal) {
        this.calculateLayout();
        this.onRender();
      }
    }
    // Unmounted before any write whose callback could re-enter `exit()`.
    this.#isUnmounted = true;
    this.#unsubscribeExit();
    settle(this.#throttledLog, canWrite);
    this.#restoreConsole?.();
    const finish = (): void => {
      this.#unsubscribeResize?.();
      this.#finishKittyDetection?.(false);
      if (canWrite) {
        if (this.#kittyProtocolEnabled) {
          kittyPop(stdout);
          this.#kittyProtocolEnabled = false;
        }
        if (this.#interactive && !this.#options.debug) this.#log.done();
        if (this.#alternateScreen) {
          leaveAlternateScreen(stdout);
          this.#alternateScreen = false;
        }
        // A non-interactive run writes its last frame now; debug mode only ends the line.
        if (!this.#interactive) write(stdout, this.#options.debug ? '\n' : `${this.#lastOutput}\n`);
      }
      this.#kittyProtocolEnabled = false;
      instances.delete(this.#options.stdout);
      this.rootNode.yogaNode?.free?.();
      this.rootNode.yogaNode = undefined;
      const result = this.#exitResult;
      const resolveOrReject = (): void => {
        if (isError(error)) this.#rejectExit(error);
        else this.#resolveExit(result);
      };
      // From signal-exit at shutdown (a code, not an Error) the loop is draining: settle now.
      const processExiting = error !== undefined && !isError(error);
      if (processExiting) resolveOrReject();
      else if (canWrite) write(stdout, '', resolveOrReject);
      else setImmediate(resolveOrReject);
    };
    updateContainerNow(null, this.#container);
    if (this.isConcurrent) flushPassiveEffects();
    finish();
  };

  readonly waitUntilExit = async (): Promise<unknown> => {
    if (!this.#isUnmounting) this.#offBeforeExit ??= onceBeforeExit(() => this.unmount());
    return this.#exitPromise;
  };

  async #awaitExit(): Promise<void> {
    try {
      await this.#exitPromise;
    } catch {
      // The error surfaces through `waitUntilExit()`.
    }
  }

  #hasPendingConcurrentWork(): boolean {
    const root = this.#container as { pendingLanes?: number; callbackNode?: unknown };
    return (root.pendingLanes ?? 0) !== 0 && root.callbackNode !== undefined && root.callbackNode !== null;
  }

  async #awaitNextRender(): Promise<void> {
    if (this.#nextRenderCommit === undefined) {
      let resolve: () => void = () => undefined;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      this.#nextRenderCommit = { promise, resolve };
    }
    return this.#nextRenderCommit.promise;
  }

  readonly waitUntilRenderFlush = async (): Promise<void> => {
    if (this.#isUnmounted || this.#isUnmounting) {
      await this.#awaitExit();
      return;
    }
    // Let React's scheduler run the passive effects and whatever they enqueue.
    await yieldImmediate();
    if (this.#isUnmounted || this.#isUnmounting) {
      await this.#awaitExit();
      return;
    }
    if (this.isConcurrent && this.#hasPendingConcurrentWork()) {
      await Promise.race([this.#awaitNextRender(), this.#awaitExit()]);
      if (this.#isUnmounted || this.#isUnmounting) {
        this.#nextRenderCommit = undefined;
        await this.#awaitExit();
        return;
      }
    }
    flushSyncWork();
    const canWrite = canWriteTo(this.#stdout);
    settle(this.#throttledOnRender, canWrite);
    settle(this.#throttledLog, canWrite);
    if (canWrite) {
      await new Promise<void>((resolve) => {
        write(this.#stdout, '', resolve);
      });
      return;
    }
    await yieldImmediate();
  };

  readonly clear = (): void => {
    if (!this.#interactive || this.#options.debug) return;
    this.#log.clear();
    // The frame is kept, so unmount's final render sees it unchanged, but no row of it remains.
    this.#lastOutputHeight = 0;
  };

  #patchConsole(): void {
    if (this.#options.debug) return;
    this.#restoreConsole = patchConsole((stream, data) => {
      if (stream === 'stdout') this.writeToStdout(data);
      else if (!data.startsWith('The above error occurred')) this.writeToStderr(data);
    });
  }

  #beginSuspend(): void {
    if (!this.#interactive) return;
    if (this.#isSuspended) throw new Error('The terminal is already suspended. Resume the current suspension before suspending again.');
    this.#finishKittyDetection?.(false);
    this.#isSuspended = true;
    if (this.#isUnmounted || this.#isUnmounting) return;
    try {
      const canWrite = canWriteTo(this.#stdout);
      // The child starts from a settled screen.
      settle(this.#throttledOnRender, canWrite);
      settle(this.#throttledLog, canWrite);
      if (canWrite) {
        // Erase the frame, show the cursor; the redraw on resume hides it again.
        this.#log.clear();
        this.#log.done();
        if (this.#kittyProtocolEnabled) {
          kittyPop(this.#stdout);
          this.#kittyProtocolEnabled = false;
        }
        if (this.#alternateScreen) writeBestEffort(this.#stdout, alternateScreenLeave);
      }
      this.#pauseInput?.();
    } catch (error) {
      // A hand-over that fails partway must not strand the app suspended.
      this.#isSuspended = false;
      try {
        this.#resumeInput?.();
      } catch {
        // Best effort: the original failure is the one to report.
      }
      throw error;
    }
  }

  async #endSuspend(): Promise<void> {
    if (!this.#isSuspended) return;
    this.#isSuspended = false;
    if (!this.#interactive || this.#isUnmounted || this.#isUnmounting) return;
    this.#resumeInput?.();
    if (canWriteTo(this.#stdout)) {
      // A fresh alternate screen is empty: replay the static output, as the full-clear path does.
      if (this.#alternateScreen) writeBestEffort(this.#stdout, alternateScreenEnter + (this.#options.debug ? '' : this.#fullStaticOutput));
      if (this.#kittyFlags !== undefined) {
        writeBestEffort(this.#stdout, kittyPushSequence(resolveFlags(this.#kittyFlags)));
        this.#kittyProtocolEnabled = true;
      }
    }
    // A full redraw, not a diff against a frame the child may have overwritten.
    this.#lastOutput = '';
    this.#lastOutputToRender = '';
    this.#lastOutputHeight = 0;
    this.#log.reset();
    try {
      this.calculateLayout();
      this.onRender();
      await this.waitUntilRenderFlush();
    } catch {
      // Best effort: a redraw failure must not mask the caller's own error.
    }
  }

  readonly suspendTerminal = (async (callback?: () => void | Promise<void>): Promise<void | TerminalSuspension> => {
    this.#beginSuspend();
    if (callback !== undefined) {
      try {
        await callback();
      } finally {
        await this.#endSuspend();
      }
      return undefined;
    }
    let isResumed = false;
    const resume = async (): Promise<void> => {
      if (isResumed) return;
      isResumed = true;
      await this.#endSuspend();
    };
    return { resume, [Symbol.asyncDispose]: resume };
  }) as SuspendTerminal;
}

/** One instance per stdout: a second `render()` to the same stream reuses the first. */
export const instances = new WeakMap<object, Ink>();

export interface RenderOptions {
  stdout?: NodeJS.WriteStream | NodeJS.WritableStream;
  stdin?: NodeJS.ReadStream | NodeJS.ReadableStream;
  stderr?: NodeJS.WriteStream | NodeJS.WritableStream;
  debug?: boolean;
  exitOnCtrlC?: boolean;
  patchConsole?: boolean;
  maxFps?: number;
  incrementalRendering?: boolean;
  concurrent?: boolean;
  isScreenReaderEnabled?: boolean;
  onRender?: (metrics: RenderMetrics) => void;
  kittyKeyboard?: KittyKeyboardOptions;
  interactive?: boolean;
  alternateScreen?: boolean;
}

export interface Instance {
  rerender: (node: React.ReactNode) => void;
  unmount: () => void;
  waitUntilExit: () => Promise<unknown>;
  waitUntilRenderFlush: () => Promise<void>;
  cleanup: () => void;
  clear: () => void;
}

const REUSED_STDOUT =
  'Warning: render() was called again for the same stdout before the previous Ink instance was unmounted. Reusing stdout across multiple render() calls is unsupported. Call unmount() first.\n';

/** Mount `node` and draw it: ink's `render`. A stream as the second argument is the stdout. */
export function render(node: React.ReactNode, options?: RenderOptions | NodeJS.WritableStream): Instance {
  const given: RenderOptions = options instanceof Stream ? { stdout: options as NodeJS.WriteStream, stdin: defaultStreams().stdin } : ((options as RenderOptions | undefined) ?? {});
  const { stdout = defaultStreams().stdout, stdin = defaultStreams().stdin, stderr = defaultStreams().stderr, exitOnCtrlC = true, patchConsole: patch = true, ...rest } = given;
  const resolved: InkOptions = {
    stdout: stdout as NodeJS.WriteStream,
    stdin: stdin as NodeJS.ReadStream,
    stderr: stderr as NodeJS.WriteStream,
    debug: false,
    exitOnCtrlC,
    patchConsole: patch,
    maxFps: DEFAULT_FPS,
    incrementalRendering: false,
    concurrent: false,
    alternateScreen: false,
    ...rest,
  };
  let instance = instances.get(resolved.stdout);
  if (instance === undefined) {
    instance = new Ink(resolved);
    instances.set(resolved.stdout, instance);
  } else {
    // One live renderer per stdout; said on the process's own stderr, past any patched console.
    write(defaultStreams().stderr as unknown as InkStream, REUSED_STDOUT);
  }
  instance.render(node);
  const mounted = instance;
  return {
    rerender: (next) => mounted.render(next),
    unmount: () => mounted.unmount(),
    waitUntilExit: mounted.waitUntilExit,
    waitUntilRenderFlush: mounted.waitUntilRenderFlush,
    cleanup: () => mounted.unmount(),
    clear: mounted.clear,
  };
}

export interface RenderToStringOptions {
  /** Columns of the virtual terminal. Default 80. */
  columns?: number;
}

/** The tree as a string, once, with no stream at all: ink's `renderToString`. */
export function renderToString(node: React.ReactNode, options?: RenderToStringOptions): string {
  const columns = options?.columns ?? DEFAULT_COLUMNS;
  const rootNode = createNode('ink-root');
  // `<Static>` clears its children after the first commit: catch them as they are written.
  let staticOutput = '';
  rootNode.onStaticChange = () => {
    staticOutput = '';
  };
  rootNode.onComputeLayout = () => {
    syncFlexTree(rootNode);
    calculateLayout(rootNode.yogaNode!, columns);
  };
  rootNode.onImmediateRender = () => {
    const rendered = renderer(rootNode, false).staticOutput;
    if (rendered !== '') staticOutput += rendered;
  };
  let uncaught: Error | undefined;
  const container = createContainer(rootNode, false, (error) => {
    // An error from another realm is still an error: rethrown as it was thrown.
    uncaught ??= types.isNativeError(error) ? error : new Error(String(error));
  });
  let output: string;
  let outputHeight: number;
  let captured: string;
  try {
    updateContainerNow(React.createElement(RootNodeContext.Provider, { value: rootNode }, node), container);
    ({ output, outputHeight } = renderer(rootNode, false));
    // Teardown removes `<Static>` too: keep what the render wrote before it.
    captured = staticOutput;
  } finally {
    updateContainerNow(null, container);
    rootNode.yogaNode?.free?.();
  }
  if (uncaught !== undefined) throw uncaught;
  // A single blank row still needs the separator after static output.
  if (outputHeight > 0) return captured + output;
  return captured.endsWith('\n') ? captured.slice(0, -1) : captured;
}
