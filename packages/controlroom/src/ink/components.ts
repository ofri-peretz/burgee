/**
 * ink's components and the contexts its hooks read, written against the program's React
 * (R11). `App` is the root every render wraps the program in: it owns raw mode, bracketed
 * paste, the input stream's key and paste events, focus, the one timer every animation shares,
 * and the error boundary that turns a thrown render into ink's error overview and an exit.
 */
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

import { onExit } from 'closeout';
import { rawMode, type Registrar } from 'closeout/cursor';
import type { ReactElement, ReactNode } from 'react';
import chalk from 'roundel/chalk';

import { type Accessibility, type DOMElement, type Styles, type TextWrap } from './dom.js';
import { createInputParser, type InputEvent, isCompleteControlSequence, isKittyQueryReply, parseKeypress } from './keypress.js';
import { cwd, defaultStreams, isProcessStdin } from './process.js';
import { React } from './react.js';
import { colorize } from './render.js';
import { bracketedPasteOff, bracketedPasteOn, type CursorPosition, type InkStream, showCursorOn } from './terminal.js';

const h = React.createElement;
type Node = ReactNode;

// ── Contexts ────────────────────────────────────────────────────────────────────────────

/** The handle `suspendTerminal()` returns without a callback. */
export interface TerminalSuspension {
  readonly resume: () => Promise<void>;
  readonly [Symbol.asyncDispose]: () => Promise<void>;
}

export interface SuspendTerminal {
  (callback: () => void | Promise<void>): Promise<void>;
  (): Promise<TerminalSuspension>;
}

export interface AppProps {
  /** Exit (unmount) the whole app; an `Error` rejects `waitUntilExit()`, anything else resolves it. */
  readonly exit: (errorOrResult?: unknown) => void;
  /** Settles once pending render output has reached stdout. */
  readonly waitUntilRenderFlush: () => Promise<void>;
  /** Hand the terminal to a child process, then take it back and redraw. */
  readonly suspendTerminal: SuspendTerminal;
}

const noopSuspension: TerminalSuspension = {
  async resume() {},
  async [Symbol.asyncDispose]() {},
};

export const AppContext = React.createContext<AppProps>({
  exit() {},
  async waitUntilRenderFlush() {},
  suspendTerminal: (async (callback?: () => void | Promise<void>) => {
    if (callback !== undefined) {
      await callback();
      return undefined;
    }
    return noopSuspension;
  }) as SuspendTerminal,
});
AppContext.displayName = 'InternalAppContext';

export interface StdinProps {
  readonly stdin: NodeJS.ReadStream;
  readonly setRawMode: (value: boolean) => void;
  readonly setBracketedPasteMode: (value: boolean) => void;
  readonly isRawModeSupported: boolean;
  readonly internal_exitOnCtrlC: boolean;
  readonly internal_eventEmitter: EventEmitter;
}
export const StdinContext = React.createContext<StdinProps>({
  stdin: defaultStreams().stdin,
  internal_eventEmitter: new EventEmitter(),
  setRawMode() {},
  setBracketedPasteMode() {},
  isRawModeSupported: false,
  internal_exitOnCtrlC: true,
});
StdinContext.displayName = 'InternalStdinContext';

export interface StdoutProps {
  readonly stdout: NodeJS.WriteStream;
  readonly write: (data: string) => void;
}
export const StdoutContext = React.createContext<StdoutProps>({ stdout: defaultStreams().stdout, write() {} });
StdoutContext.displayName = 'InternalStdoutContext';

export interface StderrProps {
  readonly stderr: NodeJS.WriteStream;
  readonly write: (data: string) => void;
}
export const StderrContext = React.createContext<StderrProps>({ stderr: defaultStreams().stderr, write() {} });
StderrContext.displayName = 'InternalStderrContext';

export interface FocusProps {
  readonly activeId?: string | undefined;
  readonly add: (id: string, options: { autoFocus: boolean }) => void;
  readonly remove: (id: string) => void;
  readonly activate: (id: string) => void;
  readonly deactivate: (id: string) => void;
  readonly enableFocus: () => void;
  readonly disableFocus: () => void;
  readonly focusNext: () => void;
  readonly focusPrevious: () => void;
  readonly focus: (id: string) => void;
}
export const FocusContext = React.createContext<FocusProps>({
  activeId: undefined,
  add() {},
  remove() {},
  activate() {},
  deactivate() {},
  enableFocus() {},
  disableFocus() {},
  focusNext() {},
  focusPrevious() {},
  focus() {},
});
FocusContext.displayName = 'InternalFocusContext';

export interface AnimationProps {
  readonly renderThrottleMs: number;
  readonly subscribe: (callback: (currentTime: number) => void, interval: number) => { readonly startTime: number; readonly unsubscribe: () => void };
}
export const AnimationContext = React.createContext<AnimationProps>({
  renderThrottleMs: 0,
  subscribe: () => ({ startTime: 0, unsubscribe() {} }),
});
AnimationContext.displayName = 'InternalAnimationContext';

export const CursorContext = React.createContext<{ readonly setCursorPosition: (position: CursorPosition | undefined) => void }>({ setCursorPosition() {} });
CursorContext.displayName = 'InternalCursorContext';

export const AccessibilityContext = React.createContext({ isScreenReaderEnabled: false });
export const BackgroundContext = React.createContext<string | undefined>(undefined);
export const RootNodeContext = React.createContext<DOMElement | undefined>(undefined);

// ── Box, Text and the small ones ────────────────────────────────────────────────────────

export type BoxProps = Omit<Styles, 'textWrap'> & {
  readonly children?: Node | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-hidden'?: boolean | undefined;
  readonly 'aria-role'?: string | undefined;
  readonly 'aria-state'?: Accessibility['state'] | undefined;
};

export const Box = React.forwardRef<DOMElement, BoxProps>(function Box(
  { children, backgroundColor, flexWrap = 'nowrap', flexDirection = 'row', 'aria-label': ariaLabel, 'aria-hidden': ariaHidden, 'aria-role': role, 'aria-state': ariaState, ...style },
  ref,
) {
  const { isScreenReaderEnabled } = React.useContext(AccessibilityContext);
  const inherited = React.useContext(BackgroundContext);
  if (isScreenReaderEnabled && ariaHidden === true) return null;
  // An empty background inherits too.
  const effective = backgroundColor || inherited;
  const box = h(
    'ink-box',
    {
      ref,
      style: {
        flexWrap,
        flexDirection,
        flexGrow: 0,
        flexShrink: 1,
        ...style,
        backgroundColor,
        overflowX: style.overflowX ?? style.overflow ?? 'visible',
        overflowY: style.overflowY ?? style.overflow ?? 'visible',
      },
      internal_accessibility: { role, state: ariaState },
    },
    isScreenReaderEnabled && Boolean(ariaLabel) ? h('ink-text', null, ariaLabel) : children,
  );
  return h(BackgroundContext.Provider, { value: effective }, box);
});
Box.displayName = 'Box';

export interface TextProps {
  readonly color?: string | undefined;
  readonly backgroundColor?: string | undefined;
  readonly dimColor?: boolean | undefined;
  readonly bold?: boolean | undefined;
  readonly italic?: boolean | undefined;
  readonly underline?: boolean | undefined;
  readonly strikethrough?: boolean | undefined;
  readonly inverse?: boolean | undefined;
  readonly wrap?: TextWrap | undefined;
  readonly children?: Node | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-hidden'?: boolean | undefined;
}

export function Text({ color, backgroundColor, dimColor = false, bold = false, italic = false, underline = false, strikethrough = false, inverse = false, wrap = 'wrap', children, 'aria-label': ariaLabel, 'aria-hidden': ariaHidden = false }: TextProps): ReactElement | null {
  const { isScreenReaderEnabled } = React.useContext(AccessibilityContext);
  const inherited = React.useContext(BackgroundContext);
  // An explicit background wins; otherwise the nearest parent Text's or Box's.
  const background = backgroundColor ?? inherited;
  const content = isScreenReaderEnabled && Boolean(ariaLabel) ? ariaLabel : children;
  if (content === undefined || content === null || (isScreenReaderEnabled && ariaHidden)) return null;
  const transform = (text: string): string => {
    let out = text;
    if (dimColor) out = chalk.dim(out);
    out = colorize(out, color, 'foreground');
    out = colorize(out, background, 'background');
    if (bold) out = chalk.bold(out);
    if (italic) out = chalk.italic(out);
    if (underline) out = chalk.underline(out);
    if (strikethrough) out = chalk.strikethrough(out);
    if (inverse) out = chalk.inverse(out);
    return out;
  };
  return h(
    BackgroundContext.Provider,
    { value: background },
    h('ink-text', { style: { flexGrow: 0, flexShrink: 1, flexDirection: 'row', textWrap: wrap }, internal_transform: isScreenReaderEnabled ? undefined : transform }, content),
  );
}

export interface StaticProps<T> {
  readonly items: T[];
  readonly style?: Styles | undefined;
  readonly children: (item: T, index: number) => Node;
}

/** Items rendered once, above everything else, and never again: what has finished. */
export function Static<T>({ items, children: render, style: customStyle }: StaticProps<T>): ReactElement {
  const [index, setIndex] = React.useState(0);
  const inherited = React.useContext(BackgroundContext);
  const effective = customStyle?.backgroundColor || inherited;
  const itemsToRender = React.useMemo(() => items.slice(index), [items, index]);
  React.useLayoutEffect(() => {
    setIndex(items.length);
  }, [items.length]);
  const children = itemsToRender.map((item, i) => render(item, index + i));
  const style = React.useMemo(
    (): Styles => ({ position: 'absolute', flexDirection: 'column', ...customStyle, display: itemsToRender.length > 0 ? customStyle?.display : 'none' }),
    [customStyle, itemsToRender.length],
  );
  return h(BackgroundContext.Provider, { value: effective }, h('ink-box', { internal_static: true, style }, children));
}

export interface TransformProps {
  readonly transform: (children: string, index: number) => string;
  readonly accessibilityLabel?: string | undefined;
  readonly children?: Node | undefined;
}

export function Transform({ children, transform, accessibilityLabel }: TransformProps): ReactElement | null {
  const { isScreenReaderEnabled } = React.useContext(AccessibilityContext);
  const content = isScreenReaderEnabled ? (accessibilityLabel ?? children) : children;
  if (content === undefined || content === null) return null;
  return h('ink-text', { style: { flexGrow: 0, flexShrink: 1, flexDirection: 'row' }, internal_transform: isScreenReaderEnabled ? undefined : transform }, content);
}

export interface NewlineProps {
  /** Newlines to insert. Default 1. */
  readonly count?: number;
}

export function Newline({ count = 1 }: NewlineProps): ReactElement {
  return h('ink-text', null, '\n'.repeat(count));
}

/** A flexible space that fills the main axis between its siblings. */
export function Spacer(): ReactElement {
  return h(Box, { flexGrow: 1 });
}

// ── The error overview ──────────────────────────────────────────────────────────────────

interface StackLine {
  function?: string;
  file?: string;
  line?: number;
  column?: number;
}

/** stack-utils' frame grammar: `at [new ]fn (file:line:col)`, `at file:line:col`, or native. */
const STACK_LINE = /^(?:\s*at )?(?:(new) )?(?:(.*?) \()?(?:eval at ([^ ]+) \((.+?):(\d+):(\d+)\), )?(?:(.+?):(\d+):(\d+)|(native))(\)?)$/u;
const METHOD = /^(.*?) \[as (.*?)\]$/u;

/** stack-utils' `parseLine`, with the working directory taken off the file. */
export function parseStackLine(line: string): StackLine | undefined {
  const match = STACK_LINE.exec(line);
  if (match === null) return undefined;
  let fname = match[2];
  let file = match[7];
  const result: StackLine = {};
  if (match[8] !== undefined) result.line = Number(match[8]);
  if (match[9] !== undefined) result.column = Number(match[9]);
  if (match[11] === ')' && file !== undefined) {
    // Balance the parens: an unbalanced `(` belongs to the function name, not the file.
    let closes = 0;
    for (let i = file.length - 1; i > 0; i -= 1) {
      if (file.charAt(i) === ')') closes += 1;
      else if (file.charAt(i) === '(' && file.charAt(i - 1) === ' ') {
        closes -= 1;
        if (closes === -1 && file.charAt(i - 1) === ' ') {
          const before = file.slice(0, i - 1);
          file = file.slice(i + 1);
          fname = `${fname ?? ''} (${before}`;
          break;
        }
      }
    }
  }
  if (fname !== undefined) {
    const method = METHOD.exec(fname);
    if (method !== null) fname = method[1];
  }
  if (file !== undefined && file !== '') {
    let name = file.replaceAll('\\', '/');
    const root = `${cwd()}/`;
    if (name.startsWith(root)) name = name.slice(root.length);
    result.file = name;
  }
  if (fname !== undefined) result.function = fname;
  return result;
}

/** A file URL to a path relative to the working directory, as ink reports a frame's file. */
const cleanupPath = (path: string | undefined): string | undefined => (path?.startsWith('file://') === true ? relative(cwd(), fileURLToPath(path)) : path);

/** code-excerpt's three lines either side of `line`, leading tabs as two spaces each. */
function excerpt(source: string, line: number): { line: number; value: string }[] | undefined {
  const lines = source.replaceAll(/^\t+/gmu, (tabs) => '  '.repeat(tabs.length)).split(/\r?\n/u);
  if (line > lines.length) return undefined;
  const out: { line: number; value: string }[] = [];
  for (let n = line - 3; n <= line + 3; n += 1) if (lines[n - 1] !== undefined) out.push({ line: n, value: lines[n - 1]! });
  return out;
}

function readExcerpt(filePath: string, line: number): { line: number; value: string }[] | undefined {
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return undefined;
    return excerpt(readFileSync(filePath, 'utf8'), line);
  } catch {
    // A source excerpt is best-effort and must not hide the error.
    return undefined;
  }
}

export function ErrorOverview({ error }: { readonly error: Error }): ReactElement {
  const stack = error.stack?.split('\n').slice(error.message.split('\n').length);
  const origin = stack === undefined || stack[0] === undefined ? undefined : parseStackLine(stack[0]);
  const filePath = cleanupPath(origin?.file);
  let lines: { line: number; value: string }[] | undefined;
  let lineWidth = 0;
  if (filePath !== undefined && filePath !== '' && origin?.line !== undefined && origin.line !== 0) {
    lines = readExcerpt(filePath, origin.line);
    for (const { line } of lines ?? []) lineWidth = Math.max(lineWidth, String(line).length);
  }
  const counts = new Map<string, number>();
  const at = origin?.line;
  return h(
    Box,
    { flexDirection: 'column', padding: 1 },
    h(Box, null, h(Text, { backgroundColor: 'red', color: 'white' }, ' ', 'ERROR', ' '), h(Text, null, ' ', error.message)),
    origin !== undefined && filePath !== undefined && filePath !== '' ? h(Box, { marginTop: 1 }, h(Text, { dimColor: true }, filePath, ':', origin.line, ':', origin.column)) : null,
    origin !== undefined && lines !== undefined
      ? h(
          Box,
          { marginTop: 1, flexDirection: 'column' },
          lines.map(({ line, value }) =>
            h(
              Box,
              { key: line },
              h(Box, { width: lineWidth + 1 }, h(Text, { dimColor: line !== at, backgroundColor: line === at ? 'red' : undefined, color: line === at ? 'white' : undefined, 'aria-label': line === at ? `Line ${line}, error` : `Line ${line}` }, String(line).padStart(lineWidth, ' '), ':')),
              h(Text, { key: line, backgroundColor: line === at ? 'red' : undefined, color: line === at ? 'white' : undefined }, ` ${value}`),
            ),
          ),
        )
      : null,
    stack === undefined
      ? null
      : h(
          Box,
          { marginTop: 1, flexDirection: 'column' },
          stack.map((line) => {
            const parsed = parseStackLine(line);
            const count = counts.get(line) ?? 0;
            counts.set(line, count + 1);
            const key = `${line}-${count}`;
            // A frame with no source location (`at native`) is printed as it came.
            if (parsed?.file === undefined || parsed.file === '' || parsed.line === undefined || parsed.line === 0 || parsed.column === undefined || parsed.column === 0) {
              return h(Box, { key }, h(Text, { dimColor: true }, '- '), h(Text, { dimColor: true, bold: true }, line, '\\t', ' '));
            }
            const file = cleanupPath(parsed.file) ?? '';
            return h(
              Box,
              { key },
              h(Text, { dimColor: true }, '- '),
              h(Text, { dimColor: true, bold: true }, parsed.function),
              h(Text, { dimColor: true, color: 'gray', 'aria-label': `at ${file} line ${parsed.line} column ${parsed.column}` }, ' ', '(', file, ':', parsed.line, ':', parsed.column, ')'),
            );
          }),
        ),
  );
}

interface BoundaryProps {
  readonly children?: Node | undefined;
  readonly onError: (error: Error) => void;
}

export class ErrorBoundary extends React.PureComponent<BoundaryProps, { error: Error | undefined }> {
  static displayName = 'InternalErrorBoundary';
  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: types.isNativeError(error) ? error : new Error(String(error)) };
  }
  override state = { error: undefined as Error | undefined };
  override componentDidCatch(): void {
    this.props.onError(this.state.error!);
  }
  override render(): Node {
    return this.state.error === undefined ? this.props.children : h(ErrorOverview, { error: this.state.error });
  }
}

// ── App ─────────────────────────────────────────────────────────────────────────────────

export interface AppOptions {
  readonly children?: Node | undefined;
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly writeToStdout: (data: string) => void;
  readonly writeToStderr: (data: string) => void;
  readonly exitOnCtrlC: boolean;
  readonly onExit: (errorOrResult?: unknown) => void;
  readonly onWaitUntilRenderFlush: () => Promise<void>;
  readonly onSuspendTerminal: SuspendTerminal;
  readonly onKittyQueryResponse: () => void;
  readonly onRegisterInputControl: (pauseInput: () => void, resumeInput: () => void) => void;
  readonly setCursorPosition: (position: CursorPosition | undefined) => void;
  readonly interactive: boolean;
  readonly renderThrottleMs: number;
}

interface Focusable {
  readonly id: string;
  readonly isActive: boolean;
}

interface AnimationSubscriber {
  readonly callback: (currentTime: number) => void;
  readonly interval: number;
  readonly startTime: number;
  nextDueTime: number;
}

const noop = (): void => undefined;
/** Where the raw-mode undo registers: closeout's `restore` phase, as the screen core's does. */
const restore: Registrar = (handler) => onExit(handler, { phase: 'restore' });

/** ink's two refusals, word for word: its suite and its users match on them. */
const RAW_MODE_HELP = `Read about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported`;
const RAW_MODE_ON_PROCESS = ['Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.', RAW_MODE_HELP].join('\n');
const RAW_MODE_ON_STDIN = ['Raw mode is not supported on the stdin provided to Ink.', RAW_MODE_HELP].join('\n');

/** Components sharing an ID are one slot to focus, at their first registration. */
function uniqueFocusables(focusables: Focusable[]): Focusable[] {
  const seen = new Set<string>();
  return focusables.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

/** How long a lone Escape waits for the rest of a chunked sequence before it is a key. */
const PENDING_INPUT_FLUSH_MS = 20;

interface RawStream {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  ref?: () => unknown;
  unref?: () => unknown;
  setEncoding?: (encoding: BufferEncoding) => unknown;
}

const rawCapable = (stdin: NodeJS.ReadStream): boolean => (stdin as RawStream).isTTY === true && typeof (stdin as RawStream).setRawMode === 'function';

export function App({
  children,
  stdin,
  stdout,
  stderr,
  writeToStdout,
  writeToStderr,
  exitOnCtrlC,
  onExit,
  onWaitUntilRenderFlush,
  onSuspendTerminal,
  onKittyQueryResponse,
  onRegisterInputControl,
  setCursorPosition,
  interactive,
  renderThrottleMs,
}: AppOptions): ReactElement {
  const isFocusEnabledRef = React.useRef(true);
  const [activeFocusId, setActiveFocusId] = React.useState<string | undefined>(undefined);
  const focusablesRef = React.useRef<Focusable[]>([]);
  const animationSubscribersRef = React.useRef(new Map<(currentTime: number) => void, AnimationSubscriber>());
  const animationTimerRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
  const rawModeEnabledCountRef = React.useRef(0);
  const pendingDisableRawModeRef = React.useRef(false);
  const isInputPausedRef = React.useRef(false);
  const bracketedPasteCountRef = React.useRef(0);
  const releaseRawModeRef = React.useRef<() => void>(noop);
  const emitterRef = React.useRef(new EventEmitter());
  emitterRef.current.setMaxListeners(Infinity);
  const readableListenerRef = React.useRef<(() => void) | undefined>(undefined);
  const parserRef = React.useRef(createInputParser());
  const pendingInputFlushRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
  const raw = stdin as unknown as RawStream;
  const isRawModeSupported = rawCapable(stdin);
  const output = stdout as unknown as InkStream;

  const clearPendingInputFlush = React.useCallback(() => {
    if (pendingInputFlushRef.current === undefined) return;
    clearTimeout(pendingInputFlushRef.current);
    pendingInputFlushRef.current = undefined;
  }, []);

  const clearAnimationTimer = React.useCallback(() => {
    if (animationTimerRef.current === undefined) return;
    clearTimeout(animationTimerRef.current);
    animationTimerRef.current = undefined;
  }, []);

  const scheduleAnimationTick = React.useCallback(() => {
    clearAnimationTimer();
    if (animationSubscribersRef.current.size === 0) return;
    let nextDueTime = Infinity;
    // One shared timer wakes at the earliest deadline; slower animations skip that tick.
    for (const subscriber of animationSubscribersRef.current.values()) nextDueTime = Math.min(nextDueTime, subscriber.nextDueTime);
    const delay = Math.max(0, nextDueTime - performance.now());
    const tick = (): void => {
      animationTimerRef.current = undefined;
      const currentTime = performance.now();
      for (const subscriber of animationSubscribersRef.current.values()) {
        if (currentTime < subscriber.nextDueTime) continue;
        subscriber.callback(currentTime);
        // Advance from elapsed time, so a late tick catches up rather than stretching the timeline.
        const elapsedFrames = Math.floor((currentTime - subscriber.startTime) / subscriber.interval) + 1;
        subscriber.nextDueTime = subscriber.startTime + elapsedFrames * subscriber.interval;
      }
      scheduleAnimationTick();
    };
    animationTimerRef.current = setTimeout(tick, delay);
  }, [clearAnimationTimer]);

  const animationSubscribe = React.useCallback(
    (callback: (currentTime: number) => void, interval: number) => {
      const startTime = performance.now();
      animationSubscribersRef.current.set(callback, { callback, interval, startTime, nextDueTime: startTime + interval });
      scheduleAnimationTick();
      return {
        startTime,
        unsubscribe() {
          animationSubscribersRef.current.delete(callback);
          if (animationSubscribersRef.current.size === 0) {
            clearAnimationTimer();
            return;
          }
          scheduleAnimationTick();
        },
      };
    },
    [clearAnimationTimer, scheduleAnimationTick],
  );

  React.useEffect(
    () => () => {
      clearAnimationTimer();
    },
    [clearAnimationTimer],
  );

  const detachReadable = React.useCallback(() => {
    if (readableListenerRef.current === undefined) return;
    stdin.removeListener('readable', readableListenerRef.current);
    readableListenerRef.current = undefined;
  }, [stdin]);

  const clearInputState = React.useCallback(() => {
    parserRef.current.reset();
    clearPendingInputFlush();
    detachReadable();
  }, [clearPendingInputFlush, detachReadable]);

  /** closeout takes the mode and registers giving it back on every exit path. */
  const takeRawMode = React.useCallback(() => {
    raw.ref?.();
    releaseRawModeRef.current = rawMode(stdin, restore);
  }, [stdin, raw]);
  const giveRawModeBack = React.useCallback(() => {
    releaseRawModeRef.current();
    releaseRawModeRef.current = noop;
    raw.unref?.();
  }, [raw]);

  const disableRawMode = React.useCallback(() => {
    if (!isRawModeSupported) return;
    pendingDisableRawModeRef.current = false;
    giveRawModeBack();
    rawModeEnabledCountRef.current = 0;
    clearInputState();
  }, [isRawModeSupported, giveRawModeBack, clearInputState]);

  const handleExit = React.useCallback(
    (errorOrResult?: unknown) => {
      if (isRawModeSupported && (rawModeEnabledCountRef.current > 0 || pendingDisableRawModeRef.current)) disableRawMode();
      onExit(errorOrResult);
    },
    [isRawModeSupported, disableRawMode, onExit],
  );

  const handleInput = React.useCallback(
    (input: string) => {
      const key = parseKeypress(input);
      if (exitOnCtrlC && key.ctrl && key.name === 'c' && key.eventType !== 'release') {
        handleExit();
        return;
      }
      // Escape, unmodified, drops focus.
      if (isFocusEnabledRef.current && key.name === 'escape' && key.eventType !== 'release' && !key.shift && !key.ctrl && !key.meta && key.super !== true && key.hyper !== true) setActiveFocusId(undefined);
    },
    [exitOnCtrlC, handleExit],
  );

  const emitInput = React.useCallback(
    (input: string) => {
      handleInput(input);
      emitterRef.current.emit('input', input);
    },
    [handleInput],
  );

  const schedulePendingInputFlush = React.useCallback(() => {
    clearPendingInputFlush();
    pendingInputFlushRef.current = setTimeout(() => {
      pendingInputFlushRef.current = undefined;
      const pending = parserRef.current.flushPendingEscape();
      if (pending === undefined || pending === '') return;
      emitInput(pending);
    }, PENDING_INPUT_FLUSH_MS);
  }, [clearPendingInputFlush, emitInput]);

  const handleReadable = React.useCallback(() => {
    const handleEvent = (event: InputEvent): void => {
      if (typeof event === 'string') {
        // The kitty query's answer is consumed here; a bracketed paste stays literal.
        if (isKittyQueryReply(event)) {
          onKittyQueryResponse();
          return;
        }
        // A terminal reply (focus, cursor position, mouse) maps to no key: it is not typed text.
        if (isCompleteControlSequence(event)) {
          const key = parseKeypress(event);
          if (key.isKittyProtocol !== true && key.name === '') return;
        }
        emitInput(event);
        return;
      }
      // A paste is its own channel, unless nobody listens for one.
      if (emitterRef.current.listenerCount('paste') === 0) {
        emitInput(event.paste);
        return;
      }
      emitterRef.current.emit('paste', event.paste);
    };
    clearPendingInputFlush();
    let chunk: unknown;
    while ((chunk = stdin.read()) !== null) {
      for (const event of parserRef.current.push(String(chunk))) handleEvent(event);
    }
    if (parserRef.current.hasPendingEscape()) schedulePendingInputFlush();
  }, [stdin, emitInput, clearPendingInputFlush, schedulePendingInputFlush, onKittyQueryResponse]);

  const attachReadable = React.useCallback(() => {
    if (readableListenerRef.current !== undefined) return;
    readableListenerRef.current = handleReadable;
    stdin.addListener('readable', handleReadable);
  }, [stdin, handleReadable]);

  const handleSetRawMode = React.useCallback(
    (isEnabled: boolean) => {
      if (!isRawModeSupported) {
        if (isProcessStdin(stdin)) throw new Error(RAW_MODE_ON_PROCESS);
        throw new Error(RAW_MODE_ON_STDIN);
      }
      raw.setEncoding?.('utf8');
      if (isEnabled) {
        if (rawModeEnabledCountRef.current === 0) {
          // A same-render swap may have left raw mode on until the queued disable runs.
          const alreadyEnabled = pendingDisableRawModeRef.current;
          pendingDisableRawModeRef.current = false;
          if (!isInputPausedRef.current) {
            if (!alreadyEnabled) takeRawMode();
            attachReadable();
          }
        }
        rawModeEnabledCountRef.current += 1;
        return;
      }
      if (rawModeEnabledCountRef.current === 0) return;
      rawModeEnabledCountRef.current -= 1;
      if (rawModeEnabledCountRef.current !== 0 || isInputPausedRef.current) return;
      // Stop owning input now, so pending parser state cannot reach a replacement mounted in the same update.
      clearInputState();
      // Defer only the terminal's raw mode, so a same-render replacement keeps it without a cycle.
      pendingDisableRawModeRef.current = true;
      queueMicrotask(() => {
        if (!pendingDisableRawModeRef.current) return;
        disableRawMode();
      });
    },
    [isRawModeSupported, stdin, raw, takeRawMode, attachReadable, clearInputState, disableRawMode],
  );

  const handleSetBracketedPasteMode = React.useCallback(
    (isEnabled: boolean) => {
      if (output.isTTY !== true) return;
      if (isEnabled) {
        if (bracketedPasteCountRef.current === 0 && !isInputPausedRef.current) bracketedPasteOn(output);
        bracketedPasteCountRef.current += 1;
        return;
      }
      if (bracketedPasteCountRef.current === 0) return;
      bracketedPasteCountRef.current -= 1;
      if (bracketedPasteCountRef.current === 0 && !isInputPausedRef.current) bracketedPasteOff(output);
    },
    [output],
  );

  // Pausing and resuming leave the counts alone: the components still own the modes.
  const pauseInput = React.useCallback(() => {
    isInputPausedRef.current = true;
    if (bracketedPasteCountRef.current > 0 && output.isTTY === true) {
      try {
        bracketedPasteOff(output);
      } catch {
        // The stream is gone; there is no mode left to turn off.
      }
    }
    if (!(isRawModeSupported && (rawModeEnabledCountRef.current > 0 || pendingDisableRawModeRef.current))) return;
    pendingDisableRawModeRef.current = false;
    giveRawModeBack();
    clearInputState();
  }, [isRawModeSupported, output, giveRawModeBack, clearInputState]);

  // Hooks may have changed while suspended: restore only the modes that still have an owner.
  const resumeInput = React.useCallback(() => {
    isInputPausedRef.current = false;
    if (isRawModeSupported && rawModeEnabledCountRef.current > 0) {
      raw.setEncoding?.('utf8');
      takeRawMode();
      attachReadable();
    }
    if (bracketedPasteCountRef.current > 0 && output.isTTY === true) {
      try {
        bracketedPasteOn(output);
      } catch {
        // The stream is gone; there is no mode left to turn on.
      }
    }
  }, [isRawModeSupported, raw, output, takeRawMode, attachReadable]);

  // Registered before any passive effect, so a child suspending from its own effect finds it.
  React.useInsertionEffect(() => {
    onRegisterInputControl(pauseInput, resumeInput);
  }, [onRegisterInputControl, pauseInput, resumeInput]);

  const next = (list: Focusable[], current: string | undefined, step: 1 | -1): string | undefined => {
    const at = list.findIndex((f) => f.id === current);
    for (let i = at + step; i >= 0 && i < list.length; i += step) if (list[i]!.isActive) return list[i]!.id;
    return undefined;
  };
  const focusNext = React.useCallback(() => {
    const list = uniqueFocusables(focusablesRef.current);
    setActiveFocusId((current) => next(list, current, 1) ?? list.find((f) => f.isActive)?.id);
  }, []);
  const focusPrevious = React.useCallback(() => {
    const list = uniqueFocusables(focusablesRef.current);
    setActiveFocusId((current) => next(list, current, -1) ?? list.findLast((f) => f.isActive)?.id);
  }, []);

  React.useEffect(() => {
    const onTab = (input: string): void => {
      if (!isFocusEnabledRef.current || focusablesRef.current.length === 0) return;
      const key = parseKeypress(input);
      if (key.name !== 'tab' || key.eventType === 'release' || key.ctrl || key.meta || key.super === true || key.hyper === true) return;
      if (key.shift) focusPrevious();
      else focusNext();
    };
    const events = emitterRef.current;
    events.on('input', onTab);
    return () => {
      events.off('input', onTab);
    };
  }, [focusNext, focusPrevious]);

  const enableFocus = React.useCallback(() => {
    isFocusEnabledRef.current = true;
  }, []);
  const disableFocus = React.useCallback(() => {
    isFocusEnabledRef.current = false;
    setActiveFocusId(undefined);
  }, []);
  const focus = React.useCallback((id: string) => {
    if (focusablesRef.current.some((f) => f.id === id && f.isActive)) setActiveFocusId(id);
  }, []);
  const add = React.useCallback((id: string, { autoFocus }: { autoFocus: boolean }) => {
    focusablesRef.current = [...focusablesRef.current, { id, isActive: true }];
    if (autoFocus && isFocusEnabledRef.current) setActiveFocusId((current) => current ?? id);
  }, []);
  const remove = React.useCallback((id: string) => {
    setActiveFocusId((current) => (current === id ? undefined : current));
    focusablesRef.current = focusablesRef.current.filter((f) => f.id !== id);
  }, []);
  const activate = React.useCallback((id: string) => {
    focusablesRef.current = focusablesRef.current.map((f) => (f.id === id ? { id, isActive: true } : f));
  }, []);
  const deactivate = React.useCallback((id: string) => {
    setActiveFocusId((current) => (current === id ? undefined : current));
    focusablesRef.current = focusablesRef.current.map((f) => (f.id === id ? { id, isActive: false } : f));
  }, []);

  // The cursor, raw mode and bracketed paste, put back at unmount.
  React.useEffect(
    () => () => {
      const canWrite = output.destroyed !== true && output.writableEnded !== true;
      if (interactive && canWrite) showCursorOn(output);
      if (isRawModeSupported && (rawModeEnabledCountRef.current > 0 || pendingDisableRawModeRef.current)) disableRawMode();
      if (!(bracketedPasteCountRef.current > 0)) return;
      if (canWrite && output.isTTY === true) bracketedPasteOff(output);
      bracketedPasteCountRef.current = 0;
    },
    [output, isRawModeSupported, disableRawMode, interactive],
  );

  const appValue = React.useMemo(() => ({ exit: handleExit, waitUntilRenderFlush: onWaitUntilRenderFlush, suspendTerminal: onSuspendTerminal }), [handleExit, onWaitUntilRenderFlush, onSuspendTerminal]);
  const stdinValue = React.useMemo(
    () => ({ stdin, setRawMode: handleSetRawMode, setBracketedPasteMode: handleSetBracketedPasteMode, isRawModeSupported, internal_exitOnCtrlC: exitOnCtrlC, internal_eventEmitter: emitterRef.current }),
    [stdin, handleSetRawMode, handleSetBracketedPasteMode, isRawModeSupported, exitOnCtrlC],
  );
  const stdoutValue = React.useMemo(() => ({ stdout, write: writeToStdout }), [stdout, writeToStdout]);
  const stderrValue = React.useMemo(() => ({ stderr, write: writeToStderr }), [stderr, writeToStderr]);
  const cursorValue = React.useMemo(() => ({ setCursorPosition }), [setCursorPosition]);
  const focusValue = React.useMemo(
    () => ({ activeId: activeFocusId, add, remove, activate, deactivate, enableFocus, disableFocus, focusNext, focusPrevious, focus }),
    [activeFocusId, add, remove, activate, deactivate, enableFocus, disableFocus, focusNext, focusPrevious, focus],
  );
  const animationValue = React.useMemo(() => ({ renderThrottleMs, subscribe: animationSubscribe }), [animationSubscribe, renderThrottleMs]);
  return h(
    AppContext.Provider,
    { value: appValue },
    h(
      StdinContext.Provider,
      { value: stdinValue },
      h(
        StdoutContext.Provider,
        { value: stdoutValue },
        h(
          StderrContext.Provider,
          { value: stderrValue },
          h(FocusContext.Provider, { value: focusValue }, h(AnimationContext.Provider, { value: animationValue }, h(CursorContext.Provider, { value: cursorValue }, h(ErrorBoundary, { onError: handleExit }, children)))),
        ),
      ),
    ),
  );
}
App.displayName = 'InternalApp';
