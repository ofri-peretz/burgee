/**
 * `caique/inquirer`'s theme: the defaults a prompt draws with, and the deep merge a caller's
 * partial theme goes through. The merge is the part with rules — per key, last one wins,
 * arrays and functions replaced whole, `undefined` themes skipped, prototype keys refused —
 * and each rule is a case here.
 *
 * The style functions are asserted in colour: the suite pins `NO_COLOR`, under which every
 * one of them would print its bare text and a swapped colour would pass unseen.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultTheme, getDefaultTheme, makeTheme, Separator } from './inquirer.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const ESC = '\u001B';

/** A caller's own style function, to see it replace the default rather than wrap it. */
const answer = (text: string): string => `<${text}>`;

describe('the default style functions', () => {
  it('colour each role the way @inquirer/core does', () => {
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', '1');
    const { style } = defaultTheme;
    expect(style.answer('a')).toBe(`${ESC}[36ma${ESC}[39m`);
    expect(style.message('m', 'idle')).toBe(`${ESC}[1mm${ESC}[22m`);
    expect(style.error('e')).toBe(`${ESC}[31m> e${ESC}[39m`);
    expect(style.defaultAnswer('d')).toBe(`${ESC}[2m(d)${ESC}[22m`);
    expect(style.help('h')).toBe(`${ESC}[2mh${ESC}[22m`);
    expect(style.highlight('x')).toBe(`${ESC}[36mx${ESC}[39m`);
    expect(style.key('k')).toBe(`${ESC}[36m${ESC}[1m<k>${ESC}[22m${ESC}[39m`);
  });
});

describe('getDefaultTheme', () => {
  it('folds INQUIRER_KEYBINDINGS in on every call, leaving the defaults untouched', () => {
    vi.stubEnv('INQUIRER_KEYBINDINGS', 'vim');
    expect(getDefaultTheme().keybindings).toEqual(['vim']);
    vi.stubEnv('INQUIRER_KEYBINDINGS', 'emacs');
    expect(getDefaultTheme().keybindings).toEqual(['emacs']);
    expect(defaultTheme.keybindings).toEqual([]);
  });
});

describe('makeTheme', () => {
  it('is the defaults when given nothing, or only undefined and null', () => {
    expect(makeTheme()).toEqual(getDefaultTheme());
    expect(makeTheme(undefined, null as never)).toEqual(getDefaultTheme());
  });

  it('merges nested objects key by key, keeping default prefixes a caller did not name', () => {
    const theme = makeTheme({ prefix: { idle: '?', custom: '!' } as Record<string, string> });
    expect(theme.prefix).toEqual({ idle: '?', done: (defaultTheme.prefix as Record<string, string>)['done'], custom: '!' });
    expect(theme.spinner).toEqual(defaultTheme.spinner);
  });

  it('lets the last theme win per leaf', () => {
    const theme = makeTheme({ spinner: { interval: 10 } }, { spinner: { interval: 20 } });
    expect(theme.spinner.interval).toBe(20);
    expect(theme.spinner.frames).toEqual(defaultTheme.spinner.frames);
  });

  it('replaces a plain value with an object, and an object with a plain value', () => {
    expect(makeTheme({ prefix: 'P' }).prefix).toBe('P');
    expect(makeTheme<object>({ prefix: 'P' }, { prefix: { idle: 'I' } }).prefix).toEqual({ idle: 'I' });
  });

  it('replaces arrays, functions and class instances whole rather than merging into them', () => {
    const separator = new Separator('--');
    const theme = makeTheme<{ extra: unknown }>({ spinner: { frames: ['x'] }, style: { answer } }, { extra: separator }, { extra: new Separator('==') });
    expect(theme.spinner.frames).toEqual(['x']);
    expect(theme.style.answer).toBe(answer);
    expect(theme.style.error).toBe(defaultTheme.style.error);
    // A Separator is not a plain object, so the second one replaces the first outright.
    expect(theme.extra).toEqual(new Separator('=='));
    expect(theme.extra).not.toBe(separator);
  });

  it('replaces an object with no prototype whole, as @inquirer/core does', () => {
    // The incumbent's `isPlainObject` walks to the end of the chain and compares; an object
    // whose chain is empty compares `null` with itself and is not plain. A drop-in that
    // merged it would keep a `done` prefix the incumbent drops.
    const bare = Object.assign(Object.create(null) as Record<string, string>, { idle: 'I' });
    const theme = makeTheme<object>({ prefix: { done: 'D' } }, { prefix: bare });
    expect(theme.prefix).toBe(bare);
  });

  it('drops __proto__, constructor and prototype keys, so a theme cannot swap a prototype', () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1, "prototype": 2, "style": {"__proto__": {"polluted": true}}}') as Record<string, unknown>;
    const theme = makeTheme(hostile) as unknown as Record<string, unknown>;
    expect(Object.getPrototypeOf(theme)).toBe(Object.prototype);
    expect(theme['polluted']).toBeUndefined();
    expect(Object.keys(theme)).not.toContain('constructor');
    expect(Object.keys(theme)).not.toContain('prototype');
    expect((theme['style'] as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

/**
 * `TICK` is read at import, as `figures` reads it, so each case imports a fresh module under
 * the platform and environment it names. Only the Windows side is stated here: the variables
 * cleared are every one the is-unicode-supported check reads, so the answer is the same
 * whichever copy of that check decides it.
 */
describe('the tick on a Windows console', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor;
  const UNICODE_VARIABLES = ['CI', 'WT_SESSION', 'TERMINUS_SUBLIME', 'ConEmuTask', 'TERM_PROGRAM', 'TERM', 'TERMINAL_EMULATOR'];

  afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
    vi.resetModules();
  });

  async function tickOnWindows(env: Record<string, string>): Promise<string> {
    for (const name of UNICODE_VARIABLES) vi.stubEnv(name, undefined);
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    vi.resetModules();
    return (await import('./inquirer-theme.js')).TICK;
  }

  it('is √ on a console that is neither Windows Terminal nor VS Code', async () => {
    expect(await tickOnWindows({})).toBe('√');
  });

  it('is ✔ under Windows Terminal, VS Code, or an xterm-256color TERM', async () => {
    expect(await tickOnWindows({ WT_SESSION: '1' })).toBe('✔');
    expect(await tickOnWindows({ TERM_PROGRAM: 'vscode' })).toBe('✔');
    expect(await tickOnWindows({ TERM: 'xterm-256color' })).toBe('✔');
  });
});
