/**
 * ink's host tree — the objects `react-reconciler` creates, appends and updates — and the
 * mapping from a `Box`'s props to the flex subset's style (`flex.ts`), applied as ink 8's
 * `styles.ts` applies them to a yoga node: a commit hands over the props that changed, and
 * each lands on the node's standing style, so a prop that is removed resets what it set and
 * one that is `undefined` unsets it. A text node is a flex leaf whose measure function wraps
 * its text.
 */
import { slice, width as widthOf, widest, wrap } from 'linegauge';

import { sanitizeAnsi, serialize, type StyledChar, styledChars } from './ansi.js';
import { defaults, type FlexNode, type FlexStyle, type Length, type Mode, type Size, UNDEFINED } from './flex.js';

export type ElementName = 'ink-root' | 'ink-box' | 'ink-text' | 'ink-virtual-text';
export type TextWrap = 'wrap' | 'hard' | 'end' | 'middle' | 'truncate-end' | 'truncate' | 'truncate-middle' | 'truncate-start';
export type Transformer = (text: string, index: number) => string;

/** A `Box`'s style props, and a `Text`'s `textWrap`: what ink passes as `style`. */
export interface Styles {
  readonly textWrap?: TextWrap;
  readonly position?: 'absolute' | 'relative' | 'static';
  readonly top?: number | string;
  readonly right?: number | string;
  readonly bottom?: number | string;
  readonly left?: number | string;
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
  readonly alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  readonly alignSelf?: 'flex-start' | 'center' | 'flex-end' | 'auto' | 'stretch' | 'baseline';
  readonly alignContent?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'space-between' | 'space-around' | 'space-evenly';
  readonly justifyContent?: 'flex-start' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly' | 'center';
  readonly width?: number | string;
  readonly height?: number | string;
  /** Cells only: yoga resolves a percentage minimum width against the wrong ancestor. */
  readonly minWidth?: number | undefined;
  readonly minHeight?: number | string;
  /** Cells only, as `minWidth`. */
  readonly maxWidth?: number | undefined;
  readonly maxHeight?: number | string;
  readonly aspectRatio?: number;
  readonly display?: 'flex' | 'none' | undefined;
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
  readonly borderBackgroundColor?: string;
  readonly borderTopBackgroundColor?: string;
  readonly borderBottomBackgroundColor?: string;
  readonly borderLeftBackgroundColor?: string;
  readonly borderRightBackgroundColor?: string;
  readonly overflow?: 'visible' | 'hidden';
  readonly overflowX?: 'visible' | 'hidden';
  readonly overflowY?: 'visible' | 'hidden';
  readonly contentOffsetX?: number;
  readonly contentOffsetY?: number;
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

type LayoutListener = () => void;

export interface DOMElement {
  nodeName: ElementName;
  attributes: Record<string, unknown>;
  childNodes: DOMNode[];
  parentNode: DOMElement | undefined;
  style: Styles;
  /** The node's flex item; `undefined` for virtual text, which lays out inside its `Text`, and once freed. */
  yogaNode: FlexNode | undefined;
  /** Set by Suspense: the node keeps its place in the tree and takes no space. */
  isHidden?: boolean;
  internal_static?: boolean;
  internal_transform?: Transformer | undefined;
  internal_accessibility?: Accessibility;
  // The root's hooks into the instance that owns it.
  isStaticDirty?: boolean;
  staticNode?: DOMElement | undefined;
  previousStaticNode?: DOMElement | undefined;
  onComputeLayout?: (() => void) | undefined;
  onRender?: (() => void) | undefined;
  onImmediateRender?: (() => void) | undefined;
  onStaticChange?: (() => void) | undefined;
  internal_layoutListeners?: Set<LayoutListener>;
}

export interface TextNode {
  nodeName: '#text';
  nodeValue: string;
  parentNode: DOMElement | undefined;
  yogaNode: undefined;
  style: Styles;
  isHidden?: boolean;
}

export type DOMNode = DOMElement | TextNode;

// ── The flex node's standing style, as yoga keeps it ────────────────────────────────────

/** One edge set as yoga stores it: each named edge set or not, resolved at layout. */
interface EdgeSet {
  all?: number | undefined;
  horizontal?: number | undefined;
  vertical?: number | undefined;
  left?: number | undefined;
  right?: number | undefined;
  top?: number | undefined;
  bottom?: number | undefined;
  start?: number | undefined;
  end?: number | undefined;
}

/** What ink has set on a node, with yoga's defaults for what it has not. */
interface Yoga {
  margin: EdgeSet;
  padding: EdgeSet;
  inset: { left: Length; top: Length; right: Length; bottom: Length };
  gap: { all?: number | undefined; column?: number | undefined; row?: number | undefined };
  border: [number, number, number, number];
}

const states = new WeakMap<FlexNode, Yoga>();
const stateOf = (node: FlexNode): Yoga => {
  let state = states.get(node);
  if (state === undefined) {
    state = { margin: {}, padding: {}, inset: { left: undefined, top: undefined, right: undefined, bottom: undefined }, gap: {}, border: [0, 0, 0, 0] };
    states.set(node, state);
  }
  return state;
};

/** yoga's `computeLeftEdge` and friends, LTR: the logical edge, the physical, the axis, all. */
function resolveEdges(set: EdgeSet): [number, number, number, number] {
  const pick = (...values: (number | undefined)[]): number => {
    for (const value of values) if (value !== undefined && !Number.isNaN(value)) return value;
    return 0;
  };
  return [pick(set.start, set.left, set.horizontal, set.all), pick(set.top, set.vertical, set.all), pick(set.end, set.right, set.horizontal, set.all), pick(set.bottom, set.vertical, set.all)];
}

/** A number, a percentage string, or unset — as yoga-layout's wrapper reads a length. */
function lengthOf(value: unknown): Length {
  if (typeof value === 'number') return Number.isNaN(value) ? undefined : value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) return undefined;
    return value.endsWith('%') ? { percent: parsed } : parsed;
  }
  return undefined;
}
const numberOf = (value: unknown): number | undefined => (typeof value === 'number' && !Number.isNaN(value) ? value : undefined);
const percentOf = (value: string): Length => {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : { percent: parsed };
};

const FLEX_WRAP = new Set(['nowrap', 'wrap', 'wrap-reverse']);
const FLEX_DIRECTION = new Set(['row', 'row-reverse', 'column', 'column-reverse']);
const ALIGN_ITEMS = new Set(['stretch', 'flex-start', 'center', 'flex-end', 'baseline']);
const ALIGN_SELF = new Set(['auto', 'flex-start', 'center', 'flex-end', 'stretch', 'baseline']);
const ALIGN_CONTENT = new Set(['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'stretch']);
const JUSTIFY = new Set(['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly']);
const has = (style: Styles, key: keyof Styles): boolean => key in style;

/**
 * ink 8's `styles(node, style, currentStyle)`: each key present in `style` sets its yoga
 * property — `undefined` unsets a length, a falsy alignment restores yoga's default, an
 * unknown enum value changes nothing — and borders are recomputed from `currentStyle`.
 */
export function applyStyles(flex: FlexNode, style: Styles = {}, currentStyle: Styles = style): void {
  const s = flex.style;
  const state = stateOf(flex);
  if (has(style, 'position')) s.position = style.position === 'absolute' ? 'absolute' : style.position === 'static' ? 'static' : 'relative';
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) if (Object.hasOwn(style, edge)) state.inset[edge] = typeof style[edge] === 'string' ? percentOf(style[edge]) : numberOf(style[edge]);
  if (has(style, 'margin')) state.margin.all = style.margin ?? 0;
  if (has(style, 'marginX')) state.margin.horizontal = numberOf(style.marginX);
  if (has(style, 'marginY')) state.margin.vertical = numberOf(style.marginY);
  if (has(style, 'marginLeft')) state.margin.start = numberOf(style.marginLeft);
  if (has(style, 'marginRight')) state.margin.end = numberOf(style.marginRight);
  if (has(style, 'marginTop')) state.margin.top = numberOf(style.marginTop);
  if (has(style, 'marginBottom')) state.margin.bottom = numberOf(style.marginBottom);
  if (has(style, 'padding')) state.padding.all = style.padding ?? 0;
  if (has(style, 'paddingX')) state.padding.horizontal = numberOf(style.paddingX);
  if (has(style, 'paddingY')) state.padding.vertical = numberOf(style.paddingY);
  if (has(style, 'paddingLeft')) state.padding.left = numberOf(style.paddingLeft);
  if (has(style, 'paddingRight')) state.padding.right = numberOf(style.paddingRight);
  if (has(style, 'paddingTop')) state.padding.top = numberOf(style.paddingTop);
  if (has(style, 'paddingBottom')) state.padding.bottom = numberOf(style.paddingBottom);
  if (has(style, 'flexGrow')) s.flexGrow = style.flexGrow ?? 0;
  if (has(style, 'flexShrink')) s.flexShrink = typeof style.flexShrink === 'number' ? style.flexShrink : 1;
  if (has(style, 'flexWrap') && FLEX_WRAP.has(style.flexWrap as string)) s.flexWrap = style.flexWrap!;
  if (has(style, 'flexDirection') && FLEX_DIRECTION.has(style.flexDirection as string)) s.flexDirection = style.flexDirection!;
  if (has(style, 'flexBasis')) s.flexBasis = typeof style.flexBasis === 'number' ? numberOf(style.flexBasis) : typeof style.flexBasis === 'string' ? percentOf(style.flexBasis) : undefined;
  // A falsy alignment — `condition && 'center'` — means the default.
  if (has(style, 'alignItems')) {
    const value = style.alignItems ? style.alignItems : 'stretch';
    if (ALIGN_ITEMS.has(value)) s.alignItems = value;
  }
  if (has(style, 'alignSelf')) {
    const value = style.alignSelf ? style.alignSelf : 'auto';
    if (ALIGN_SELF.has(value)) s.alignSelf = value;
  }
  if (has(style, 'alignContent')) {
    const value = style.alignContent ? style.alignContent : 'flex-start';
    if (ALIGN_CONTENT.has(value)) s.alignContent = value;
  }
  if (has(style, 'justifyContent')) {
    const value = style.justifyContent ? style.justifyContent : 'flex-start';
    if (JUSTIFY.has(value)) s.justifyContent = value;
  }
  if (has(style, 'width')) s.width = typeof style.width === 'string' ? percentOf(style.width) : numberOf(style.width);
  if (has(style, 'height')) s.height = typeof style.height === 'string' ? percentOf(style.height) : numberOf(style.height);
  if (has(style, 'minWidth')) s.minWidth = lengthOf(style.minWidth ?? 0);
  if (has(style, 'minHeight')) s.minHeight = typeof style.minHeight === 'string' ? percentOf(style.minHeight) : lengthOf(style.minHeight ?? 0);
  if (has(style, 'maxWidth')) s.maxWidth = lengthOf(style.maxWidth);
  if (has(style, 'maxHeight')) s.maxHeight = typeof style.maxHeight === 'string' ? percentOf(style.maxHeight) : lengthOf(style.maxHeight);
  if (has(style, 'aspectRatio')) s.aspectRatio = numberOf(style.aspectRatio) ?? Number.NaN;
  if (has(style, 'display')) s.display = style.display === 'none' ? 'none' : 'flex';
  if (has(style, 'borderStyle') || has(style, 'borderTop') || has(style, 'borderBottom') || has(style, 'borderLeft') || has(style, 'borderRight')) {
    const border = currentStyle.borderStyle ? 1 : 0;
    state.border = [currentStyle.borderLeft === false ? 0 : border, currentStyle.borderTop === false ? 0 : border, currentStyle.borderRight === false ? 0 : border, currentStyle.borderBottom === false ? 0 : border];
  }
  if (has(style, 'gap')) state.gap.all = style.gap ?? 0;
  if (has(style, 'columnGap')) state.gap.column = numberOf(style.columnGap);
  if (has(style, 'rowGap')) state.gap.row = numberOf(style.rowGap);
  s.margin = resolveEdges(state.margin);
  s.padding = resolveEdges(state.padding);
  s.border = [...state.border];
  s.inset = [state.inset.left, state.inset.top, state.inset.right, state.inset.bottom];
  s.columnGap = state.gap.column ?? state.gap.all ?? 0;
  s.rowGap = state.gap.row ?? state.gap.all ?? 0;
}

// ── Nodes ───────────────────────────────────────────────────────────────────────────────

function createFlexNode(): FlexNode {
  return { style: defaults(), children: [], layout: { left: 0, top: 0, width: 0, height: 0 }, free() {} };
}

export function createNode(nodeName: ElementName): DOMElement {
  const node: DOMElement = {
    nodeName,
    style: {},
    attributes: {},
    childNodes: [],
    parentNode: undefined,
    yogaNode: nodeName === 'ink-virtual-text' ? undefined : createFlexNode(),
    internal_accessibility: {},
  };
  if (nodeName === 'ink-text') node.yogaNode!.measure = (width: number, mode: Mode): Size => measureTextNode(node, width, mode);
  return node;
}

/** The nearest flex item at or above `node` that has a parent: whose measurement depends on it. */
function closestFlexNode(node: DOMNode | undefined): FlexNode | undefined {
  if (node?.parentNode === undefined) return undefined;
  return node.yogaNode ?? closestFlexNode(node.parentNode);
}

/** yoga's `markDirty`: the subset re-measures every layout, so this only drops a stale measure cache. */
function markNodeAsDirty(node: DOMNode | undefined): void {
  const flex = closestFlexNode(node);
  if (flex !== undefined) flex.calc = undefined;
}

const isTextContainer = (node: DOMElement): boolean => node.nodeName === 'ink-text' || node.nodeName === 'ink-virtual-text';

export function removeChildNode(node: DOMElement, child: DOMNode): void {
  child.parentNode = undefined;
  const index = node.childNodes.indexOf(child);
  if (index >= 0) node.childNodes.splice(index, 1);
  if (isTextContainer(node)) markNodeAsDirty(node);
}

export function appendChildNode(node: DOMElement, child: DOMNode): void {
  if (child.parentNode !== undefined) removeChildNode(child.parentNode, child);
  child.parentNode = node;
  node.childNodes.push(child);
  if (isTextContainer(node)) markNodeAsDirty(node);
}

export function insertBeforeNode(node: DOMElement, child: DOMNode, before: DOMNode): void {
  if (child.parentNode !== undefined) removeChildNode(child.parentNode, child);
  child.parentNode = node;
  const index = node.childNodes.indexOf(before);
  if (index >= 0) node.childNodes.splice(index, 0, child);
  else node.childNodes.push(child);
  if (isTextContainer(node)) markNodeAsDirty(node);
}

/** A removed subtree's flex nodes, dropped: a late access is a no-op rather than a read of stale layout. */
export function freeYogaSubtree(node: DOMNode): void {
  node.yogaNode = undefined;
  if (node.nodeName !== '#text') for (const child of node.childNodes) freeYogaSubtree(child);
}

export function setAttribute(node: DOMElement, key: string, value: unknown): void {
  if (key === 'internal_accessibility') {
    node.internal_accessibility = value as Accessibility;
    return;
  }
  node.attributes[key] = value;
}

/** A transform changed: a nested one is part of its text's measured content. */
export function setTransform(node: DOMElement, transform: Transformer | undefined): void {
  node.internal_transform = transform;
  if (node.nodeName === 'ink-virtual-text') markNodeAsDirty(node);
}

export function setStyle(node: DOMElement, style: Styles | undefined): void {
  if (node.nodeName === 'ink-text' && node.style.textWrap !== style?.textWrap) markNodeAsDirty(node);
  node.style = style ?? {};
}

export function setNodeHidden(node: DOMElement, hidden: boolean): void {
  node.isHidden = hidden;
  if (node.yogaNode !== undefined) node.yogaNode.style.display = hidden || node.style.display === 'none' ? 'none' : 'flex';
  if (node.nodeName === 'ink-virtual-text') markNodeAsDirty(node);
}

export function createTextNode(text: unknown): TextNode {
  return { nodeName: '#text', nodeValue: String(text), parentNode: undefined, yogaNode: undefined, style: {} };
}

export function setTextNodeValue(node: TextNode, text: unknown): void {
  node.nodeValue = typeof text === 'string' ? text : String(text);
  markNodeAsDirty(node);
}

export function addLayoutListener(rootNode: DOMElement, listener: LayoutListener): () => void {
  if (rootNode.nodeName !== 'ink-root') return () => undefined;
  rootNode.internal_layoutListeners ??= new Set();
  rootNode.internal_layoutListeners.add(listener);
  return () => {
    rootNode.internal_layoutListeners?.delete(listener);
  };
}

export function emitLayoutListeners(rootNode: DOMElement): void {
  if (rootNode.nodeName !== 'ink-root' || rootNode.internal_layoutListeners === undefined) return;
  for (const listener of rootNode.internal_layoutListeners) listener();
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

const ESC = '\u001B';

/**
 * The text of a `Text` and everything nested in it, each nested transform applied line by
 * line, sanitized, the C1 introducers in their ESC forms, and tabs expanded — ink 8's
 * `squashTextNodes`.
 */
export function squashTextNodes(node: DOMElement): string {
  let text = '';
  for (const child of node.childNodes) {
    let nodeText = '';
    if (child.nodeName === '#text') nodeText = child.nodeValue;
    else {
      if (child.isHidden === true) continue;
      if (child.nodeName === 'ink-text' || child.nodeName === 'ink-virtual-text') nodeText = squashTextNodes(child);
      const transform = child.internal_transform;
      if (nodeText.length > 0 && typeof transform === 'function')
        nodeText = nodeText
          .split('\n')
          .map((line, index) => transform(line, index))
          .join('\n');
    }
    text += nodeText;
  }
  text = sanitizeAnsi(text.replaceAll('\r\n', '\n'));
  text = text
    .replaceAll('\u009B', `${ESC}${'['}`)
    .replaceAll('\u009D', `${ESC}${']'}`)
    .replaceAll('\u009C', `${ESC}\\`);
  if (node.nodeName === 'ink-text' && text.includes('\t')) text = wrap(text, Number.POSITIVE_INFINITY, { trim: false });
  return text;
}

/** A bounded memo, oldest out first: quick-lru's contract where ink uses one. */
export class Lru<K, V> {
  readonly #max: number;
  #map = new Map<K, V>();
  constructor(max: number) {
    this.#max = max;
  }
  get(key: K): V | undefined {
    const value = this.#map.get(key);
    if (value !== undefined) {
      this.#map.delete(key);
      this.#map.set(key, value);
    }
    return value;
  }
  has(key: K): boolean {
    return this.#map.has(key);
  }
  set(key: K, value: V): this {
    this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.#max) this.#map.delete(this.#map.keys().next().value as K);
    return this;
  }
  clear(): void {
    this.#map.clear();
  }
  get size(): number {
    return this.#map.size;
  }
}

const measured = new Lru<string, Size>(4096);

export function measureText(text: string): Size {
  if (text.length === 0) return { width: 0, height: 0 };
  const cached = measured.get(text);
  if (cached !== undefined) return cached;
  const lines = text.split('\n');
  const size = { width: widest(lines), height: lines.length };
  measured.set(text, size);
  return size;
}

/** Lines of styled cells back to strings, so a style spanning a newline reopens on every line. */
function styledLines(text: string): string[] {
  const lines: StyledChar[][] = [[]];
  for (const character of styledChars(text)) {
    if (character.value === '\n') lines.push([]);
    else lines.at(-1)!.push(character);
  }
  return lines.map((line) => serialize(line));
}

const ELLIPSIS = '\u2026';
const ESC_CODE = 27;
const BRACKET_CODE = 91;
const M_CODE = 109;
const isSgrParameter = (code: number | undefined): boolean => code !== undefined && ((code >= 48 && code <= 57) || code === 59);

/** Where the SGR codes a string opens with end. */
function leadingSgrSpanEnd(text: string): number {
  let index = 0;
  while (index + 2 < text.length && text.codePointAt(index) === ESC_CODE && text.codePointAt(index + 1) === BRACKET_CODE) {
    let at = index + 2;
    while (at < text.length && isSgrParameter(text.codePointAt(at))) at += 1;
    if (at >= text.length || text.codePointAt(at) !== M_CODE) break;
    index = at + 1;
  }
  return index;
}

/** Where the SGR codes a string closes with begin. */
function trailingSgrSpanStart(text: string): number {
  let start = text.length;
  while (start > 1 && text.codePointAt(start - 1) === M_CODE) {
    let at = start - 2;
    while (at >= 0 && isSgrParameter(text.codePointAt(at))) at -= 1;
    if (at < 1 || text.codePointAt(at - 1) !== ESC_CODE || text.codePointAt(at) !== BRACKET_CODE) break;
    start = at - 1;
  }
  return start;
}

/**
 * One line cut to `columns` with an ellipsis, as cli-truncate 6.1 cuts it for ink: the
 * ellipsis goes inside the styles that close the kept end (or open the kept start), so a
 * coloured line keeps its colour to the edge. The cuts are linegauge's `slice`.
 */
function truncateLine(text: string, columns: number, position: 'start' | 'middle' | 'end'): string {
  if (columns < 1) return '';
  const length = widthOf(text);
  if (length <= columns) return text;
  if (columns === 1) return ELLIPSIS;
  if (position === 'start') {
    const right = slice(text, length - columns + 1, length);
    const end = leadingSgrSpanEnd(right);
    return end === 0 ? ELLIPSIS + right : right.slice(0, end) + ELLIPSIS + right.slice(end);
  }
  if (position === 'middle') {
    const half = Math.min(Math.floor(columns / 2), Math.max(0, columns - 1));
    return slice(text, 0, half) + ELLIPSIS + slice(text, length - (columns - half) + 1, length);
  }
  const left = slice(text, 0, columns - 1);
  const start = trailingSgrSpanStart(left);
  return start === left.length ? left + ELLIPSIS : left.slice(0, start) + ELLIPSIS + left.slice(start);
}

/** ink's wrap cache, which its suite clears and inspects. */
export const wrapTextCache = new Lru<string, string>(4096);

/** Wrap or truncate to `maxWidth` columns, as ink 8's `wrapText` does with wrap-ansi and cli-truncate. */
export function wrapText(text: string, maxWidth: number, wrapType: TextWrap | undefined): string {
  // Text with no room keeps its natural width; truncation still cuts to nothing.
  if (maxWidth <= 0 && (wrapType === 'wrap' || wrapType === 'hard')) return text;
  // A positive fraction of a column is the one column it renders into.
  const width = maxWidth > 0 && maxWidth < 1 ? 1 : maxWidth;
  const key = `${width}\u0000${String(wrapType)}\u0000${text}`;
  const cached = wrapTextCache.get(key);
  if (cached !== undefined) return cached;
  let wrapped = text;
  if (wrapType === 'wrap') wrapped = wrap(text, width, { trim: false, hard: true });
  else if (wrapType === 'hard') wrapped = wrap(text, width, { trim: false, hard: true, wordWrap: false });
  else if (wrapType?.startsWith('truncate') === true) {
    const position = wrapType === 'truncate-middle' ? 'middle' : wrapType === 'truncate-start' ? 'start' : 'end';
    const lines = text.includes('\n') ? styledLines(text) : [text];
    wrapped = lines.map((line) => truncateLine(line, width, position)).join('\n');
  }
  wrapTextCache.set(key, wrapped);
  return wrapped;
}

function measureTextNode(node: DOMElement, width: number, mode: Mode): Size {
  const text = squashTextNodes(node);
  const dimensions = measureText(text);
  // An unconstrained measure asks for the natural size; text that fits needs no wrapping.
  if (mode === UNDEFINED || dimensions.width <= width) return dimensions;
  const textWrap = node.style.textWrap ?? 'wrap';
  const wrapped = measureText(wrapText(text, width, textWrap));
  // A truncation reserves its width, so rendering does not cut again narrower at a wide character.
  return textWrap.startsWith('truncate') ? { width, height: wrapped.height } : wrapped;
}

export const widestLine = (text: string): number => widest(text.split('\n'));
export const stringWidth = (text: string): number => widthOf(text);
