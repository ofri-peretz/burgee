/**
 * Ink's host tree — the objects `react-reconciler` creates, appends and updates — and the
 * mapping from a `Box`'s props to the flex subset's style (`flex.ts`), prop for prop as Ink
 * hands them to yoga. A text node is a flex leaf whose measure function wraps its text.
 */
import { truncate, width as widthOf, widest, wrap } from 'linegauge';

import { sanitize } from './ansi.js';
import { defaults, type Edges, type FlexNode, type FlexStyle, type Length, type Mode, type Size } from './flex.js';

export type ElementName = 'ink-root' | 'ink-box' | 'ink-text' | 'ink-virtual-text';
export type TextWrap = 'wrap' | 'end' | 'middle' | 'truncate-end' | 'truncate' | 'truncate-middle' | 'truncate-start';
export type Transformer = (text: string, index: number) => string;

/** A `Box`'s style props, and a `Text`'s `textWrap`: what Ink passes as `style`. */
export interface Styles {
  readonly textWrap?: TextWrap;
  readonly position?: 'absolute' | 'relative';
  readonly columnGap?: number;
  readonly rowGap?: number;
  readonly gap?: number;
  readonly margin?: number;
  readonly marginX?: number;
  readonly marginY?: number;
  readonly marginTop?: number;
  readonly marginBottom?: number;
  readonly marginLeft?: number;
  readonly marginRight?: number;
  readonly padding?: number;
  readonly paddingX?: number;
  readonly paddingY?: number;
  readonly paddingTop?: number;
  readonly paddingBottom?: number;
  readonly paddingLeft?: number;
  readonly paddingRight?: number;
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  readonly flexBasis?: number | string;
  readonly flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  readonly alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  readonly alignSelf?: 'flex-start' | 'center' | 'flex-end' | 'auto';
  readonly justifyContent?: 'flex-start' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly' | 'center';
  readonly width?: number | string;
  readonly height?: number | string;
  readonly minWidth?: number | string;
  readonly minHeight?: number | string;
  readonly display?: 'flex' | 'none';
  readonly borderStyle?: string | BoxStyle;
  readonly borderTop?: boolean;
  readonly borderBottom?: boolean;
  readonly borderLeft?: boolean;
  readonly borderRight?: boolean;
  readonly borderColor?: string;
  readonly borderTopColor?: string;
  readonly borderBottomColor?: string;
  readonly borderLeftColor?: string;
  readonly borderRightColor?: string;
  readonly borderDimColor?: boolean;
  readonly borderTopDimColor?: boolean;
  readonly borderBottomDimColor?: boolean;
  readonly borderLeftDimColor?: boolean;
  readonly borderRightDimColor?: boolean;
  readonly overflow?: 'visible' | 'hidden';
  readonly overflowX?: 'visible' | 'hidden';
  readonly overflowY?: 'visible' | 'hidden';
  readonly backgroundColor?: string;
}

/** cli-boxes' shape: what a custom `borderStyle` object carries. */
export interface BoxStyle {
  readonly topLeft: string;
  readonly top: string;
  readonly topRight: string;
  readonly right: string;
  readonly bottomRight: string;
  readonly bottom: string;
  readonly bottomLeft: string;
  readonly left: string;
}

export interface Accessibility {
  role?: string | undefined;
  state?: Record<string, boolean | undefined> | undefined;
}

export interface DOMElement {
  nodeName: ElementName;
  attributes: Record<string, unknown>;
  childNodes: DOMNode[];
  parentNode: DOMElement | undefined;
  style: Styles;
  /** The node's flex item; `undefined` for virtual text, which lays out inside its `Text`. */
  yogaNode: FlexNode | undefined;
  /** Set by Suspense: the node keeps its place in the tree and takes no space. */
  hidden?: boolean;
  internal_static?: boolean;
  internal_transform?: Transformer | undefined;
  internal_accessibility?: Accessibility;
  // The root's hooks into the instance that owns it.
  isStaticDirty?: boolean;
  staticNode?: DOMElement | undefined;
  onComputeLayout?: (() => void) | undefined;
  onRender?: (() => void) | undefined;
  onImmediateRender?: (() => void) | undefined;
}

export interface TextNode {
  nodeName: '#text';
  nodeValue: string;
  parentNode: DOMElement | undefined;
  yogaNode: undefined;
  style: Styles;
}

export type DOMNode = DOMElement | TextNode;

export function createNode(nodeName: ElementName): DOMElement {
  const node: DOMElement = {
    nodeName,
    style: {},
    attributes: {},
    childNodes: [],
    parentNode: undefined,
    yogaNode: undefined,
    internal_accessibility: {},
  };
  if (nodeName !== 'ink-virtual-text') {
    node.yogaNode = { style: toFlex({}, false), children: [], layout: { left: 0, top: 0, width: 0, height: 0 } };
    if (nodeName === 'ink-text') node.yogaNode.measure = (width: number, mode: Mode): Size => measureTextNode(node, width, mode);
  }
  return node;
}

export function createTextNode(text: unknown): TextNode {
  return { nodeName: '#text', nodeValue: String(text), parentNode: undefined, yogaNode: undefined, style: {} };
}

export function setTextNodeValue(node: TextNode, text: unknown): void {
  node.nodeValue = String(text);
}

export function removeChildNode(node: DOMElement, child: DOMNode): void {
  child.parentNode = undefined;
  const index = node.childNodes.indexOf(child);
  if (index >= 0) node.childNodes.splice(index, 1);
}

export function appendChildNode(node: DOMElement, child: DOMNode): void {
  if (child.parentNode !== undefined) removeChildNode(child.parentNode, child);
  child.parentNode = node;
  node.childNodes.push(child);
}

export function insertBeforeNode(node: DOMElement, child: DOMNode, before: DOMNode): void {
  if (child.parentNode !== undefined) removeChildNode(child.parentNode, child);
  child.parentNode = node;
  const index = node.childNodes.indexOf(before);
  if (index >= 0) node.childNodes.splice(index, 0, child);
  else node.childNodes.push(child);
}

export function setStyle(node: DOMElement, style: Styles | undefined): void {
  node.style = style ?? {};
  if (node.yogaNode !== undefined) node.yogaNode.style = toFlex(node.style, node.hidden === true);
}

export function setHidden(node: DOMElement, hidden: boolean): void {
  node.hidden = hidden;
  setStyle(node, node.style);
}

// ── Props → flex style, as Ink's `styles.ts` hands them to yoga ─────────────────────────

const percent = (value: string): Length => ({ percent: Number.parseInt(value, 10) });
const length = (value: number | string | undefined): Length => (typeof value === 'number' ? value : typeof value === 'string' ? percent(value) : undefined);
/** `'x' in style` — present, even when its value is `undefined`. */
const has = (style: Styles, key: keyof Styles): boolean => key in style;

/**
 * One edge as yoga resolves it: the side's own value, else its axis's, else the all-sides
 * value. Ink sets a side with `value || 0` and an axis or all with `value ?? 0`.
 */
function edges(style: Styles, all: keyof Styles, x: keyof Styles, y: keyof Styles, sides: readonly [keyof Styles, keyof Styles, keyof Styles, keyof Styles]): Edges {
  const side = (key: keyof Styles): number | undefined => (has(style, key) ? (style[key] as number | undefined) || 0 : undefined);
  const group = (key: keyof Styles): number | undefined => (has(style, key) ? ((style[key] as number | undefined) ?? 0) : undefined);
  const [left, top, right, bottom] = sides.map(side);
  const horizontal = group(x);
  const vertical = group(y);
  const every = group(all) ?? 0;
  return [left ?? horizontal ?? every, top ?? vertical ?? every, right ?? horizontal ?? every, bottom ?? vertical ?? every];
}

export function toFlex(style: Styles, hidden: boolean): FlexStyle {
  const flex = defaults();
  if (style.position === 'absolute') flex.position = 'absolute';
  flex.margin = edges(style, 'margin', 'marginX', 'marginY', ['marginLeft', 'marginTop', 'marginRight', 'marginBottom']);
  flex.padding = edges(style, 'padding', 'paddingX', 'paddingY', ['paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom']);
  if (has(style, 'flexGrow')) flex.flexGrow = style.flexGrow ?? 0;
  if (has(style, 'flexShrink')) flex.flexShrink = typeof style.flexShrink === 'number' ? style.flexShrink : 1;
  if (style.flexWrap !== undefined) flex.flexWrap = style.flexWrap;
  if (style.flexDirection !== undefined) flex.flexDirection = style.flexDirection;
  if (has(style, 'flexBasis')) flex.flexBasis = length(style.flexBasis);
  if (has(style, 'alignItems')) flex.alignItems = style.alignItems ?? 'stretch';
  if (has(style, 'alignSelf')) flex.alignSelf = style.alignSelf ?? 'auto';
  if (has(style, 'justifyContent')) flex.justifyContent = style.justifyContent ?? 'flex-start';
  flex.width = length(style.width);
  flex.height = length(style.height);
  if (has(style, 'minWidth')) flex.minWidth = typeof style.minWidth === 'string' ? percent(style.minWidth) : (style.minWidth ?? 0);
  if (has(style, 'minHeight')) flex.minHeight = typeof style.minHeight === 'string' ? percent(style.minHeight) : (style.minHeight ?? 0);
  if (hidden || (has(style, 'display') && style.display !== 'flex')) flex.display = 'none';
  if (has(style, 'borderStyle')) {
    const border = style.borderStyle === undefined ? 0 : 1;
    flex.border = [style.borderLeft === false ? 0 : border, style.borderTop === false ? 0 : border, style.borderRight === false ? 0 : border, style.borderBottom === false ? 0 : border];
  }
  const gap = style.gap ?? 0;
  flex.columnGap = has(style, 'columnGap') ? (style.columnGap ?? 0) : gap;
  flex.rowGap = has(style, 'rowGap') ? (style.rowGap ?? 0) : gap;
  return flex;
}

/** Rebuild every flex node's children from the host tree: the nodes that lay out, in order. */
export function syncFlexTree(node: DOMElement): void {
  if (node.yogaNode === undefined || node.nodeName === 'ink-text') return;
  const children: FlexNode[] = [];
  for (const child of node.childNodes) {
    if (child.nodeName === '#text' || child.yogaNode === undefined) continue;
    syncFlexTree(child);
    children.push(child.yogaNode);
  }
  node.yogaNode.children = children;
}

// ── Text ────────────────────────────────────────────────────────────────────────────────

/** The text of a `Text` and everything nested in it, each nested transform applied. */
export function squashTextNodes(node: DOMElement): string {
  let text = '';
  for (const [index, child] of node.childNodes.entries()) {
    let nodeText = '';
    if (child.nodeName === '#text') nodeText = child.nodeValue;
    else {
      if (child.nodeName === 'ink-text' || child.nodeName === 'ink-virtual-text') nodeText = squashTextNodes(child);
      if (nodeText.length > 0 && typeof child.internal_transform === 'function') nodeText = child.internal_transform(nodeText, index);
    }
    text += nodeText;
  }
  return sanitize(text);
}

export function measureText(text: string): Size {
  if (text.length === 0) return { width: 0, height: 0 };
  return { width: widest(text.split('\n')), height: text.split('\n').length };
}

/** Wrap or truncate to `maxWidth` columns, as Ink's `wrapText` does with wrap-ansi and cli-truncate. */
export function wrapText(text: string, maxWidth: number, wrapType: TextWrap): string {
  if (wrapType === 'wrap') return Number.isFinite(maxWidth) ? wrap(text, maxWidth, { trim: false, hard: true }) : text;
  if (wrapType.startsWith('truncate')) {
    const position = wrapType === 'truncate-middle' ? 'middle' : wrapType === 'truncate-start' ? 'start' : 'end';
    return Number.isFinite(maxWidth) ? truncate(text, maxWidth, { position }) : '…';
  }
  return text;
}

function measureTextNode(node: DOMElement, width: number, mode: Mode): Size {
  const text = squashTextNodes(node);
  const dimensions = measureText(text);
  if (dimensions.width <= width) return dimensions;
  if (dimensions.width >= 1 && width > 0 && width < 1) return dimensions;
  // An unconstrained measure (yoga passes NaN) wraps nothing.
  if (mode === 0 && Number.isNaN(width) && (node.style.textWrap ?? 'wrap') === 'wrap') return dimensions;
  return measureText(wrapText(text, width, node.style.textWrap ?? 'wrap'));
}

export const widestLine = (text: string): number => widest(text.split('\n'));
export const stringWidth = (text: string): number => widthOf(text);
