/**
 * `controlroom/ink` — a drop-in for `ink` (R11, R12), graded by ink's own suite in
 * `compat-oracle`. A program moves by changing its import and installing the reconciler
 * ink used to bring along: `npm install react react-reconciler`.
 *
 * React is the program's own, rendered by React's own reconciler through a host config of
 * ours; layout is a TypeScript port of yoga's algorithm (no yoga); colour is roundel's and
 * borders are flagstaff's. Nothing else in the package imports React, so the native API never
 * loads it.
 */
export { type AppProps, Box, type BoxProps, Newline, type NewlineProps, Spacer, Static, type StaticProps, type StderrProps, type StdinProps, type StdoutProps, type SuspendTerminal, type TerminalSuspension, Text, type TextProps, Transform, type TransformProps } from './components.js';
export { type DOMElement } from './dom.js';
export {
  type AnimationResult,
  type BoxMetrics,
  type ElementMetrics,
  type Key,
  measureElement,
  useAnimation,
  useApp,
  type UseBoxMetricsResult,
  useBoxMetrics,
  useCursor,
  useFocus,
  useFocusManager,
  useInput,
  useIsScreenReaderEnabled,
  usePaste,
  useStderr,
  useStdin,
  useStdout,
  useWindowSize,
  type WindowSize,
} from './hooks.js';
export { type Instance, type KittyKeyboardOptions, type RenderMetrics, render, type RenderOptions, renderToString, type RenderToStringOptions } from './instance.js';
export { type KittyFlagName, kittyFlags, kittyModifiers } from './keypress.js';
export { type CursorPosition } from './terminal.js';
