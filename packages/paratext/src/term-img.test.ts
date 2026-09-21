/**
 * `paratext/term-img` — the drop-in, and the one thing it deliberately will not do.
 *
 * The compat oracle grades this façade against `term-img`'s own eighteen cases and is the
 * measurement that counts; this file exists for the three things that measurement cannot
 * state on its own.
 *
 *   1. **The ceiling is a decision, not a bug.** D-030 says `image` takes bytes, so a path
 *      is refused — and it is refused *at the line upstream reads the file*, which is what
 *      keeps the twelve gradeable cases gradeable. Both halves are asserted here, because a
 *      later "helpful" change that moved the refusal earlier would take four passing cases
 *      down with it and the oracle would report it as a compatibility regression with no
 *      explanation attached.
 *   2. **The subpath registers nothing.** Same promise `link.test.ts` makes, same way of
 *      observing it: vitest gives each file its own module graph, so a registry that is
 *      still empty after importing this module is evidence rather than coincidence.
 *   3. **The terminal table is upstream's**, including the four version floors that only
 *      appear in upstream's suite as refusals.
 */
import { describe, expect, it } from 'vitest';

import { capabilities } from './capability.js';
import terminalImage, { supportsInlineImage, terminalImageFor, UnsupportedTerminalError } from './term-img.js';

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

describe('the unsupported branch is upstream`s, including the throw', () => {
  it('throws UnsupportedTerminalError by name and by type', () => {
    const call = () => terminalImageFor(unsupported)(bytes);
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

describe('a path is refused, and refused late — D-030', () => {
  it('names the decision rather than failing at an fs call nobody made', () => {
    expect(() => terminalImageFor(wezterm)('fixture.jpg')).toThrow(/D-030/);
  });

  it('is a TypeError, not an UnsupportedTerminalError: the terminal was fine', () => {
    expect(() => terminalImageFor(wezterm)('fixture.jpg')).toThrow(TypeError);
    expect(() => terminalImageFor(wezterm)('fixture.jpg')).not.toThrow(UnsupportedTerminalError);
  });

  it('**does not** pre-empt the unsupported branch, which is what keeps four cases gradeable', () => {
    // The whole reason the refusal sits where upstream's `readFileSync` sits. A path handed
    // to a terminal that cannot draw it is upstream's `UnsupportedTerminalError`, because
    // upstream would not have opened the file either.
    expect(() => terminalImageFor(unsupported)('fixture.jpg')).toThrow(UnsupportedTerminalError);
    expect(terminalImageFor(unsupported)('fixture.jpg', { fallback: () => 'fallback-result' })).toBe('fallback-result');
  });
});

describe('the default export is the function, bound to this process', () => {
  it('is callable and validates its argument the same way', () => {
    expect(typeof terminalImage).toBe('function');
    expect(() => terminalImage()).toThrow(new TypeError('Image required'));
  });
});
