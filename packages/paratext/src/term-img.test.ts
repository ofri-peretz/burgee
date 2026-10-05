/**
 * `paratext/term-img` — the drop-in, and the order it reads a file in.
 *
 * The compat oracle grades this façade against `term-img`'s own eighteen cases and is the
 * measurement that counts; this file exists for the three things that measurement cannot
 * state on its own.
 *
 *   1. **A path is read, and read late.** The subpath takes a file path (or a `URL`) and
 *      reads it *at the line upstream reads the file* — after the terminal check. The suite
 *      only proves a path renders *something*; this file proves it renders the file's bytes,
 *      and that a terminal which cannot draw never has the file opened
 *      (D-20260930-paratext-term-img-path).
 *   2. **The subpath registers nothing.** Same promise `link.test.ts` makes, same way of
 *      observing it: vitest gives each file its own module graph, so a registry that is
 *      still empty after importing this module is evidence rather than coincidence.
 *   3. **The terminal table is upstream's**, including the four version floors that only
 *      appear in upstream's suite as refusals.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, describe, expect, expectTypeOf, it } from 'vitest';

import { capabilities } from './capability.js';
import terminalImage, { type Options, supportsInlineImage, type TerminalImageOptions, terminalImageFor, UnsupportedTerminalError } from './term-img.js';

const BEL = '';
const OSC = ']';

/** No tty anywhere in this file: `term-img` never asks, and that is the point of the table. */
const at = (env: Record<string, string>) => ({ env, isTTY: { stdout: false } });
const wezterm = at({ TERM_PROGRAM: 'WezTerm', TERM_PROGRAM_VERSION: '20220319-123456-abcdefgh' });
const unsupported = at({});

const bytes = new Uint8Array([1, 2, 3, 4]);

describe('the subpath registers nothing', () => {
  it('leaves the capability registry empty', () => {
    // If `term-img.js` ever reaches `builtins.js` or `index.js`, this is seven names.
    expect(capabilities()).toEqual([]);
  });
});

describe('the terminal table is term-img`s, read from the environment alone', () => {
  it.each([
    ['iTerm2', { TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.3.7' }, true],
    ['iTerm2, five majors on — upstream reads the first character and would refuse this', { TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '10.2.1' }, true],
    ['WezTerm', { TERM_PROGRAM: 'WezTerm', TERM_PROGRAM_VERSION: '20220319-123456-abcdefgh' }, true],
    ['WezTerm, a day early', { TERM_PROGRAM: 'WezTerm', TERM_PROGRAM_VERSION: '20220318-123456-abcdefgh' }, false],
    ['Konsole', { KONSOLE_VERSION: '220400' }, true],
    ['Konsole, one release early', { KONSOLE_VERSION: '220300' }, false],
    ['Rio', { TERM_PROGRAM: 'rio', TERM_PROGRAM_VERSION: '0.1.13' }, true],
    ['Rio, one patch early', { TERM_PROGRAM: 'rio', TERM_PROGRAM_VERSION: '0.1.12' }, false],
    ['VSCode', { TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.80.0' }, true],
    ['VSCode, one minor early', { TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '1.79.0' }, false],
    ['a terminal that says nothing', {}, false],
    ['a version that does not parse', { TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: 'nightly' }, false],
    ['iTerm2 with no version', { TERM_PROGRAM: 'iTerm.app' }, false],
    ['WezTerm with no version', { TERM_PROGRAM: 'WezTerm' }, false],
    ['Rio with no version', { TERM_PROGRAM: 'rio' }, false],
    ['Rio, a major past the floor with a lower minor', { TERM_PROGRAM: 'rio', TERM_PROGRAM_VERSION: '1.0.0' }, true],
    ['VSCode, a major past the floor with a lower minor', { TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '2.0.0' }, true],
    ['VSCode, a major under the floor with a higher minor', { TERM_PROGRAM: 'vscode', TERM_PROGRAM_VERSION: '0.99.0' }, false],
  ])('%s', (_name, env, expected) => {
    expect(supportsInlineImage(at(env))).toBe(expected);
  });

  it('never consults the tty, because term-img does not', () => {
    // The divergence from `IMAGE.when` that the module comment argues for, pinned: adding a
    // `tty` clause here would turn every piped run into a thrown `UnsupportedTerminalError`.
    expect(supportsInlineImage({ env: { TERM_PROGRAM: 'WezTerm', TERM_PROGRAM_VERSION: '20220319-x' }, isTTY: { stdout: false } })).toBe(true);
  });
});

describe('bytes in, OSC 1337 out', () => {
  it('renders the incumbent`s sequence, size and all', () => {
    expect(terminalImageFor(wezterm)(bytes)).toBe(`${OSC}1337;File=inline=1;size=4:AQIDBA==${BEL}`);
  });

  it('writes the four optional groups in ansi-escapes` order', () => {
    expect(terminalImageFor(wezterm)(bytes, { width: 100, height: '50%', preserveAspectRatio: false })).toBe(`${OSC}1337;File=inline=1;width=100;height=50%;preserveAspectRatio=0;size=4:AQIDBA==${BEL}`);
  });
});

const call = () => terminalImageFor(unsupported)(bytes);

describe('the unsupported branch is upstream`s, including the throw', () => {
  it('throws UnsupportedTerminalError by name and by type', () => {
    expect(call).toThrow(UnsupportedTerminalError);
    expect(call).toThrow(/Supported terminals/);
  });

  it('calls a supplied fallback instead, and returns what it returns', () => {
    expect(terminalImageFor(unsupported)(bytes, { fallback: () => 'fallback-result' })).toBe('fallback-result');
  });

  it('throws when `fallback` is present but not callable', () => {
    // Upstream's `typeof options.fallback === 'function'` test, and a caller who passed a
    // string got the error rather than the string.
    expect(() => terminalImageFor(unsupported)(bytes, { fallback: 'not-a-function' as unknown as () => string })).toThrow(UnsupportedTerminalError);
  });
});

describe('`Image required` comes before the terminal is consulted', () => {
  it.each([['undefined', undefined], ['null', null], ['an empty string', ''], ['an empty Uint8Array', new Uint8Array(0)]] as const)('refuses %s', (_name, image) => {
    expect(() => terminalImageFor(wezterm)(image)).toThrow(new TypeError('Image required'));
  });

  it('refuses it on an unsupported terminal too — the order is upstream`s', () => {
    // Were the support check first, this would be `UnsupportedTerminalError`, and upstream's
    // four TypeError cases would depend on which terminal ran them.
    expect(() => terminalImageFor(unsupported)()).toThrow(TypeError);
  });
});

describe('a path is read, and read late — D-20260930-paratext-term-img-path', () => {
  // A real file with known bytes, so the assertion is on what was read rather than on a stub
  // of `node:fs`: the same four bytes as `bytes`, so path and bytes must render one sequence.
  const dir = mkdtempSync(join(tmpdir(), 'paratext-term-img-'));
  const file = join(dir, 'four.bin');
  writeFileSync(file, bytes);
  const missing = join(dir, 'missing.jpg');
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const expected = `${OSC}1337;File=inline=1;size=4:AQIDBA==${BEL}`;

  it('reads a string path and renders exactly what the bytes render', () => {
    expect(terminalImageFor(wezterm)(file)).toBe(expected);
  });

  it('reads a file URL too — a superset: upstream answers `Image required` to a URL', () => {
    expect(terminalImageFor(wezterm)(pathToFileURL(file))).toBe(expected);
  });

  it('passes the options through for a path as it does for bytes', () => {
    expect(terminalImageFor(wezterm)(file, { width: 100, height: 50 })).toBe(`${OSC}1337;File=inline=1;width=100;height=50;size=4:AQIDBA==${BEL}`);
  });

  it('lets `node:fs` report a missing file, as upstream does', () => {
    expect(() => terminalImageFor(wezterm)(missing)).toThrow(expect.objectContaining({ code: 'ENOENT' }));
  });

  it('**does not** open the file on an unsupported terminal — upstream never reaches its read', () => {
    // The order that keeps four of upstream's cases passing: a path handed to a terminal that
    // cannot draw it is `UnsupportedTerminalError` or the fallback, never `ENOENT`.
    expect(() => terminalImageFor(unsupported)(missing)).toThrow(UnsupportedTerminalError);
    expect(terminalImageFor(unsupported)(missing, { fallback: () => 'fallback-result' })).toBe('fallback-result');
    expect(terminalImageFor(unsupported)(pathToFileURL(missing), { fallback: () => 'fallback-result' })).toBe('fallback-result');
  });
});

/** term-img's README idiom: a `fallback` that does something else and returns nothing. */
const fallback = (): void => undefined;

describe('the types are upstream`s, so a typed term-img program compiles unchanged', () => {
  // Checked by `tsc` (`npm run typecheck`), not at run time: upstream's `Options` is generic
  // over what `fallback` returns, and its README's `fallback` returns nothing.
  it('takes a `fallback` that returns nothing, and types the call `string | void`', () => {
    const result = terminalImageFor(unsupported)(bytes, { fallback });
    expectTypeOf(result).toEqualTypeOf<string | void>();
    expect(result).toBeUndefined();
  });

  it('types a call with no `fallback` as `string`, which is what it returns', () => {
    expectTypeOf(terminalImageFor(wezterm)(bytes)).toEqualTypeOf<string>();
  });

  it('exports upstream`s `Options` name', () => {
    const options: Options<number> = { width: 1, fallback: () => 1 };
    expectTypeOf(options).toEqualTypeOf<TerminalImageOptions<number>>();
    expect(terminalImageFor(unsupported)(bytes, options)).toBe(1);
  });

  it('takes any `fallback` under a bare `Options`, as upstream`s `unknown` default does', () => {
    const options: Options = { fallback: () => 'fallback-result' };
    expect(terminalImageFor(unsupported)(bytes, options)).toBe('fallback-result');
  });
});

describe('the default export is the function, bound to this process', () => {
  it('is callable and validates its argument the same way', () => {
    expect(typeof terminalImage).toBe('function');
    expect(() => terminalImage()).toThrow(new TypeError('Image required'));
  });
});
