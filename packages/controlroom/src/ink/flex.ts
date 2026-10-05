/**
 * R12 — the flexbox subset `controlroom/ink` lays `Box` out with: TypeScript, no yoga.
 *
 * Ink lays out with yoga, and Ink's own suite asserts yoga's answers to the cell, so this is
 * yoga's algorithm (`CalculateLayout.cpp`, 3.x) for the props Ink exposes, step for step and
 * in its own vocabulary — flex basis, flex lines, the two free-space passes, justification,
 * cross alignment, multi-line alignment, the absolute children, and yoga's pixel-grid
 * rounding, which is where a fractional layout becomes the cells a test compares. What is not
 * here is what Ink never sets: `aspectRatio`, `maxWidth`/`maxHeight`, inset offsets, auto
 * margins, baseline alignment, `overflow: scroll`, RTL. A case that depends on one of those is
 * a conditional case in `compat-oracle`, never a silent pass.
 *
 * Nothing here knows about React, terminals or text: a node is a style, its children, and an
 * optional measure function (a text node's). Constraint 6 holds: nothing outside
 * `controlroom/ink` imports this file.
 */

/** How an available size constrains a node: not at all, exactly, or as a ceiling. */
export const UNDEFINED = 0;
export const EXACTLY = 1;
export const AT_MOST = 2;
export type Mode = typeof UNDEFINED | typeof EXACTLY | typeof AT_MOST;

export interface Percent {
  readonly percent: number;
}
/** Cells, a percentage of the owner's size, or `undefined` for auto. */
export type Length = number | Percent | undefined;

export type Direction = 'row' | 'row-reverse' | 'column' | 'column-reverse';
export type Align = 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch';
export type Justify = 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
export type Wrap = 'nowrap' | 'wrap' | 'wrap-reverse';

/** Left, top, right, bottom: yoga's physical edge order. */
export type Edges = [number, number, number, number];

export interface FlexStyle {
  position: 'relative' | 'absolute';
  display: 'flex' | 'none';
  flexDirection: Direction;
  flexWrap: Wrap;
  flexGrow: number;
  flexShrink: number;
  flexBasis: Length;
  alignItems: Align;
  alignSelf: Align;
  alignContent: Align;
  justifyContent: Justify;
  width: Length;
  height: Length;
  minWidth: Length;
  minHeight: Length;
  margin: Edges;
  padding: Edges;
  border: Edges;
  columnGap: number;
  rowGap: number;
}

/** yoga's defaults — not the web's: a column, no shrinking, content aligned to the start. */
export const defaults = (): FlexStyle => ({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flexWrap: 'nowrap',
  flexGrow: 0,
  flexShrink: 0,
  flexBasis: undefined,
  alignItems: 'stretch',
  alignSelf: 'auto',
  alignContent: 'flex-start',
  justifyContent: 'flex-start',
  width: undefined,
  height: undefined,
  minWidth: undefined,
  minHeight: undefined,
  margin: [0, 0, 0, 0],
  padding: [0, 0, 0, 0],
  border: [0, 0, 0, 0],
  columnGap: 0,
  rowGap: 0,
});

export interface Size {
  width: number;
  height: number;
}

export interface FlexNode {
  style: FlexStyle;
  children: FlexNode[];
  /** A leaf that sizes itself: Ink's text nodes. yoga rounds such a node as text. */
  measure?: ((width: number, mode: Mode) => Size) | undefined;
  /** Set by `calculateLayout`: the node's box relative to its parent, in whole cells. */
  layout: Box;
  /** Internal to a layout pass. */
  calc?: Calc | undefined;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Calc {
  measuredWidth: number;
  measuredHeight: number;
  width: number;
  height: number;
  /** Left, top, right, bottom, as yoga keeps them until the reverse axes are resolved. */
  position: Edges;
  flexBasis: number;
  lineIndex: number;
  generation: number;
  cache: Map<string, Size>;
}

const LEFT = 0;
const TOP = 1;
const RIGHT = 2;
const BOTTOM = 3;

const isRow = (axis: Direction): boolean => axis === 'row' || axis === 'row-reverse';
const isReverse = (axis: Direction): boolean => axis === 'row-reverse' || axis === 'column-reverse';
const startEdge = (axis: Direction): number => (axis === 'row' ? LEFT : axis === 'row-reverse' ? RIGHT : axis === 'column' ? TOP : BOTTOM);
const endEdge = (axis: Direction): number => (axis === 'row' ? RIGHT : axis === 'row-reverse' ? LEFT : axis === 'column' ? BOTTOM : TOP);
const crossOf = (axis: Direction): Direction => (isRow(axis) ? 'column' : 'row');
const defined = (n: number): boolean => !Number.isNaN(n);
const EPSILON = 0.0001;
const same = (a: number, b: number): boolean => (Number.isNaN(a) ? Number.isNaN(b) : Math.abs(a - b) < EPSILON);

let generation = 0;

function calc(node: FlexNode): Calc {
  if (node.calc === undefined || node.calc.generation !== generation) {
    node.calc = { measuredWidth: Number.NaN, measuredHeight: Number.NaN, width: 0, height: 0, position: [0, 0, 0, 0], flexBasis: Number.NaN, lineIndex: 0, generation, cache: new Map() };
  }
  return node.calc;
}

export function resolve(length: Length, owner: number): number {
  if (length === undefined) return Number.NaN;
  if (typeof length === 'number') return length;
  return defined(owner) ? (length.percent * owner) / 100 : Number.NaN;
}

const dimension = (node: FlexNode, axis: Direction): Length => (isRow(axis) ? node.style.width : node.style.height);
const minDimension = (node: FlexNode, axis: Direction): Length => (isRow(axis) ? node.style.minWidth : node.style.minHeight);
const measured = (node: FlexNode, axis: Direction): number => (isRow(axis) ? calc(node).measuredWidth : calc(node).measuredHeight);

function setMeasured(node: FlexNode, axis: Direction, value: number): void {
  if (isRow(axis)) calc(node).measuredWidth = value;
  else calc(node).measuredHeight = value;
}

const leadingMargin = (node: FlexNode, axis: Direction): number => node.style.margin[startEdge(axis)]!;
const trailingMargin = (node: FlexNode, axis: Direction): number => node.style.margin[endEdge(axis)]!;
const marginForAxis = (node: FlexNode, axis: Direction): number => leadingMargin(node, axis) + trailingMargin(node, axis);
const leadingPaddingAndBorder = (node: FlexNode, axis: Direction): number => node.style.padding[startEdge(axis)]! + node.style.border[startEdge(axis)]!;
const trailingPaddingAndBorder = (node: FlexNode, axis: Direction): number => node.style.padding[endEdge(axis)]! + node.style.border[endEdge(axis)]!;
const paddingAndBorderForAxis = (node: FlexNode, axis: Direction): number => leadingPaddingAndBorder(node, axis) + trailingPaddingAndBorder(node, axis);
const dimensionWithMargin = (node: FlexNode, axis: Direction): number => measured(node, axis) + marginForAxis(node, axis);
const gapFor = (node: FlexNode, axis: Direction): number => (isRow(axis) ? node.style.columnGap : node.style.rowGap);

function isStyleDimDefined(node: FlexNode, axis: Direction, owner: number): boolean {
  const length = dimension(node, axis);
  if (length === undefined) return false;
  if (typeof length === 'number') return length >= 0;
  return length.percent >= 0 && defined(owner);
}

function boundWithinMinAndMax(node: FlexNode, axis: Direction, value: number, axisSize: number): number {
  const min = resolve(minDimension(node, axis), axisSize);
  return defined(min) && value < min ? min : value;
}

function bound(node: FlexNode, axis: Direction, value: number, axisSize: number): number {
  const within = boundWithinMinAndMax(node, axis, value, axisSize);
  const floor = paddingAndBorderForAxis(node, axis);
  return defined(within) ? Math.max(within, floor) : floor;
}

function alignOf(parent: FlexNode, child: FlexNode): Align {
  return child.style.alignSelf === 'auto' ? parent.style.alignItems : child.style.alignSelf;
}

const inFlow = (node: FlexNode): boolean => node.style.display !== 'none' && node.style.position !== 'absolute';

function zeroOut(node: FlexNode): void {
  const c = calc(node);
  c.measuredWidth = 0;
  c.measuredHeight = 0;
  c.width = 0;
  c.height = 0;
  c.position = [0, 0, 0, 0];
  for (const child of node.children) zeroOut(child);
}

// ── Leaves ──────────────────────────────────────────────────────────────────────────────

function measureLeaf(node: FlexNode, availableWidth: number, availableHeight: number, widthMode: Mode, heightMode: Mode, ownerWidth: number, ownerHeight: number): void {
  const measure = node.measure!;
  const width = widthMode === UNDEFINED ? Number.NaN : availableWidth;
  const height = heightMode === UNDEFINED ? Number.NaN : availableHeight;
  const pbRow = paddingAndBorderForAxis(node, 'row');
  const pbColumn = paddingAndBorderForAxis(node, 'column');
  const marginRow = marginForAxis(node, 'row');
  const marginColumn = marginForAxis(node, 'column');
  if (widthMode === EXACTLY && heightMode === EXACTLY) {
    setMeasured(node, 'row', bound(node, 'row', width - marginRow, ownerWidth));
    setMeasured(node, 'column', bound(node, 'column', height - marginColumn, ownerHeight));
    return;
  }
  const inner = defined(width) ? Math.max(0, width - marginRow - pbRow) : width;
  const size = measure(inner, widthMode);
  setMeasured(node, 'row', bound(node, 'row', widthMode === EXACTLY ? width - marginRow : size.width + pbRow, ownerWidth));
  setMeasured(node, 'column', bound(node, 'column', heightMode === EXACTLY ? height - marginColumn : size.height + pbColumn, ownerHeight));
}

function measureEmpty(node: FlexNode, availableWidth: number, availableHeight: number, widthMode: Mode, heightMode: Mode, ownerWidth: number, ownerHeight: number): void {
  const width = widthMode === EXACTLY ? availableWidth - marginForAxis(node, 'row') : paddingAndBorderForAxis(node, 'row');
  const height = heightMode === EXACTLY ? availableHeight - marginForAxis(node, 'column') : paddingAndBorderForAxis(node, 'column');
  setMeasured(node, 'row', bound(node, 'row', width, ownerWidth));
  setMeasured(node, 'column', bound(node, 'column', height, ownerHeight));
}

function measureFixed(node: FlexNode, availableWidth: number, availableHeight: number, widthMode: Mode, heightMode: Mode, ownerWidth: number, ownerHeight: number): boolean {
  const zeroWidth = defined(availableWidth) && widthMode === AT_MOST && availableWidth <= 0;
  const zeroHeight = defined(availableHeight) && heightMode === AT_MOST && availableHeight <= 0;
  if (!zeroWidth && !zeroHeight && !(widthMode === EXACTLY && heightMode === EXACTLY)) return false;
  const width = !defined(availableWidth) || (widthMode === AT_MOST && availableWidth < 0) ? 0 : availableWidth - marginForAxis(node, 'row');
  const height = !defined(availableHeight) || (heightMode === AT_MOST && availableHeight < 0) ? 0 : availableHeight - marginForAxis(node, 'column');
  setMeasured(node, 'row', bound(node, 'row', width, ownerWidth));
  setMeasured(node, 'column', bound(node, 'column', height, ownerHeight));
  return true;
}

// ── The flex basis ──────────────────────────────────────────────────────────────────────

function computeFlexBasis(parent: FlexNode, child: FlexNode, width: number, widthMode: Mode, height: number, heightMode: Mode, ownerWidth: number, ownerHeight: number): void {
  const mainAxis = parent.style.flexDirection;
  const mainRow = isRow(mainAxis);
  const mainSize = mainRow ? width : height;
  const mainOwnerSize = mainRow ? ownerWidth : ownerHeight;
  const basis = resolve(child.style.flexBasis, mainOwnerSize);
  const rowDefined = isStyleDimDefined(child, 'row', ownerWidth);
  const columnDefined = isStyleDimDefined(child, 'column', ownerHeight);
  const c = calc(child);
  if (defined(basis) && defined(mainSize)) {
    c.flexBasis = Math.max(basis, paddingAndBorderForAxis(child, mainAxis));
    return;
  }
  if (mainRow && rowDefined) {
    c.flexBasis = Math.max(resolve(child.style.width, ownerWidth), paddingAndBorderForAxis(child, 'row'));
    return;
  }
  if (!mainRow && columnDefined) {
    c.flexBasis = Math.max(resolve(child.style.height, ownerHeight), paddingAndBorderForAxis(child, 'column'));
    return;
  }
  let childWidth = Number.NaN;
  let childHeight = Number.NaN;
  let childWidthMode: Mode = UNDEFINED;
  let childHeightMode: Mode = UNDEFINED;
  const marginRow = marginForAxis(child, 'row');
  const marginColumn = marginForAxis(child, 'column');
  if (rowDefined) {
    childWidth = resolve(child.style.width, ownerWidth) + marginRow;
    childWidthMode = EXACTLY;
  }
  if (columnDefined) {
    childHeight = resolve(child.style.height, ownerHeight) + marginColumn;
    childHeightMode = EXACTLY;
  }
  if (!defined(childWidth) && defined(width)) {
    childWidth = width;
    childWidthMode = AT_MOST;
  }
  if (!defined(childHeight) && defined(height)) {
    childHeight = height;
    childHeightMode = AT_MOST;
  }
  const stretches = alignOf(parent, child) === 'stretch';
  if (!mainRow && !rowDefined && defined(width) && widthMode === EXACTLY && stretches && childWidthMode !== EXACTLY) {
    childWidth = width;
    childWidthMode = EXACTLY;
  }
  if (mainRow && !columnDefined && defined(height) && heightMode === EXACTLY && stretches && childHeightMode !== EXACTLY) {
    childHeight = height;
    childHeightMode = EXACTLY;
  }
  layoutInternal(child, childWidth, childHeight, childWidthMode, childHeightMode, ownerWidth, ownerHeight, false);
  c.flexBasis = Math.max(measured(child, mainAxis), paddingAndBorderForAxis(child, mainAxis));
}

// ── Flex lines ──────────────────────────────────────────────────────────────────────────

interface Line {
  items: FlexNode[];
  end: number;
  sizeConsumed: number;
  totalGrow: number;
  totalShrinkScaled: number;
  remainingFreeSpace: number;
  mainDim: number;
  crossDim: number;
}

function collectLine(node: FlexNode, start: number, lineIndex: number, mainOwnerSize: number, availableInnerMain: number): Line {
  const mainAxis = node.style.flexDirection;
  const wraps = node.style.flexWrap !== 'nowrap';
  const gap = gapFor(node, mainAxis);
  const line: Line = { items: [], end: start, sizeConsumed: 0, totalGrow: 0, totalShrinkScaled: 0, remainingFreeSpace: 0, mainDim: 0, crossDim: 0 };
  let index = start;
  for (; index < node.children.length; index += 1) {
    const child = node.children[index]!;
    if (!inFlow(child)) continue;
    const c = calc(child);
    c.lineIndex = lineIndex;
    const leadingGap = line.items.length === 0 ? 0 : gap;
    const basis = boundWithinMinAndMax(child, mainAxis, c.flexBasis, mainOwnerSize);
    const outer = basis + marginForAxis(child, mainAxis) + leadingGap;
    if (wraps && line.items.length > 0 && line.sizeConsumed + outer > availableInnerMain) break;
    line.sizeConsumed += outer;
    if (child.style.flexGrow !== 0 || child.style.flexShrink !== 0) {
      line.totalGrow += child.style.flexGrow;
      line.totalShrinkScaled += -child.style.flexShrink * c.flexBasis;
    }
    line.items.push(child);
  }
  if (line.totalGrow > 0 && line.totalGrow < 1) line.totalGrow = 1;
  line.end = index;
  return line;
}

// ── Resolving flexible lengths ──────────────────────────────────────────────────────────

function distributeFirstPass(line: Line, mainAxis: Direction, mainOwnerSize: number, availableInnerMain: number): void {
  let delta = 0;
  for (const child of line.items) {
    const c = calc(child);
    const basis = boundWithinMinAndMax(child, mainAxis, c.flexBasis, mainOwnerSize);
    if (line.remainingFreeSpace < 0) {
      const scaled = -child.style.flexShrink * basis;
      if (scaled !== 0) {
        const base = basis + (line.remainingFreeSpace / line.totalShrinkScaled) * scaled;
        const bounded = bound(child, mainAxis, base, availableInnerMain);
        if (defined(base) && base !== bounded) {
          delta += bounded - basis;
          line.totalShrinkScaled -= -child.style.flexShrink * c.flexBasis;
        }
      }
    } else if (line.remainingFreeSpace > 0 && child.style.flexGrow !== 0) {
      const base = basis + (line.remainingFreeSpace / line.totalGrow) * child.style.flexGrow;
      const bounded = bound(child, mainAxis, base, availableInnerMain);
      if (base !== bounded) {
        delta += bounded - basis;
        line.totalGrow -= child.style.flexGrow;
      }
    }
  }
  line.remainingFreeSpace -= delta;
}

interface Pass {
  node: FlexNode;
  line: Line;
  mainOwnerSize: number;
  availableInnerMain: number;
  availableInnerCross: number;
  availableInnerWidth: number;
  availableInnerHeight: number;
  mainOverflows: boolean;
  crossMode: Mode;
  performLayout: boolean;
}

function distributeSecondPass({ node, line, mainOwnerSize, availableInnerMain, availableInnerCross, availableInnerWidth, availableInnerHeight, mainOverflows, crossMode, performLayout }: Pass): number {
  const mainAxis = node.style.flexDirection;
  const crossAxis = crossOf(mainAxis);
  const mainRow = isRow(mainAxis);
  const wraps = node.style.flexWrap !== 'nowrap';
  let delta = 0;
  for (const child of line.items) {
    const c = calc(child);
    const basis = boundWithinMinAndMax(child, mainAxis, c.flexBasis, mainOwnerSize);
    let mainSize = basis;
    if (line.remainingFreeSpace < 0) {
      const scaled = -child.style.flexShrink * basis;
      if (scaled !== 0) {
        const size = line.totalShrinkScaled === 0 ? basis + scaled : basis + (line.remainingFreeSpace / line.totalShrinkScaled) * scaled;
        mainSize = bound(child, mainAxis, size, availableInnerMain);
      }
    } else if (line.remainingFreeSpace > 0 && child.style.flexGrow !== 0) {
      mainSize = bound(child, mainAxis, basis + (line.remainingFreeSpace / line.totalGrow) * child.style.flexGrow, availableInnerMain);
    }
    delta += mainSize - basis;
    const childMain = mainSize + marginForAxis(child, mainAxis);
    let childCross: number;
    let childCrossMode: Mode;
    const stretches = alignOf(node, child) === 'stretch';
    const crossDefined = isStyleDimDefined(child, crossAxis, availableInnerCross);
    if (defined(availableInnerCross) && !crossDefined && crossMode === EXACTLY && !(wraps && mainOverflows) && stretches) {
      childCross = availableInnerCross;
      childCrossMode = EXACTLY;
    } else if (crossDefined) {
      childCross = resolve(dimension(child, crossAxis), availableInnerCross) + marginForAxis(child, crossAxis);
      const loose = typeof dimension(child, crossAxis) === 'object' && crossMode !== EXACTLY;
      childCrossMode = !defined(childCross) || loose ? UNDEFINED : EXACTLY;
    } else {
      childCross = availableInnerCross;
      childCrossMode = defined(childCross) ? AT_MOST : UNDEFINED;
    }
    const requiresStretch = !crossDefined && stretches;
    const pass = performLayout && !requiresStretch;
    layoutInternal(
      child,
      mainRow ? childMain : childCross,
      mainRow ? childCross : childMain,
      mainRow ? EXACTLY : childCrossMode,
      mainRow ? childCrossMode : EXACTLY,
      availableInnerWidth,
      availableInnerHeight,
      pass,
    );
  }
  return delta;
}

// ── Justification ───────────────────────────────────────────────────────────────────────

function justify(node: FlexNode, line: Line, mainMode: Mode, mainOwnerSize: number, availableInnerMain: number, performLayout: boolean): void {
  const mainAxis = node.style.flexDirection;
  const crossAxis = crossOf(mainAxis);
  const gap = gapFor(node, mainAxis);
  if (mainMode === AT_MOST && line.remainingFreeSpace > 0) {
    const min = resolve(minDimension(node, mainAxis), mainOwnerSize);
    if (defined(min)) {
      const minAvailable = min - leadingPaddingAndBorder(node, mainAxis) - trailingPaddingAndBorder(node, mainAxis);
      const occupied = availableInnerMain - line.remainingFreeSpace;
      line.remainingFreeSpace = Math.max(0, minAvailable - occupied);
    } else {
      line.remainingFreeSpace = 0;
    }
  }
  const count = line.items.length;
  const free = line.remainingFreeSpace;
  let leading = 0;
  let between = 0;
  switch (node.style.justifyContent) {
    case 'center':
      leading = free / 2;
      break;
    case 'flex-end':
      leading = free;
      break;
    case 'space-between':
      if (count > 1) between = Math.max(free, 0) / (count - 1);
      break;
    case 'space-evenly':
      leading = free / (count + 1);
      between = leading;
      break;
    case 'space-around':
      leading = (0.5 * free) / count;
      between = leading * 2;
      break;
    default:
      break;
  }
  line.mainDim = leadingPaddingAndBorder(node, mainAxis) + leading;
  line.crossDim = 0;
  const last = line.items.at(-1);
  for (const child of line.items) {
    const c = calc(child);
    if (performLayout) c.position[startEdge(mainAxis)] = c.position[startEdge(mainAxis)]! + line.mainDim;
    if (child !== last) line.mainDim += between + gap;
    line.mainDim += dimensionWithMargin(child, mainAxis);
    line.crossDim = Math.max(line.crossDim, dimensionWithMargin(child, crossAxis));
  }
  line.mainDim += trailingPaddingAndBorder(node, mainAxis);
}

// ── The layout of one node ──────────────────────────────────────────────────────────────

function availableInner(node: FlexNode, axis: Direction, available: number, owner: number): number {
  const pb = paddingAndBorderForAxis(node, axis);
  const inner = available - pb;
  if (!defined(inner)) return inner;
  const min = resolve(minDimension(node, axis), owner);
  return Math.max(inner, defined(min) ? min - pb : 0);
}

function layoutImpl(node: FlexNode, availableWidth: number, availableHeight: number, widthMode: Mode, heightMode: Mode, ownerWidth: number, ownerHeight: number, performLayout: boolean): void {
  if (node.measure !== undefined) {
    measureLeaf(node, availableWidth, availableHeight, widthMode, heightMode, ownerWidth, ownerHeight);
    return;
  }
  if (node.children.length === 0) {
    measureEmpty(node, availableWidth, availableHeight, widthMode, heightMode, ownerWidth, ownerHeight);
    return;
  }
  if (!performLayout && measureFixed(node, availableWidth, availableHeight, widthMode, heightMode, ownerWidth, ownerHeight)) return;

  const { style } = node;
  const mainAxis = style.flexDirection;
  const crossAxis = crossOf(mainAxis);
  const mainRow = isRow(mainAxis);
  const wraps = style.flexWrap !== 'nowrap';
  const mainOwnerSize = mainRow ? ownerWidth : ownerHeight;
  const crossOwnerSize = mainRow ? ownerHeight : ownerWidth;
  const pbMain = paddingAndBorderForAxis(node, mainAxis);
  const pbCross = paddingAndBorderForAxis(node, crossAxis);
  const leadingPbCross = leadingPaddingAndBorder(node, crossAxis);
  let mainMode = mainRow ? widthMode : heightMode;
  const crossMode = mainRow ? heightMode : widthMode;
  const marginRow = marginForAxis(node, 'row');
  const marginColumn = marginForAxis(node, 'column');

  const availableInnerWidth = availableInner(node, 'row', availableWidth - marginRow, ownerWidth);
  const availableInnerHeight = availableInner(node, 'column', availableHeight - marginColumn, ownerHeight);
  let availableInnerMain = mainRow ? availableInnerWidth : availableInnerHeight;
  const availableInnerCross = mainRow ? availableInnerHeight : availableInnerWidth;

  // Step 3: every child's flex basis.
  let single: FlexNode | undefined;
  if (mainMode === EXACTLY) {
    for (const child of node.children) {
      if (!inFlow(child) || (child.style.flexGrow === 0 && child.style.flexShrink === 0)) continue;
      if (single !== undefined || child.style.flexGrow === 0 || child.style.flexShrink === 0) {
        single = undefined;
        break;
      }
      single = child;
    }
  }
  let totalMain = 0;
  for (const child of node.children) {
    if (child.style.display === 'none') {
      zeroOut(child);
      continue;
    }
    if (performLayout) {
      const c = calc(child);
      c.position = [child.style.margin[LEFT]!, child.style.margin[TOP]!, child.style.margin[RIGHT]!, child.style.margin[BOTTOM]!];
    }
    if (child.style.position === 'absolute') continue;
    if (child === single) calc(child).flexBasis = 0;
    else computeFlexBasis(node, child, availableInnerWidth, widthMode, availableInnerHeight, heightMode, availableInnerWidth, availableInnerHeight);
    totalMain += calc(child).flexBasis + marginForAxis(child, mainAxis);
  }
  const mainOverflows = mainMode === UNDEFINED ? false : totalMain > availableInnerMain;
  if (wraps && mainOverflows && mainMode === AT_MOST) mainMode = EXACTLY;

  // Step 4: the lines, each flexed, justified and aligned on the cross axis.
  const lines: Line[] = [];
  let totalLineCross = 0;
  let maxLineMain = 0;
  const crossGap = gapFor(node, crossAxis);
  for (let start = 0; start < node.children.length; ) {
    const line = collectLine(node, start, lines.length, mainOwnerSize, availableInnerMain);
    start = line.end;
    let lineAvailableMain = availableInnerMain;
    let sizedByContent = false;
    if (mainMode !== EXACTLY) {
      const minInnerMain = resolve(minDimension(node, mainAxis), mainOwnerSize) - pbMain;
      if (defined(minInnerMain) && line.sizeConsumed < minInnerMain) {
        lineAvailableMain = minInnerMain;
      } else {
        if (line.totalGrow === 0 && style.flexGrow === 0) lineAvailableMain = line.sizeConsumed;
        sizedByContent = true;
      }
    }
    if (!sizedByContent && defined(lineAvailableMain)) line.remainingFreeSpace = lineAvailableMain - line.sizeConsumed;
    else if (line.sizeConsumed < 0) line.remainingFreeSpace = -line.sizeConsumed;

    const canSkipFlex = !performLayout && crossMode === EXACTLY;
    if (!canSkipFlex) {
      const original = line.remainingFreeSpace;
      // The first pass freezes the items a bound stops, so the second shares only what is left.
      distributeFirstPass(line, mainAxis, mainOwnerSize, lineAvailableMain);
      const distributed = distributeSecondPass({
        node,
        line,
        mainOwnerSize,
        availableInnerMain: lineAvailableMain,
        availableInnerCross,
        availableInnerWidth,
        availableInnerHeight,
        mainOverflows,
        crossMode,
        performLayout,
      });
      line.remainingFreeSpace = original - distributed;
    }

    justify(node, line, mainMode, mainOwnerSize, lineAvailableMain, performLayout);
    if (canSkipFlex) {
      line.mainDim = leadingPaddingAndBorder(node, mainAxis) + trailingPaddingAndBorder(node, mainAxis);
      for (const [i, child] of line.items.entries()) line.mainDim += marginForAxis(child, mainAxis) + calc(child).flexBasis + (i > 0 ? gapFor(node, mainAxis) : 0);
      line.crossDim = availableInnerCross;
    }

    let containerCross = availableInnerCross;
    if (crossMode === UNDEFINED || crossMode === AT_MOST) containerCross = bound(node, crossAxis, line.crossDim + pbCross, crossOwnerSize) - pbCross;
    if (!wraps && crossMode === EXACTLY) line.crossDim = availableInnerCross;
    if (!wraps) line.crossDim = bound(node, crossAxis, line.crossDim + pbCross, crossOwnerSize) - pbCross;

    // Step 7: cross-axis alignment within the line.
    if (performLayout) {
      for (const child of line.items) {
        const c = calc(child);
        let leadingCross = leadingPbCross;
        const align = alignOf(node, child);
        if (align === 'stretch') {
          if (!isStyleDimDefined(child, crossAxis, availableInnerCross)) {
            const childMain = measured(child, mainAxis) + marginForAxis(child, mainAxis);
            const childCross = line.crossDim;
            const crossDoesNotGrow = style.alignContent !== 'stretch' && wraps;
            const width = mainRow ? childMain : childCross;
            const height = mainRow ? childCross : childMain;
            const wMode: Mode = !defined(width) || (!mainRow && crossDoesNotGrow) ? UNDEFINED : EXACTLY;
            const hMode: Mode = !defined(height) || (mainRow && crossDoesNotGrow) ? UNDEFINED : EXACTLY;
            layoutInternal(child, width, height, wMode, hMode, availableInnerWidth, availableInnerHeight, true);
          }
        } else {
          const remaining = containerCross - dimensionWithMargin(child, crossAxis);
          if (align === 'center') leadingCross += remaining / 2;
          else if (align === 'flex-end') leadingCross += remaining;
        }
        const edge = startEdge(crossAxis);
        c.position[edge] = c.position[edge]! + totalLineCross + leadingCross;
      }
    }
    totalLineCross += line.crossDim + (lines.length > 0 ? crossGap : 0);
    maxLineMain = Math.max(maxLineMain, line.mainDim);
    lines.push(line);
  }

  // Step 8: multi-line alignment.
  if (performLayout && wraps) alignLines(node, lines, availableInnerCross, totalLineCross, availableInnerWidth, availableInnerHeight);

  // Step 9: this node's own size.
  setMeasured(node, 'row', bound(node, 'row', availableWidth - marginRow, ownerWidth));
  setMeasured(node, 'column', bound(node, 'column', availableHeight - marginColumn, ownerHeight));
  if (mainMode === UNDEFINED || mainMode === AT_MOST) setMeasured(node, mainAxis, bound(node, mainAxis, maxLineMain, mainOwnerSize));
  if (crossMode === UNDEFINED || crossMode === AT_MOST) setMeasured(node, crossAxis, bound(node, crossAxis, totalLineCross + pbCross, crossOwnerSize));

  if (!performLayout) return;
  if (style.flexWrap === 'wrap-reverse') {
    const edge = startEdge(crossAxis);
    for (const child of node.children) {
      if (child.style.position === 'absolute') continue;
      const c = calc(child);
      c.position[edge] = measured(node, crossAxis) - c.position[edge]! - measured(child, crossAxis);
    }
  }
  // Step 10: the absolute children, against this node's padding box.
  for (const child of node.children) {
    if (child.style.display === 'none' || child.style.position !== 'absolute') continue;
    layoutAbsolute(node, child, widthMode);
  }
  // Step 11: a reversed main axis is laid out from its far edge.
  if (isReverse(mainAxis)) {
    for (const child of node.children) {
      if (!inFlow(child)) continue;
      const c = calc(child);
      c.position[endEdge(mainAxis)] = measured(node, mainAxis) - measured(child, mainAxis) - c.position[startEdge(mainAxis)]!;
    }
  }
}

function alignLines(node: FlexNode, lines: Line[], availableInnerCross: number, totalLineCross: number, availableInnerWidth: number, availableInnerHeight: number): void {
  const mainAxis = node.style.flexDirection;
  const crossAxis = crossOf(mainAxis);
  const mainRow = isRow(mainAxis);
  const crossGap = gapFor(node, crossAxis);
  let lead = leadingPaddingAndBorder(node, crossAxis);
  let crossDimLead = 0;
  if (defined(availableInnerCross)) {
    const remaining = availableInnerCross - totalLineCross;
    switch (node.style.alignContent) {
      case 'flex-end':
        lead += remaining;
        break;
      case 'center':
        lead += remaining / 2;
        break;
      case 'stretch':
        if (availableInnerCross > totalLineCross) crossDimLead = remaining / lines.length;
        break;
      default:
        break;
    }
  }
  for (const [i, line] of lines.entries()) {
    let lineHeight = 0;
    for (const child of line.items) {
      const size = measured(child, crossAxis);
      if (defined(size) && size >= 0) lineHeight = Math.max(lineHeight, size + marginForAxis(child, crossAxis));
    }
    lineHeight += crossDimLead;
    if (i !== 0) lead += crossGap;
    for (const child of line.items) {
      const c = calc(child);
      const edge = startEdge(crossAxis);
      switch (alignOf(node, child)) {
        case 'flex-end':
          c.position[edge] = lead + lineHeight - trailingMargin(child, crossAxis) - measured(child, crossAxis);
          break;
        case 'center':
          c.position[edge] = lead + (lineHeight - measured(child, crossAxis)) / 2;
          break;
        case 'stretch': {
          c.position[edge] = lead + leadingMargin(child, crossAxis);
          if (!isStyleDimDefined(child, crossAxis, availableInnerCross)) {
            const width = mainRow ? c.measuredWidth + marginForAxis(child, mainAxis) : lineHeight;
            const height = mainRow ? lineHeight : c.measuredHeight + marginForAxis(child, mainAxis);
            if (!(same(width, c.measuredWidth) && same(height, c.measuredHeight))) layoutInternal(child, width, height, EXACTLY, EXACTLY, availableInnerWidth, availableInnerHeight, true);
          }
          break;
        }
        default:
          c.position[edge] = lead + leadingMargin(child, crossAxis);
          break;
      }
    }
    lead += lineHeight;
  }
}

function layoutAbsolute(parent: FlexNode, child: FlexNode, widthMode: Mode): void {
  const mainAxis = parent.style.flexDirection;
  const mainRow = isRow(mainAxis);
  const blockWidth = measured(parent, 'row') - parent.style.border[LEFT]! - parent.style.border[RIGHT]!;
  const blockHeight = measured(parent, 'column') - parent.style.border[TOP]! - parent.style.border[BOTTOM]!;
  const marginRow = marginForAxis(child, 'row');
  const marginColumn = marginForAxis(child, 'column');
  let width = isStyleDimDefined(child, 'row', blockWidth) ? resolve(child.style.width, blockWidth) + marginRow : Number.NaN;
  let height = isStyleDimDefined(child, 'column', blockHeight) ? resolve(child.style.height, blockHeight) + marginColumn : Number.NaN;
  if (!defined(width) || !defined(height)) {
    let wMode: Mode = defined(width) ? EXACTLY : UNDEFINED;
    const hMode: Mode = defined(height) ? EXACTLY : UNDEFINED;
    if (!mainRow && !defined(width) && widthMode !== UNDEFINED && defined(blockWidth) && blockWidth > 0) {
      width = blockWidth;
      wMode = AT_MOST;
    }
    layoutInternal(child, width, height, wMode, hMode, blockWidth, blockHeight, false);
    width = calc(child).measuredWidth + marginRow;
    height = calc(child).measuredHeight + marginColumn;
  }
  layoutInternal(child, width, height, EXACTLY, EXACTLY, blockWidth, blockHeight, true);
  positionAbsolute(parent, child, mainAxis, true);
  positionAbsolute(parent, child, crossOf(mainAxis), false);
}

function positionAbsolute(parent: FlexNode, child: FlexNode, axis: Direction, isMain: boolean): void {
  const c = calc(child);
  const start = startEdge(axis);
  const end = endEdge(axis);
  const startOffset = parent.style.border[start]! + parent.style.padding[start]!;
  const endOffset = parent.style.border[end]! + parent.style.padding[end]!;
  let placement: 'start' | 'end' | 'center';
  if (isMain) {
    const j = parent.style.justifyContent;
    placement = j === 'flex-end' ? 'end' : j === 'center' || j === 'space-around' || j === 'space-evenly' ? 'center' : 'start';
  } else {
    let align = alignOf(parent, child);
    if (parent.style.flexWrap === 'wrap-reverse') align = align === 'flex-end' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end';
    placement = align === 'flex-end' ? 'end' : align === 'center' ? 'center' : 'start';
  }
  const size = measured(child, axis);
  const parentSize = measured(parent, axis);
  if (placement === 'start') c.position[start] = leadingMargin(child, axis) + startOffset;
  else if (placement === 'end') c.position[start] = parentSize - size - (endOffset + trailingMargin(child, axis));
  else c.position[start] = (parentSize - startOffset - endOffset - (size + marginForAxis(child, axis))) / 2 + startOffset + leadingMargin(child, axis);
  if (isReverse(axis)) c.position[end] = parentSize - size - c.position[start]!;
}

function layoutInternal(node: FlexNode, availableWidth: number, availableHeight: number, widthMode: Mode, heightMode: Mode, ownerWidth: number, ownerHeight: number, performLayout: boolean): void {
  const c = calc(node);
  if (!performLayout) {
    const key = `${availableWidth}|${availableHeight}|${widthMode}|${heightMode}|${ownerWidth}|${ownerHeight}`;
    const cached = c.cache.get(key);
    if (cached !== undefined) {
      c.measuredWidth = cached.width;
      c.measuredHeight = cached.height;
      return;
    }
    layoutImpl(node, availableWidth, availableHeight, widthMode, heightMode, ownerWidth, ownerHeight, false);
    c.cache.set(key, { width: c.measuredWidth, height: c.measuredHeight });
    return;
  }
  layoutImpl(node, availableWidth, availableHeight, widthMode, heightMode, ownerWidth, ownerHeight, true);
  c.width = c.measuredWidth;
  c.height = c.measuredHeight;
}

// ── Rounding to the cell grid ───────────────────────────────────────────────────────────

function roundToGrid(value: number, forceCeil: boolean, forceFloor: boolean): number {
  let fraction = value % 1;
  if (fraction < 0) fraction += 1;
  if (same(fraction, 0)) return value - fraction;
  if (same(fraction, 1)) return value - fraction + 1;
  if (forceCeil) return value - fraction + 1;
  if (forceFloor) return value - fraction;
  return value - fraction + (fraction >= 0.5 - EPSILON ? 1 : 0);
}

function round(node: FlexNode, absoluteLeft: number, absoluteTop: number): void {
  const c = calc(node);
  const text = node.measure !== undefined;
  const left = c.position[LEFT]!;
  const top = c.position[TOP]!;
  const absLeft = absoluteLeft + left;
  const absTop = absoluteTop + top;
  const fractionalWidth = !same(c.width % 1, 0) && !same(c.width % 1, 1);
  const fractionalHeight = !same(c.height % 1, 0) && !same(c.height % 1, 1);
  node.layout = {
    left: roundToGrid(left, false, text),
    top: roundToGrid(top, false, text),
    width: roundToGrid(absLeft + c.width, text && fractionalWidth, text && !fractionalWidth) - roundToGrid(absLeft, false, text),
    height: roundToGrid(absTop + c.height, text && fractionalHeight, text && !fractionalHeight) - roundToGrid(absTop, false, text),
  };
  for (const child of node.children) round(child, absLeft, absTop);
}

/**
 * Lay the tree out in a `width` × `height` space (`NaN` for unbounded, as the root's height
 * always is in Ink), and leave every node's whole-cell box in `node.layout`.
 */
export function calculateLayout(root: FlexNode, ownerWidth: number, ownerHeight = Number.NaN): void {
  generation += 1;
  let width = ownerWidth;
  let widthMode: Mode = defined(width) ? EXACTLY : UNDEFINED;
  if (isStyleDimDefined(root, 'row', ownerWidth)) {
    width = resolve(root.style.width, ownerWidth) + marginForAxis(root, 'row');
    widthMode = EXACTLY;
  }
  let height = ownerHeight;
  let heightMode: Mode = defined(height) ? EXACTLY : UNDEFINED;
  if (isStyleDimDefined(root, 'column', ownerHeight)) {
    height = resolve(root.style.height, ownerHeight) + marginForAxis(root, 'column');
    heightMode = EXACTLY;
  }
  layoutInternal(root, width, height, widthMode, heightMode, ownerWidth, ownerHeight, true);
  const c = calc(root);
  c.position = [root.style.margin[LEFT]!, root.style.margin[TOP]!, root.style.margin[RIGHT]!, root.style.margin[BOTTOM]!];
  round(root, 0, 0);
}
