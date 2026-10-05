/**
 * Ink's components and the contexts its hooks read, written against the program's React
 * (R11). `App` is the root every render wraps the program in: it owns raw mode, the input
 * stream's key events, focus, and the error boundary that turns a thrown render into Ink's
 * error overview and an exit.
 */
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';

import { onExit } from 'closeout';
import { rawMode, type Registrar } from 'closeout/cursor';
import type * as ReactTypes from 'react';

import { type Accessibility, type DOMElement, type Styles, type TextWrap } from './dom.js';
import { createInputParser, parseKeypress } from './keypress.js';
import { cwd, defaultStreams, isProcessStdin } from './process.js';
import { React } from './react.js';
import { colorize } from './render.js';
import { type CursorPosition, type InkStream, showCursorOn } from './terminal.js';
import chalk from 'roundel/chalk';

const h = React.createElement;
type Node = ReactTypes.ReactNode;

// ── Contexts ────────────────────────────────────────────────────────────────────────────

export interface AppProps {
  /** Exit (unmount) the whole app; an `Error` rejects `waitUntilExit()`, anything else resolves it. */
  readonly exit: (errorOrResult?: unknown) => void;
}
export const AppContext = React.createContext<AppProps>({ exit() {} });
AppContext.displayName = 'InternalAppContext';

export interface StdinProps {
  readonly stdin: NodeJS.ReadStream;
  readonly setRawMode: (value: boolean) => void;
  readonly isRawModeSupported: boolean;
  readonly internal_exitOnCtrlC: boolean;
  readonly internal_eventEmitter: EventEmitter;
}
export const StdinContext = React.createContext<StdinProps>({
  stdin: defaultStreams().stdin,
  internal_eventEmitter: new EventEmitter(),
  setRawMode() {},
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

export const CursorContext = React.createContext<{ readonly setCursorPosition: (position: CursorPosition | undefined) => void }>({ setCursorPosition() {} });
CursorContext.displayName = 'InternalCursorContext';

export const AccessibilityContext = React.createContext({ isScreenReaderEnabled: false });
export const BackgroundContext = React.createContext<string | undefined>(undefined);

// ── Box, Text and the small ones ────────────────────────────────────────────────────────

export type BoxProps = Styles & {
  readonly children?: Node | undefined;
  readonly backgroundColor?: string | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-hidden'?: boolean | undefined;
  readonly 'aria-role'?: string | undefined;
  readonly 'aria-state'?: Accessibility['state'] | undefined;
};

export const Box = React.forwardRef<DOMElement, BoxProps>(function Box(
  { children, backgroundColor, 'aria-label': ariaLabel, 'aria-hidden': ariaHidden, 'aria-role': role, 'aria-state': ariaState, ...style },
  ref,
) {
  const { isScreenReaderEnabled } = React.useContext(AccessibilityContext);
  const label = ariaLabel === undefined || ariaLabel === '' ? undefined : h('ink-text', null, ariaLabel);
  if (isScreenReaderEnabled && ariaHidden === true) return null;
  const box = h(
    'ink-box',
    {
      ref,
      style: {
        flexWrap: 'nowrap',
        flexDirection: 'row',
        flexGrow: 0,
        flexShrink: 1,
        ...style,
        backgroundColor,
        overflowX: style.overflowX ?? style.overflow ?? 'visible',
        overflowY: style.overflowY ?? style.overflow ?? 'visible',
      },
      internal_accessibility: { role, state: ariaState },
    },
    isScreenReaderEnabled && label !== undefined ? label : children,
  );
  return backgroundColor === undefined || backgroundColor === '' ? box : h(BackgroundContext.Provider, { value: backgroundColor }, box);
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

export function Text({ color, backgroundColor, dimColor = false, bold = false, italic = false, underline = false, strikethrough = false, inverse = false, wrap = 'wrap', children, 'aria-label': ariaLabel, 'aria-hidden': ariaHidden = false }: TextProps): ReactTypes.ReactElement | null {
  const { isScreenReaderEnabled } = React.useContext(AccessibilityContext);
  const inherited = React.useContext(BackgroundContext);
  const content = isScreenReaderEnabled && ariaLabel !== undefined && ariaLabel !== '' ? ariaLabel : children;
  if (content === undefined || content === null) return null;
  if (isScreenReaderEnabled && ariaHidden) return null;
  const transform = (text: string): string => {
    let out = text;
    if (dimColor) out = chalk.dim(out);
    if (color !== undefined && color !== '') out = colorize(out, color, 'foreground');
    const background = backgroundColor ?? inherited;
    if (background !== undefined && background !== '') out = colorize(out, background, 'background');
    if (bold) out = chalk.bold(out);
    if (italic) out = chalk.italic(out);
    if (underline) out = chalk.underline(out);
    if (strikethrough) out = chalk.strikethrough(out);
    if (inverse) out = chalk.inverse(out);
    return out;
  };
  return h('ink-text', { style: { flexGrow: 0, flexShrink: 1, flexDirection: 'row', textWrap: wrap }, internal_transform: transform }, content);
}

export interface StaticProps<T> {
  readonly items: T[];
  readonly style?: Styles | undefined;
  readonly children: (item: T, index: number) => Node;
}

/** Items rendered once, above everything else, and never again: what has finished. */
export function Static<T>({ items, children: render, style: customStyle }: StaticProps<T>): ReactTypes.ReactElement {
  const [index, setIndex] = React.useState(0);
  const itemsToRender = React.useMemo(() => items.slice(index), [items, index]);
  React.useLayoutEffect(() => {
    setIndex(items.length);
  }, [items.length]);
  const children = itemsToRender.map((item, i) => render(item, index + i));
  const style = React.useMemo(() => ({ position: 'absolute', flexDirection: 'column', ...customStyle }), [customStyle]);
  return h('ink-box', { internal_static: true, style }, children);
}

export interface TransformProps {
  readonly transform: (children: string, index: number) => string;
  readonly accessibilityLabel?: string | undefined;
  readonly children?: Node | undefined;
}

export function Transform({ children, transform, accessibilityLabel }: TransformProps): ReactTypes.ReactElement | null {
  const { isScreenReaderEnabled } = React.useContext(AccessibilityContext);
  if (children === undefined || children === null) return null;
  return h('ink-text', { style: { flexGrow: 0, flexShrink: 1, flexDirection: 'row' }, internal_transform: transform }, isScreenReaderEnabled && accessibilityLabel !== undefined && accessibilityLabel !== '' ? accessibilityLabel : children);
}

export function Newline({ count = 1 }: { readonly count?: number }): ReactTypes.ReactElement {
  return h('ink-text', null, '\n'.repeat(count));
}

/** A flexible space that fills the main axis between its siblings. */
export function Spacer(): ReactTypes.ReactElement {
  return h(Box, { flexGrow: 1 });
}

// ── The error overview ──────────────────────────────────────────────────────────────────

interface StackLine {
  function: string | undefined;
  file: string;
  line: number;
  column: number;
}

const STACK_LINE = /^\s*at (?:(?:async |new )?(.+?) \()?(.+?):(\d+):(\d+)\)?$/u;

function parseStackLine(line: string): StackLine | undefined {
  const match = STACK_LINE.exec(line);
  if (match === null) return undefined;
  return { function: match[1], file: match[2]!, line: Number(match[3]), column: Number(match[4]) };
}

/** A stack frame's file, relative to the working directory, as stack-utils and Ink's own cleanup leave it. */
const cleanupPath = (path: string | undefined): string | undefined => {
  if (path === undefined) return undefined;
  const root = `${cwd()}/`;
  const file = path.replaceAll('\\', '/');
  return file.startsWith(root) ? file.slice(root.length) : file.replace(`file://${root}`, '');
};

/** code-excerpt's three lines either side of `line`. */
function excerpt(source: string, line: number): { line: number; value: string }[] {
  const lines = source.split('\n');
  const out: { line: number; value: string }[] = [];
  for (let n = Math.max(1, line - 3); n <= Math.min(lines.length, line + 3); n += 1) out.push({ line: n, value: lines[n - 1]!.replace(/^\t+/u, (tabs) => '  '.repeat(tabs.length)) });
  return out;
}

export function ErrorOverview({ error }: { readonly error: Error }): ReactTypes.ReactElement {
  const stack = error.stack?.split('\n').slice(1);
  const origin = stack?.[0] === undefined ? undefined : parseStackLine(stack[0]);
  const filePath = cleanupPath(origin?.file);
  let lines: { line: number; value: string }[] | undefined;
  let lineWidth = 0;
  if (filePath !== undefined && origin !== undefined && existsSync(filePath)) {
    lines = excerpt(readFileSync(filePath, 'utf8'), origin.line);
    for (const { line } of lines) lineWidth = Math.max(lineWidth, String(line).length);
  }
  const at = origin?.line;
  return h(
    Box,
    { flexDirection: 'column', padding: 1 },
    h(Box, null, h(Text, { backgroundColor: 'red', color: 'white' }, ' ', 'ERROR', ' '), h(Text, null, ' ', error.message)),
    origin !== undefined && filePath !== undefined && h(Box, { marginTop: 1 }, h(Text, { dimColor: true }, filePath, ':', origin.line, ':', origin.column)),
    origin !== undefined &&
      lines !== undefined &&
      h(
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
      ),
    error.stack !== undefined &&
      h(
        Box,
        { marginTop: 1, flexDirection: 'column' },
        error.stack
          .split('\n')
          .slice(1)
          .map((line) => {
            const parsed = parseStackLine(line);
            if (parsed === undefined) return h(Box, { key: line }, h(Text, { dimColor: true }, '- '), h(Text, { dimColor: true, bold: true }, line, '\\t', ' '));
            const file = cleanupPath(parsed.file) ?? '';
            return h(
              Box,
              { key: line },
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
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }
  override state = { error: undefined as Error | undefined };
  override componentDidCatch(error: Error): void {
    this.props.onError(error);
  }
  override render(): Node {
    return this.state.error === undefined ? this.props.children : h(ErrorOverview, { error: this.state.error });
  }
}

// ── App ─────────────────────────────────────────────────────────────────────────────────

const ESCAPE = '\u001B';
const CTRL_C = '\u0003';

export interface AppOptions {
  readonly children?: Node | undefined;
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly writeToStdout: (data: string) => void;
  readonly writeToStderr: (data: string) => void;
  readonly exitOnCtrlC: boolean;
  readonly onExit: (errorOrResult?: unknown) => void;
  readonly setCursorPosition: (position: CursorPosition | undefined) => void;
}

interface Focusable {
  id: string;
  isActive: boolean;
}

const noop = (): void => undefined;
/** Where the raw-mode undo registers: closeout's `restore` phase, as the screen core's does. */
const restore: Registrar = (handler) => onExit(handler, { phase: 'restore' });

const RAW_MODE_HELP = 'https://github.com/vadimdemedes/ink/#israwmodesupported';

export function App({ children, stdin, stdout, stderr, writeToStdout, writeToStderr, exitOnCtrlC, onExit, setCursorPosition }: AppOptions): ReactTypes.ReactElement {
  const [isFocusEnabled, setIsFocusEnabled] = React.useState(true);
  const [activeFocusId, setActiveFocusId] = React.useState<string | undefined>(undefined);
  const [, setFocusables] = React.useState<Focusable[]>([]);
  const focusablesCount = React.useRef(0);
  const rawModeEnabledCount = React.useRef(0);
  const releaseRawMode = React.useRef<() => void>(noop);
  const emitter = React.useRef(new EventEmitter());
  emitter.current.setMaxListeners(Infinity);
  const readableListener = React.useRef<(() => void) | undefined>(undefined);
  const parser = React.useRef(createInputParser());
  const pendingFlush = React.useRef<NodeJS.Immediate | undefined>(undefined);
  const isRawModeSupported = stdin.isTTY;

  const clearPendingFlush = React.useCallback(() => {
    if (pendingFlush.current === undefined) return;
    clearImmediate(pendingFlush.current);
    pendingFlush.current = undefined;
  }, []);
  const detachReadable = React.useCallback(() => {
    if (readableListener.current === undefined) return;
    stdin.removeListener('readable', readableListener.current);
    readableListener.current = undefined;
  }, [stdin]);
  const disableRawMode = React.useCallback(() => {
    releaseRawMode.current();
    releaseRawMode.current = noop;
    detachReadable();
    stdin.unref();
    rawModeEnabledCount.current = 0;
    parser.current.reset();
    clearPendingFlush();
  }, [stdin, detachReadable, clearPendingFlush]);
  const handleExit = React.useCallback(
    (errorOrResult?: unknown) => {
      if (isRawModeSupported && rawModeEnabledCount.current > 0) disableRawMode();
      onExit(errorOrResult);
    },
    [isRawModeSupported, disableRawMode, onExit],
  );
  const handleInput = React.useCallback(
    (input: string) => {
      if (input === CTRL_C && exitOnCtrlC) {
        handleExit();
        return;
      }
      if (input === ESCAPE) setActiveFocusId((current) => (current === undefined ? current : undefined));
    },
    [exitOnCtrlC, handleExit],
  );
  const emitInput = React.useCallback(
    (input: string) => {
      handleInput(input);
      emitter.current.emit('input', input);
    },
    [handleInput],
  );
  const schedulePendingFlush = React.useCallback(() => {
    clearPendingFlush();
    pendingFlush.current = setImmediate(() => {
      pendingFlush.current = undefined;
      const pending = parser.current.flushPendingEscape();
      if (pending !== undefined) emitInput(pending);
    });
  }, [clearPendingFlush, emitInput]);
  const handleReadable = React.useCallback(() => {
    clearPendingFlush();
    let chunk: unknown;
    while ((chunk = stdin.read()) !== null) {
      for (const input of parser.current.push(String(chunk))) emitInput(input);
    }
    if (parser.current.hasPendingEscape()) schedulePendingFlush();
  }, [stdin, emitInput, clearPendingFlush, schedulePendingFlush]);
  const handleSetRawMode = React.useCallback(
    (isEnabled: boolean) => {
      if (!isRawModeSupported) {
        if (isProcessStdin(stdin)) throw new Error(`Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.\nRead about how to prevent this error on ${RAW_MODE_HELP}`);
        throw new Error(`Raw mode is not supported on the stdin provided to Ink.\nRead about how to prevent this error on ${RAW_MODE_HELP}`);
      }
      stdin.setEncoding('utf8');
      if (isEnabled) {
        if (rawModeEnabledCount.current === 0) {
          stdin.ref();
          // closeout takes the mode and registers giving it back on every exit path.
          releaseRawMode.current = rawMode(stdin, restore);
          readableListener.current = handleReadable;
          stdin.addListener('readable', handleReadable);
        }
        rawModeEnabledCount.current += 1;
        return;
      }
      if (rawModeEnabledCount.current === 0) return;
      rawModeEnabledCount.current -= 1;
      if (rawModeEnabledCount.current === 0) disableRawMode();
    },
    [isRawModeSupported, stdin, handleReadable, disableRawMode],
  );

  const next = (list: Focusable[], current: string | undefined, step: 1 | -1): string | undefined => {
    const at = list.findIndex((f) => f.id === current);
    for (let i = at + step; i >= 0 && i < list.length; i += step) if (list[i]!.isActive) return list[i]!.id;
    return undefined;
  };
  const focusNext = React.useCallback(() => {
    setFocusables((list) => {
      setActiveFocusId((current) => next(list, current, 1) ?? list.find((f) => f.isActive)?.id);
      return list;
    });
  }, []);
  const focusPrevious = React.useCallback(() => {
    setFocusables((list) => {
      setActiveFocusId((current) => next(list, current, -1) ?? list.findLast((f) => f.isActive)?.id);
      return list;
    });
  }, []);
  React.useEffect(() => {
    const onTab = (input: string): void => {
      if (!isFocusEnabled || focusablesCount.current === 0) return;
      // Tab and Shift+Tab (`CSI Z`), decoded as `useInput` decodes them.
      const key = parseKeypress(input);
      if (key.name !== 'tab' || key.isKittyProtocol === true) return;
      if (key.shift) focusPrevious();
      else focusNext();
    };
    const events = emitter.current;
    events.on('input', onTab);
    return () => {
      events.off('input', onTab);
    };
  }, [isFocusEnabled, focusNext, focusPrevious]);
  const enableFocus = React.useCallback(() => setIsFocusEnabled(true), []);
  const disableFocus = React.useCallback(() => setIsFocusEnabled(false), []);
  const focus = React.useCallback((id: string) => {
    setFocusables((list) => {
      if (list.some((f) => f.id === id)) setActiveFocusId(id);
      return list;
    });
  }, []);
  const add = React.useCallback((id: string, { autoFocus }: { autoFocus: boolean }) => {
    setFocusables((list) => {
      focusablesCount.current = list.length + 1;
      return [...list, { id, isActive: true }];
    });
    if (autoFocus) setActiveFocusId((current) => current ?? id);
  }, []);
  const remove = React.useCallback((id: string) => {
    setActiveFocusId((current) => (current === id ? undefined : current));
    setFocusables((list) => {
      const kept = list.filter((f) => f.id !== id);
      focusablesCount.current = kept.length;
      return kept;
    });
  }, []);
  const activate = React.useCallback((id: string) => {
    setFocusables((list) => list.map((f) => (f.id === id ? { id, isActive: true } : f)));
  }, []);
  const deactivate = React.useCallback((id: string) => {
    setActiveFocusId((current) => (current === id ? undefined : current));
    setFocusables((list) => list.map((f) => (f.id === id ? { id, isActive: false } : f)));
  }, []);

  React.useEffect(
    () => () => {
      showCursorOn(stdout as InkStream);
      if (isRawModeSupported && rawModeEnabledCount.current > 0) disableRawMode();
    },
    [stdout, isRawModeSupported, disableRawMode],
  );

  const appValue = React.useMemo(() => ({ exit: handleExit }), [handleExit]);
  const stdinValue = React.useMemo(
    () => ({ stdin, setRawMode: handleSetRawMode, isRawModeSupported, internal_exitOnCtrlC: exitOnCtrlC, internal_eventEmitter: emitter.current }),
    [stdin, handleSetRawMode, isRawModeSupported, exitOnCtrlC],
  );
  const stdoutValue = React.useMemo(() => ({ stdout, write: writeToStdout }), [stdout, writeToStdout]);
  const stderrValue = React.useMemo(() => ({ stderr, write: writeToStderr }), [stderr, writeToStderr]);
  const cursorValue = React.useMemo(() => ({ setCursorPosition }), [setCursorPosition]);
  const focusValue = React.useMemo(
    () => ({ activeId: activeFocusId, add, remove, activate, deactivate, enableFocus, disableFocus, focusNext, focusPrevious, focus }),
    [activeFocusId, add, remove, activate, deactivate, enableFocus, disableFocus, focusNext, focusPrevious, focus],
  );
  return h(
    AppContext.Provider,
    { value: appValue },
    h(
      StdinContext.Provider,
      { value: stdinValue },
      h(
        StdoutContext.Provider,
        { value: stdoutValue },
        h(StderrContext.Provider, { value: stderrValue }, h(FocusContext.Provider, { value: focusValue }, h(CursorContext.Provider, { value: cursorValue }, h(ErrorBoundary, { onError: handleExit }, children)))),
      ),
    ),
  );
}
App.displayName = 'InternalApp';
