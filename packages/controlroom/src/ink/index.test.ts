/**
 * `controlroom/ink`'s own checks. The drop-in is graded by ink's and `@inkjs/ui`'s suites in
 * `compat-oracle`, in another process and against `dist/` (576 / 584 and 103 / 103 on
 * 2026-10-05); these pin what those suites do not: that the surface is ink 6.8's and no
 * more, that a missing peer is a refusal with a `fix`, and the yoga behaviours the flexbox
 * subset reproduces on purpose, including the ones that are yoga's bugs.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';

import { calculateLayout, defaults, type FlexNode, type FlexStyle } from './flex.js';
import { Box, renderToString, Text } from './index.js';
import { InkPeerError, INSTALL, loadPeer } from './peers.js';

const h = React.createElement;

/** A peer that is not installed, as `import()` reports one. */
const absent = (): Promise<never> => Promise.reject(Object.assign(new Error("Cannot find package 'react'"), { code: 'ERR_MODULE_NOT_FOUND' }));

describe('the surface', () => {
  it('exports ink 6.8.0’s runtime names, and nothing of its own', async () => {
    expect(Object.keys(await import('./index.js')).sort()).toEqual(
      [
        'Box',
        'Newline',
        'Spacer',
        'Static',
        'Text',
        'Transform',
        'kittyFlags',
        'kittyModifiers',
        'measureElement',
        'render',
        'renderToString',
        'useApp',
        'useCursor',
        'useFocus',
        'useFocusManager',
        'useInput',
        'useIsScreenReaderEnabled',
        'useStderr',
        'useStdin',
        'useStdout',
      ].sort(),
    );
  });

  it('renders a bordered box with flexbox and roundel, through React’s own reconciler', () => {
    const out = renderToString(h(Box, { borderStyle: 'round', width: 9, justifyContent: 'center' }, h(Text, null, 'hi')), { columns: 20 });
    expect(out).toBe(['╭───────╮', '│  hi   │', '╰───────╯'].join('\n'));
  });
});

describe('R11 — a missing optional peer', () => {
  it('is a refusal whose fix is the install line', async () => {
    const refusal = await loadPeer('react', absent).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(InkPeerError);
    expect(refusal).toMatchObject({ code: 'E_PEER_MISSING', peer: 'react' });
    expect((refusal as InkPeerError).fix).toContain(INSTALL);
  });

  it('passes any other failure through untouched', async () => {
    const broken = new SyntaxError('broken peer');
    await expect(loadPeer('react-reconciler', () => Promise.reject(broken))).rejects.toBe(broken);
  });

  it('hands a present peer back as it loaded', async () => {
    await expect(loadPeer('react', () => Promise.resolve({ default: 1 }))).resolves.toEqual({ default: 1 });
  });
});

/** A node with `style` over yoga's defaults, and a leaf `w` × `h` when it has no children. */
function node(style: Partial<FlexStyle>, children: FlexNode[] = [], size?: [number, number]): FlexNode {
  return {
    style: { ...defaults(), ...style },
    children,
    measure: size === undefined ? undefined : () => ({ width: size[0], height: size[1] }),
    layout: { left: 0, top: 0, width: 0, height: 0 },
  };
}

/** Two text leaves, one and two cells wide. */
const items = (): FlexNode[] => [node({}, [], [1, 1]), node({}, [], [2, 1])];

describe('R12 — the flexbox subset reproduces yoga, rounding and quirks included', () => {
  it('shrinks by flex basis and rounds each edge to the grid, as yoga does', () => {
    // 6 + 6 + 1 into 10: each loses 3 × basis / 13. yoga rounds the edges, not the widths.
    const a = node({ width: 6, flexShrink: 1 }, [node({ flexShrink: 1 }, [], [1, 1])]);
    const b = node({ width: 6, flexShrink: 1 }, [node({ flexShrink: 1 }, [], [1, 1])]);
    const c = node({ flexShrink: 1 }, [], [1, 1]);
    const root = node({ flexDirection: 'row', width: 10 }, [a, b, c]);
    calculateLayout(root, 100);
    expect([a, b, c].map((n) => [n.layout.left, n.layout.width])).toEqual([
      [0, 5],
      [5, 4],
      [9, 1],
    ]);
  });

  it('floors a text node’s first edge, which is why ink marks space-around `failing`', () => {
    // 3 free cells around two: 0.75 leads, so yoga puts A at 0.75 and floors it to 0.
    const a = node({ flexShrink: 1 }, [], [1, 1]);
    const b = node({ flexShrink: 1 }, [], [1, 1]);
    const root = node({ flexDirection: 'row', width: 5, justifyContent: 'space-around' }, [a, b]);
    calculateLayout(root, 100);
    expect([a.layout.left, b.layout.left]).toEqual([0, 3]);
  });

  it('wraps onto a second line, and wrap-reverse stacks the lines from the far edge', () => {    const wrapped = node({ flexDirection: 'row', width: 2, flexWrap: 'wrap' }, items());
    calculateLayout(wrapped, 100);
    expect(wrapped.children.map((n) => [n.layout.left, n.layout.top])).toEqual([
      [0, 0],
      [0, 1],
    ]);
    const reversed = node({ flexDirection: 'row', width: 2, height: 3, flexWrap: 'wrap-reverse' }, items());
    calculateLayout(reversed, 100);
    expect(reversed.children.map((n) => n.layout.top)).toEqual([2, 1]);
  });

  it('places an absolute child at its parent’s padding edge and leaves it out of the flow', () => {
    const fixed = node({ position: 'absolute' }, [], [3, 1]);
    const flowing = node({}, [], [1, 1]);
    const root = node({ padding: [2, 1, 0, 0] }, [fixed, flowing]);
    calculateLayout(root, 10);
    expect([fixed.layout.left, fixed.layout.top, flowing.layout.top]).toEqual([2, 1, 1]);
  });
});
