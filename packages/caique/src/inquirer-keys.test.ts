/**
 * `caique/inquirer`'s keypress vocabulary: the predicates a render function asks "was that up?"
 * with, and the keybinding sets they read. Pure data in, a boolean out — so every case here
 * states the key that counts and, beside it, the near miss that must not.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getDefaultKeybindings,
  isBackspaceKey,
  isDownKey,
  isEnterKey,
  isNumberKey,
  isShiftKey,
  isSpaceKey,
  isTabKey,
  isUpKey,
} from './inquirer.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getDefaultKeybindings', () => {
  it('is empty when INQUIRER_KEYBINDINGS is unset or empty', () => {
    vi.stubEnv('INQUIRER_KEYBINDINGS', undefined);
    expect(getDefaultKeybindings()).toEqual([]);
    vi.stubEnv('INQUIRER_KEYBINDINGS', '');
    expect(getDefaultKeybindings()).toEqual([]);
  });

  it('splits on spaces and commas, lowercases, drops unknown names and collapses duplicates', () => {
    vi.stubEnv('INQUIRER_KEYBINDINGS', 'VIM, emacs unknown,vim');
    expect(getDefaultKeybindings()).toEqual(['vim', 'emacs']);
  });

  it('reads the variable at call time, not at import', () => {
    vi.stubEnv('INQUIRER_KEYBINDINGS', 'emacs');
    expect(getDefaultKeybindings()).toEqual(['emacs']);
    vi.stubEnv('INQUIRER_KEYBINDINGS', 'vim');
    expect(getDefaultKeybindings()).toEqual(['vim']);
  });
});

describe('isUpKey and isDownKey', () => {
  it('always take the arrows, and nothing else with no keybindings', () => {
    expect(isUpKey({ name: 'up' })).toBe(true);
    expect(isDownKey({ name: 'down' })).toBe(true);
    expect(isUpKey({ name: 'k' })).toBe(false);
    expect(isDownKey({ name: 'j' })).toBe(false);
    expect(isUpKey({ name: 'p', ctrl: true })).toBe(false);
    expect(isDownKey({ name: 'n', ctrl: true })).toBe(false);
  });

  it('take k and j under vim, and not Ctrl-P or Ctrl-N', () => {
    expect(isUpKey({ name: 'k' }, ['vim'])).toBe(true);
    expect(isDownKey({ name: 'j' }, ['vim'])).toBe(true);
    expect(isUpKey({ name: 'p', ctrl: true }, ['vim'])).toBe(false);
    expect(isDownKey({ name: 'n', ctrl: true }, ['vim'])).toBe(false);
  });

  it('take Ctrl-P and Ctrl-N under emacs, and never a bare p or n', () => {
    expect(isUpKey({ name: 'p', ctrl: true }, ['emacs'])).toBe(true);
    expect(isDownKey({ name: 'n', ctrl: true }, ['emacs'])).toBe(true);
    expect(isUpKey({ name: 'p' }, ['emacs'])).toBe(false);
    expect(isDownKey({ name: 'n' }, ['emacs'])).toBe(false);
    expect(isUpKey({ name: 'k' }, ['emacs'])).toBe(false);
    expect(isDownKey({ name: 'j' }, ['emacs'])).toBe(false);
  });

  it('take both sets together', () => {
    expect(isUpKey({ name: 'k' }, ['emacs', 'vim'])).toBe(true);
    expect(isDownKey({ name: 'n', ctrl: true }, ['vim', 'emacs'])).toBe(true);
  });
});

describe('the single-key predicates', () => {
  it('name exactly one key each', () => {
    expect(isSpaceKey({ name: 'space' })).toBe(true);
    expect(isSpaceKey({ name: 'tab' })).toBe(false);
    expect(isBackspaceKey({ name: 'backspace' })).toBe(true);
    expect(isBackspaceKey({ name: 'delete' })).toBe(false);
    expect(isTabKey({ name: 'tab' })).toBe(true);
    expect(isTabKey({ name: 'space' })).toBe(false);
  });

  it('takes Enter under both names readline gives it', () => {
    expect(isEnterKey({ name: 'enter' })).toBe(true);
    expect(isEnterKey({ name: 'return' })).toBe(true);
    expect(isEnterKey({ name: 'space' })).toBe(false);
  });

  it('takes every digit and no letter', () => {
    for (const digit of '0123456789') expect(isNumberKey({ name: digit })).toBe(true);
    expect(isNumberKey({ name: 'a' })).toBe(false);
  });

  it('reads an absent shift flag as false', () => {
    expect(isShiftKey({ name: 'a', shift: true })).toBe(true);
    expect(isShiftKey({ name: 'a', shift: false })).toBe(false);
    expect(isShiftKey({ name: 'a' })).toBe(false);
  });
});
