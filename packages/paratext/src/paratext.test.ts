/**
 * The two things this package promises, and one it promises about itself.
 *
 * 1. Every capability emits its sequence where the terminal understands it.
 * 2. Every capability has a static projection, and `emit` uses it everywhere else — which is
 *    the whole reason to prefer this over `ansi-escapes`.
 * 3. A third party can add or replace a capability through the same call the built-ins use.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { bell, clipboard, cwd, image, link, notify, registerBuiltins, title } from './builtins.js';
import { type Capability, capabilities, capability, emit, register, reset } from './capability.js';
import { type Runtime } from './runtime.js';

const BEL = '\u0007';
const OSC = '\u001B]';

/** A terminal that understands everything we ship. */
const iterm: Runtime = { env: { TERM_PROGRAM: 'iTerm.app', TERM: 'xterm-256color' }, isTTY: { stdout: true } };
/** A pipe: no TTY, so nothing may emit a control byte into it. */
const pipe: Runtime = { env: {}, isTTY: { stdout: false } };

beforeEach(() => {
  reset();
  registerBuiltins();
});

describe('what it ships', () => {
  it('registers every capability under a name, and nothing else', () => {
    expect(capabilities()).toEqual(['bell', 'clipboard', 'cwd', 'image', 'link', 'notify', 'title']);
  });

  it('emits the sequences a supporting terminal understands', () => {
    expect(emit(iterm, 'link', { text: 'Docs', url: 'https://x.dev' })).toBe(`${OSC}8;;https://x.dev${BEL}Docs${OSC}8;;${BEL}`);
    expect(emit(iterm, 'title', { text: 'build' })).toBe(`${OSC}0;build${BEL}`);
    expect(emit(iterm, 'clipboard', { text: 'hi' })).toBe(`${OSC}52;c;aGk=${BEL}`);
    expect(emit(iterm, 'bell')).toBe(BEL);
    expect(emit(iterm, 'image', { base64: 'QQ==', caption: 'a chart' })).toBe(`${OSC}1337;File=inline=1:QQ==${BEL}`);
  });
});

describe('the projection, which is the point', () => {
  it('prints something a human can read instead of bytes a pipe cannot', () => {
    expect(emit(pipe, 'link', { text: 'Docs', url: 'https://x.dev' })).toBe('Docs (https://x.dev)');
    expect(emit(pipe, 'image', { base64: 'QQ==', caption: 'a chart' })).toBe('a chart');
    expect(emit(pipe, 'notify', { title: 'Done', body: '3 files' })).toBe('Done: 3 files');
  });

  it('emits no control byte at all into a pipe', () => {
    const everything = [
      emit(pipe, 'link', { text: 'a', url: 'b' }),
      emit(pipe, 'image', { base64: 'QQ==', caption: 'c' }),
      emit(pipe, 'title', { text: 't' }),
      emit(pipe, 'clipboard', { text: 'x' }),
      emit(pipe, 'notify', { title: 'n' }),
      emit(pipe, 'cwd', { path: '/tmp' }),
      emit(pipe, 'bell'),
    ].join('');
    // The failure this guards is the one every incumbent ships: `]1337;File=inline=1;…`
    // printed across a user's screen, or an escape byte landing in a log file.
    expect(everything).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  });

  it('gives every capability a fallback — a sequence with no projection is not shippable', () => {
    for (const name of capabilities()) {
      expect(typeof capability(name)?.fallback, name).toBe('function');
    }
  });
});

describe('what a third party can do', () => {
  it('adds a capability the package never heard of, through the public call', () => {
    // Kitty's graphics protocol, in the fifteen lines the README promises.
    const kitty: Capability = {
      name: 'kitty-image',
      supports: (runtime) => runtime.env['TERM'] === 'xterm-kitty',
      encode: ({ base64 = '' }) => `\u001B_Ga=T,f=100;${base64}\u001B\\`,
      fallback: ({ caption = '' }) => caption,
    };
    register(kitty);

    expect(capabilities()).toContain('kitty-image');
    const kittyTerm: Runtime = { env: { TERM: 'xterm-kitty' }, isTTY: { stdout: true } };
    expect(emit(kittyTerm, 'kitty-image', { base64: 'QQ==', caption: 'chart' })).toBe('\u001B_Ga=T,f=100;QQ==\u001B\\');
    expect(emit(pipe, 'kitty-image', { base64: 'QQ==', caption: 'chart' })).toBe('chart');
  });

  it('replaces one of ours by name, so a mis-detected terminal is the caller’s to fix', () => {
    // We guess `link` support from TERM_PROGRAM. A caller who knows better says so, rather
    // than patching the package or going without.
    register({ ...link, supports: () => true });
    expect(emit(pipe, 'link', { text: 'Docs', url: 'https://x.dev' })).toBe(`${OSC}8;;https://x.dev${BEL}Docs${OSC}8;;${BEL}`);
  });

  it('refuses a capability with no fallback, at registration rather than at output', () => {
    const broken = { name: 'broken', supports: () => true, encode: () => 'x' } as unknown as Capability;
    expect(() => register(broken)).toThrow(/fallback must be a function/);
  });

  it('falls back to the input for a name nobody registered, rather than throwing at 3am', () => {
    expect(emit(iterm, 'not-a-capability', { text: 'plain text' })).toBe('plain text');
  });
});

describe('the built-ins are not special', () => {
  it('every one of them is reachable, replaceable and removable like any other', () => {
    for (const shipped of [bell, clipboard, cwd, image, link, notify, title]) {
      expect(capability(shipped.name)?.name).toBe(shipped.name);
    }
    reset();
    expect(capabilities()).toEqual([]);
  });
});
