/**
 * Ink's hooks, over the contexts `App` provides. `useInput` decodes each key event with Ink's
 * own parser and calls the handler inside the reconciler's batch, as Ink does.
 */
import { type DOMElement } from './dom.js';
import { AccessibilityContext, AppContext, type AppProps, CursorContext, FocusContext, StderrContext, type StderrProps, StdinContext, type StdinProps, StdoutContext, type StdoutProps } from './components.js';
import { reconciler } from './host.js';
import { nonAlphanumericKeys, parseKeypress } from './keypress.js';
import { React } from './react.js';
import { type CursorPosition } from './terminal.js';

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
export const useStdin = (): StdinProps => React.useContext(StdinContext);
export const useStdout = (): StdoutProps => React.useContext(StdoutContext);
export const useStderr = (): StderrProps => React.useContext(StderrContext);
export const useIsScreenReaderEnabled = (): boolean => React.useContext(AccessibilityContext).isScreenReaderEnabled;

/** Handle each key press, while `isActive` (default true): raw mode is on for as long as it is. */
export function useInput(handler: (input: string, key: Key) => void, options: { isActive?: boolean } = {}): void {
  const { stdin, setRawMode, internal_exitOnCtrlC, internal_eventEmitter } = useStdin();
  React.useEffect(() => {
    if (options.isActive === false) return;
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [options.isActive, setRawMode]);
  React.useEffect(() => {
    if (options.isActive === false) return;
    const handleData = (data: string): void => {
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
        // ESC ESC [ A parses as meta false and option true; Ink reports both as meta.
        meta: keypress.meta || keypress.name === 'escape' || keypress.option,
        super: keypress.super ?? false,
        hyper: keypress.hyper ?? false,
        capsLock: keypress.capsLock ?? false,
        numLock: keypress.numLock ?? false,
        eventType: keypress.eventType,
      };
      let input: string;
      if (keypress.isKittyProtocol === true) {
        if (keypress.isPrintable === true) input = keypress.text ?? keypress.name;
        else if (keypress.ctrl && keypress.name.length === 1) input = keypress.name;
        else input = '';
      } else if (keypress.ctrl) input = keypress.name;
      else input = keypress.sequence;
      if (keypress.isKittyProtocol !== true && nonAlphanumericKeys.includes(keypress.name)) input = '';
      if (input.startsWith('\u001B')) input = input.slice(1);
      if (input.length === 1 && /[A-Z]/u.test(input)) key.shift = true;
      if (!(input === 'c' && key.ctrl) || !internal_exitOnCtrlC) reconciler.batchedUpdates(() => handler(input, key));
    };
    internal_eventEmitter.on('input', handleData);
    return () => {
      internal_eventEmitter.removeListener('input', handleData);
    };
  }, [options.isActive, stdin, internal_exitOnCtrlC, handler]);
}

/** Make this component focusable: Tab and Shift+Tab move focus between such components in render order. */
export function useFocus({ isActive = true, autoFocus = false, id: customId }: { isActive?: boolean; autoFocus?: boolean; id?: string } = {}): { isFocused: boolean; focus: (id: string) => void } {
  const { isRawModeSupported, setRawMode } = useStdin();
  const { activeId, add, remove, activate, deactivate, focus } = React.useContext(FocusContext);
  const id = React.useMemo(() => customId ?? Math.random().toString().slice(2, 7), [customId]);
  React.useEffect(() => {
    add(id, { autoFocus });
    return () => {
      remove(id);
    };
  }, [id, autoFocus]);
  React.useEffect(() => {
    if (isActive) activate(id);
    else deactivate(id);
  }, [isActive, id]);
  React.useEffect(() => {
    if (!isRawModeSupported || !isActive) return;
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [isActive]);
  return { isFocused: id !== '' && activeId === id, focus };
}

export function useFocusManager(): Pick<React.ContextType<typeof FocusContext>, 'enableFocus' | 'disableFocus' | 'focusNext' | 'focusPrevious' | 'focus'> {
  const context = React.useContext(FocusContext);
  return { enableFocus: context.enableFocus, disableFocus: context.disableFocus, focusNext: context.focusNext, focusPrevious: context.focusPrevious, focus: context.focus };
}

/** Place the terminal's cursor inside the output (for an IME); `undefined` hides it. */
export function useCursor(): { setCursorPosition: (position: CursorPosition | undefined) => void } {
  const context = React.useContext(CursorContext);
  const position = React.useRef<CursorPosition | undefined>(undefined);
  const setCursorPosition = React.useCallback((next: CursorPosition | undefined) => {
    position.current = next;
  }, []);
  React.useInsertionEffect(() => {
    context.setCursorPosition(position.current);
    return () => {
      context.setCursorPosition(undefined);
    };
  });
  return { setCursorPosition };
}

/** A `Box`'s laid-out size, in cells. */
export function measureElement(node: DOMElement): { width: number; height: number } {
  return { width: node.yogaNode?.layout.width ?? 0, height: node.yogaNode?.layout.height ?? 0 };
}
