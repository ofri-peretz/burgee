/**
 * `roundel/yoctocolors` — yoctocolors 2.2.0, which yoctocolors' own `test.js` grades in
 * `compat-oracle` (`colour-facades` R3).
 *
 * The suite runs with `FORCE_COLOR=1` and checks one style per case, plus the nesting cases and one
 * spawned `FORCE_COLOR=0` program. This file holds the rest differentially: yoctocolors' installed
 * `base.js` is evaluated with a `node:tty` of the test's choosing, this module is imported under the
 * same `node:tty`, and every style must give the same value for every input — colour on and off,
 * every pair of styles nested in each other, and the coercions — and both must decide colour the
 * same way when any link of `tty.WriteStream.prototype.hasColors()` is missing.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import tty from 'node:tty';
import { Script, createContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line import-next/no-namespace -- the namespace is the subject: yoctocolors' default export is this module's own namespace, and its keys are the surface under test
import * as real from './yoctocolors.js';

type Style = (input: unknown) => unknown;
type Styles = Record<string, Style>;

const require = createRequire(import.meta.url);
const BASE = readFileSync(join(dirname(require.resolve('yoctocolors')), 'base.js'), 'utf8');
const NAMES = [...BASE.matchAll(/^export const (\w+) =/gm)].map((m) => m[1] as string);

/** A `node:tty` default export whose chain ends where the test says. */
type Tty = { WriteStream?: { prototype?: { hasColors?: () => boolean } } } | undefined;
const terminal = (hasColors: boolean): Tty => ({ WriteStream: { prototype: { hasColors: () => hasColors } } });

/** yoctocolors' own `base.js`, its import replaced by `tty` and its exports collected. */
function incumbent(tty: Tty): Styles {
  const body = BASE.replace(/^import tty from 'node:tty';$/m, '').replaceAll(/^export const /gm, 'const ');
  const context = createContext({ tty });
  // eslint-disable-next-line node-security/detect-eval-with-expression -- the source is yoctocolors' own installed `base.js`, with its one import supplied and its `export` keywords dropped; that evaluation is the comparison
  return new Script(`(() => {\n${body}\nreturn { ${NAMES.join(', ')} };\n})()`).runInContext(context) as Styles;
}

/** This module, imported under `tty`. */
async function ours(tty: Tty): Promise<typeof real> {
  vi.resetModules();
  vi.doMock('node:tty', () => ({ default: tty }));
  return import('./yoctocolors.js');
}

afterEach(() => {
  vi.doUnmock('node:tty');
});

/** Every style of `module`, by yoctocolors' names. */
const styles = (module: typeof real): Styles => Object.fromEntries(NAMES.map((name) => [name, (module as unknown as Styles)[name] as Style]));

/** Inputs whose bytes every style must agree on: plain, each close code inside, and the coercions. */
function inputs(theirs: Styles): unknown[] {
  const nested = NAMES.flatMap((inner) => [`a ${String(theirs[inner]?.('b'))} c`, String(theirs[inner]?.(theirs[inner]?.('x'))), `x${String(theirs[inner]?.(''))}y${String(theirs[inner]?.('z'))}`]);
  return ['', 'foo', 'a\u001B[22mb\u001B[22mc', 'a\u001B[39mb', 123, undefined, null, { toString: () => 'x' }, { valueOf: () => 'v', toString: () => 't' }, ...nested];
}

describe('the surface is yoctocolors’', () => {
  it('exports every style yoctocolors exports, and no other value but the default', () => {
    expect(NAMES).toHaveLength(61);
    expect(Object.keys(real).filter((name) => name !== 'default').sort()).toEqual([...NAMES].sort());
  });

  it('is its own default export, as `export * as default` makes yoctocolors’', () => {
    expect(real.default.red).toBe(real.red);
    expect(Object.keys(real.default).filter((name) => name !== 'default').sort()).toEqual([...NAMES].sort());
  });
});

describe('every style gives yoctocolors’ value', () => {
  it.each([
    ['colour on', true],
    ['colour off', false],
  ])('%s, for every input, every pair of styles nested', async (_, on) => {
    const theirs = incumbent(terminal(on));
    const mine = styles(await ours(terminal(on)));
    for (const input of inputs(incumbent(terminal(true)))) {
      for (const name of NAMES) expect(mine[name]?.(input), `${name}(${JSON.stringify(String(input))})`).toBe(theirs[name]?.(input));
    }
  });

  it('closes and re-opens bold and dim, which share 22, and resumes any other style', async () => {
    const on = await ours(terminal(true));
    expect(on.bold(`a ${on.dim('b')} c`)).toBe('\u001B[1ma \u001B[2mb\u001B[22m\u001B[1m c\u001B[22m');
    expect(on.red(`a ${on.yellow('b')} c`)).toBe('\u001B[31ma \u001B[33mb\u001B[31m c\u001B[39m');
    expect(on.underlineRed(on.underlineCurly('typo'))).toBe('\u001B[58;5;1m\u001B[4:3mtypo\u001B[24m\u001B[59m');
  });

  it('hands the input back untouched when colour is off, a fresh function per style', async () => {
    const off = await ours(terminal(false));
    const value = { toString: () => 'x' };
    expect(off.red(value as unknown as string)).toBe(value);
    expect(off.red).not.toBe(off.bold);
  });
});

describe('colour is decided as yoctocolors decides it, once, at import', () => {
  it.each<[string, Tty]>([
    ['a terminal with colours', terminal(true)],
    ['a terminal without', terminal(false)],
    ['no node:tty default', undefined],
    ['no WriteStream', {}],
    ['no prototype', { WriteStream: {} }],
    ['no hasColors', { WriteStream: { prototype: {} } }],
  ])('%s', async (_, tty) => {
    const theirs = incumbent(tty);
    const mine = await ours(tty);
    expect(mine.red('x')).toBe(theirs['red']?.('x'));
  });

  it('asks Node, which reads FORCE_COLOR, in this process', () => {
    // The colour setup pins this process's environment before anything imports.
    expect(real.red('x')).toBe(incumbent(tty as unknown as Tty)['red']?.('x'));
  });
});
