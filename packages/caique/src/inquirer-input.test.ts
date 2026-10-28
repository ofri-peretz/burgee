/**
 * `input`, `number`, `password` and `confirm`, in this process.
 *
 * Their public grade is each package's own suite through `compat-oracle`, against `dist/` in
 * another process. Every branch is driven again here, through the screens those suites
 * assert: the dimmed default and what Tab and Backspace do to it, a failed validation putting
 * the typed text back into the line, the mask, and the words `confirm` reads.
 */
import { stripVTControlCharacters } from 'node:util';

import { describe, expect, it, vi } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { isStepOf } from './inquirer-input.js';
import { confirm, input, number, password } from './inquirer-prompts.js';
import { cursorTo } from './inquirer-screen.js';
import { TICK } from './inquirer-theme.js';

const frame = (...lines: string[]): string => lines.join('\n');

/** The first line of a raw frame, escapes stripped. */
const line = (raw: string): string => stripVTControlCharacters(raw).split('\n')[0] ?? '';

/** Upper case while typing, bracketed once final. */
const transformer = (value: string, { isFinal }: { isFinal: boolean }): string => (isFinal ? `[${value}]` : value.toUpperCase());

describe('input', () => {
  it('answers with what was typed', async () => {
    const { answer, events, getScreen } = await render(input, { message: 'Name' });
    expect(getScreen()).toBe('? Name');
    events.type('Ada');
    expect(getScreen()).toBe('? Name Ada');
    events.keypress('enter');
    await expect(answer).resolves.toBe('Ada');
    expect(getScreen()).toBe(`${TICK} Name Ada`);
  });

  it('shows a default dimmed, answers with it on Enter, and takes a number as one', async () => {
    const { answer, events, getScreen } = await render(input, { message: 'Port', default: 8080 as unknown as string });
    expect(getScreen()).toBe('? Port (8080)');
    events.keypress('enter');
    await expect(answer).resolves.toBe('8080');
  });

  it('copies the default into the line on Tab, and drops it on Backspace over an empty line', async () => {
    const tab = await render(input, { message: 'Name', default: 'Ada' });
    tab.events.keypress('tab');
    expect(tab.getScreen()).toBe('? Name Ada');
    const backspace = await render(input, { message: 'Name', default: 'Ada' });
    backspace.events.keypress('backspace');
    expect(backspace.getScreen()).toBe('? Name');
    backspace.events.keypress('enter');
    await expect(backspace.answer).resolves.toBe('');
  });

  it('starts with the default in the line under prefill: editable', async () => {
    const { answer, events, getScreen } = await render(input, { message: 'Name', default: 'Ada', prefill: 'editable' });
    await vi.waitFor(() => {
      expect(getScreen()).toBe('? Name Ada');
    });
    events.keypress('enter');
    await expect(answer).resolves.toBe('Ada');
  });

  it('does not prefill when there is no default', async () => {
    const { getScreen } = await render(input, { message: 'Name', prefill: 'editable' });
    expect(getScreen()).toBe('? Name');
  });

  it('refuses an empty answer when required, and a pattern miss, keeping what was typed', async () => {
    const { answer, events, getScreen } = await render(input, { message: 'Code', required: true, pattern: /^\d+$/u, patternError: 'digits only' });
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toBe(frame('? Code', '> You must provide a value'));
    });
    events.type('ab');
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toBe(frame('? Code ab', '> digits only'));
    });
    events.keypress('backspace');
    events.keypress('backspace');
    events.type('12');
    events.keypress('enter');
    await expect(answer).resolves.toBe('12');
  });

  it('uses a default pattern message, and validate, and its default message for false', async () => {
    const pattern = await render(input, { message: 'Code', pattern: /^x$/u });
    pattern.events.type('y');
    pattern.events.keypress('enter');
    await vi.waitFor(() => {
      expect(pattern.getScreen()).toContain('> Invalid input');
    });
    const validate = await render(input, { message: 'Code', validate: async (value: string) => value.length > 1 || false });
    validate.events.type('y');
    validate.events.keypress('enter');
    await vi.waitFor(() => {
      expect(validate.getScreen()).toContain('> You must provide a valid value');
    });
  });

  it('clears the line on a failed validation when the theme says so', async () => {
    const { events, getScreen } = await render(input, { message: 'Code', validate: () => 'no', theme: { validationFailureMode: 'clear' } });
    events.type('abc');
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toBe(frame('? Code', '> no'));
    });
  });

  it('ignores keys while a validation is in flight', async () => {
    let release!: (verdict: boolean) => void;
    const { answer, events } = await render(input, { message: 'Code', validate: async () => new Promise<boolean>((resolve) => (release = resolve)) });
    events.type('a');
    events.keypress('enter');
    events.type('b');
    release(true);
    await expect(answer).resolves.toBe('a');
  });

  it('draws the value through a transformer, told whether it is final', async () => {
    const { answer, events, getScreen } = await render(input, { message: 'Name', transformer });
    events.type('ada');
    expect(getScreen()).toBe('? Name ADA');
    events.keypress('enter');
    await expect(answer).resolves.toBe('ada');
    expect(getScreen()).toBe(`${TICK} Name [ada]`);
  });
});

describe('number', () => {
  it('answers with a number, or with nothing when nothing is typed', async () => {
    const typed = await render(number, { message: 'Age' });
    typed.events.type('42');
    typed.events.keypress('enter');
    await expect(typed.answer).resolves.toBe(42);
    expect(typed.getScreen()).toBe(`${TICK} Age 42`);
    const empty = await render(number, { message: 'Age' });
    empty.events.keypress('enter');
    await expect(empty.answer).resolves.toBeUndefined();
  });

  it('reads a line of only whitespace as empty: the default, or a refusal under required, as @inquirer/number 4.2.5 does', async () => {
    const fallback = await render(number, { message: 'Age', default: 35 });
    fallback.events.type('  ');
    fallback.events.keypress('enter');
    await expect(fallback.answer).resolves.toBe(35);
    expect(fallback.getScreen()).toBe(`${TICK} Age 35`);
    const refused = await render(number, { message: 'Age', required: true });
    refused.events.type('  ');
    refused.events.keypress('enter');
    await vi.waitFor(() => {
      expect(refused.getScreen()).toContain('> You must provide a valid numeric value');
    });
  });

  it('shows a usable default, ignores one outside the bounds, and copies it on Tab', async () => {
    const shown = await render(number, { message: 'Age', default: 30 });
    expect(shown.getScreen()).toBe('? Age (30)');
    shown.events.keypress('tab');
    expect(shown.getScreen()).toBe('? Age 30');
    const ignored = await render(number, { message: 'Age', default: 300, max: 120 });
    expect(ignored.getScreen()).toBe('? Age');
    const dropped = await render(number, { message: 'Age', default: 30 });
    dropped.events.keypress('backspace');
    expect(dropped.getScreen()).toBe('? Age');
  });

  it('refuses what is not a number, outside the bounds, or off the step', async () => {
    const { answer, events, getScreen } = await render(number, { message: 'N', min: 1, max: 9, step: 2, required: true });
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> You must provide a valid numeric value');
    });
    events.type('12');
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> Value must be between 1 and 9');
    });
    events.keypress('backspace');
    events.keypress('backspace');
    events.type('4');
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> Value must be a multiple of 2 starting from 1');
    });
    events.keypress('backspace');
    events.type('5');
    events.keypress('enter');
    await expect(answer).resolves.toBe(5);
  });

  it('says only the step when there is no lower bound, and accepts any value under step: any', async () => {
    const stepped = await render(number, { message: 'N', step: 0.5 });
    stepped.events.type('0.7');
    stepped.events.keypress('enter');
    await vi.waitFor(() => {
      expect(stepped.getScreen()).toContain('> Value must be a multiple of 0.5');
    });
    expect(stepped.getScreen()).not.toContain('starting from');
    const any = await render(number, { message: 'N', step: 'any' });
    any.events.type('0.7');
    any.events.keypress('enter');
    await expect(any.answer).resolves.toBe(0.7);
  });

  it('runs validate on a number that passes the bounds, with its own message', async () => {
    const { events, getScreen } = await render(number, { message: 'N', validate: (n?: number) => (n === 3 ? 'not three' : true) });
    events.type('3');
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> not three');
    });
    events.type('x');
    expect(getScreen()).not.toContain('not three');
  });

  it('ignores keys while a validation is in flight', async () => {
    let release!: (verdict: boolean) => void;
    const { answer, events } = await render(number, { message: 'N', validate: async () => new Promise<boolean>((resolve) => (release = resolve)) });
    events.type('1');
    events.keypress('enter');
    events.type('2');
    release(true);
    await expect(answer).resolves.toBe(1);
  });
});

describe('isStepOf', () => {
  it('compares in decimal, from the lower bound when there is one', () => {
    expect(isStepOf(0.3, 0.1, 0)).toBe(true);
    expect(isStepOf(1.5e-7, 5e-8, Number.NEGATIVE_INFINITY)).toBe(true);
    expect(isStepOf(5, 2, 1)).toBe(true);
    expect(isStepOf(4, 2, 1)).toBe(false);
  });

  it('is false for a value or a step that cannot be stepped', () => {
    expect(isStepOf(Number.NaN, 1, 0)).toBe(false);
    expect(isStepOf(1, Number.POSITIVE_INFINITY, 0)).toBe(false);
    expect(isStepOf(1, 0, 0)).toBe(false);
  });
});

describe('password', () => {
  it('masks the line with a note, answers with what was typed, and hides it when done', async () => {
    const { answer, events, getScreen } = await render(password, { message: 'Secret' });
    expect(getScreen()).toBe(frame('? Secret [input is masked]', 'ctrl+t toggle visibility'));
    events.type('hunter2');
    events.keypress('enter');
    await expect(answer).resolves.toBe('hunter2');
    expect(getScreen()).toBe(`${TICK} Secret`);
  });

  it('keeps the space after the message while the mask has nothing to draw, as @inquirer/password 5.2.5 does', async () => {
    const { events, getScreen } = await render(password, { message: 'Secret', mask: true });
    // The drawn line trims the trailing space away, so the cursor is what shows it: one
    // column past the separator, as if a space had been typed.
    const empty = getScreen({ raw: true });
    expect(line(empty)).toBe('? Secret');
    expect(empty.endsWith(cursorTo('? Secret'.length + 1))).toBe(true);
    events.type('J');
    const typed = getScreen({ raw: true });
    expect(line(typed)).toBe('? Secret *');
    expect(typed.endsWith(cursorTo('? Secret *'.length))).toBe(true);
  });

  it('draws a mask character per typed one, the default star or one of its own', async () => {
    const star = await render(password, { message: 'Secret', mask: true });
    star.events.type('abc');
    expect(star.getScreen()).toBe(frame('? Secret ***', 'ctrl+t toggle visibility'));
    star.events.keypress('enter');
    await expect(star.answer).resolves.toBe('abc');
    expect(star.getScreen()).toBe(`${TICK} Secret ***`);
    const own = await render(password, { message: 'Secret', mask: '#' });
    own.events.type('ab');
    expect(own.getScreen()).toContain('? Secret ##');
  });

  it('reveals and hides the text on ctrl+t, unless toggleMask is off', async () => {
    const { events, getScreen } = await render(password, { message: 'Secret' });
    events.type('abc');
    events.keypress({ name: 't', ctrl: true });
    expect(getScreen()).toBe(frame('? Secret abc', 'ctrl+t toggle visibility'));
    events.keypress({ name: 't', ctrl: true });
    expect(getScreen()).toContain('[input is masked]');
    const fixed = await render(password, { message: 'Secret', toggleMask: false });
    fixed.events.keypress({ name: 't', ctrl: true });
    expect(fixed.getScreen()).toBe('? Secret [input is masked]');
  });

  it('shows the validation message, or a default one for false, and keeps the line', async () => {
    const own = await render(password, { message: 'Secret', validate: (value: string) => value.length > 3 || 'too short' });
    own.events.type('ab');
    own.events.keypress('enter');
    await vi.waitFor(() => {
      expect(own.getScreen()).toBe(frame('? Secret [input is masked]', '> too short', 'ctrl+t toggle visibility'));
    });
    own.events.type('cd');
    own.events.keypress('enter');
    await expect(own.answer).resolves.toBe('abcd');
    const plain = await render(password, { message: 'Secret', validate: () => false });
    plain.events.keypress('enter');
    await vi.waitFor(() => {
      expect(plain.getScreen()).toContain('> You must provide a valid value');
    });
  });

  it('ignores keys while a validation is in flight', async () => {
    let release!: (verdict: boolean) => void;
    const { answer, events } = await render(password, { message: 'Secret', validate: async () => new Promise<boolean>((resolve) => (release = resolve)) });
    events.type('a');
    events.keypress('enter');
    events.type('b');
    release(true);
    await expect(answer).resolves.toBe('a');
  });
});

describe('confirm', () => {
  it('answers yes on an empty line by default, and no when the default is false', async () => {
    const yes = await render(confirm, { message: 'Go?' });
    expect(yes.getScreen()).toBe('? Go? (Y/n)');
    yes.events.keypress('enter');
    await expect(yes.answer).resolves.toBe(true);
    expect(yes.getScreen()).toBe(`${TICK} Go? Yes`);
    const no = await render(confirm, { message: 'Go?', default: false });
    expect(no.getScreen()).toBe('? Go? (y/N)');
    no.events.keypress('enter');
    await expect(no.answer).resolves.toBe(false);
  });

  it('reads any prefix of its words, and of yes and no, in any case', async () => {
    const ye = await render(confirm, { message: 'Go?' });
    ye.events.type('Ye');
    ye.events.keypress('enter');
    await expect(ye.answer).resolves.toBe(true);
    const n = await render(confirm, { message: 'Go?' });
    n.events.type('N');
    n.events.keypress('enter');
    await expect(n.answer).resolves.toBe(false);
    const french = await render(confirm, { message: 'Go?', theme: { keywords: { yes: 'Oui', no: 'Non' } } });
    french.events.type('no');
    french.events.keypress('enter');
    await expect(french.answer).resolves.toBe(false);
    const english = await render(confirm, { message: 'Go?', theme: { keywords: { yes: 'Oui', no: 'Non' } } });
    english.events.type('ye');
    english.events.keypress('enter');
    await expect(english.answer).resolves.toBe(true);
    const german = await render(confirm, { message: 'Go?', theme: { keywords: { yes: 'Ja', no: 'Nein' } } });
    german.events.type('no');
    german.events.keypress('enter');
    await expect(german.answer).resolves.toBe(false);
  });

  it('refuses an answer it cannot read, keeping it in the line', async () => {
    const { answer, events, getScreen } = await render(confirm, { message: 'Go?' });
    events.type('maybe');
    events.keypress('enter');
    expect(getScreen()).toBe(frame('? Go? (Y/n) maybe', '> You must answer with "Yes" or "No"'));
    events.type('x');
    expect(getScreen()).toBe('? Go? (Y/n) maybex');
    answer.cancel();
    await expect(answer).rejects.toThrow('Prompt was canceled');
  });

  it('flips the answer into the line on Tab', async () => {
    const { events, getScreen } = await render(confirm, { message: 'Go?' });
    events.keypress('tab');
    expect(getScreen()).toBe('? Go? (Y/n) No');
    events.keypress('tab');
    expect(getScreen()).toBe('? Go? (Y/n) Yes');
    const unread = await render(confirm, { message: 'Go?', default: false });
    unread.events.type('zz');
    unread.events.keypress('tab');
    expect(unread.getScreen()).toBe('? Go? (y/N) Yes');
  });

  it('draws the answer through a transformer, and colours a hint letter in a script with no case', async () => {
    const { answer, events, getScreen } = await render(confirm, { message: 'Go?', transformer: (value: boolean) => (value ? 'sure' : 'nope') });
    events.keypress('enter');
    await expect(answer).resolves.toBe(true);
    expect(getScreen()).toBe(`${TICK} Go? sure`);
    const chinese = await render(confirm, { message: '继续?', theme: { keywords: { yes: '是', no: '否' } } });
    expect(chinese.getScreen()).toBe('? 继续? (是/否)');
    const empty = await render(confirm, { message: 'Go?', theme: { keywords: { yes: '', no: '' } } });
    expect(empty.getScreen()).toBe('? Go? (/)');
  });

  it('ignores keys once it has answered', async () => {
    const { answer, events, getScreen } = await render(confirm, { message: 'Go?' });
    events.keypress('enter');
    events.type('n');
    await expect(answer).resolves.toBe(true);
    expect(getScreen()).toBe(`${TICK} Go? Yes`);
  });
});

/**
 * What the default styles hide once escapes are stripped, made visible: the status each frame
 * was drawn in, and the answer in angle brackets.
 */
const seen = { style: { message: (text: string, status: string) => `${text}:${status}`, answer: (text: string) => `<${text}>` } };

/** Tab as a terminal sends it: readline puts the `\t` in its line, which the prompt must take out again. */
const TAB = { name: 'tab', sequence: '\t' };

/** A validator that answers when the test says so, counting its calls. */
function pending<T>(): { validate: (value: T) => Promise<boolean | string>; release: (verdict: boolean | string) => void; calls: () => number } {
  let release: ((verdict: boolean | string) => void) | undefined;
  let calls = 0;
  return {
    validate: async () => {
      calls++;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    release: (verdict) => {
      release?.(verdict);
    },
    calls: () => calls,
  };
}

describe('the line prompts, frame by frame', () => {
  it('input: loading while it validates, one validation per answer, the answer styled once done', async () => {
    const check = pending<string>();
    const { answer, events, getScreen } = await render(input, { message: 'Name', validate: check.validate, theme: seen });
    expect(getScreen()).toBe('? Name:idle');
    events.type('Ada');
    events.keypress('enter');
    expect(getScreen()).toBe('? Name:loading Ada');
    events.keypress('enter');
    events.type('x');
    check.release(true);
    await expect(answer).resolves.toBe('Ada');
    expect(check.calls()).toBe(1);
    expect(getScreen()).toBe(`${TICK} Name:done <Ada>`);
  });

  it('input: draws the default it answered with, styled, and only while the line is empty', async () => {
    const { answer, events, getScreen } = await render(input, { message: 'Port', default: '8080', theme: seen });
    events.type('1');
    expect(getScreen()).toBe('? Name:idle 1'.replace('Name', 'Port'));
    events.keypress('backspace');
    events.keypress('enter');
    await expect(answer).resolves.toBe('8080');
    expect(getScreen()).toBe(`${TICK} Port:done <8080>`);
  });

  it('input: keeps the refused text in the line, and clears the refusal on the next key', async () => {
    const { answer, events, getScreen } = await render(input, { message: 'Name', validate: (value: string) => value.length > 2 || 'longer' });
    events.type('ab');
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toBe(frame('? Name ab', '> longer'));
    });
    events.type('c');
    expect(getScreen()).toBe('? Name abc');
    events.keypress('enter');
    await expect(answer).resolves.toBe('abc');
  });

  it('input: Tab and prefill put the default in readline’s line, so the next key edits it', async () => {
    const tab = await render(input, { message: 'Name', default: 'Ada' });
    tab.events.keypress(TAB);
    tab.events.type('m');
    expect(tab.getScreen()).toBe('? Name Adam');
    for (let i = 0; i < 4; i++) tab.events.keypress('backspace');
    expect(tab.getScreen()).toBe('? Name');
    const prefilled = await render(input, { message: 'Name', default: 'Ada', prefill: 'editable' });
    await vi.waitFor(() => {
      expect(prefilled.getScreen()).toBe('? Name Ada');
    });
    prefilled.events.type('m');
    expect(prefilled.getScreen()).toBe('? Name Adam');
  });

  it('number: loading while it validates, one validation per answer, the answer styled once done', async () => {
    const check = pending<number | undefined>();
    const { answer, events, getScreen } = await render(number, { message: 'Age', validate: check.validate, theme: seen });
    events.type('42');
    events.keypress('enter');
    expect(getScreen()).toBe('? Age:loading 42');
    events.keypress('enter');
    check.release(true);
    await expect(answer).resolves.toBe(42);
    expect(check.calls()).toBe(1);
    expect(getScreen()).toBe(`${TICK} Age:done <42>`);
  });

  it('number: an empty answer skips validate and draws nothing', async () => {
    const validate = vi.fn(() => true);
    const { answer, events, getScreen } = await render(number, { message: 'Age', validate, theme: seen });
    events.keypress('enter');
    await expect(answer).resolves.toBeUndefined();
    expect(validate).not.toHaveBeenCalled();
    expect(getScreen()).toBe(`${TICK} Age:done <>`);
  });

  it('number: holds the bounds inclusive, names them, and keeps the refused number in the line', async () => {
    const { answer, events, getScreen } = await render(number, { message: 'Age', min: 5, max: 10 });
    events.type('4');
    events.keypress('enter');
    expect(getScreen()).toBe(frame('? Age 4', '> Value must be between 5 and 10'));
    events.keypress('backspace');
    events.type('11');
    events.keypress('enter');
    expect(getScreen()).toBe(frame('? Age 11', '> Value must be between 5 and 10'));
    events.keypress('backspace');
    events.keypress('backspace');
    events.type('1');
    events.keypress('enter');
    expect(getScreen()).toContain('? Age 1');
    events.type('0');
    events.keypress('enter');
    await expect(answer).resolves.toBe(10);
    const low = await render(number, { message: 'Age', min: 5, max: 10 });
    low.events.type('5');
    low.events.keypress('enter');
    await expect(low.answer).resolves.toBe(5);
  });

  it('number: names the step alone when there is no lower bound', async () => {
    const { events, getScreen } = await render(number, { message: 'Even', step: 2 });
    events.type('3');
    events.keypress('enter');
    expect(getScreen()).toBe(frame('? Even 3', '> Value must be a multiple of 2'));
  });

  it('number: Tab copies the default into readline’s line, and Backspace on an empty line drops it', async () => {
    const tab = await render(number, { message: 'Age', default: 30 });
    tab.events.keypress(TAB);
    tab.events.type('1');
    expect(tab.getScreen()).toBe('? Age 301');
    tab.events.keypress('backspace');
    tab.events.keypress('backspace');
    tab.events.keypress('backspace');
    expect(tab.getScreen()).toBe('? Age');
    const dropped = await render(number, { message: 'Age', default: 30 });
    dropped.events.keypress('backspace');
    expect(dropped.getScreen()).toBe('? Age');
    dropped.events.keypress('enter');
    await expect(dropped.answer).resolves.toBeUndefined();
  });

  it('isStepOf: decimal steps, an exponent, and a lower bound that is not zero', () => {
    expect(isStepOf(0.3, 0.1, 0)).toBe(true);
    expect(isStepOf(0.25, 0.1, 0)).toBe(false);
    expect(isStepOf(1.5, 0.5, 0.5)).toBe(true);
    expect(isStepOf(4, 3, 1)).toBe(true);
    expect(isStepOf(5, 3, 1)).toBe(false);
    expect(isStepOf(3e-7, 1e-7, 0)).toBe(true);
    expect(isStepOf(2.5e-7, 1e-7, 0)).toBe(false);
    expect(isStepOf(1e21, 1e20, 0)).toBe(true);
    expect(isStepOf(12, 4, -Infinity)).toBe(true);
  });

  it('password: loading while it validates, one validation per answer, the mask styled once done', async () => {
    const check = pending<string>();
    const { answer, events, getScreen } = await render(password, { message: 'Secret', mask: '*', validate: check.validate, theme: seen });
    events.type('ab');
    events.keypress('enter');
    expect(getScreen()).toBe('? Secret:loading **');
    events.keypress('enter');
    check.release(true);
    await expect(answer).resolves.toBe('ab');
    expect(check.calls()).toBe(1);
    expect(getScreen()).toBe(`${TICK} Secret:done <**>`);
  });

  it('password: answers an empty line, toggles on ctrl+t only, and never reveals the answer once done', async () => {
    const empty = await render(password, { message: 'Secret' });
    empty.events.keypress('enter');
    await expect(empty.answer).resolves.toBe('');
    const other = await render(password, { message: 'Secret' });
    other.events.type('a');
    other.events.keypress({ name: 'a', ctrl: true });
    expect(other.getScreen()).toContain('[input is masked]');
    const { answer, events, getScreen } = await render(password, { message: 'Secret', theme: seen });
    events.type('t');
    events.keypress({ name: 't', ctrl: true });
    expect(getScreen()).toContain('? Secret:idle t');
    events.keypress('enter');
    await expect(answer).resolves.toBe('t');
    expect(getScreen()).toBe(`${TICK} Secret:done <>`);
  });

  it('password: clears a refusal on the next key, hides the cursor only without a mask, and keeps every part', async () => {
    const { events, getScreen } = await render(password, { message: 'Secret', validate: () => 'no' });
    events.keypress('enter');
    await vi.waitFor(() => {
      expect(getScreen()).toContain('> no');
    });
    events.type('a');
    expect(getScreen()).not.toContain('> no');
    expect(getScreen({ raw: true })).toContain('\u001B[?25l');
    const masked = await render(password, { message: 'Secret', mask: true });
    masked.events.type('a');
    expect(stripVTControlCharacters(masked.getScreen({ raw: true }).replaceAll('\u001B[?25l', 'HIDDEN'))).not.toContain('HIDDEN');
    // An empty prefix still takes its separator, as @inquirer/password 5.2.5 joins its parts unfiltered.
    const bare = await render(password, { message: 'Secret', mask: true, theme: { prefix: '' } });
    expect(stripVTControlCharacters(bare.getScreen({ raw: true })).split('\n')[0]).toBe(' Secret');
  });

  it('confirm: opens idle, trims what was typed, and reads its own words before yes and no', async () => {
    const opening = await render(confirm, { message: 'Go?', theme: seen });
    expect(opening.frames()[0]).toBe('? Go?:idle (Y/n)');
    const words = { keywords: { yes: 'Oui', no: 'Aucun', error: () => 'oui ou aucun' } };
    const cases: [string, boolean | 'refused'][] = [[' o ', true], ['a', false], ['s', 'refused'], ['o', true]];
    await Promise.all(
      cases.map(async ([typed, expected]) => {
        const { answer, events, getScreen } = await render(confirm, { message: 'Go?', theme: words });
        events.type(typed);
        events.keypress('enter');
        if (expected === 'refused') expect(getScreen()).toContain('> oui ou aucun');
        else await expect(answer).resolves.toBe(expected);
      }),
    );
    const plain = await render(confirm, { message: 'Go?' });
    plain.events.type('o');
    plain.events.keypress('enter');
    expect(plain.getScreen()).toContain('> You must answer with "Yes" or "No"');
  });

  it('confirm: Tab flips what is typed, or the default when nothing readable is, and writes it into the line', async () => {
    const typedYes = await render(confirm, { message: 'Go?', default: false });
    typedYes.events.type('y');
    typedYes.events.keypress('tab');
    expect(typedYes.getScreen()).toBe('? Go? (y/N) No');
    const unreadable = await render(confirm, { message: 'Go?' });
    unreadable.events.type('x');
    unreadable.events.keypress('tab');
    expect(unreadable.getScreen()).toBe('? Go? (Y/n) No');
    const edited = await render(confirm, { message: 'Go?', default: false });
    edited.events.keypress(TAB);
    edited.events.keypress('backspace');
    expect(edited.getScreen()).toBe('? Go? (y/N) Ye');
    edited.events.keypress('enter');
    await expect(edited.answer).resolves.toBe(true);
  });

  it('confirm: colours the default letter of a script with no case, and capitalises one with case', async () => {
    vi.stubEnv('FORCE_COLOR', '1');
    const cjk = await render(confirm, { message: '继续?', theme: { keywords: { yes: '是', no: '否' } } });
    expect(cjk.getScreen({ raw: true })).toContain('\u001B[36m是\u001B[39m');
    const latin = await render(confirm, { message: 'Go?' });
    expect(latin.getScreen({ raw: true })).not.toContain('\u001B[36mY');
    vi.unstubAllEnvs();
  });

  it('confirm: draws its answer styled once done', async () => {
    const { answer, events, getScreen } = await render(confirm, { message: 'Go?', theme: seen });
    events.keypress('enter');
    await expect(answer).resolves.toBe(true);
    expect(getScreen()).toBe(`${TICK} Go?:done <Yes>`);
  });
});
