/**
 * R8 — the `ansi-escapes`-compatible surface, and the line it will not cross.
 *
 * The incumbent's own suite is the other half of this file's argument: `npm run compat --
 * ansi-escapes` grades paratext against `ansi-escapes@7.3.0`'s four ava cases, and three of
 * them assert CSI (`cursorTo(2, 2)`, the clear sequence, `ESC [ ? 2026 h/l`). Since D-138
 * paratext implements the CSI half too, so the assertions here hold both halves from this
 * side: the four OSC members are byte-identical to the incumbent on a terminal that
 * understands them, and every CSI member is byte-identical to `ansi-escapes` 7.3.0 itself.
 *
 * Two of these tests exist because of a failure in this repo's own history. `closeout`'s
 * `onExit()` threw `ReferenceError` in a published release while 39 tests passed, because
 * every one of them injected a fake process and none called it the way the README does. So
 * the byte assertions run against an injected `Runtime` — and then `the way a caller
 * actually calls it` calls the exported function with no injection at all.
 */
import { describe, expect, it } from 'vitest';

import ansiEscapes, {
  ansiEscapesFor,
  beep,
  beginSynchronizedOutput,
  clearTerminal,
  ConEmu,
  cursorTo,
  image,
  iTerm,
  link,
  setCwd,
  synchronizedOutput,
} from './ansi-escapes.js';
import { emit } from './capability.js';
import { processRuntime, type Runtime } from './runtime.js';

const BEL = '\u0007';
const OSC = '\u001B]';

/** A terminal that understands everything paratext ships, with a `cwd` for `setCwd()`. */
const iterm: Runtime = { env: { TERM_PROGRAM: 'iTerm.app', TERM: 'xterm-256color' }, isTTY: { stdout: true }, cwd: '/work' };
/** A pipe: no TTY, so nothing may put a control byte into it. */
const pipe: Runtime = { env: {}, isTTY: { stdout: false }, cwd: '/work' };

describe('the ansi-escapes surface (R8)', () => {
  /**
   * The incumbent's `named export(s)` case, which is the one OSC case of its four and the
   * only one this row can legitimately pass: `t.is(setCwd, ansiEscapes.setCwd)`.
   */
  it('exports the same function objects by name and on the default export', () => {
    /* eslint-disable import-next/no-named-as-default-member -- reading the member off the
       default is not a style slip here, it is the assertion: the incumbent's suite does
       `t.is(setCwd, ansiEscapes.setCwd)`, and identity is what this case is for. */
    expect(ansiEscapes.setCwd).toBe(setCwd);
    expect(ansiEscapes.link).toBe(link);
    expect(ansiEscapes.image).toBe(image);
    expect(ansiEscapes.beep).toBe(beep);
    /* eslint-enable import-next/no-named-as-default-member */
  });

  it('emits exactly the bytes ansi-escapes 7.3.0 emits, on a terminal that understands', () => {
    const on = ansiEscapesFor(iterm);
    expect(on.link('Docs', 'https://x.dev')).toBe(`${OSC}8;;https://x.dev${BEL}Docs${OSC}8;;${BEL}`);
    // Upstream's `setCwd` is `iTerm.setCwd(cwd) + ConEmu.setCwd(cwd)`, which is what
    // paratext's one `cwd` capability already encodes, in that order.
    expect(on.setCwd('/tmp')).toBe(`${OSC}50;CurrentDir=/tmp${BEL}${OSC}9;9;/tmp${BEL}`);
    // `;size=` is not optional in practice — the spec allows leaving it out and xterm.js
    // requires it, which is why upstream always writes it.
    expect(on.image('A', { caption: 'a chart' })).toBe(`${OSC}1337;File=inline=1;size=1:QQ==${BEL}`);
    expect(on.image('A', { width: 40, height: '20px', preserveAspectRatio: false, caption: 'a chart' })).toBe(
      `${OSC}1337;File=inline=1;width=40;height=20px;preserveAspectRatio=0;size=1:QQ==${BEL}`,
    );
  });

  it('defaults setCwd to the runtime’s cwd, as ansi-escapes defaults it to process.cwd()', () => {
    expect(ansiEscapesFor(iterm).setCwd()).toBe(`${OSC}50;CurrentDir=/work${BEL}${OSC}9;9;/work${BEL}`);
  });

  it('beeps with the one byte the incumbent beeps with', () => {
    expect(beep).toBe(BEL);
  });
});

describe('the projection, which is the difference (R8, rule 6)', () => {
  it('degrades instead of writing OSC into a pipe', () => {
    const off = ansiEscapesFor(pipe);
    expect(off.link('Docs', 'https://x.dev')).toBe('Docs (https://x.dev)');
    expect(off.image('A', { caption: 'a chart' })).toBe('a chart');
    expect(off.setCwd('/tmp')).toBe('');
  });

  it('puts no escape byte at all into a pipe', () => {
    const off = ansiEscapesFor(pipe);
    const everything = off.link('Docs', 'https://x.dev') + off.image('A', { caption: 'c' }) + off.setCwd('/tmp');
    expect(everything).not.toMatch(/[\u001B\u0007]/);
  });
});

describe('the way a caller actually calls it', () => {
  /**
   * No injected runtime, no fake process — the README's call, against whatever this process
   * is. It cannot assert bytes (a CI runner has no tty and a developer's terminal does), so
   * it asserts the only thing that matters: the unfaked path runs, and it agrees with
   * `emit()` over the same runtime.
   */
  it('reads the process runtime itself, and agrees with emit() over it', () => {
    const runtime = processRuntime();
    expect(link('Docs', 'https://x.dev')).toBe(emit(runtime, 'link', { text: 'Docs', url: 'https://x.dev' }));
    expect(setCwd('/tmp')).toBe(emit(runtime, 'cwd', { path: '/tmp' }));
    expect(() => setCwd()).not.toThrow();
    expect(typeof image('A', { caption: 'c' })).toBe('string');
  });
});

describe('the CSI half, byte-exact with the incumbent (D-138)', () => {
  /**
   * Restated 2026-09-23. This block asserted that every CSI name was declared and `undefined`,
   * and that the default export carried only the four OSC members: paratext did not own CSI,
   * so the row's ceiling was 1 / 4 and `burgee migrate` could never move a program off
   * `ansi-escapes`. D-138 moved the CSI half here. The honest assertion now is equality with
   * the incumbent, member by member, against `ansi-escapes` 7.3.0 itself.
   */
  const CSI_VALUES = ['cursorLeft', 'cursorSavePosition', 'cursorRestorePosition', 'cursorGetPosition', 'cursorNextLine', 'cursorPrevLine', 'cursorHide', 'cursorShow', 'eraseEndLine', 'eraseStartLine', 'eraseLine', 'eraseDown', 'eraseUp', 'eraseScreen', 'scrollUp', 'scrollDown', 'clearScreen', 'clearViewport', 'clearTerminal', 'enterAlternativeScreen', 'exitAlternativeScreen', 'beginSynchronizedOutput', 'endSynchronizedOutput'] as const;

  it.each(CSI_VALUES)('%s is the incumbent\'s bytes', async (name) => {
    const incumbent = (await import('ansi-escapes')) as unknown as Record<string, unknown>;
    expect((ansiEscapes as unknown as Record<string, unknown>)[name]).toBe(incumbent[name]);
  });

  it('formats every CSI call the incumbent formats, argument for argument', async () => {
    const theirs = (await import('ansi-escapes')) as unknown as Record<string, (...a: unknown[]) => string>;
    const ours = ansiEscapes as unknown as Record<string, (...a: unknown[]) => string>;
    const calls: [string, unknown[]][] = [
      ['cursorTo', [2, 2]], ['cursorTo', [4]], ['cursorMove', [-3, 2]], ['cursorMove', [5, -1]], ['cursorMove', [0, 0]],
      ['cursorUp', []], ['cursorUp', [3]], ['cursorDown', [2]], ['cursorForward', [7]], ['cursorBackward', []],
      ['eraseLines', [0]], ['eraseLines', [1]], ['eraseLines', [3]], ['synchronizedOutput', ['foo']],
    ];
    for (const [name, args] of calls) expect(ours[name]?.(...args), `${name}(${args.join(', ')})`).toBe(theirs[name]?.(...args));
    expect(() => ours['cursorTo']?.()).toThrow(TypeError);
  });

  it('puts the CSI half on the default export, and the named export is the same function', () => {
    // eslint-disable-next-line import-next/no-named-as-default-member -- the member and the named export being one function is the assertion; ansi-escapes' own suite asserts the same
    expect(ansiEscapes.cursorTo).toBe(cursorTo);
    expect(ansiEscapes).toHaveProperty('clearTerminal', clearTerminal);
    expect(beginSynchronizedOutput).toBe('\u001B[?2026h');
    expect(synchronizedOutput('x')).toBe('\u001B[?2026hx\u001B[?2026l');
  });

  /** OSC, but no capability ships them yet: `iTerm.annotation` and ConEmu's progress bar. */
  it('declares the OSC members it has no capability for yet', () => {
    expect(iTerm).toBeUndefined();
    expect(ConEmu).toBeUndefined();
  });
});
