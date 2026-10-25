/**
 * `roundel/colorette` — colorette 2.0.20, which colorette's own `tests/*.js` grade in
 * `compat-oracle` (`colour-facades` R2).
 *
 * The suite runs with colour forced and checks one style per case, the nesting cases, the falsy
 * inputs and four spawned programs. This file holds the rest differentially: colorette's installed
 * `index.js` is evaluated with a `process` and a `tty` of the test's choosing, this module is
 * imported under the same two, and every style must give the same value for every input — colour
 * on and off, every pair of styles nested in each other, and the coercions — and both must decide
 * colour the same way for every row of colorette's decision.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Script, createContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line import-next/no-namespace -- the namespace is the subject: colorette's surface is its named exports, and their keys are what is compared
import * as real from './colorette.js';

type Style = (input: unknown) => unknown;
type Module = Record<string, unknown> & { isColorSupported: boolean; createColors: (options?: { useColor?: boolean }) => Record<string, Style> };

const require = createRequire(import.meta.url);
const INDEX = readFileSync(join(dirname(require.resolve('colorette')), 'index.js'), 'utf8');
/** colorette's style names, read off its own `colors` table, in its order. */
const NAMES = [...INDEX.matchAll(/^ {2}(\w+): init\(/gm)].map((m) => m[1] as string);

/** What the module reads: a process (or none), and whether fd 1 is a terminal. */
interface World {
  process?: { env?: Record<string, string>; argv?: string[]; platform?: string };
  tty: boolean;
}

/** colorette's own `index.js`, its `tty` import supplied, its exports collected. */
function incumbent(world: World): Module {
  const body = INDEX.replace(/^import \* as tty from "tty"$/m, '').replaceAll(/^export const /gm, 'const ');
  const context = createContext({ tty: { isatty: (fd: number) => fd === 1 && world.tty }, ...(world.process === undefined ? {} : { process: world.process }) });
  // eslint-disable-next-line node-security/detect-eval-with-expression -- the source is colorette's own installed `index.js`, with its one import supplied and its `export` keywords dropped; that evaluation is the comparison
  return new Script(`(() => {\n${body}\nreturn { isColorSupported, createColors, ${NAMES.join(', ')} };\n})()`).runInContext(context) as Module;
}

/** This module, imported in `world`. */
async function ours(world: World): Promise<Module> {
  vi.resetModules();
  vi.doMock('./runtime.js', () => ({ proc: world.process }));
  vi.doMock('node:tty', () => ({ isatty: (fd: number) => fd === 1 && world.tty }));
  return (await import('./colorette.js')) as unknown as Module;
}

afterEach(() => {
  vi.doUnmock('./runtime.js');
  vi.doUnmock('node:tty');
});

const FORCED: World = { process: { env: { FORCE_COLOR: '' }, argv: [] }, tty: false };
const OFF: World = { process: { env: {}, argv: [] }, tty: false };

/** A style's answer, or the name of what it threw, so a throw is compared as a value. */
function outcome(style: Style | undefined, input: unknown): unknown {
  try {
    return style?.(input);
  } catch (error) {
    return `throws ${(error as Error).name}`;
  }
}

/** Inputs whose bytes every style must agree on: plain, each close code inside, and the coercions. */
function inputs(theirs: Module): unknown[] {
  const style = (name: string): Style => theirs[name] as Style;
  const nested = NAMES.flatMap((inner) => [`a ${String(style(inner)('b'))} c`, String(style(inner)(style(inner)('x'))), `x${String(style(inner)(''))}y${String(style(inner)('z'))}`]);
  // Every close code at every offset either side of an open code's length (4 to 6), where
  // colorette's search begins: a close sitting exactly at the open's length is not seen.
  // Twice in a row too, so the second close is found at the very start of what the first cut left.
  const offsets = [0, 22, 23, 24, 27, 28, 29, 39, 49].flatMap((code) =>
    [2, 3, 4, 5, 6, 7].flatMap((n) => [`${'x'.repeat(n)}\u001B[${String(code)}m.`, `${'x'.repeat(n)}\u001B[${String(code)}m\u001B[${String(code)}m.`]),
  );
  return [
    ...offsets,
    '',
    'foo',
    'a\u001B[22mb\u001B[22mc',
    'a\u001B[39mb',
    '\u001B[39m',
    'x\u001B[39m',
    0,
    123,
    Number.NaN,
    false,
    true,
    undefined,
    null,
    { toString: () => 'x' },
    { valueOf: () => 'v', toString: () => 't' },
    // A value whose string holds a close: colorette cuts the value itself, so this throws there.
    { toString: () => 'a\u001B[39mb' },
    ...nested,
  ];
}

describe('the surface is colorette’s', () => {
  it('exports every style colorette exports, `isColorSupported` and `createColors`, and nothing else', () => {
    expect(NAMES).toHaveLength(41);
    expect(Object.keys(real).sort()).toEqual([...NAMES, 'createColors', 'isColorSupported'].sort());
  });

  it('builds `createColors()` with colorette’s keys, in colorette’s order, on and off', () => {
    expect(Object.keys(real.createColors({ useColor: true }))).toEqual(NAMES);
    expect(Object.keys(real.createColors({ useColor: false }))).toEqual(NAMES);
  });
});

describe('every style gives colorette’s value', () => {
  it.each([
    ['colour on', FORCED],
    ['colour off', OFF],
  ])('%s, for every input, every pair of styles nested', async (_, world) => {
    const theirs = incumbent(world);
    const mine = await ours(world);
    for (const input of inputs(incumbent(FORCED))) {
      for (const name of NAMES) expect(outcome(mine[name] as Style, input), `${name}(${JSON.stringify(String(input))})`).toEqual(outcome(theirs[name] as Style, input));
    }
  });

  it('closes and re-opens bold and dim, which share 22, and resumes any other style', async () => {
    const on = await ours(FORCED);
    const style = (name: string): Style => on[name] as Style;
    expect(style('bold')(`a ${String(style('dim')('b'))} c`)).toBe('\u001B[1ma \u001B[2mb\u001B[22m\u001B[1m c\u001B[22m');
    expect(style('red')(`a ${String(style('yellow')('b'))} c ${String(style('blue')('d'))} e`)).toBe('\u001B[31ma \u001B[33mb\u001B[31m c \u001B[34md\u001B[31m e\u001B[39m');
    expect(style('reset')('a\u001B[0mb')).toBe('\u001B[0ma\u001B[0mb\u001B[0m');
  });

  it('styles `\'\'` and `undefined` to nothing, and every other falsy value', async () => {
    const blue = (await ours(FORCED))['blue'] as Style;
    expect([blue(''), blue(undefined), blue(0), blue(Number.NaN), blue(null), blue(false)]).toEqual(['', '', '\u001B[34m0\u001B[39m', '\u001B[34mNaN\u001B[39m', '\u001B[34mnull\u001B[39m', '\u001B[34mfalse\u001B[39m']);
  });
});

describe('createColors', () => {
  it('hands back the one shared object the named exports came from when colour is on', async () => {
    const on = await ours(FORCED);
    expect(on.createColors()).toBe(on.createColors({ useColor: true }));
    expect(on.createColors()['red']).toBe(on['red']);
  });

  it('makes every style `String` when colour is off, a fresh object each call', async () => {
    const on = await ours(FORCED);
    const off = on.createColors({ useColor: false });
    expect(NAMES.every((name) => off[name] === String)).toBe(true);
    expect(on.createColors({ useColor: false })).not.toBe(off);
    expect(off['blue']?.(42)).toBe('42');
  });

  it('defaults to the import’s decision, and takes `useColor` over it either way', async () => {
    const off = await ours(OFF);
    expect(off.createColors()['red']).toBe(String);
    expect(off.createColors({})['red']).toBe(String);
    expect(off.createColors({ useColor: true })['red']?.('x')).toBe('\u001B[31mx\u001B[39m');
    expect(off['red']).toBe(String);
  });
});

describe('colour is decided as colorette decides it, once, at import', () => {
  const tty = (env: Record<string, string> = {}, argv: string[] = [], platform = 'linux'): World => ({ process: { env, argv, platform }, tty: true });
  const pipe = (env: Record<string, string> = {}, argv: string[] = [], platform = 'linux'): World => ({ process: { env, argv, platform }, tty: false });

  it.each<[string, World, boolean]>([
    ['a terminal with a TERM', tty({ TERM: 'xterm' }), true],
    ['a terminal with no TERM', tty(), false],
    ['a terminal whose TERM is empty', tty({ TERM: '' }), false],
    ['a dumb terminal', tty({ TERM: 'dumb' }), false],
    ['a pipe', pipe({ TERM: 'xterm' }), false],
    ['FORCE_COLOR present and empty', pipe({ FORCE_COLOR: '' }), true],
    ['FORCE_COLOR=0, which is still present', pipe({ FORCE_COLOR: '0' }), true],
    ['--color', pipe({}, ['node', 'x', '--color']), true],
    ['NO_COLOR present and empty, over FORCE_COLOR', pipe({ NO_COLOR: '', FORCE_COLOR: '1' }), false],
    ['--no-color over --color', pipe({}, ['--color', '--no-color']), false],
    ['NO_COLOR over a terminal', tty({ NO_COLOR: '1', TERM: 'xterm' }), false],
    ['Windows', pipe({}, [], 'win32'), true],
    ['Windows with a dumb TERM', pipe({ TERM: 'dumb' }, [], 'win32'), false],
    ['CI alone', pipe({ CI: 'true' }), false],
    ['CI on GitHub Actions', pipe({ CI: 'true', GITHUB_ACTIONS: 'true' }), true],
    ['CI on GitLab', pipe({ CI: '', GITLAB_CI: '' }), true],
    ['CI on CircleCI', pipe({ CI: '1', CIRCLECI: '1' }), true],
    ['GitHub Actions without CI', pipe({ GITHUB_ACTIONS: 'true' }), false],
    ['no process at all', { tty: true }, false],
    ['a process with no env, argv or platform', { process: {}, tty: true }, false],
  ])('%s', async (_, world, expected) => {
    expect(incumbent(world).isColorSupported, 'colorette itself').toBe(expected);
    const mine = await ours(world);
    expect(mine.isColorSupported).toBe(expected);
    expect((mine['red'] as Style)('x')).toBe((incumbent(world)['red'] as Style)('x'));
  });
});
