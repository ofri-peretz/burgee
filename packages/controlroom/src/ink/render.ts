/**
 * The laid-out host tree to text: each node drawn into an `Output` at its computed cell —
 * backgrounds, borders, wrapped and transformed text, and clipping for `overflow: hidden` —
 * plus the screen-reader projection, which is the tree as plain sentences with each
 * `aria-role` and `aria-state` spoken. Colour is roundel's (`roundel/chalk`), borders are
 * flagstaff's registry.
 */
import { lookupBorder } from 'flagstaff/plugin';
import chalk from 'roundel/chalk';

import { type BoxStyle, type DOMElement, type DOMNode, squashTextNodes, type Transformer, widestLine, wrapText } from './dom.js';
import { type FlexNode } from './flex.js';
import { Output } from './output.js';

const RGB = /^rgb\(\s?(\d+),\s?(\d+),\s?(\d+)\s?\)$/u;
const ANSI256 = /^ansi256\(\s?(\d+)\s?\)$/u;

type Painter = (text: string) => string;
const painterOf = (name: string): Painter => (chalk as unknown as Record<string, Painter>)[name]!;

/** Ink's `colorize`: a chalk name, `#hex`, `rgb(r, g, b)` or `ansi256(n)`, as text or background. */
export function colorize(text: string, color: string | undefined, type: 'foreground' | 'background'): string {
  if (color === undefined || color === '') return text;
  if (color in chalk) return painterOf(type === 'foreground' ? color : `bg${color[0]!.toUpperCase()}${color.slice(1)}`)(text);
  if (color.startsWith('#')) return type === 'foreground' ? chalk.hex(color)(text) : chalk.bgHex(color)(text);
  const ansi = ANSI256.exec(color);
  if (color.startsWith('ansi256')) {
    if (ansi === null) return text;
    const n = Number(ansi[1]);
    return type === 'foreground' ? chalk.ansi256(n)(text) : chalk.bgAnsi256(n)(text);
  }
  const rgb = RGB.exec(color);
  if (color.startsWith('rgb') && rgb !== null) {
    const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    return type === 'foreground' ? chalk.rgb(r, g, b)(text) : chalk.bgRgb(r, g, b)(text);
  }
  return text;
}

/** cli-boxes' three styles flagstaff's registry does not ship; the other five are the registry's. */
const MORE_BOXES: Readonly<Record<string, BoxStyle>> = {
  singleDouble: { topLeft: '╓', top: '─', topRight: '╖', right: '║', bottomRight: '╜', bottom: '─', bottomLeft: '╙', left: '║' },
  doubleSingle: { topLeft: '╒', top: '═', topRight: '╕', right: '│', bottomRight: '╛', bottom: '═', bottomLeft: '╘', left: '│' },
  arrow: { topLeft: '↘', top: '↓', topRight: '↙', right: '←', bottomRight: '↖', bottom: '↑', bottomLeft: '↗', left: '→' },
};

function boxOf(style: string | BoxStyle): BoxStyle {
  if (typeof style !== 'string') return style;
  return MORE_BOXES[style] ?? lookupBorder(style);
}

const flexOf = (node: DOMElement): FlexNode => node.yogaNode!;

function renderBorder(x: number, y: number, node: DOMElement, output: Output): void {
  const { style } = node;
  if (style.borderStyle === undefined || style.borderStyle === '') return;
  const { width, height } = flexOf(node).layout;
  const box = boxOf(style.borderStyle);
  const showTop = style.borderTop !== false;
  const showBottom = style.borderBottom !== false;
  const showLeft = style.borderLeft !== false;
  const showRight = style.borderRight !== false;
  const contentWidth = width - (showLeft ? 1 : 0) - (showRight ? 1 : 0);
  const dim = (text: string, flag: boolean | undefined): string => (flag === true ? chalk.dim(text) : text);
  const side = (text: string, color: string | undefined, flag: boolean | undefined): string => dim(colorize(text, color, 'foreground'), flag);
  const vertical = height - (showTop ? 1 : 0) - (showBottom ? 1 : 0);
  const repeat = (s: string, n: number): string => s.repeat(Math.max(0, n));
  if (showTop) {
    const top = (showLeft ? box.topLeft : '') + repeat(box.top, contentWidth) + (showRight ? box.topRight : '');
    output.draw(x, y, side(top, style.borderTopColor ?? style.borderColor, style.borderTopDimColor ?? style.borderDimColor), { transformers: [] });
  }
  const offsetY = showTop ? 1 : 0;
  if (showLeft) {
    const left = repeat(`${colorize(box.left, style.borderLeftColor ?? style.borderColor, 'foreground')}\n`, vertical);
    output.draw(x, y + offsetY, dim(left, style.borderLeftDimColor ?? style.borderDimColor), { transformers: [] });
  }
  if (showRight) {
    const right = repeat(`${colorize(box.right, style.borderRightColor ?? style.borderColor, 'foreground')}\n`, vertical);
    output.draw(x + width - 1, y + offsetY, dim(right, style.borderRightDimColor ?? style.borderDimColor), { transformers: [] });
  }
  if (showBottom) {
    const bottom = (showLeft ? box.bottomLeft : '') + repeat(box.bottom, contentWidth) + (showRight ? box.bottomRight : '');
    output.draw(x, y + height - 1, side(bottom, style.borderBottomColor ?? style.borderColor, style.borderBottomDimColor ?? style.borderDimColor), { transformers: [] });
  }
}

function renderBackground(x: number, y: number, node: DOMElement, output: Output): void {
  const { style } = node;
  if (style.backgroundColor === undefined || style.backgroundColor === '') return;
  const { width, height } = flexOf(node).layout;
  const bordered = style.borderStyle !== undefined && style.borderStyle !== '';
  const left = bordered && style.borderLeft !== false ? 1 : 0;
  const right = bordered && style.borderRight !== false ? 1 : 0;
  const top = bordered && style.borderTop !== false ? 1 : 0;
  const bottom = bordered && style.borderBottom !== false ? 1 : 0;
  const contentWidth = width - left - right;
  const contentHeight = height - top - bottom;
  if (!(contentWidth > 0 && contentHeight > 0)) return;
  const line = colorize(' '.repeat(contentWidth), style.backgroundColor, 'background');
  for (let row = 0; row < contentHeight; row += 1) output.draw(x + left, y + top + row, line, { transformers: [] });
}

const indent = (text: string, count: number): string => (count <= 0 ? text : text.replaceAll(/^(?!\s*$)/gmu, ' '.repeat(count)));

/** A text node's padding, applied as text: its first child's offset inside the `Text`. */
function applyPaddingToText(node: DOMElement, text: string): string {
  const first = node.childNodes[0];
  if (first?.yogaNode === undefined) return text;
  const { left, top } = first.yogaNode.layout;
  return '\n'.repeat(top) + indent(text, left);
}

/** The inner width a text node wraps to: its box less padding and border. */
function maxWidthOf(flex: FlexNode): number {
  const { padding, border } = flex.style;
  return flex.layout.width - padding[0] - padding[2] - border[0] - border[2];
}

interface RenderOptions {
  offsetX?: number;
  offsetY?: number;
  transformers?: Transformer[];
  skipStaticElements: boolean;
}

export function renderNodeToOutput(node: DOMElement, output: Output, options: RenderOptions): void {
  const { offsetX = 0, offsetY = 0, transformers = [], skipStaticElements } = options;
  if (skipStaticElements && node.internal_static === true) return;
  const flex = node.yogaNode;
  if (flex === undefined || flex.style.display === 'none') return;
  const x = offsetX + flex.layout.left;
  const y = offsetY + flex.layout.top;
  const next = typeof node.internal_transform === 'function' ? [node.internal_transform, ...transformers] : transformers;
  if (node.nodeName === 'ink-text') {
    let text = squashTextNodes(node);
    if (text.length > 0) {
      const maxWidth = maxWidthOf(flex);
      if (widestLine(text) > maxWidth) text = wrapText(text, maxWidth, node.style.textWrap ?? 'wrap');
      text = applyPaddingToText(node, text);
      output.draw(x, y, text, { transformers: next });
    }
    return;
  }
  let clipped = false;
  if (node.nodeName === 'ink-box') {
    renderBackground(x, y, node, output);
    renderBorder(x, y, node, output);
    const horizontally = node.style.overflowX === 'hidden' || node.style.overflow === 'hidden';
    const vertically = node.style.overflowY === 'hidden' || node.style.overflow === 'hidden';
    if (horizontally || vertically) {
      const [bl, bt, br, bb] = flex.style.border;
      output.clip({
        x1: horizontally ? x + bl : undefined,
        x2: horizontally ? x + flex.layout.width - br : undefined,
        y1: vertically ? y + bt : undefined,
        y2: vertically ? y + flex.layout.height - bb : undefined,
      });
      clipped = true;
    }
  }
  for (const child of node.childNodes) {
    if (child.nodeName !== '#text') renderNodeToOutput(child, output, { offsetX: x, offsetY: y, transformers: next, skipStaticElements });
  }
  if (clipped) output.unclip();
}

/** The screen-reader projection: text in reading order, rows joined by spaces, roles and states spoken. */
export function renderNodeToScreenReaderOutput(node: DOMNode, options: { parentRole?: string | undefined; skipStaticElements: boolean }): string {
  if (node.nodeName === '#text') return '';
  if (options.skipStaticElements && node.internal_static === true) return '';
  if (node.yogaNode?.style.display === 'none') return '';
  let output = '';
  if (node.nodeName === 'ink-text') output = squashTextNodes(node);
  else if (node.nodeName === 'ink-box' || node.nodeName === 'ink-root') {
    const direction = node.style.flexDirection;
    const separator = direction === 'row' || direction === 'row-reverse' ? ' ' : '\n';
    const children = direction === 'row-reverse' || direction === 'column-reverse' ? [...node.childNodes].reverse() : node.childNodes;
    output = children
      // The host tree is React's, as deep as the program's components: the recursion is bounded by it.
      // eslint-disable-next-line secure-coding/no-unchecked-loop-condition -- a tree walk over the program's own host nodes
      .map((child) => renderNodeToScreenReaderOutput(child, { parentRole: node.internal_accessibility?.role, skipStaticElements: options.skipStaticElements }))
      .filter(Boolean)
      .join(separator);
  }
  const accessibility = node.internal_accessibility;
  if (accessibility !== undefined) {
    const { role, state } = accessibility;
    if (state !== undefined) {
      const said = Object.keys(state)
        .filter((key) => Boolean(state[key]))
        .join(', ');
      if (said !== '') output = `(${said}) ${output}`;
    }
    if (role !== undefined && role !== '' && role !== options.parentRole) output = `${role}: ${output}`;
  }
  return output;
}

export interface Rendered {
  output: string;
  outputHeight: number;
  staticOutput: string;
}

/** The whole root: the live output, its height, and any new `<Static>` output above it. */
export function renderer(node: DOMElement, isScreenReaderEnabled: boolean): Rendered {
  if (node.yogaNode === undefined) return { output: '', outputHeight: 0, staticOutput: '' };
  if (isScreenReaderEnabled) {
    const output = renderNodeToScreenReaderOutput(node, { skipStaticElements: true });
    const staticOutput = node.staticNode === undefined ? '' : renderNodeToScreenReaderOutput(node.staticNode, { skipStaticElements: false });
    return { output, outputHeight: output === '' ? 0 : output.split('\n').length, staticOutput: staticOutput === '' ? '' : `${staticOutput}\n` };
  }
  const output = new Output({ width: node.yogaNode.layout.width, height: node.yogaNode.layout.height });
  renderNodeToOutput(node, output, { skipStaticElements: true });
  let staticOutput = '';
  const staticFlex = node.staticNode?.yogaNode;
  if (node.staticNode !== undefined && staticFlex !== undefined) {
    const out = new Output({ width: staticFlex.layout.width, height: staticFlex.layout.height });
    renderNodeToOutput(node.staticNode, out, { skipStaticElements: false });
    staticOutput = `${out.get().output}\n`;
  }
  const { output: generated, height } = output.get();
  return { output: generated, outputHeight: height, staticOutput };
}
