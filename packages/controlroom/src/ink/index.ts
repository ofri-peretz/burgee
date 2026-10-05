/**
 * `controlroom/ink` — a drop-in for `ink` (R11, R12), graded by Ink's own suite in
 * `compat-oracle`. A program moves by changing its import and installing the reconciler
 * Ink used to bring along: `npm install react react-reconciler`.
 *
 * React is the program's own, rendered by React's own reconciler through a host config of
 * ours; layout is a TypeScript flexbox subset (no yoga); colour is roundel's and borders are
 * flagstaff's. Nothing else in the package imports React, so the native API never loads it.
 */
export { Box, type BoxProps, Newline, Spacer, Static, type StaticProps, Text, type TextProps, Transform, type TransformProps } from './components.js';
export { type DOMElement } from './dom.js';
export { type Key, measureElement, useApp, useCursor, useFocus, useFocusManager, useInput, useIsScreenReaderEnabled, useStderr, useStdin, useStdout } from './hooks.js';
export { type Instance, type RenderMetrics, render, type RenderOptions, renderToString } from './instance.js';
export { kittyFlags, kittyModifiers } from './keypress.js';
