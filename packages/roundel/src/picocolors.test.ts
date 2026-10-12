/**
 * `roundel/picocolors` — picocolors 1.1.1, which picocolors' own `tests/test.js` grades in
 * `compat-oracle` (`graded-override-targets` R7).
 *
 * picocolors' `npm test` runs that one file. Its other file, `tests/environments.js`, decides
 * colour support by evaluating picocolors' *source text* in a `vm` context with a fake `process`,
 * which only a single self-contained script can pass, and upstream does not run it. Its nine
 * environments are held here instead, differentially: the same fake process goes to picocolors'
 * own source, evaluated exactly as that file evaluates it, and to this façade through
 * `runtime.ts`, and the two must agree.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script, createContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

import pc, { createColors, isColorSupported } from './picocolors.js';

const require = createRequire(import.meta.url);
const SOURCE = readFileSync(require.resolve('picocolors/picocolors.js'), 'utf8');

interface World {
  env: Record<string, string | undefined>;
  argv?: string[];
  platform?: string;
  isTTY?: boolean;
}

/** picocolors' own module, evaluated the way `tests/environments.js` evaluates it. */
function incumbent({ env, argv = [], platform = 'darwin', isTTY = false }: World): { isColorSupported: boolean; red: (s: string) => string } {
  const context = createContext({ process: { env, argv, platform, stdout: { isTTY } }, module: { exports: {} } });
  // eslint-disable-next-line node-security/detect-eval-with-expression -- the source is picocolors' own installed file, evaluated exactly as its `tests/environments.js` evaluates it; that evaluation is the comparison
  new Script(SOURCE).runInContext(context);
  return (context as { module: { exports: { isColorSupported: boolean; red: (s: string) => string } } }).module.exports;
}

/** This façade, over a runtime that reports `world`. */
async function ours({ env, argv = [], platform = 'darwin', isTTY = false }: World): Promise<typeof pc> {
  vi.resetModules();
  vi.doMock('./runtime.js', () => ({ processRuntime: () => ({ env, argv, isTTY: { stdout: isTTY } }) }));
  vi.doMock('node:os', () => ({ platform: () => platform }));
  return (await import('./picocolors.js')).default;
}

afterEach(() => {
  vi.doUnmock('./runtime.js');
  vi.doUnmock('node:os');
});

// tests/environments.js's nine, plus a TTY with and without `TERM=dumb`.
const WORLDS: [string, World][] = [
  ['ci server', { env: { TERM: 'dumb', CI: '1' } }],
  ['arg --color', { env: { TERM: 'dumb' }, argv: ['--color'] }],
  ['env NO_COLOR', { env: { FORCE_COLOR: '1', NO_COLOR: '1' } }],
  ['env NO_COLOR empty', { env: { NO_COLOR: '', CI: '1' } }],
  ['env FORCE_COLOR', { env: { TERM: 'dumb', FORCE_COLOR: '1' } }],
  ['arg --no-color', { env: { FORCE_COLOR: '1' }, argv: ['--no-color'] }],
  ['no term', { env: { TERM: 'dumb' } }],
  ['windows', { env: { TERM: 'dumb' }, platform: 'win32' }],
  ['edge runtime', { env: { FORCE_COLOR: '1' } }],
  ['a terminal', { env: { TERM: 'xterm-256color' }, isTTY: true }],
  ['a dumb terminal', { env: { TERM: 'dumb' }, isTTY: true }],
];

describe('colour support is decided as picocolors decides it', () => {
  it.each(WORLDS)('%s', async (_, world) => {
    const theirs = incumbent(world);
    const mine = await ours(world);
    expect(mine.isColorSupported).toBe(theirs.isColorSupported);
    expect(mine.red('text')).toBe(theirs.red('text'));
  });
});

describe('the styles are picocolors’ bytes', () => {
  const on = createColors(true);
  const theirs = incumbent({ env: { FORCE_COLOR: '1' } }) as unknown as Record<string, (s: unknown) => string>;

  it('styles every name the way picocolors does, nested closes included', () => {
    for (const [name, style] of Object.entries(on)) {
      if (name === 'isColorSupported') continue;
      const format = style as (s: unknown) => string;
      expect(format(`a ${on.red('b')} ${on.bold(on.dim('c'))} d`)).toBe((theirs[name] as (s: unknown) => string)(`a ${on.red('b')} ${on.bold(on.dim('c'))} d`));
    }
  });

  it('stringifies as "" + input does, valueOf first', () => {
    const value = { valueOf: () => 'v', toString: () => 't' };
    expect(on.red(value)).toBe(theirs['red']?.(value));
    expect(on.red(undefined)).toBe('\u001B[31mundefined\u001B[39m');
  });

  it('returns plain strings when colour is off', () => {
    const off = createColors(false);
    expect(off.isColorSupported).toBe(false);
    expect(off.bold(42)).toBe('42');
  });

  it('is one object with createColors on it, as picocolors’ module is', () => {
    expect(pc).toMatchObject({ createColors, isColorSupported });
  });
});
