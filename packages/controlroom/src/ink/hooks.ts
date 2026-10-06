/**
 * ink's hooks, over the contexts `App` provides. `useInput` and `usePaste` decode each event
 * with ink's own parser and call the handler inside the reconciler's discrete update, as ink
 * does; `useAnimation` rides the one timer `App` keeps; `useBoxMetrics` follows every layout.
 */
import { AccessibilityContext, AnimationContext, AppContext, type AppProps, CursorContext, FocusContext, RootNodeContext, StderrContext, type StderrProps, StdinContext, type StdinProps, StdoutContext, type StdoutProps } from './components.js';
import { addLayoutListener, type DOMElement } from './dom.js';
import { reconciler } from './host.js';
import { nonAlphanumericKeys, parseKeypress } from './keypress.js';
import { windowSize } from './process.js';
import { React } from './react.js';
import { type CursorPosition, type InkStream } from './terminal.js';

export interface Key {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageDown: boolean;
  pageUp: boolean;
  home: boolean;
  end: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  meta: boolean;
  super: boolean;
  hyper: boolean;
  capsLock: boolean;
  numLock: boolean;
  eventType?: 'press' | 'repeat' | 'release' | undefined;
}

export const useApp = (): AppProps => React.useContext(AppContext);
export const useStdin = (): Pick<StdinProps, 'stdin' | 'setRawMode' | 'isRawModeSupported'> => React.useContext(StdinContext);
export const useStdout = (): StdoutProps => React.useContext(StdoutContext);
export const useStderr = (): StderrProps => React.useContext(StderrContext);
export const useIsScreenReaderEnabled = (): boolean => React.useContext(AccessibilityContext).isScreenReaderEnabled;

/** React's `useEffectEvent` where the program's React has it (19.2+), and the same contract where it does not. */
function useEffectEvent<A extends unknown[]>(handler: (...args: A) => void): (...args: A) => void {
  const native = (React as unknown as { useEffectEvent?: typeof useEffectEvent }).useEffectEvent;
  if (native !== undefined) return native(handler);
  const ref = React.useRef(handler);
  React.useInsertionEffect(() => {
    ref.current = handler;
  });
  return React.useCallback((...args: A) => ref.current(...args), []);
}

/** A state update from a key or a paste: discrete priority, so concurrent mode takes it first. */
const discrete = (fn: () => void): void => {
  (reconciler as unknown as { discreteUpdates: (fn: () => void) => void }).discreteUpdates(fn);
};

/** Handle each key press, while `isActive` (default true): raw mode is on for as long as it is. */
export function useInput(handler: (input: string, key: Key) => void, options: { isActive?: boolean } = {}): void {
  const { setRawMode, internal_exitOnCtrlC, internal_eventEmitter } = React.useContext(StdinContext);
  React.useEffect(() => {
    if (options.isActive === false) return;
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [options.isActive, setRawMode]);
  const handleData = useEffectEvent((data: string) => {
    const keypress = parseKeypress(data);
    const key: Key = {
      upArrow: keypress.name === 'up',
      downArrow: keypress.name === 'down',
      leftArrow: keypress.name === 'left',
      rightArrow: keypress.name === 'right',
      pageDown: keypress.name === 'pagedown',
      pageUp: keypress.name === 'pageup',
      home: keypress.name === 'home',
      end: keypress.name === 'end',
      return: keypress.name === 'return',
      escape: keypress.name === 'escape',
      ctrl: keypress.ctrl,
      shift: keypress.shift,
      tab: keypress.name === 'tab',
      backspace: keypress.name === 'backspace',
      delete: keypress.name === 'delete',
      meta: keypress.meta,
      super: keypress.super ?? false,
      hyper: keypress.hyper ?? false,
      capsLock: keypress.capsLock ?? false,
      numLock: keypress.numLock ?? false,
      eventType: keypress.eventType,
    };
    let input: string;
    // A kitty key's text is its associated text; a function or modifier key types nothing.
    if (keypress.isKittyProtocol === true) input = keypress.isPrintable === true ? (keypress.text ?? keypress.name) : '';
    else if (keypress.ctrl) input = keypress.name === 'space' ? ' ' : (keypress.name ?? '');
    else input = keypress.sequence;
    if (keypress.isKittyProtocol !== true && nonAlphanumericKeys.includes(keypress.name)) input = '';
    // A flushed, unresolved sequence (`ESC [`) loses its escape.
    if (input.startsWith('\u001B')) input = input.slice(1);
    if (keypress.isKittyProtocol !== true && input.length === 1 && /[A-Z]/u.test(input)) key.shift = true;
    if (internal_exitOnCtrlC && keypress.name === 'c' && key.ctrl && keypress.eventType !== 'release') return;
    discrete(() => handler(input, key));
  });
  React.useEffect(() => {
    if (options.isActive === false) return;
    internal_eventEmitter.on('input', handleData);
    return () => {
      internal_eventEmitter.removeListener('input', handleData);
    };
  }, [options.isActive, internal_eventEmitter]);
}

/** Handle each paste as one string, with bracketed paste on for as long as the hook is active. */
export function usePaste(handler: (text: string) => void, options: { isActive?: boolean } = {}): void {
  const { setRawMode, setBracketedPasteMode, internal_eventEmitter } = React.useContext(StdinContext);
  React.useEffect(() => {
    if (options.isActive === false) return;
    setRawMode(true);
    setBracketedPasteMode(true);
    return () => {
      setRawMode(false);
      setBracketedPasteMode(false);
    };
  }, [options.isActive, setRawMode, setBracketedPasteMode]);
  const handlePaste = useEffectEvent((text: string) => {
    discrete(() => handler(text));
  });
  React.useEffect(() => {
    if (options.isActive === false) return;
    internal_eventEmitter.on('paste', handlePaste);
    return () => {
      internal_eventEmitter.removeListener('paste', handlePaste);
    };
  }, [options.isActive, internal_eventEmitter]);
}

/** Make this component focusable: Tab and Shift+Tab move focus between such components in registration order. */
export function useFocus({ isActive = true, autoFocus = false, id: customId }: { isActive?: boolean; autoFocus?: boolean; id?: string } = {}): { isFocused: boolean; focus: (id: string) => void } {
  const { isRawModeSupported, setRawMode } = React.useContext(StdinContext);
  const { activeId, add, remove, activate, deactivate, focus } = React.useContext(FocusContext);
  const generatedId = React.useId();
  const id = customId ?? generatedId;
  React.useEffect(() => {
    add(id, { autoFocus });
    return () => {
      remove(id);
    };
  }, [id, autoFocus, add, remove]);
  React.useEffect(() => {
    // Reapplied when `autoFocus` re-registers the component.
    if (isActive) activate(id);
    else deactivate(id);
  }, [isActive, id, autoFocus, activate, deactivate]);
  React.useEffect(() => {
    if (!isRawModeSupported || !isActive) return;
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [isActive, isRawModeSupported, setRawMode]);
  return { isFocused: activeId === id, focus };
}

export function useFocusManager(): Pick<React.ContextType<typeof FocusContext>, 'enableFocus' | 'disableFocus' | 'focusNext' | 'focusPrevious' | 'focus' | 'activeId'> {
  const context = React.useContext(FocusContext);
  return { enableFocus: context.enableFocus, disableFocus: context.disableFocus, focusNext: context.focusNext, focusPrevious: context.focusPrevious, focus: context.focus, activeId: context.activeId };
}

/** Place the terminal's cursor inside the output (for an IME); `undefined` hides it. */
export function useCursor(): { setCursorPosition: (position: CursorPosition | undefined) => void } {
  const context = React.useContext(CursorContext);
  const position = React.useRef<CursorPosition | undefined>(undefined);
  const setCursorPosition = React.useCallback((next: CursorPosition | undefined) => {
    position.current = next;
  }, []);
  // Committed only with the render that set it: an abandoned concurrent render leaks nothing.
  React.useInsertionEffect(() => {
    context.setCursorPosition(position.current);
    return () => {
      context.setCursorPosition(undefined);
    };
  });
  return { setCursorPosition };
}

export interface ElementMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
}

const emptyMetrics: ElementMetrics = { x: 0, y: 0, width: 0, height: 0, clientWidth: 0, clientHeight: 0 };

/** A `Box`'s laid-out size and its position in the live region, in cells; zeros before layout. */
export function measureElement(node: DOMElement): ElementMetrics {
  const flex = node.yogaNode;
  if (flex === undefined) return emptyMetrics;
  let x = flex.layout.left;
  let y = flex.layout.top;
  for (let current = node.parentNode; current !== undefined; current = current.parentNode) {
    if (current.yogaNode === undefined) continue;
    x += current.yogaNode.layout.left;
    y += current.yogaNode.layout.top;
  }
  const { width, height } = flex.layout;
  const [left, top, right, bottom] = flex.style.border;
  return { x, y, width, height, clientWidth: width - left - right, clientHeight: height - top - bottom };
}

export interface BoxMetrics {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

export type UseBoxMetricsResult = BoxMetrics & { readonly hasMeasured: boolean };

const emptyBoxMetrics: BoxMetrics = { width: 0, height: 0, left: 0, top: 0, clientWidth: 0, clientHeight: 0 };

/** The tracked box's layout metrics, kept current across every layout; zeros until measured. */
export function useBoxMetrics(ref: React.RefObject<DOMElement | null>): UseBoxMetricsResult {
  const rootNode = React.useContext(RootNodeContext);
  const [metrics, setMetrics] = React.useState(emptyBoxMetrics);
  const [hasMeasured, setHasMeasured] = React.useState(false);
  const updateMetrics = React.useCallback(() => {
    const node = ref.current;
    const layout = node?.yogaNode?.layout;
    let next = emptyBoxMetrics;
    if (node !== null && node !== undefined && layout !== undefined) {
      const { width, height, clientWidth, clientHeight } = measureElement(node);
      next = { width, height, left: layout.left, top: layout.top, clientWidth, clientHeight };
    }
    setMetrics((previous) => ((Object.keys(next) as (keyof BoxMetrics)[]).some((key) => previous[key] !== next[key]) ? next : previous));
    setHasMeasured(node !== null && node !== undefined);
  }, [ref]);
  React.useEffect(updateMetrics);
  React.useEffect(() => {
    if (rootNode === undefined) return;
    // React attaches refs after the layout notification, in the same commit.
    return addLayoutListener(rootNode, () => queueMicrotask(updateMetrics));
  }, [rootNode, updateMetrics]);
  return React.useMemo(() => ({ ...metrics, hasMeasured }), [metrics, hasMeasured]);
}

export interface WindowSize {
  readonly columns: number;
  readonly rows: number;
}

/** The terminal's size, re-read on every resize. */
export function useWindowSize(): WindowSize {
  const { stdout } = useStdout();
  const [size, setSize] = React.useState<WindowSize>(() => windowSize(stdout as unknown as InkStream));
  React.useEffect(() => {
    const onResize = (): void => setSize(windowSize(stdout as unknown as InkStream));
    stdout.on('resize', onResize);
    onResize();
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  return size;
}

export interface AnimationResult {
  readonly frame: number;
  readonly time: number;
  readonly delta: number;
  readonly reset: () => void;
}

const DEFAULT_INTERVAL = 100;
const MAX_TIMER_INTERVAL = 2_147_483_647;
const zeroAnimation = { frame: 0, time: 0, delta: 0 };

const normalizeInterval = (interval: number): number => (Number.isFinite(interval) ? Math.min(MAX_TIMER_INTERVAL, Math.max(1, interval)) : DEFAULT_INTERVAL);

/** A frame counter, elapsed time and delta on the shared animation timer, with a reset. */
export function useAnimation(options?: { interval?: number; isActive?: boolean }): AnimationResult {
  const { interval = DEFAULT_INTERVAL, isActive = true } = options ?? {};
  const safeInterval = normalizeInterval(interval);
  const { subscribe, renderThrottleMs } = React.useContext(AnimationContext);
  const [resetKey, setResetKey] = React.useState(0);
  const [state, setState] = React.useState(zeroAnimation);
  const nextRenderTimeRef = React.useRef(0);
  const lastRenderTimeRef = React.useRef(0);
  const previousOptionsRef = React.useRef({ isActive, safeInterval, resetKey });
  const previous = previousOptionsRef.current;
  const shouldReset = isActive && (safeInterval !== previous.safeInterval || !previous.isActive || resetKey !== previous.resetKey);
  const reset = React.useCallback(() => {
    setState(zeroAnimation);
    setResetKey((k) => k + 1);
  }, []);
  React.useLayoutEffect(() => {
    if (!isActive) return;
    // Zeros at once, so a render before the first tick shows no stale values.
    setState(zeroAnimation);
    let startTime = 0;
    const subscription = subscribe((currentTime) => {
      // Ticks inside the render-throttle window coalesce into the next allowed one.
      if (renderThrottleMs > 0 && currentTime < nextRenderTimeRef.current) return;
      const elapsed = currentTime - startTime;
      const delta = currentTime - lastRenderTimeRef.current;
      lastRenderTimeRef.current = currentTime;
      nextRenderTimeRef.current = currentTime + renderThrottleMs;
      setState({ frame: Math.floor(elapsed / safeInterval), time: elapsed, delta });
    }, safeInterval);
    startTime = subscription.startTime;
    lastRenderTimeRef.current = subscription.startTime;
    nextRenderTimeRef.current = startTime + renderThrottleMs;
    return subscription.unsubscribe;
  }, [safeInterval, isActive, subscribe, renderThrottleMs, resetKey]);
  React.useLayoutEffect(() => {
    previousOptionsRef.current = { isActive, safeInterval, resetKey };
  }, [isActive, safeInterval, resetKey]);
  return shouldReset ? { ...zeroAnimation, reset } : { ...state, reset };
}
