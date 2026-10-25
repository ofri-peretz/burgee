/**
 * `roundel/kleur/colors` — kleur 4.1.5's `kleur/colors`, which kleur's own `test/colors.js` grades
 * in `compat-oracle` (`colour-facades` R1).
 *
 * The suite checks every function with colour forced, the wrappings, numbers, the nullish and
 * boolean inputs and the `$.enabled` switch. This file holds the rest differentially: kleur's
 * installed `colors.mjs` is evaluated with a `process` of the test's choosing, this module is
 * imported under the same one, and every function must give the same value for every input,
 * every pair nested, colour on and off — and both must decide colour the same way for every row
 * of kleur's decision.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Script, createContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

type Style = (input?: unknown) => unknown;
type Colors = Record<string, unknown> & { $: { enabled: unknown } };

const require = createRequire(import.meta.url);
const COLORS = readFileSync(join(dirname(require.resolve('kleur')), 'colors.mjs'), 'utf8');
/** kleur/colors' function names, read off its own exports, in its order. */
const NAMES = [...COLORS.matchAll(/^export const (\w+) = init\(/gm)].map((m) => m[1] as string);

interface World {
  process?: { env?: Record<string, string>; stdout?: { isTTY?: boolean } };
}

/** kleur's own `colors.mjs`, its exports collected. */
function incumbent(world: World): Colors {
  const body = COLORS.replaceAll(/^export const /gm, 'const ');
  const context = createContext(world.process === undefined ? {} : { process: world.process });
  // eslint-disable-next-line node-security/detect-eval-with-expression -- the source is kleur's own installed `colors.mjs` with its `export` keywords dropped; that evaluation is the comparison
  return new Script(`(() => {\n'use strict';\n${body}\nreturn { $, ${NAMES.join(', ')} };\n})()`).runInContext(context) as Colors;
}

/** This module, imported in `world`, afresh inside the test that asks. */
async function ours(world: World): Promise<Colors> {
  vi.resetModules();
  vi.doMock('./runtime.js', () => ({ proc: world.process }));
  return (await import('./kleur-colors.js')) as unknown as Colors;
}

afterEach(() => {
  vi.doUnmock('./runtime.js');
});

const FORCED: World = { process: { env: { FORCE_COLOR: '1' }, stdout: {} } };
const OFF: World = { process: { env: {}, stdout: {} } };

function outcome(style: Style | undefined, input: unknown): unknown {
  try {
    return style?.(input);
  } catch (error) {
    return `throws ${(error as Error).name}`;
  }
}

function inputs(theirs: Colors): unknown[] {
  const style = (name: string): Style => theirs[name] as Style;
  const nested = NAMES.flatMap((inner) => [`a ${String(style(inner)('b'))} c`, style(inner)(style(inner)('x')), style(inner)(0)]);
  return ['', 'foo', 'a\u001B[22mb\u001B[22mc', 'a\u001B[39mb', '\u001B[49m', 'x\u001B[0my', 0, 123, -1, Number.NaN, false, true, undefined, null, { toString: () => 'x' }, { valueOf: () => 'v', toString: () => 't' }, { toString: () => 'a\u001B[39mb' }, ...nested];
}

describe('the surface is kleur/colors’', () => {
  it('exports `$` and every function kleur/colors exports, and nothing else', async () => {
    expect(NAMES).toHaveLength(26);
    expect(Object.keys(await ours(FORCED)).sort()).toEqual(['$', ...NAMES].sort());
  });
});

describe('every function gives kleur/colors’ value', () => {
  it.each([
    ['colour on', FORCED],
    ['colour off', OFF],
  ])('%s, for every input, every pair nested', async (_, world) => {
    const theirs = incumbent(world);
    const mine = await ours(world);
    for (const input of inputs(incumbent(FORCED))) {
      for (const name of NAMES) expect(outcome(mine[name] as Style, input), `${name}(${JSON.stringify(String(input))})`).toEqual(outcome(theirs[name] as Style, input));
    }
  });

  it('wraps from the inside out, and resumes an outer style after a nested close', async () => {
    const on = await ours(FORCED);
    const style = (name: string): Style => on[name] as Style;
    expect(style('red')(style('bold')('~foo~'))).toBe('\u001B[31m\u001B[1m~foo~\u001B[22m\u001B[39m');
    expect(style('bold')(`foo ${String(style('red')(style('dim')('bar')))} baz`)).toBe('\u001B[1mfoo \u001B[31m\u001B[2mbar\u001B[22m\u001B[1m\u001B[39m baz\u001B[22m');
    expect([style('red')(), style('red')(null), style('red')(0)]).toEqual([undefined, null, '\u001B[31m0\u001B[39m']);
  });
});

describe('`$.enabled` is a switch read on every call', () => {
  it('turns every function into the identity, and back, as kleur/colors’ does', async () => {
    for (const k of [incumbent(FORCED), await ours(FORCED)]) {
      k.$.enabled = false;
      expect([(k['red'] as Style)('foo'), (k['red'] as Style)(1)]).toEqual(['foo', 1]);
      k.$.enabled = true;
      expect((k['red'] as Style)('foo')).toBe('\u001B[31mfoo\u001B[39m');
    }
  });
});

const tty = (env: Record<string, string> = {}): World => ({ process: { env, stdout: { isTTY: true } } });
const pipe = (env: Record<string, string> = {}): World => ({ process: { env, stdout: { isTTY: false } } });

describe('colour is decided as kleur decides it, once, at import', () => {
  it.each<[string, World]>([
    ['a pipe', pipe()],
    ['a terminal', tty()],
    ['FORCE_COLOR=0 on a pipe', pipe({ FORCE_COLOR: '0' })],
    ['FORCE_COLOR=1', pipe({ FORCE_COLOR: '1' })],
    ['FORCE_COLOR present and empty', pipe({ FORCE_COLOR: '' })],
    ['NODE_DISABLE_COLORS=1 over FORCE_COLOR=1', pipe({ NODE_DISABLE_COLORS: '1', FORCE_COLOR: '1' })],
    ['NODE_DISABLE_COLORS empty', tty({ NODE_DISABLE_COLORS: '' })],
    ['NO_COLOR present and empty', tty({ NO_COLOR: '' })],
    ['NO_COLOR=1 over FORCE_COLOR=1', pipe({ NO_COLOR: '1', FORCE_COLOR: '1' })],
    ['TERM=dumb over FORCE_COLOR=1', pipe({ TERM: 'dumb', FORCE_COLOR: '1' })],
    ['TERM=dumb on a terminal', tty({ TERM: 'dumb' })],
    ['a stdout that says nothing about a terminal', { process: { env: {}, stdout: {} } }],
    ['a process with no stdout', { process: { env: {} } }],
    ['a process with no env', { process: { stdout: { isTTY: true } } }],
    ['no process at all', {}],
  ])('%s', async (_, world) => {
    const theirs = incumbent(world);
    const mine = await ours(world);
    expect(mine.$.enabled).toBe(theirs.$.enabled);
    expect((mine['red'] as Style)('x')).toBe((theirs['red'] as Style)('x'));
  });
});
