/**
 * R8 — the `ansi-escapes`-compatible surface, and the line it will not cross.
 *
 * The incumbent's own suite is the other half of this file's argument: `npm run compat --
 * ansi-escapes` grades paratext against `ansi-escapes@7.3.0`'s four ava cases, and three of
 * them assert CSI (`cursorTo(2, 2)`, the clear sequence, `ESC [ ? 2026 h/l`). paratext owns
 * OSC and says so, so **the ceiling on that row is 1 / 4 and 25% means complete** — see the
 * `ansi-escapes` entry in `compat-oracle/src/hosts.ts`. The assertions here are written to
 * hold that line from this side: the four OSC members are byte-identical to the incumbent,
 * and every CSI name is declared and empty on purpose.
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

describe('the half paratext does not own', () => {
  /**
   * Declared and empty. The names exist so that `import ansiEscapes, { cursorTo } from
   * 'paratext'` *loads* — an ESM named import of a name the module does not export is a
   * `SyntaxError` that takes the whole module down, which is exactly the one line of TAP
   * this row printed before R8 — and they are `undefined` because paratext does not
   * implement CSI. TypeScript types each as `undefined`, so calling one is a compile error
   * rather than a runtime surprise.
   */
  it('declares every CSI name ansi-escapes exports, and implements none of them', () => {
    expect(cursorTo).toBeUndefined();
    expect(clearTerminal).toBeUndefined();
    expect(beginSynchronizedOutput).toBeUndefined();
    expect(synchronizedOutput).toBeUndefined();
  });

  /**
   * The default export carries only what paratext implements. A CSI key present with an
   * `undefined` value would read as a claim being made and not kept; absence is the honest
   * shape, and it keeps the incumbent's three CSI cases failing for the stated reason
   * rather than passing by accident.
   */
  it('keeps the default export to the members it implements', () => {
    expect(Object.keys(ansiEscapes).toSorted()).toEqual(['beep', 'image', 'link', 'setCwd']);
    expect(ansiEscapes).not.toHaveProperty('cursorTo');
  });

  /** OSC, but no capability ships them yet: `iTerm.annotation` and ConEmu's progress bar. */
  it('declares the OSC members it has no capability for yet', () => {
    expect(iTerm).toBeUndefined();
    expect(ConEmu).toBeUndefined();
  });
});
