/**
 * controlroom R16 — the widget contract lock, flagstaff's side.
 *
 * `widget-contract.d.ts` is the pinned surface controlroom consumes: `Component`, `Writer`,
 * `Clock`, and the frame seam (`FrameWriter`, `frameWriter`). This lock holds what flagstaff
 * *publishes* to it in two ways:
 *
 * - **as text**, declaration by declaration, against `dist/*.d.ts` — what an installed
 *   flagstaff actually hands a consumer, comments and formatting aside;
 * - **as types**, both directions, through `expectTypeOf` — checked by `npm run typecheck`,
 *   which the pre-push battery and CI run.
 *
 * Changing any of the five without changing the pinned file turns this red. Changing the
 * pinned file is then a visible edit to the contract, and controlroom's copy of it — held to
 * this file by controlroom's own lock — turns red on the other side until it follows.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { type Clock, type FrameWriter, frameWriter, type Writer } from './loop.js';
import { type Component } from './plugin.js';
// eslint-disable-next-line import-next/consistent-type-specifier-style -- a declaration file has no module to load: inline `type` specifiers leave `import './widget-contract.js'` behind under verbatimModuleSyntax, and that fails at runtime
import type { Clock as PinnedClock, Component as PinnedComponent, FrameWriter as PinnedFrameWriter, frameWriter as pinnedFrameWriter, Writer as PinnedWriter } from './widget-contract.js';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(resolve(pkgRoot, path), 'utf8');

/** Where each pinned name is declared in the published package. */
const PUBLISHED: Record<string, string> = {
  Writer: 'dist/projection.d.ts',
  Clock: 'dist/projection.d.ts',
  FrameWriter: 'dist/projection.d.ts',
  frameWriter: 'dist/projection.d.ts',
  Component: 'dist/plugin.d.ts',
};

/** A declaration with its comments and layout gone: what a type means, not how it is printed. */
const normalize = (text: string): string =>
  text
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/\s*([{}();:,?<>=|[\]])\s*/g, '$1')
    .trim();

/** Just past the brace that closes the first `{` at or after `from`. */
function closing(text: string, from: number): number {
  let depth = 0;
  for (let at = text.indexOf('{', from); at < text.length; at += 1) {
    depth += Number(text[at] === '{') - Number(text[at] === '}');
    if (depth === 0) return at + 1;
  }
  return text.length;
}

/** Every exported interface and function in a declaration file, by name. */
function declarations(source: string): Map<string, string> {
  const text = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');
  const found = new Map<string, string>();
  for (const match of text.matchAll(/export (?:declare )?(interface|function) (\w+)/g)) {
    const [, kind, name = ''] = match;
    const end = kind === 'interface' ? closing(text, match.index) : text.indexOf(';', match.index) + 1;
    found.set(name, normalize(text.slice(match.index, end)));
  }
  return found;
}

const pinned = declarations(read('src/widget-contract.d.ts'));

describe('controlroom R16 · the widget contract, flagstaff’s side', () => {
  it('the pinned file declares the five names controlroom consumes, and nothing else', () => {
    expect([...pinned.keys()].sort()).toEqual(Object.keys(PUBLISHED).sort());
  });

  it.each(Object.entries(PUBLISHED))('the published %s is the pinned one, word for word', (name, file) => {
    expect(declarations(read(file)).get(name), `${name} in ${file} differs from src/widget-contract.d.ts — change both, and controlroom's copy`).toBe(pinned.get(name));
  });

  it('is published where controlroom imports it from: the seam and its types from flagstaff/loop', () => {
    const loop = read('dist/loop.d.ts');
    for (const name of ['Writer', 'Clock', 'FrameWriter', 'frameWriter']) expect(loop).toMatch(new RegExp(`export (?:type )?\\{[^}]*\\b${name}\\b[^}]*\\}`));
    expect(typeof frameWriter).toBe('function');
  });

  it('the types are the pinned types, both ways (checked by `npm run typecheck`)', () => {
    interface State {
      n: number;
    }
    expectTypeOf<Component<State>>().toEqualTypeOf<PinnedComponent<State>>();
    expectTypeOf<Component>().toEqualTypeOf<PinnedComponent>();
    expectTypeOf<Writer>().toEqualTypeOf<PinnedWriter>();
    expectTypeOf<Clock>().toEqualTypeOf<PinnedClock>();
    expectTypeOf<FrameWriter>().toEqualTypeOf<PinnedFrameWriter>();
    expectTypeOf(frameWriter).toEqualTypeOf<typeof pinnedFrameWriter>();
  });
});
