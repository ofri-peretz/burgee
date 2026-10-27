/**
 * controlroom R16 — the widget contract lock, controlroom's side.
 *
 * `widget-contract.d.ts` here is a byte-identical copy of flagstaff's pinned contract: the
 * flagstaff surface every screen paints through (`Component`, `Writer`, `Clock`, and the frame
 * seam, `FrameWriter` and `frameWriter`). flagstaff's own lock holds what flagstaff publishes to
 * its copy. This one holds the other two edges:
 *
 * - **the copy to flagstaff's file**, byte for byte — so changing the contract in flagstaff alone
 *   turns controlroom red until this side follows, which is when its consumers are re-read;
 * - **the flagstaff controlroom installed to the copy**, declaration by declaration against the
 *   installed `dist/*.d.ts`, and as types both ways through `expectTypeOf` — checked by `npm run
 *   typecheck` — on the very specifiers `screen.ts` and `compose.ts` import.
 *
 * Neither side changes the contract silently (spec R16).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Clock, type FrameWriter, frameWriter, type Writer } from 'flagstaff/loop';
import { type Component } from 'flagstaff/plugin';
import { describe, expect, expectTypeOf, it } from 'vitest';

// eslint-disable-next-line import-next/consistent-type-specifier-style -- a declaration file has no module to load: inline `type` specifiers leave `import './widget-contract.js'` behind under verbatimModuleSyntax, and that fails at runtime
import type { Clock as PinnedClock, Component as PinnedComponent, FrameWriter as PinnedFrameWriter, frameWriter as pinnedFrameWriter, Writer as PinnedWriter } from './widget-contract.js';

const read = (path: string): string => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const copy = read(fileURLToPath(new URL('widget-contract.d.ts', import.meta.url)));
/** flagstaff's pinned file, from its source in this repository. */
const pinnedInFlagstaff = read(fileURLToPath(new URL('../../flagstaff/src/widget-contract.d.ts', import.meta.url)));
/** The flagstaff this package installed: the `dist/` its `flagstaff/loop` export resolves into. */
const installedDist = dirname(fileURLToPath(import.meta.resolve('flagstaff/loop')));

/** Where each pinned name is declared in the installed flagstaff. */
const PUBLISHED: Record<string, string> = {
  Writer: 'projection.d.ts',
  Clock: 'projection.d.ts',
  FrameWriter: 'projection.d.ts',
  frameWriter: 'projection.d.ts',
  Component: 'plugin.d.ts',
};

/** A declaration with its comments and layout gone: what a type means, not how it is printed. */
const normalize = (text: string): string =>
  text
    .replaceAll(/\s+/gu, ' ')
    .replaceAll(/\s*([{}();:,?<>=|[\]])\s*/gu, '$1')
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
  const text = source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/.*$/gmu, '');
  const found = new Map<string, string>();
  for (const match of text.matchAll(/export (?:declare )?(interface|function) (\w+)/gu)) {
    const [, kind, name = ''] = match;
    const end = kind === 'interface' ? closing(text, match.index) : text.indexOf(';', match.index) + 1;
    found.set(name, normalize(text.slice(match.index, end)));
  }
  return found;
}

const pinned = declarations(copy);

describe('controlroom R16 · the widget contract, controlroom’s side', () => {
  it('is a byte-identical copy of flagstaff’s pinned contract', () => {
    expect(copy, 'flagstaff changed the widget contract — re-read every consumer in src/, then copy its widget-contract.d.ts here').toBe(pinnedInFlagstaff);
  });

  it('pins the five names this package consumes, and nothing else', () => {
    expect([...pinned.keys()].sort()).toEqual(Object.keys(PUBLISHED).sort());
  });

  it.each(Object.entries(PUBLISHED))('the installed flagstaff declares %s as pinned, word for word', (name, file) => {
    expect(declarations(read(join(installedDist, file))).get(name), `${name} in the installed flagstaff's ${file} is not the pinned one`).toBe(pinned.get(name));
  });

  it('the types it imports are the pinned types, both ways (checked by `npm run typecheck`)', () => {
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
