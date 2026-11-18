/**
 * The root entry registers what the package ships — through `ansi-escapes.js`, which it
 * re-exports and which runs `registerBuiltins()` as it loads.
 *
 * `link.test.ts` and `term-img.test.ts` prove the narrow subpaths register *nothing*; this is
 * the other half of the same promise. Vitest gives each test file its own module graph, so an
 * import of the root here starts from an empty registry, and the seven names below are there
 * only because importing `index.js` put them there.
 */
import { describe, expect, it } from 'vitest';

import { capabilities, emit } from './index.js';

describe('importing the root', () => {
  it('registers every built-in, so emit() reaches them without a setup call', () => {
    expect(capabilities()).toEqual(['bell', 'clipboard', 'cwd', 'image', 'link', 'notify', 'title']);
    expect(emit({ env: {}, isTTY: { stdout: false } }, 'link', { text: 'Docs', url: 'https://x.dev' })).toBe('Docs (https://x.dev)');
  });
});

describe('the root exports', () => {
  it('names exactly what it named when each one was listed by hand', async () => {
    const root = await import('./index.js');
    // The drop-in half arrives by `export * from './ansi-escapes.js'` since 2026-11-17, so the
    // list is written here instead: a name gained or lost through that line fails this.
    expect(Object.keys(root).toSorted()).toEqual(
      [
        'default', 'ansiEscapesFor', 'beep', 'beginSynchronizedOutput', 'clearScreen', 'clearTerminal', 'clearViewport', 'ConEmu', 'cursorBackward', 'cursorDown',
        'cursorForward', 'cursorGetPosition', 'cursorHide', 'cursorLeft', 'cursorMove', 'cursorNextLine', 'cursorPrevLine', 'cursorRestorePosition', 'cursorSavePosition',
        'cursorShow', 'cursorTo', 'cursorUp', 'endSynchronizedOutput', 'enterAlternativeScreen', 'eraseDown', 'eraseEndLine', 'eraseLine', 'eraseLines', 'eraseScreen',
        'eraseStartLine', 'eraseUp', 'exitAlternativeScreen', 'image', 'iTerm', 'link', 'scrollDown', 'scrollUp', 'setCwd', 'synchronizedOutput',
        'bell', 'builtins', 'clipboard', 'cwd', 'notify', 'registerBuiltins', 'title',
        'CapabilityError', 'DEPRECATED', 'capabilities', 'capability', 'check', 'emit', 'isDeprecation', 'refusals', 'register', 'reset', 'supports',
        'processRuntime', 'fieldsUsed', 'render',
      ].toSorted(),
    );
  });
});
