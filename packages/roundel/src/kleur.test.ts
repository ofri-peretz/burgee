/**
 * `roundel/kleur` — kleur 4.1.5, which kleur's own `test/index.js` grades in `compat-oracle`
 * (`colour-facades` R1).
 *
 * The suite runs with colour forced (uvu sets `FORCE_COLOR=1`) and checks every style, three
 * chains, the nesting cases, numbers, a held chain and the `enabled` switch. This file holds the
 * rest differentially: kleur's installed `index.mjs` is evaluated with a `process` of the test's
 * choosing, this module is imported under the same one, and every program below must give the
 * same value against both — every style, every pair of styles chained and nested, each coercion,
 * a chain held and called again — and both must decide colour the same way for every row of
 * kleur's decision. kleur's other half, `env.sh`, is upstream CI's separate Linux step; its
 * table is the decision rows here.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Script, createContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

/** A style: with nothing, a chain of styles; with a value, what it gives. */
interface Style {
  (): Record<string, Style>;
  (input: unknown): unknown;
}
type Kleur = Record<string, unknown> & { enabled: unknown };

const require = createRequire(import.meta.url);
const INDEX = readFileSync(join(dirname(require.resolve('kleur')), 'index.mjs'), 'utf8');
/** kleur's style names, read off its own `$` table, in its order. */
const NAMES = [...INDEX.matchAll(/^\t(\w+): init\(/gm)].map((m) => m[1] as string);

/** What the module reads: a process, or none. */
interface World {
  process?: { env?: Record<string, string>; stdout?: { isTTY?: boolean } };
}

/** kleur's own `index.mjs`, its default export collected. */
function incumbent(world: World): Kleur {
  const body = INDEX.replace(/^export default \$;$/m, '');
  const context = createContext(world.process === undefined ? {} : { process: world.process });
  // eslint-disable-next-line node-security/detect-eval-with-expression -- the source is kleur's own installed `index.mjs` with its one `export` dropped; that evaluation is the comparison
  return new Script(`(() => {\n'use strict';\n${body}\nreturn $;\n})()`).runInContext(context) as Kleur;
}

/**
 * This module, imported in `world`, afresh inside the test that asks: a defect at import then
 * fails that test rather than the collection of this file (#1233's lesson).
 */
async function ours(world: World): Promise<Kleur> {
  vi.resetModules();
  vi.doMock('./runtime.js', () => ({ proc: world.process }));
  return ((await import('./kleur.js')) as unknown as { default: Kleur }).default;
}

afterEach(() => {
  vi.doUnmock('./runtime.js');
});

const FORCED: World = { process: { env: { FORCE_COLOR: '1' }, stdout: {} } };
const OFF: World = { process: { env: {}, stdout: {} } };

/** A program's answer, or the name of what it threw, so a throw is compared as a value. */
function outcome(program: (k: Kleur) => unknown, k: Kleur): unknown {
  try {
    const value = program(k);
    // A chain is compared by what it is made of: its keys, and what it gives for a string.
    if (value !== null && typeof value === 'object') return { keys: Object.keys(value), styled: ((value as Record<string, Style>)['red'] as Style)('x') };
    return value;
  } catch (error) {
    return `throws ${(error as Error).name}`;
  }
}

const style = (k: Kleur, name: string): Style => k[name] as Style;

/** Inputs every style must agree on: plain, a close inside, and the coercions. */
const INPUTS: unknown[] = ['', 'foo', 'a\u001B[22mb\u001B[22mc', 'a\u001B[39mb', '\u001B[49m', 'x\u001B[0my', 0, 123, -1, Number.NaN, false, true, null, { toString: () => 'x' }, { valueOf: () => 'v', toString: () => 't' }, { toString: () => 'a\u001B[39mb' }];

/** A chain held and called again, grown after it was held, and fed what is not a string. */
const CHAINS: [string, (k: Kleur) => unknown][] = [
  [
    'a held chain, called twice',
    (k) => {
      const held = style(k, 'red')()['bold'] as Style;
      return [held('a'), held('b'), style(k, 'red')('c')];
    },
  ],
  [
    'a chain grown after it was held',
    (k) => {
      const chain = style(k, 'red')();
      const first = (chain['bold'] as Style)('a');
      return [first, (chain['italic'] as Style)('b'), (chain['red'] as Style)('c')];
    },
  ],
  ['gray and grey share a code', (k) => ((style(k, 'gray')()['grey'] as Style)()['red'] as Style)('g')],
  ['a chain with a number and zero', (k) => [(style(k, 'red')()['italic'] as Style)(0), (style(k, 'blue')()['bold'] as Style)(-1)]],
];

/** Every program the comparison runs: each style alone, each pair chained and nested, held chains. */
function programs(): [string, (k: Kleur) => unknown][] {
  const out: [string, (k: Kleur) => unknown][] = [];
  for (const a of NAMES) {
    for (const input of INPUTS) out.push([`${a}(${String(input)})`, (k) => style(k, a)(input)]);
    out.push([`${a}()`, (k) => style(k, a)()]);
    out.push([`${a} detached`, (k) => (style(k, a) as (input: string) => unknown).call(undefined, 'x')]);
    for (const b of NAMES) {
      out.push([`${a}().${b}()`, (k) => (style(k, a)()[b] as Style)('~x~')]);
      out.push([`${a}(${b}())`, (k) => style(k, a)(`p ${String(style(k, b)('q'))} r`)]);
      out.push([`${a}().${b}().${a}()`, (k) => ((style(k, a)()[b] as Style)()[a] as Style)('y')]);
    }
  }
  out.push(...CHAINS);
  return out;
}

describe('the surface is kleur’s', () => {
  it('has every style kleur has, in kleur’s order, after `enabled`', async () => {
    expect(NAMES).toHaveLength(26);
    expect(Object.keys(await ours(FORCED))).toEqual(Object.keys(incumbent(FORCED)));
  });

  it('builds a chain with kleur’s keys: `has`, `keys` and every style', async () => {
    expect(Object.keys((await ours(FORCED))['red'] as Style)).toEqual([]);
    expect(Object.keys(style(await ours(FORCED), 'red')() as object)).toEqual(Object.keys(style(incumbent(FORCED), 'red')() as object));
  });

  it('hands a CommonJS caller the same object as the default, as `require(\'kleur\')` does', async () => {
    vi.resetModules();
    const module = (await import('./kleur.js')) as unknown as Record<string, unknown>;
    expect(module['module.exports']).toBe(module['default']);
  });
});

describe('every program gives kleur’s value', () => {
  it.each([
    ['colour on', FORCED],
    ['colour off', OFF],
  ])('%s', async (_, world) => {
    const theirs = incumbent(world);
    const mine = await ours(world);
    for (const [name, program] of programs()) expect(outcome(program, mine), name).toEqual(outcome(program, theirs));
  });

  it('resumes an outer style after a nested close, and closes and re-opens what shares 22', async () => {
    const on = await ours(FORCED);
    expect(style(on, 'red')(`foo ${String(style(on, 'yellow')('bar'))} baz`)).toBe('\u001B[31mfoo \u001B[33mbar\u001B[39m\u001B[31m baz\u001B[39m');
    expect((style(on, 'bold')()['dim'] as Style)('x')).toBe('\u001B[1m\u001B[2mx\u001B[22m\u001B[22m');
    expect(style(on, 'bold')(`a ${String(style(on, 'dim')('b'))} c`)).toBe('\u001B[1ma \u001B[2mb\u001B[22m\u001B[1m c\u001B[22m');
  });
});

describe('`enabled` is a switch read on every call', () => {
  it('turns every style and chain plain, and back, as kleur’s does', async () => {
    for (const k of [incumbent(FORCED), await ours(FORCED)]) {
      const held = style(k, 'red')()['bold'] as Style;
      k.enabled = false;
      expect([style(k, 'red')('foo'), (style(k, 'red')()['italic'] as Style)(1), held('x')]).toEqual(['foo', '1', 'x']);
      k.enabled = true;
      expect([style(k, 'red')('foo'), held('x')]).toEqual(['\u001B[31mfoo\u001B[39m', '\u001B[31m\u001B[1mx\u001B[39m\u001B[22m']);
    }
  });
});

const tty = (env: Record<string, string> = {}): World => ({ process: { env, stdout: { isTTY: true } } });
const pipe = (env: Record<string, string> = {}): World => ({ process: { env, stdout: { isTTY: false } } });

describe('colour is decided as kleur decides it, once, at import', () => {
  // `env.sh`'s rows, a terminal and a pipe each, and the edges of each operand.
  it.each<[string, World]>([
    ['a pipe', pipe()],
    ['a terminal', tty()],
    ['FORCE_COLOR=0 on a pipe', pipe({ FORCE_COLOR: '0' })],
    ['FORCE_COLOR=0 on a terminal', tty({ FORCE_COLOR: '0' })],
    ['FORCE_COLOR=1', pipe({ FORCE_COLOR: '1' })],
    ['FORCE_COLOR present and empty', pipe({ FORCE_COLOR: '' })],
    ['NODE_DISABLE_COLORS=1', tty({ NODE_DISABLE_COLORS: '1' })],
    ['NODE_DISABLE_COLORS=1 over FORCE_COLOR=1', pipe({ NODE_DISABLE_COLORS: '1', FORCE_COLOR: '1' })],
    ['NODE_DISABLE_COLORS empty, which is no opt-out', tty({ NODE_DISABLE_COLORS: '' })],
    ['NO_COLOR=1', tty({ NO_COLOR: '1' })],
    ['NO_COLOR=1 over FORCE_COLOR=1', pipe({ NO_COLOR: '1', FORCE_COLOR: '1' })],
    ['NO_COLOR present and empty', tty({ NO_COLOR: '' })],
    ['NO_COLOR present and empty over FORCE_COLOR=1', pipe({ NO_COLOR: '', FORCE_COLOR: '1' })],
    ['TERM=dumb over FORCE_COLOR=1', pipe({ TERM: 'dumb', FORCE_COLOR: '1' })],
    ['TERM=dumb on a terminal', tty({ TERM: 'dumb' })],
    ['TERM=xterm on a pipe', pipe({ TERM: 'xterm' })],
    ['a stdout that says nothing about a terminal', { process: { env: {}, stdout: {} } }],
    ['a process with no stdout', { process: { env: {} } }],
    ['a process with no env', { process: { stdout: { isTTY: true } } }],
    ['no process at all', {}],
  ])('%s', async (_, world) => {
    const theirs = incumbent(world);
    const mine = await ours(world);
    expect(mine.enabled).toBe(theirs.enabled);
    expect(style(mine, 'red')('x')).toBe(style(theirs, 'red')('x'));
  });
});
