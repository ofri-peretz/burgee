/**
 * One mounted app: the root host node, React's container over it, and the loop that turns a
 * commit into bytes — Ink's, decision for decision. `debug` writes every frame whole; CI
 * writes `<Static>` output as it arrives and the last frame once; a screen reader gets plain
 * text, erased and rewritten; everything else is the live frame, throttled to `maxFps`,
 * with new `<Static>` output written above it. Layout is `flex.ts` at the stream's width.
 */
import { onExit } from 'closeout';
import { wrap } from 'linegauge';

import { AccessibilityContext, App } from './components.js';
import { createNode, type DOMElement, syncFlexTree } from './dom.js';
import { calculateLayout } from './flex.js';
import { createContainer, updateContainer } from './host.js';
import { type KittyFlagName } from './keypress.js';
import { defaultStreams, isInCi, onceBeforeExit, patchConsole, screenReaderByDefault } from './process.js';
import { React } from './react.js';
import { renderer } from './render.js';
import { bsu, clearTerminal, createLogUpdate, type CursorPosition, eraseLines, esu, type InkStream, type LogUpdate, write } from './terminal.js';

const DEFAULT_COLUMNS = 80;
const DEFAULT_FPS = 30;
const MS_PER_SECOND = 1000;

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
}

interface Throttled<A extends unknown[]> {
  (...args: A): void;
  flush(): void;
  cancel(): void;
}

/** es-toolkit's `throttle` with leading and trailing calls: the first call runs at once, the last one in a window runs at its end. */
function throttle<A extends unknown[]>(fn: (...args: A) => void, wait: number): Throttled<A> {
  let timer: NodeJS.Timeout | undefined;
  let pending: A | undefined;
  let last = Number.NEGATIVE_INFINITY;
  const fire = (): void => {
    timer = undefined;
    if (pending === undefined) return;
    const args = pending;
    pending = undefined;
    last = Date.now();
    timer = setTimeout(fire, wait);
    fn(...args);
  };
  const throttled = ((...args: A) => {
    const now = Date.now();
    if (timer === undefined && now - last >= wait) {
      last = now;
      timer = setTimeout(fire, wait);
      fn(...args);
      return;
    }
    pending = args;
    timer ??= setTimeout(fire, Math.max(0, wait - (now - last)));
  }) as Throttled<A>;
  throttled.flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (pending !== undefined) {
      const args = pending;
      pending = undefined;
      fn(...args);
    }
  };
  throttled.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  return throttled;
}

const isError = (value: unknown): value is Error => value instanceof Error || Object.prototype.toString.call(value) === '[object Error]';

const shouldSynchronize = (stream: InkStream, ci: boolean): boolean => stream.isTTY === true && !ci;

export class Ink {
  readonly isConcurrent: boolean;
  readonly #options: InkOptions;
  readonly #stdout: InkStream;
  readonly #ci = isInCi();
  readonly #log: LogUpdate;
  readonly #throttledLog: Throttled<[string]> | LogUpdate;
  readonly #throttledOnRender: Throttled<[]> | undefined;
  readonly #rootNode: DOMElement;
  readonly #container: unknown;
  readonly isScreenReaderEnabled: boolean;
  #cursorPosition: CursorPosition | undefined;
  #isUnmounted = false;
  #isUnmounting = false;
  #lastOutput = '';
  #lastOutputToRender = '';
  #lastOutputHeight = 0;
  #lastTerminalWidth: number;
  #fullStaticOutput = '';
  #exitPromise: Promise<unknown> | undefined;
  #exitResult: unknown;
  #resolveExit: (value: unknown) => void = () => undefined;
  #rejectExit: (reason: unknown) => void = () => undefined;
  #offBeforeExit: (() => void) | undefined;
  #restoreConsole: (() => void) | undefined;
  #unsubscribeResize: (() => void) | undefined;
  #unsubscribeExit: () => void;
  #hasPendingThrottledRender = false;

  constructor(options: InkOptions) {
    this.#options = options;
    this.#stdout = options.stdout as InkStream;
    this.#rootNode = createNode('ink-root');
    this.#rootNode.onComputeLayout = this.calculateLayout;
    this.isScreenReaderEnabled = options.isScreenReaderEnabled ?? screenReaderByDefault();
    const unthrottled = options.debug || this.isScreenReaderEnabled;
    const maxFps = options.maxFps ?? DEFAULT_FPS;
    const wait = maxFps > 0 ? Math.max(1, Math.ceil(MS_PER_SECOND / maxFps)) : 0;
    if (unthrottled) {
      this.#rootNode.onRender = this.onRender;
      this.#throttledOnRender = undefined;
    } else {
      const throttled = throttle(this.onRender, wait);
      this.#rootNode.onRender = () => {
        this.#hasPendingThrottledRender = true;
        throttled();
      };
      this.#throttledOnRender = throttled;
    }
    this.#rootNode.onImmediateRender = this.onRender;
    this.#log = createLogUpdate(this.#stdout, { incremental: options.incrementalRendering === true });
    this.#throttledLog = unthrottled
      ? this.#log
      : throttle((output: string) => {
          const shouldWrite = this.#log.willRender(output);
          const sync = shouldSynchronize(this.#stdout, this.#ci);
          if (sync && shouldWrite) write(this.#stdout, bsu);
          this.#log(output);
          if (sync && shouldWrite) write(this.#stdout, esu);
        }, 0);
    this.isConcurrent = options.concurrent ?? false;
    this.#lastTerminalWidth = this.#terminalWidth();
    this.#container = createContainer(this.#rootNode, this.isConcurrent);
    this.#unsubscribeExit = onExit(() => this.unmount(0));
    if (options.patchConsole) this.#patchConsole();
    if (!this.#ci) {
      this.#stdout.on?.('resize', this.resized);
      this.#unsubscribeResize = () => this.#stdout.off?.('resize', this.resized);
    }
  }

  #terminalWidth(): number {
    const { columns } = this.#stdout;
    return columns !== undefined && columns > 0 ? columns : DEFAULT_COLUMNS;
  }

  readonly resized = (): void => {
    const width = this.#terminalWidth();
    if (width < this.#lastTerminalWidth) {
      this.#log.clear();
      this.#lastOutput = '';
      this.#lastOutputToRender = '';
    }
    this.calculateLayout();
    this.onRender();
    this.#lastTerminalWidth = width;
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

  readonly calculateLayout = (): void => {
    syncFlexTree(this.#rootNode);
    calculateLayout(this.#rootNode.yogaNode!, this.#terminalWidth());
  };

  readonly onRender = (): void => {
    this.#hasPendingThrottledRender = false;
    if (this.#isUnmounted) return;
    const started = performance.now();
    const { output, outputHeight, staticOutput } = renderer(this.#rootNode, this.isScreenReaderEnabled);
    this.#options.onRender?.({ renderTime: performance.now() - started });
    const hasStaticOutput = staticOutput !== '' && staticOutput !== '\n';
    const stdout = this.#stdout;
    if (this.#options.debug) {
      if (hasStaticOutput) this.#fullStaticOutput += staticOutput;
      write(stdout, this.#fullStaticOutput + output);
      return;
    }
    if (this.#ci) {
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
    if (hasStaticOutput) this.#fullStaticOutput += staticOutput;
    const rows = stdout.rows ?? Number.POSITIVE_INFINITY;
    const isFullscreen = stdout.isTTY === true && outputHeight >= rows;
    const outputToRender = isFullscreen ? output : `${output}\n`;
    const sync = shouldSynchronize(stdout, this.#ci);
    if (this.#lastOutputHeight >= rows) {
      if (sync) write(stdout, bsu);
      write(stdout, clearTerminal + this.#fullStaticOutput + output);
      this.#lastOutput = output;
      this.#lastOutputToRender = outputToRender;
      this.#lastOutputHeight = outputHeight;
      this.#log.sync(outputToRender);
      if (sync) write(stdout, esu);
      return;
    }
    if (hasStaticOutput) {
      if (sync) write(stdout, bsu);
      this.#log.clear();
      write(stdout, staticOutput);
      this.#log(outputToRender);
      if (sync) write(stdout, esu);
    } else if (output !== this.#lastOutput || this.#log.isCursorDirty()) {
      this.#throttledLog(outputToRender);
    }
    this.#lastOutput = output;
    this.#lastOutputToRender = outputToRender;
    this.#lastOutputHeight = outputHeight;
  };

  #renderForScreenReader(output: string, staticOutput: string, hasStaticOutput: boolean): void {
    const stdout = this.#stdout;
    const sync = shouldSynchronize(stdout, this.#ci);
    if (sync) write(stdout, bsu);
    if (hasStaticOutput) {
      write(stdout, (this.#lastOutputHeight > 0 ? eraseLines(this.#lastOutputHeight) : '') + staticOutput);
      this.#lastOutputHeight = 0;
    }
    if (output === this.#lastOutput && !hasStaticOutput) {
      if (sync) write(stdout, esu);
      return;
    }
    const wrapped = wrap(output, this.#terminalWidth(), { trim: false, hard: true });
    if (hasStaticOutput) write(stdout, wrapped);
    else write(stdout, (this.#lastOutputHeight > 0 ? eraseLines(this.#lastOutputHeight) : '') + wrapped);
    this.#lastOutput = output;
    this.#lastOutputToRender = wrapped;
    this.#lastOutputHeight = wrapped === '' ? 0 : wrapped.split('\n').length;
    if (sync) write(stdout, esu);
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
          writeToStdout: this.writeToStdout,
          writeToStderr: this.writeToStderr,
          setCursorPosition: this.setCursorPosition,
          onExit: this.handleAppExit,
        },
        node,
      ),
    );
    updateContainer(tree, this.#container, this.isConcurrent);
  }

  readonly writeToStdout = (data: string): void => {
    if (this.#isUnmounted) return;
    const stdout = this.#stdout;
    if (this.#options.debug) {
      write(stdout, data + this.#fullStaticOutput + this.#lastOutput);
      return;
    }
    if (this.#ci) {
      write(stdout, data);
      return;
    }
    const sync = shouldSynchronize(stdout, this.#ci);
    if (sync) write(stdout, bsu);
    this.#log.clear();
    write(stdout, data);
    this.#restoreLastOutput();
    if (sync) write(stdout, esu);
  };

  readonly writeToStderr = (data: string): void => {
    if (this.#isUnmounted) return;
    const stderr = this.#options.stderr as InkStream;
    if (this.#options.debug) {
      write(stderr, data);
      write(this.#stdout, this.#fullStaticOutput + this.#lastOutput);
      return;
    }
    if (this.#ci) {
      write(stderr, data);
      return;
    }
    const sync = shouldSynchronize(this.#stdout, this.#ci);
    if (sync) write(this.#stdout, bsu);
    this.#log.clear();
    write(stderr, data);
    this.#restoreLastOutput();
    if (sync) write(this.#stdout, esu);
  };

  #restoreLastOutput(): void {
    this.#log.setCursorPosition(this.#cursorPosition);
    this.#log(this.#lastOutputToRender || `${this.#lastOutput}\n`);
  }

  readonly unmount = (error?: unknown): void => {
    if (this.#isUnmounted || this.#isUnmounting) return;
    this.#isUnmounting = true;
    this.#offBeforeExit?.();
    this.#offBeforeExit = undefined;
    const stdout = this.#stdout;
    const canWrite = stdout.destroyed !== true && stdout.writableEnded !== true && (stdout.writable ?? true);
    const settle = (throttled: Partial<Throttled<never[]>>): void => {
      if (typeof throttled.flush !== 'function') return;
      if (canWrite) throttled.flush();
      else throttled.cancel?.();
    };
    settle(this.#throttledOnRender ?? {});
    if (canWrite) {
      const renderFinal = this.#throttledOnRender === undefined || (!this.#hasPendingThrottledRender && this.#fullStaticOutput === '');
      if (renderFinal) {
        this.calculateLayout();
        this.onRender();
      }
    }
    this.#isUnmounted = true;
    this.#unsubscribeExit();
    this.#restoreConsole?.();
    this.#unsubscribeResize?.();
    settle(this.#throttledLog as Partial<Throttled<never[]>>);
    if (canWrite) {
      if (this.#ci) write(stdout, `${this.#lastOutput}\n`);
      else if (!this.#options.debug) this.#log.done();
    }
    updateContainer(null, this.#container, this.isConcurrent);
    instances.delete(this.#options.stdout);
    const result = this.#exitResult;
    const finish = (): void => {
      if (isError(error)) this.#rejectExit(error);
      else this.#resolveExit(result);
    };
    const processExiting = error !== undefined && !isError(error);
    const hasWritableState = stdout._writableState !== undefined || stdout.writableLength !== undefined;
    if (processExiting) finish();
    else if (canWrite && hasWritableState) write(stdout, '', finish);
    else setImmediate(finish);
  };

  readonly waitUntilExit = async (): Promise<unknown> => {
    this.#exitPromise ??= new Promise((resolve, reject) => {
      this.#resolveExit = resolve;
      this.#rejectExit = reject;
    });
    this.#offBeforeExit ??= onceBeforeExit(() => this.unmount());
    return this.#exitPromise;
  };

  readonly clear = (): void => {
    if (this.#ci || this.#options.debug) return;
    this.#log.clear();
    this.#log.sync(this.#lastOutputToRender || `${this.#lastOutput}\n`);
  };

  #patchConsole(): void {
    if (this.#options.debug) return;
    this.#restoreConsole = patchConsole((stream, data) => {
      if (stream === 'stdout') this.writeToStdout(data);
      else if (!data.startsWith('The above error occurred')) this.writeToStderr(data);
    });
  }
}

/** One instance per stdout: a second `render()` to the same stream re-renders the first. */
export const instances = new WeakMap<object, Ink>();

export interface RenderOptions {
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
  debug?: boolean;
  exitOnCtrlC?: boolean;
  patchConsole?: boolean;
  maxFps?: number;
  incrementalRendering?: boolean;
  concurrent?: boolean;
  isScreenReaderEnabled?: boolean;
  onRender?: (metrics: RenderMetrics) => void;
  kittyKeyboard?: KittyKeyboardOptions;
}

export interface Instance {
  rerender: (node: React.ReactNode) => void;
  unmount: () => void;
  waitUntilExit: () => Promise<unknown>;
  cleanup: () => void;
  clear: () => void;
}

const isStream = (value: unknown): value is NodeJS.WriteStream => typeof value === 'object' && value !== null && typeof (value as { pipe?: unknown }).pipe === 'function';

/** Mount `node` and draw it: Ink's `render`. A stream as the second argument is the stdout. */
export function render(node: React.ReactNode, options?: RenderOptions | NodeJS.WriteStream): Instance {
  const given: RenderOptions = isStream(options) ? { stdout: options, stdin: defaultStreams().stdin } : (options ?? {});
  const resolved: InkOptions = { ...defaultStreams(), debug: false, exitOnCtrlC: true, patchConsole: true, maxFps: DEFAULT_FPS, incrementalRendering: false, concurrent: false, ...given } as InkOptions;
  let instance = instances.get(resolved.stdout);
  if (instance === undefined) {
    instance = new Ink(resolved);
    instances.set(resolved.stdout, instance);
  }
  instance.render(node);
  const mounted = instance;
  return {
    rerender: (next) => mounted.render(next),
    unmount: () => mounted.unmount(),
    waitUntilExit: mounted.waitUntilExit,
    cleanup: () => instances.delete(resolved.stdout),
    clear: mounted.clear,
  };
}

/** The tree as a string, once, with no stream at all: Ink's `renderToString`. */
export function renderToString(node: React.ReactNode, options?: { columns?: number }): string {
  const columns = options?.columns ?? DEFAULT_COLUMNS;
  const rootNode = createNode('ink-root');
  let staticOutput = '';
  rootNode.onComputeLayout = () => {
    syncFlexTree(rootNode);
    calculateLayout(rootNode.yogaNode!, columns);
  };
  rootNode.onImmediateRender = () => {
    const rendered = renderer(rootNode, false).staticOutput;
    if (rendered !== '' && rendered !== '\n') staticOutput += rendered;
  };
  let uncaught: unknown;
  let caught = false;
  const container = createContainer(rootNode, false, (error) => {
    if (!caught) {
      caught = true;
      uncaught = error;
    }
  });
  updateContainer(node, container, false);
  const { output } = renderer(rootNode, false);
  updateContainer(null, container, false);
  if (caught) throw uncaught instanceof Error ? uncaught : new Error(String(uncaught));
  const settled = staticOutput.endsWith('\n') ? staticOutput.slice(0, -1) : staticOutput;
  if (settled !== '' && output !== '') return `${settled}\n${output}`;
  return settled === '' ? output : settled;
}
