/**
 * R12 — the flexbox subset `controlroom/ink` lays `Box` out with: TypeScript, no yoga.
 *
 * ink lays out with yoga, and ink's own suite asserts yoga's answers to the cell, so this is
 * yoga's algorithm (`CalculateLayout.cpp`, `AbsoluteLayout.cpp`, `Baseline.cpp`,
 * `FlexLine.cpp` and `PixelGrid.cpp` at 3.2.1) for the props ink exposes, step for step and in
 * its own vocabulary — flex basis, flex lines, the two free-space passes, justification,
 * cross and baseline alignment, multi-line alignment, min and max sizes, aspect ratio,
 * relative and absolute insets, `position: static`, the absolute descendants a containing
 * block lays out, and yoga's pixel-grid rounding, which is where a fractional layout becomes
 * the cells a test compares. What is not here is what ink never sets: auto margins,
 * `overflow: scroll`, `display: contents`, RTL, box-sizing and errata. A case that depends on
 * one of those is a conditional case in `compat-oracle`, never a silent pass.
 *
 * Nothing here knows about React, terminals or text: a node is a style, its children, and an
 * optional measure function (a text node's). Constraint 6 holds: nothing outside
 * `controlroom/ink` imports this file.
 */

/** How an available size constrains a node: not at all, exactly, or as a ceiling (yoga's MaxContent, StretchFit, FitContent). */
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
export type Align = 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline' | 'space-between' | 'space-around' | 'space-evenly';
export type Justify = 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
export type Wrap = 'nowrap' | 'wrap' | 'wrap-reverse';

/** Left, top, right, bottom: yoga's physical edge order. */
export type Edges = [number, number, number, number];

export interface FlexStyle {
  position: 'relative' | 'absolute' | 'static';
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
  maxWidth: Length;
  maxHeight: Length;
  /** Width over height; `NaN` when unset. */
  aspectRatio: number;
  margin: Edges;
  padding: Edges;
  border: Edges;
  /** The `left`, `top`, `right` and `bottom` insets. */
  inset: [Length, Length, Length, Length];
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
  maxWidth: undefined,
  maxHeight: undefined,
  aspectRatio: Number.NaN,
  margin: [0, 0, 0, 0],
  padding: [0, 0, 0, 0],
  border: [0, 0, 0, 0],
  inset: [undefined, undefined, undefined, undefined],
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
  /** A leaf that sizes itself: ink's text nodes. yoga rounds such a node as text. */
  measure?: ((width: number, mode: Mode) => Size) | undefined;
  /** Set by `calculateLayout`: the node's box relative to its parent, in whole cells. */
  layout: Box;
  /** Internal to a layout pass. */
  calc?: Calc | undefined;
  /** yoga's `free()`: nothing to release here, but ink calls it and its suite watches the call. */
  free?(): void;
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
const isColumn = (axis: Direction): boolean => !isRow(axis);
const isReverse = (axis: Direction): boolean => axis === 'row-reverse' || axis === 'column-reverse';
/** yoga's `flexStartEdge`: where the axis begins, reversal included. */
const flexStartEdge = (axis: Direction): number => (axis === 'row' ? LEFT : axis === 'row-reverse' ? RIGHT : axis === 'column' ? TOP : BOTTOM);
const flexEndEdge = (axis: Direction): number => (axis === 'row' ? RIGHT : axis === 'row-reverse' ? LEFT : axis === 'column' ? BOTTOM : TOP);
/** yoga's `inlineStartEdge` in LTR: where the axis begins on the page, whatever its reversal. */
const inlineStartEdge = (axis: Direction): number => (isRow(axis) ? LEFT : TOP);
const inlineEndEdge = (axis: Direction): number => (isRow(axis) ? RIGHT : BOTTOM);
const crossOf = (axis: Direction): Direction => (isRow(axis) ? 'column' : 'row');
const defined = (n: number): boolean => !Number.isNaN(n);
const EPSILON = 0.0001;
const same = (a: number, b: number): boolean => (Number.isNaN(a) ? Number.isNaN(b) : Math.abs(a - b) < EPSILON);
/** yoga's `maxOrDefined`: the larger, or whichever is defined. */
const maxOrDefined = (a: number, b: number): number => (defined(a) && defined(b) ? Math.max(a, b) : defined(a) ? a : b);
const minOrDefined = (a: number, b: number): number => (defined(a) && defined(b) ? Math.min(a, b) : defined(a) ? a : b);

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

const sameLength = (a: Length, b: Length): boolean => {
  if (a === undefined || b === undefined) return a === b;
  if (typeof a === 'number' || typeof b === 'number') return typeof a === typeof b && same(a as number, b as number);
  return same(a.percent, b.percent);
};

/** yoga's `processDimensions`: a minimum equal to a defined maximum is the size. */
function processed(node: FlexNode, axis: Direction): Length {
  const { style } = node;
  const [size, min, max] = isRow(axis) ? [style.width, style.minWidth, style.maxWidth] : [style.height, style.minHeight, style.maxHeight];
  return max !== undefined && sameLength(max, min) ? max : size;
}
const minDimension = (node: FlexNode, axis: Direction): Length => (isRow(axis) ? node.style.minWidth : node.style.minHeight);
const maxDimension = (node: FlexNode, axis: Direction): Length => (isRow(axis) ? node.style.maxWidth : node.style.maxHeight);
const measured = (node: FlexNode, axis: Direction): number => (isRow(axis) ? calc(node).measuredWidth : calc(node).measuredHeight);

function setMeasured(node: FlexNode, axis: Direction, value: number): void {
  if (isRow(axis)) calc(node).measuredWidth = value;
  else calc(node).measuredHeight = value;
}

const flexStartMargin = (node: FlexNode, axis: Direction): number => node.style.margin[flexStartEdge(axis)]!;
const flexEndMargin = (node: FlexNode, axis: Direction): number => node.style.margin[flexEndEdge(axis)]!;
const marginForAxis = (node: FlexNode, axis: Direction): number => node.style.margin[inlineStartEdge(axis)]! + node.style.margin[inlineEndEdge(axis)]!;
const flexStartPaddingAndBorder = (node: FlexNode, axis: Direction): number => node.style.padding[flexStartEdge(axis)]! + node.style.border[flexStartEdge(axis)]!;
const flexEndPaddingAndBorder = (node: FlexNode, axis: Direction): number => node.style.padding[flexEndEdge(axis)]! + node.style.border[flexEndEdge(axis)]!;
const paddingAndBorderForAxis = (node: FlexNode, axis: Direction): number =>
  node.style.padding[inlineStartEdge(axis)]! + node.style.border[inlineStartEdge(axis)]! + node.style.padding[inlineEndEdge(axis)]! + node.style.border[inlineEndEdge(axis)]!;
const dimensionWithMargin = (node: FlexNode, axis: Direction): number => measured(node, axis) + marginForAxis(node, axis);
const gapFor = (node: FlexNode, axis: Direction): number => (isRow(axis) ? node.style.columnGap : node.style.rowGap);
const borderForAxis = (node: FlexNode, axis: Direction): number => node.style.border[inlineStartEdge(axis)]! + node.style.border[inlineEndEdge(axis)]!;

/** An inset on a physical edge, resolved; 0 when unset, as yoga's `compute*Position` gives it. */
const insetAt = (node: FlexNode, edge: number, axisSize: number): number => {
  const value = resolve(node.style.inset[edge], axisSize);
  return defined(value) ? value : 0;
};
const insetDefined = (node: FlexNode, edge: number): boolean => node.style.inset[edge] !== undefined;
const horizontalInsetsDefined = (node: FlexNode): boolean => insetDefined(node, LEFT) || insetDefined(node, RIGHT);
const verticalInsetsDefined = (node: FlexNode): boolean => insetDefined(node, TOP) || insetDefined(node, BOTTOM);

/** yoga's `relativePosition`: the inline-start inset, else minus the inline-end one; nothing for `static`. */
function relativePosition(node: FlexNode, axis: Direction, axisSize: number): number {
  if (node.style.position === 'static') return 0;
  if (insetDefined(node, inlineStartEdge(axis))) return insetAt(node, inlineStartEdge(axis), axisSize);
  return -insetAt(node, inlineEndEdge(axis), axisSize);
}

/** yoga's `Node::setPosition`: margins plus the relative offset, on each axis's two edges. */
function setInitialPosition(node: FlexNode, parentDirection: Direction, ownerWidth: number, ownerHeight: number): void {
  const c = calc(node);
  const mainAxis = parentDirection;
  const crossAxis = crossOf(mainAxis);
  const relativeMain = relativePosition(node, mainAxis, isRow(mainAxis) ? ownerWidth : ownerHeight);
  const relativeCross = relativePosition(node, crossAxis, isRow(mainAxis) ? ownerHeight : ownerWidth);
  for (const [axis, relative] of [
    [mainAxis, relativeMain],
    [crossAxis, relativeCross],
  ] as const) {
    c.position[inlineStartEdge(axis)] = node.style.margin[inlineStartEdge(axis)]! + relative;
    c.position[inlineEndEdge(axis)] = node.style.margin[inlineEndEdge(axis)]! + relative;
  }
}

/** yoga's `hasDefiniteLength`: a resolved, non-negative size on the axis. */
function hasDefiniteLength(node: FlexNode, axis: Direction, owner: number): boolean {
  const value = resolve(processed(node, axis), owner);
  return defined(value) && value >= 0;
}

const resolvedDimension = (node: FlexNode, axis: Direction, owner: number): number => resolve(processed(node, axis), owner);

function boundWithinMinAndMax(node: FlexNode, axis: Direction, value: number, axisSize: number): number {
  const min = resolve(minDimension(node, axis), axisSize);
  const max = resolve(maxDimension(node, axis), axisSize);
  if (defined(max) && max >= 0 && value > max) return max;
  if (defined(min) && min >= 0 && value < min) return min;
  return value;
}

function bound(node: FlexNode, axis: Direction, value: number, axisSize: number): number {
  return maxOrDefined(boundWithinMinAndMax(node, axis, value, axisSize), paddingAndBorderForAxis(node, axis));
}

/** yoga's `constrainMaxSizeForMode`: a maximum caps a size and turns an unbounded measure into a ceiling. */
function constrainMaxSize(node: FlexNode, axis: Direction, ownerAxisSize: number, mode: Mode, size: number): { mode: Mode; size: number } {
  const max = resolve(maxDimension(node, axis), ownerAxisSize) + marginForAxis(node, axis);
  if (mode === EXACTLY || mode === AT_MOST) return { mode, size: !defined(max) || size < max ? size : max };
  return defined(max) ? { mode: AT_MOST, size: max } : { mode, size };
}

function alignOf(parent: FlexNode, child: FlexNode): Align {
  const align = child.style.alignSelf === 'auto' ? parent.style.alignItems : child.style.alignSelf;
  return align === 'baseline' && isColumn(parent.style.flexDirection) ? 'flex-start' : align;
}

const inFlow = (node: FlexNode): boolean => node.style.display !== 'none' && node.style.position !== 'absolute';
const flexible = (node: FlexNode): boolean => node.style.position !== 'absolute' && (node.style.flexGrow !== 0 || node.style.flexShrink !== 0);

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
  if (widthMode === EXACTLY && heightMode === EXACTLY) {
    setMeasured(node, 'row', bound(node, 'row', width, ownerWidth));
    setMeasured(node, 'column', bound(node, 'column', height, ownerHeight));
    return;
  }
  const inner = defined(width) ? maxOrDefined(0, width - pbRow) : width;
  const size = measure(inner, widthMode);
  setMeasured(node, 'row', bound(node, 'row', widthMode === EXACTLY ? width : size.width + pbRow, ownerWidth));
  setMeasured(node, 'column', bound(node, 'column', heightMode === EXACTLY ? height : size.height + pbColumn, ownerHeight));
}

function measureEmpty(node: FlexNode, availableWidth: number, availableHeight: number, widthMode: Mode, heightMode: Mode, ownerWidth: number, ownerHeight: number): void {
  const width = widthMode === EXACTLY ? availableWidth : paddingAndBorderForAxis(node, 'row');
  const height = heightMode === EXACTLY ? availableHeight : paddingAndBorderForAxis(node, 'column');
  setMeasured(node, 'row', bound(node, 'row', width, ownerWidth));
  setMeasured(node, 'column', bound(node, 'column', height, ownerHeight));
}

function measureFixed(node: FlexNode, availableWidth: number, availableHeight: number, widthMode: Mode, heightMode: Mode, ownerWidth: number, ownerHeight: number): boolean {
  const zeroWidth = defined(availableWidth) && widthMode === AT_MOST && availableWidth <= 0;
  const zeroHeight = defined(availableHeight) && heightMode === AT_MOST && availableHeight <= 0;
  if (!zeroWidth && !zeroHeight && !(widthMode === EXACTLY && heightMode === EXACTLY)) return false;
  const width = !defined(availableWidth) || (widthMode === AT_MOST && availableWidth < 0) ? 0 : availableWidth;
  const height = !defined(availableHeight) || (heightMode === AT_MOST && availableHeight < 0) ? 0 : availableHeight;
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
  const rowDefined = hasDefiniteLength(child, 'row', ownerWidth);
  const columnDefined = hasDefiniteLength(child, 'column', ownerHeight);
  const c = calc(child);
  if (defined(basis) && defined(mainSize)) {
    if (!defined(c.flexBasis)) c.flexBasis = maxOrDefined(basis, paddingAndBorderForAxis(child, mainAxis));
    return;
  }
  if (mainRow && rowDefined) {
    c.flexBasis = maxOrDefined(resolvedDimension(child, 'row', ownerWidth), paddingAndBorderForAxis(child, 'row'));
    return;
  }
  if (!mainRow && columnDefined) {
    c.flexBasis = maxOrDefined(resolvedDimension(child, 'column', ownerHeight), paddingAndBorderForAxis(child, 'column'));
    return;
  }
  let childWidth = Number.NaN;
  let childHeight = Number.NaN;
  let childWidthMode: Mode = UNDEFINED;
  let childHeightMode: Mode = UNDEFINED;
  const marginRow = marginForAxis(child, 'row');
  const marginColumn = marginForAxis(child, 'column');
  if (rowDefined) {
    childWidth = resolvedDimension(child, 'row', ownerWidth) + marginRow;
    childWidthMode = EXACTLY;
  }
  if (columnDefined) {
    childHeight = resolvedDimension(child, 'column', ownerHeight) + marginColumn;
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
  const ratio = child.style.aspectRatio;
  if (defined(ratio)) {
    if (!mainRow && childWidthMode === EXACTLY) {
      childHeight = marginColumn + (childWidth - marginRow) / ratio;
      childHeightMode = EXACTLY;
    } else if (mainRow && childHeightMode === EXACTLY) {
      childWidth = marginRow + (childHeight - marginColumn) * ratio;
      childWidthMode = EXACTLY;
    }
  }
  const stretches = alignOf(parent, child) === 'stretch';
  if (!mainRow && !rowDefined && defined(width) && widthMode === EXACTLY && stretches && childWidthMode !== EXACTLY) {
    childWidth = width;
    childWidthMode = EXACTLY;
    if (defined(ratio)) {
      childHeight = (childWidth - marginRow) / ratio;
      childHeightMode = EXACTLY;
    }
  }
  if (mainRow && !columnDefined && defined(height) && heightMode === EXACTLY && stretches && childHeightMode !== EXACTLY) {
    childHeight = height;
    childHeightMode = EXACTLY;
    if (defined(ratio)) {
      childWidth = (childHeight - marginColumn) * ratio;
      childWidthMode = EXACTLY;
    }
  }
  ({ mode: childWidthMode, size: childWidth } = constrainMaxSize(child, 'row', ownerWidth, childWidthMode, childWidth));
  ({ mode: childHeightMode, size: childHeight } = constrainMaxSize(child, 'column', ownerHeight, childHeightMode, childHeight));
  layoutInternal(child, childWidth, childHeight, childWidthMode, childHeightMode, ownerWidth, ownerHeight, false);
  c.flexBasis = maxOrDefined(measured(child, mainAxis), paddingAndBorderForAxis(child, mainAxis));
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
    const leadingGap = line.items.length === 0 ? 0 : gap;
    const basis = boundWithinMinAndMax(child, mainAxis, c.flexBasis, mainOwnerSize);
    const outer = basis + marginForAxis(child, mainAxis) + leadingGap;
    if (line.sizeConsumed + outer > availableInnerMain && wraps && line.items.length > 0) break;
    c.lineIndex = lineIndex;
    line.sizeConsumed += outer;
    if (flexible(child)) {
      line.totalGrow += child.style.flexGrow;
      line.totalShrinkScaled += -child.style.flexShrink * c.flexBasis;
    }
    line.items.push(child);
  }
  if (line.totalGrow > 0 && line.totalGrow < 1) line.totalGrow = 1;
  if (line.totalShrinkScaled > 0 && line.totalShrinkScaled < 1) line.totalShrinkScaled = 1;
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
      if (defined(scaled) && scaled !== 0) {
        const base = basis + (line.remainingFreeSpace / line.totalShrinkScaled) * scaled;
        const bounded = bound(child, mainAxis, base, availableInnerMain);
        if (defined(base) && defined(bounded) && base !== bounded) {
          delta += bounded - basis;
          line.totalShrinkScaled -= -child.style.flexShrink * c.flexBasis;
        }
      }
    } else if (defined(line.remainingFreeSpace) && line.remainingFreeSpace > 0) {
      const grow = child.style.flexGrow;
      if (defined(grow) && grow !== 0) {
        const base = basis + (line.remainingFreeSpace / line.totalGrow) * grow;
        const bounded = bound(child, mainAxis, base, availableInnerMain);
        if (defined(base) && defined(bounded) && base !== bounded) {
          delta += bounded - basis;
          line.totalGrow -= grow;
        }
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
    if (defined(line.remainingFreeSpace) && line.remainingFreeSpace < 0) {
      const scaled = -child.style.flexShrink * basis;
      if (scaled !== 0) {
        const size = defined(line.totalShrinkScaled) && line.totalShrinkScaled === 0 ? basis + scaled : basis + (line.remainingFreeSpace / line.totalShrinkScaled) * scaled;
        mainSize = bound(child, mainAxis, size, availableInnerMain);
      }
    } else if (defined(line.remainingFreeSpace) && line.remainingFreeSpace > 0) {
      const grow = child.style.flexGrow;
      if (!Number.isNaN(grow) && grow !== 0) mainSize = bound(child, mainAxis, basis + (line.remainingFreeSpace / line.totalGrow) * grow, availableInnerMain);
    }
    delta += mainSize - basis;
    const marginMain = marginForAxis(child, mainAxis);
    const marginCross = marginForAxis(child, crossAxis);
    let childMain = mainSize + marginMain;
    let childMainMode: Mode = EXACTLY;
    let childCross: number;
    let childCrossMode: Mode;
    const stretches = alignOf(node, child) === 'stretch';
    const crossDefined = hasDefiniteLength(child, crossAxis, availableInnerCross);
    const ratio = child.style.aspectRatio;
    if (defined(ratio)) {
      childCross = (mainRow ? (childMain - marginMain) / ratio : (childMain - marginMain) * ratio) + marginCross;
      childCrossMode = EXACTLY;
    } else if (!Number.isNaN(availableInnerCross) && !crossDefined && crossMode === EXACTLY && !(wraps && mainOverflows) && stretches) {
      childCross = availableInnerCross;
      childCrossMode = EXACTLY;
    } else if (!crossDefined) {
      childCross = availableInnerCross;
      childCrossMode = defined(childCross) ? AT_MOST : UNDEFINED;
    } else {
      childCross = resolvedDimension(child, crossAxis, availableInnerCross) + marginCross;
      const loose = typeof processed(child, crossAxis) === 'object' && crossMode !== EXACTLY;
      childCrossMode = !defined(childCross) || loose ? UNDEFINED : EXACTLY;
    }
    ({ mode: childMainMode, size: childMain } = constrainMaxSize(child, mainAxis, availableInnerMain, childMainMode, childMain));
    ({ mode: childCrossMode, size: childCross } = constrainMaxSize(child, crossAxis, availableInnerCross, childCrossMode, childCross));
    const requiresStretch = !crossDefined && stretches;
    const pass = performLayout && !requiresStretch;
    layoutInternal(child, mainRow ? childMain : childCross, mainRow ? childCross : childMain, mainRow ? childMainMode : childCrossMode, mainRow ? childCrossMode : childMainMode, availableInnerWidth, availableInnerHeight, pass);
  }
  return delta;
}

// ── Baselines ───────────────────────────────────────────────────────────────────────────

/** yoga's `calculateBaseline`: the first line's baseline child, else its first, else the height. */
function baselineOf(node: FlexNode): number {
  let baselineChild: FlexNode | undefined;
  for (const child of node.children) {
    if (child.style.display === 'none') continue;
    if (calc(child).lineIndex > 0) break;
    if (child.style.position === 'absolute') continue;
    if (alignOf(node, child) === 'baseline') {
      baselineChild = child;
      break;
    }
    baselineChild ??= child;
  }
  if (baselineChild === undefined) return calc(node).measuredHeight;
  return baselineOf(baselineChild) + calc(baselineChild).position[TOP]!;
}

function isBaselineLayout(node: FlexNode): boolean {
  if (isColumn(node.style.flexDirection)) return false;
  if (node.style.alignItems === 'baseline') return true;
  return node.children.some((child) => child.style.display !== 'none' && child.style.position !== 'absolute' && child.style.alignSelf === 'baseline');
}

// ── Justification ───────────────────────────────────────────────────────────────────────

function justify(node: FlexNode, line: Line, mainMode: Mode, crossMode: Mode, mainOwnerSize: number, availableInnerMain: number, availableInnerCross: number, performLayout: boolean): void {
  const mainAxis = node.style.flexDirection;
  const crossAxis = crossOf(mainAxis);
  const leadingPb = flexStartPaddingAndBorder(node, mainAxis);
  const trailingPb = flexEndPaddingAndBorder(node, mainAxis);
  const gap = gapFor(node, mainAxis);
  if (mainMode === AT_MOST && line.remainingFreeSpace > 0) {
    const min = resolve(minDimension(node, mainAxis), mainOwnerSize);
    if (minDimension(node, mainAxis) !== undefined && defined(min)) {
      const minAvailable = min - leadingPb - trailingPb;
      const occupied = availableInnerMain - line.remainingFreeSpace;
      line.remainingFreeSpace = maxOrDefined(0, minAvailable - occupied);
    } else {
      line.remainingFreeSpace = 0;
    }
  }
  const count = line.items.length;
  const free = line.remainingFreeSpace;
  let leading = 0;
  let between = gap;
  let justifyContent = node.style.justifyContent;
  if (!(free >= 0) && (justifyContent === 'space-between' || justifyContent === 'space-around' || justifyContent === 'space-evenly')) justifyContent = 'flex-start';
  switch (justifyContent) {
    case 'center':
      leading = free / 2;
      break;
    case 'flex-end':
      leading = free;
      break;
    case 'space-between':
      if (count > 1) between += free / (count - 1);
      break;
    case 'space-evenly':
      leading = free / (count + 1);
      between += leading;
      break;
    case 'space-around':
      leading = (0.5 * free) / count;
      between += leading * 2;
      break;
    default:
      break;
  }
  line.mainDim = leadingPb + leading;
  line.crossDim = 0;
  let maxAscent = 0;
  let maxDescent = 0;
  const baseline = isBaselineLayout(node);
  const last = line.items.at(-1);
  const canSkipFlex = !performLayout && crossMode === EXACTLY;
  for (const child of line.items) {
    const c = calc(child);
    if (performLayout) c.position[flexStartEdge(mainAxis)] = c.position[flexStartEdge(mainAxis)]! + line.mainDim;
    if (child !== last) line.mainDim += between;
    if (canSkipFlex) {
      line.mainDim += marginForAxis(child, mainAxis) + c.flexBasis;
      line.crossDim = availableInnerCross;
    } else {
      line.mainDim += dimensionWithMargin(child, mainAxis);
      if (baseline) {
        const ascent = baselineOf(child) + flexStartMargin(child, 'column');
        const descent = measured(child, 'column') + marginForAxis(child, 'column') - ascent;
        maxAscent = maxOrDefined(maxAscent, ascent);
        maxDescent = maxOrDefined(maxDescent, descent);
      } else {
        line.crossDim = maxOrDefined(line.crossDim, dimensionWithMargin(child, crossAxis));
      }
    }
  }
  line.mainDim += trailingPb;
  if (baseline) line.crossDim = maxAscent + maxDescent;
}

// ── The layout of one node ──────────────────────────────────────────────────────────────

function availableInner(node: FlexNode, axis: Direction, available: number, owner: number): number {
  const pb = paddingAndBorderForAxis(node, axis);
  let inner = available - pb;
  if (!defined(inner)) return inner;
  const min = resolve(minDimension(node, axis), owner);
  const max = resolve(maxDimension(node, axis), owner);
  const minInner = defined(min) ? min - pb : 0;
  const maxInner = defined(max) ? max - pb : Number.MAX_VALUE;
  inner = maxOrDefined(minOrDefined(inner, maxInner), minInner);
  return inner;
}

function layoutImpl(node: FlexNode, availableWidth: number, availableHeight: number, widthMode: Mode, heightMode: Mode, ownerWidth: number, ownerHeight: number, performLayout: boolean, depth: number): void {
  const marginRow = marginForAxis(node, 'row');
  const marginColumn = marginForAxis(node, 'column');
  if (node.measure !== undefined) {
    measureLeaf(node, availableWidth - marginRow, availableHeight - marginColumn, widthMode, heightMode, ownerWidth, ownerHeight);
    return;
  }
  if (node.children.length === 0) {
    measureEmpty(node, availableWidth - marginRow, availableHeight - marginColumn, widthMode, heightMode, ownerWidth, ownerHeight);
    return;
  }
  if (!performLayout && measureFixed(node, availableWidth - marginRow, availableHeight - marginColumn, widthMode, heightMode, ownerWidth, ownerHeight)) return;

  const { style } = node;
  const mainAxis = style.flexDirection;
  const crossAxis = crossOf(mainAxis);
  const mainRow = isRow(mainAxis);
  const wraps = style.flexWrap !== 'nowrap';
  const mainOwnerSize = mainRow ? ownerWidth : ownerHeight;
  const crossOwnerSize = mainRow ? ownerHeight : ownerWidth;
  const pbMain = paddingAndBorderForAxis(node, mainAxis);
  const pbCross = paddingAndBorderForAxis(node, crossAxis);
  const leadingPbCross = flexStartPaddingAndBorder(node, crossAxis);
  let mainMode = mainRow ? widthMode : heightMode;
  const crossMode = mainRow ? heightMode : widthMode;
  const pbRow = mainRow ? pbMain : pbCross;
  const pbColumn = mainRow ? pbCross : pbMain;

  const availableInnerWidth = availableInner(node, 'row', availableWidth - marginRow, ownerWidth);
  const availableInnerHeight = availableInner(node, 'column', availableHeight - marginColumn, ownerHeight);
  let availableInnerMain = mainRow ? availableInnerWidth : availableInnerHeight;
  const availableInnerCross = mainRow ? availableInnerHeight : availableInnerWidth;

  // Step 3: every child's flex basis.
  let single: FlexNode | undefined;
  if (mainMode === EXACTLY) {
    for (const child of node.children) {
      if (!flexible(child)) continue;
      if (single !== undefined || same(child.style.flexGrow, 0) || same(child.style.flexShrink, 0)) {
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
    if (performLayout) setInitialPosition(child, mainAxis, availableInnerWidth, availableInnerHeight);
    if (child.style.position === 'absolute') continue;
    if (child === single) calc(child).flexBasis = 0;
    else computeFlexBasis(node, child, availableInnerWidth, widthMode, availableInnerHeight, heightMode, availableInnerWidth, availableInnerHeight);
    totalMain += calc(child).flexBasis + marginForAxis(child, mainAxis);
  }
  if (node.children.length > 1) totalMain += gapFor(node, mainAxis) * (node.children.length - 1);
  const mainOverflows = mainMode !== UNDEFINED && totalMain > availableInnerMain;
  if (wraps && mainOverflows && mainMode === AT_MOST) mainMode = EXACTLY;

  // Step 4: the lines, each flexed, justified and aligned on the cross axis.
  let lineCount = 0;
  let totalLineCross = 0;
  let maxLineMain = 0;
  const crossGap = gapFor(node, crossAxis);
  for (let start = 0; start < node.children.length; lineCount += 1) {
    const line = collectLine(node, start, lineCount, mainOwnerSize, availableInnerMain);
    start = line.end;
    const canSkipFlex = !performLayout && crossMode === EXACTLY;
    let sizedByContent = false;
    if (mainMode !== EXACTLY) {
      const minInnerWidth = resolve(style.minWidth, ownerWidth) - pbRow;
      const maxInnerWidth = resolve(style.maxWidth, ownerWidth) - pbRow;
      const minInnerHeight = resolve(style.minHeight, ownerHeight) - pbColumn;
      const maxInnerHeight = resolve(style.maxHeight, ownerHeight) - pbColumn;
      const minInnerMain = mainRow ? minInnerWidth : minInnerHeight;
      const maxInnerMain = mainRow ? maxInnerWidth : maxInnerHeight;
      if (defined(minInnerMain) && line.sizeConsumed < minInnerMain) availableInnerMain = minInnerMain;
      else if (defined(maxInnerMain) && line.sizeConsumed > maxInnerMain) availableInnerMain = maxInnerMain;
      else {
        // The root never grows (yoga's `resolveFlexGrow` is 0 without an owner).
        if (line.totalGrow === 0 || node.style.flexGrow === 0 || depth === 1) availableInnerMain = line.sizeConsumed;
        sizedByContent = true;
      }
    }
    if (!sizedByContent && defined(availableInnerMain)) line.remainingFreeSpace = availableInnerMain - line.sizeConsumed;
    else if (line.sizeConsumed < 0) line.remainingFreeSpace = -line.sizeConsumed;

    if (!canSkipFlex) {
      const original = line.remainingFreeSpace;
      // The first pass freezes the items a bound stops, so the second shares only what is left.
      distributeFirstPass(line, mainAxis, mainOwnerSize, availableInnerMain);
      const distributed = distributeSecondPass({
        node,
        line,
        mainOwnerSize,
        availableInnerMain,
        availableInnerCross,
        availableInnerWidth,
        availableInnerHeight,
        mainOverflows,
        crossMode,
        performLayout,
      });
      line.remainingFreeSpace = original - distributed;
    }

    justify(node, line, mainMode, crossMode, mainOwnerSize, availableInnerMain, availableInnerCross, performLayout);

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
          if (!hasDefiniteLength(child, crossAxis, availableInnerCross)) {
            let childMain = measured(child, mainAxis);
            const ratio = child.style.aspectRatio;
            let childCross = defined(ratio) ? marginForAxis(child, crossAxis) + (mainRow ? childMain / ratio : childMain * ratio) : line.crossDim;
            childMain += marginForAxis(child, mainAxis);
            let childMainMode: Mode = EXACTLY;
            let childCrossMode: Mode = EXACTLY;
            ({ mode: childMainMode, size: childMain } = constrainMaxSize(child, mainAxis, availableInnerMain, childMainMode, childMain));
            ({ mode: childCrossMode, size: childCross } = constrainMaxSize(child, crossAxis, availableInnerCross, childCrossMode, childCross));
            const width = mainRow ? childMain : childCross;
            const height = mainRow ? childCross : childMain;
            const crossDoesNotGrow = style.alignContent !== 'stretch' && wraps;
            const wMode: Mode = !defined(width) || (!mainRow && crossDoesNotGrow) ? UNDEFINED : EXACTLY;
            const hMode: Mode = !defined(height) || (mainRow && crossDoesNotGrow) ? UNDEFINED : EXACTLY;
            layoutInternal(child, width, height, wMode, hMode, availableInnerWidth, availableInnerHeight, true);
          }
        } else {
          const remaining = containerCross - dimensionWithMargin(child, crossAxis);
          if (align === 'flex-start') {
            // No-op.
          } else if (align === 'center') leadingCross += remaining / 2;
          else leadingCross += remaining;
        }
        const edge = flexStartEdge(crossAxis);
        c.position[edge] = c.position[edge]! + totalLineCross + leadingCross;
      }
    }
    totalLineCross += line.crossDim + (lineCount !== 0 ? crossGap : 0);
    maxLineMain = maxOrDefined(maxLineMain, line.mainDim);
  }

  // Step 8: multi-line alignment.
  if (performLayout && (wraps || isBaselineLayout(node))) alignLines(node, lineCount, { crossMode, availableInnerCross, pbCross, crossOwnerSize, ownerHeight, totalLineCross, availableInnerWidth, availableInnerHeight, leadingPbCross });

  // Step 9: this node's own size.
  setMeasured(node, 'row', bound(node, 'row', availableWidth - marginRow, ownerWidth));
  setMeasured(node, 'column', bound(node, 'column', availableHeight - marginColumn, ownerHeight));
  if (mainMode === UNDEFINED || mainMode === AT_MOST) setMeasured(node, mainAxis, bound(node, mainAxis, maxLineMain, mainOwnerSize));
  if (crossMode === UNDEFINED || crossMode === AT_MOST) setMeasured(node, crossAxis, bound(node, crossAxis, totalLineCross + pbCross, crossOwnerSize));

  if (!performLayout) return;
  if (style.flexWrap === 'wrap-reverse') {
    const edge = flexStartEdge(crossAxis);
    for (const child of node.children) {
      if (child.style.position === 'absolute') continue;
      const c = calc(child);
      c.position[edge] = measured(node, crossAxis) - c.position[edge]! - measured(child, crossAxis);
    }
  }
  // Step 10: a reversed axis is laid out from its far edge.
  if (isReverse(mainAxis) || isReverse(crossAxis)) {
    for (const child of node.children) {
      if (child.style.display === 'none' || child.style.position === 'absolute') continue;
      if (isReverse(mainAxis)) setTrailingPosition(node, child, mainAxis);
      if (isReverse(crossAxis)) setTrailingPosition(node, child, crossAxis);
    }
  }
  // Step 11: a containing block lays out its absolute descendants.
  if (style.position !== 'static' || depth === 1) layoutAbsoluteDescendants(node, node, mainRow ? mainMode : crossMode, 0, 0);
}

function setTrailingPosition(node: FlexNode, child: FlexNode, axis: Direction): void {
  const c = calc(child);
  c.position[flexEndEdge(axis)] = measured(node, axis) - measured(child, axis) - c.position[flexStartEdge(axis)]!;
}

interface Lines {
  crossMode: Mode;
  availableInnerCross: number;
  pbCross: number;
  crossOwnerSize: number;
  ownerHeight: number;
  totalLineCross: number;
  availableInnerWidth: number;
  availableInnerHeight: number;
  leadingPbCross: number;
}

function alignLines(node: FlexNode, lineCount: number, { crossMode, availableInnerCross, pbCross, crossOwnerSize, ownerHeight, totalLineCross, availableInnerWidth, availableInnerHeight, leadingPbCross }: Lines): void {
  const mainAxis = node.style.flexDirection;
  const crossAxis = crossOf(mainAxis);
  const mainRow = isRow(mainAxis);
  const crossGap = gapFor(node, crossAxis);
  let leadPerLine = 0;
  let currentLead = leadingPbCross;
  let extraSpacePerLine = 0;
  const unclamped =
    crossMode === EXACTLY ? availableInnerCross + pbCross : hasDefiniteLength(node, crossAxis, crossOwnerSize) ? resolvedDimension(node, crossAxis, crossOwnerSize) : totalLineCross + pbCross;
  const innerCross = bound(node, crossAxis, unclamped, ownerHeight) - pbCross;
  const remaining = innerCross - totalLineCross;
  let alignContent = node.style.alignContent;
  if (!(remaining >= 0)) {
    if (alignContent === 'space-between' || alignContent === 'stretch' || alignContent === 'space-around' || alignContent === 'space-evenly') alignContent = 'flex-start';
  }
  switch (alignContent) {
    case 'flex-end':
      currentLead += remaining;
      break;
    case 'center':
      currentLead += remaining / 2;
      break;
    case 'stretch':
      extraSpacePerLine = remaining / lineCount;
      break;
    case 'space-around':
      currentLead += remaining / (2 * lineCount);
      leadPerLine = remaining / lineCount;
      break;
    case 'space-evenly':
      currentLead += remaining / (lineCount + 1);
      leadPerLine = remaining / (lineCount + 1);
      break;
    case 'space-between':
      if (lineCount > 1) leadPerLine = remaining / (lineCount - 1);
      break;
    default:
      break;
  }
  let end = 0;
  for (let i = 0; i < lineCount; i += 1) {
    const start = end;
    let index = start;
    let lineHeight = 0;
    let maxAscent = 0;
    let maxDescent = 0;
    for (; index < node.children.length; index += 1) {
      const child = node.children[index]!;
      if (child.style.display === 'none') continue;
      if (child.style.position === 'absolute') continue;
      if (calc(child).lineIndex !== i) break;
      const size = measured(child, crossAxis);
      if (defined(size) && size >= 0) lineHeight = maxOrDefined(lineHeight, size + marginForAxis(child, crossAxis));
      if (alignOf(node, child) === 'baseline') {
        const ascent = baselineOf(child) + flexStartMargin(child, 'column');
        const descent = measured(child, 'column') + marginForAxis(child, 'column') - ascent;
        maxAscent = maxOrDefined(maxAscent, ascent);
        maxDescent = maxOrDefined(maxDescent, descent);
        lineHeight = maxOrDefined(lineHeight, maxAscent + maxDescent);
      }
    }
    end = index;
    currentLead += i !== 0 ? crossGap : 0;
    lineHeight += extraSpacePerLine;
    for (let at = start; at < end; at += 1) {
      const child = node.children[at]!;
      if (child.style.display === 'none' || child.style.position === 'absolute') continue;
      const c = calc(child);
      const edge = flexStartEdge(crossAxis);
      switch (alignOf(node, child)) {
        case 'flex-start':
          c.position[edge] = currentLead + insetAt(child, flexStartEdge(crossAxis), availableInnerWidth);
          break;
        case 'flex-end':
          c.position[edge] = currentLead + lineHeight - flexEndMargin(child, crossAxis) - measured(child, crossAxis);
          break;
        case 'center':
          c.position[edge] = currentLead + (lineHeight - measured(child, crossAxis)) / 2;
          break;
        case 'stretch': {
          c.position[edge] = currentLead + flexStartMargin(child, crossAxis);
          if (!hasDefiniteLength(child, crossAxis, availableInnerCross)) {
            const width = mainRow ? c.measuredWidth + marginForAxis(child, mainAxis) : leadPerLine + lineHeight;
            const height = !mainRow ? c.measuredHeight + marginForAxis(child, crossAxis) : leadPerLine + lineHeight;
            if (!(same(width, c.measuredWidth) && same(height, c.measuredHeight))) layoutInternal(child, width, height, EXACTLY, EXACTLY, availableInnerWidth, availableInnerHeight, true);
          }
          break;
        }
        case 'baseline':
          c.position[TOP] = currentLead + maxAscent - baselineOf(child) + insetAt(child, TOP, availableInnerCross);
          break;
        default:
          break;
      }
    }
    currentLead = currentLead + leadPerLine + lineHeight;
  }
}

// ── Absolute children ───────────────────────────────────────────────────────────────────

function oppositeEdge(position: number, axis: Direction, containing: FlexNode, child: FlexNode): number {
  return measured(containing, axis) - measured(child, axis) - position;
}

function setFlexStartPosition(parent: FlexNode, child: FlexNode, axis: Direction): void {
  calc(child).position[flexStartEdge(axis)] = flexStartMargin(child, axis) + parent.style.border[flexStartEdge(axis)]! + parent.style.padding[flexStartEdge(axis)]!;
}

function setFlexEndPosition(parent: FlexNode, child: FlexNode, axis: Direction): void {
  const end = parent.style.border[flexEndEdge(axis)]! + flexEndMargin(child, axis) + parent.style.padding[flexEndEdge(axis)]!;
  calc(child).position[flexStartEdge(axis)] = oppositeEdge(end, axis, parent, child);
}

function setCenterPosition(parent: FlexNode, child: FlexNode, axis: Direction): void {
  const content = measured(parent, axis) - parent.style.border[flexStartEdge(axis)]! - parent.style.border[flexEndEdge(axis)]! - parent.style.padding[flexStartEdge(axis)]! - parent.style.padding[flexEndEdge(axis)]!;
  const outer = measured(child, axis) + marginForAxis(child, axis);
  calc(child).position[flexStartEdge(axis)] = (content - outer) / 2 + parent.style.border[flexStartEdge(axis)]! + flexStartMargin(child, axis) + parent.style.padding[flexStartEdge(axis)]!;
}

function positionAbsolute(containing: FlexNode, parent: FlexNode, child: FlexNode, axis: Direction, isMain: boolean, blockWidth: number, blockHeight: number): void {
  const blockSize = isRow(axis) ? blockWidth : blockHeight;
  const c = calc(child);
  const start = inlineStartEdge(axis);
  const end = inlineEndEdge(axis);
  if (insetDefined(child, start)) {
    const fromStart = insetAt(child, start, blockSize) + containing.style.border[start]! + child.style.margin[start]!;
    c.position[flexStartEdge(axis)] = start !== flexStartEdge(axis) ? oppositeEdge(fromStart, axis, containing, child) : fromStart;
  } else if (insetDefined(child, end)) {
    const fromStart = measured(containing, axis) - measured(child, axis) - containing.style.border[end]! - child.style.margin[end]! - insetAt(child, end, blockSize);
    c.position[flexStartEdge(axis)] = start !== flexStartEdge(axis) ? oppositeEdge(fromStart, axis, containing, child) : fromStart;
  } else if (isMain) {
    const j = parent.style.justifyContent;
    if (j === 'flex-end') setFlexEndPosition(parent, child, axis);
    else if (j === 'center' || j === 'space-around' || j === 'space-evenly') setCenterPosition(parent, child, axis);
    else setFlexStartPosition(parent, child, axis);
  } else {
    let align = alignOf(parent, child);
    if (parent.style.flexWrap === 'wrap-reverse') align = align === 'flex-end' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end';
    if (align === 'flex-end') setFlexEndPosition(parent, child, axis);
    else if (align === 'center') setCenterPosition(parent, child, axis);
    else setFlexStartPosition(parent, child, axis);
  }
}

function layoutAbsoluteChild(containing: FlexNode, parent: FlexNode, child: FlexNode, blockWidth: number, blockHeight: number, widthMode: Mode): void {
  const mainAxis = parent.style.flexDirection;
  const mainRow = isRow(mainAxis);
  const marginRow = marginForAxis(child, 'row');
  const marginColumn = marginForAxis(child, 'column');
  let width = Number.NaN;
  let height = Number.NaN;
  if (hasDefiniteLength(child, 'row', blockWidth)) width = resolvedDimension(child, 'row', blockWidth) + marginRow;
  else if (insetDefined(child, LEFT) && insetDefined(child, RIGHT)) {
    width = measured(containing, 'row') - borderForAxis(containing, 'row') - (insetAt(child, LEFT, blockWidth) + insetAt(child, RIGHT, blockWidth));
    width = bound(child, 'row', width, blockWidth);
  }
  if (hasDefiniteLength(child, 'column', blockHeight)) height = resolvedDimension(child, 'column', blockHeight) + marginColumn;
  else if (insetDefined(child, TOP) && insetDefined(child, BOTTOM)) {
    height = measured(containing, 'column') - borderForAxis(containing, 'column') - (insetAt(child, TOP, blockHeight) + insetAt(child, BOTTOM, blockHeight));
    height = bound(child, 'column', height, blockHeight);
  }
  const ratio = child.style.aspectRatio;
  if (defined(ratio) && defined(width) !== defined(height)) {
    if (!defined(width)) width = marginRow + (height - marginColumn) * ratio;
    else height = marginColumn + (width - marginRow) / ratio;
  }
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
  positionAbsolute(containing, parent, child, mainAxis, true, blockWidth, blockHeight);
  positionAbsolute(containing, parent, child, crossOf(mainAxis), false, blockWidth, blockHeight);
}

/** yoga's `layoutAbsoluteDescendants`: absolute children here, and through each `static` child to theirs. */
function layoutAbsoluteDescendants(containing: FlexNode, current: FlexNode, widthMode: Mode, leftOffset: number, topOffset: number): void {
  for (const child of current.children) {
    if (child.style.display === 'none') continue;
    if (child.style.position === 'absolute') {
      const blockWidth = measured(containing, 'row') - borderForAxis(containing, 'row');
      const blockHeight = measured(containing, 'column') - borderForAxis(containing, 'column');
      layoutAbsoluteChild(containing, current, child, blockWidth, blockHeight, widthMode);
      const parentMain = current.style.flexDirection;
      const parentCross = crossOf(parentMain);
      const c = calc(child);
      if (isReverse(parentMain)) setTrailingPosition((isRow(parentMain) ? horizontalInsetsDefined(child) : verticalInsetsDefined(child)) ? containing : current, child, parentMain);
      if (isReverse(parentCross)) setTrailingPosition((isRow(parentCross) ? horizontalInsetsDefined(child) : verticalInsetsDefined(child)) ? containing : current, child, parentCross);
      c.position[LEFT] = horizontalInsetsDefined(child) ? c.position[LEFT]! - leftOffset : c.position[LEFT]!;
      c.position[TOP] = verticalInsetsDefined(child) ? c.position[TOP]! - topOffset : c.position[TOP]!;
    } else if (child.style.position === 'static') {
      const c = calc(child);
      layoutAbsoluteDescendants(containing, child, widthMode, leftOffset + c.position[LEFT]!, topOffset + c.position[TOP]!);
    }
  }
}

function layoutInternal(node: FlexNode, availableWidth: number, availableHeight: number, widthMode: Mode, heightMode: Mode, ownerWidth: number, ownerHeight: number, performLayout: boolean, parentDepth = currentDepth): void {
  const c = calc(node);
  const depth = parentDepth + 1;
  const previous = currentDepth;
  currentDepth = depth;
  try {
    if (!performLayout) {
      const key = `${availableWidth}|${availableHeight}|${widthMode}|${heightMode}|${ownerWidth}|${ownerHeight}`;
      const cached = c.cache.get(key);
      if (cached !== undefined) {
        c.measuredWidth = cached.width;
        c.measuredHeight = cached.height;
        return;
      }
      layoutImpl(node, availableWidth, availableHeight, widthMode, heightMode, ownerWidth, ownerHeight, false, depth);
      c.cache.set(key, { width: c.measuredWidth, height: c.measuredHeight });
      return;
    }
    layoutImpl(node, availableWidth, availableHeight, widthMode, heightMode, ownerWidth, ownerHeight, true, depth);
    c.width = c.measuredWidth;
    c.height = c.measuredHeight;
  } finally {
    currentDepth = previous;
  }
}

/** The depth of the node being laid out: the root is 1, as yoga counts it. */
let currentDepth = 0;

// ── Rounding to the cell grid ───────────────────────────────────────────────────────────

function roundToGrid(value: number, forceCeil: boolean, forceFloor: boolean): number {
  let fraction = value % 1;
  if (fraction < 0) fraction += 1;
  if (same(fraction, 0)) return value - fraction;
  if (same(fraction, 1)) return value - fraction + 1;
  if (forceCeil) return value - fraction + 1;
  if (forceFloor) return value - fraction;
  return value - fraction + (!Number.isNaN(fraction) && (fraction > 0.5 || same(fraction, 0.5)) ? 1 : 0);
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
 * always is in ink), and leave every node's whole-cell box in `node.layout`.
 */
export function calculateLayout(root: FlexNode, ownerWidth: number, ownerHeight = Number.NaN): void {
  generation += 1;
  let width: number;
  let widthMode: Mode;
  const maxWidth = resolve(root.style.maxWidth, ownerWidth);
  if (hasDefiniteLength(root, 'row', ownerWidth)) {
    width = resolvedDimension(root, 'row', ownerWidth) + marginForAxis(root, 'row');
    widthMode = EXACTLY;
  } else if (defined(maxWidth)) {
    width = maxWidth;
    widthMode = AT_MOST;
  } else {
    width = ownerWidth;
    widthMode = defined(width) ? EXACTLY : UNDEFINED;
  }
  let height: number;
  let heightMode: Mode;
  const maxHeight = resolve(root.style.maxHeight, ownerHeight);
  if (hasDefiniteLength(root, 'column', ownerHeight)) {
    height = resolvedDimension(root, 'column', ownerHeight) + marginForAxis(root, 'column');
    heightMode = EXACTLY;
  } else if (defined(maxHeight)) {
    height = maxHeight;
    heightMode = AT_MOST;
  } else {
    height = ownerHeight;
    heightMode = defined(height) ? EXACTLY : UNDEFINED;
  }
  currentDepth = 0;
  layoutInternal(root, width, height, widthMode, heightMode, ownerWidth, ownerHeight, true, 0);
  const c = calc(root);
  c.position = [root.style.margin[LEFT]!, root.style.margin[TOP]!, root.style.margin[RIGHT]!, root.style.margin[BOTTOM]!];
  round(root, 0, 0);
}
