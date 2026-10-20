/**
 * `input`, `number`, `password` and `confirm`, in this process.
 *
 * Their public grade is each package's own suite through `compat-oracle`, against `dist/` in
 * another process. Every branch is driven again here, through the screens those suites
 * assert: the dimmed default and what Tab and Backspace do to it, a failed validation putting
 * the typed text back into the line, the mask, and the words `confirm` reads.
 */
import { describe, expect, it, vi } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { isStepOf } from './inquirer-input.js';
import { confirm, input, number, password } from './inquirer-prompts.js';

const frame = (...lines: string[]): string => lines.join('\n');

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
    expect(getScreen()).toBe('✔ Name Ada');
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
    expect(getScreen()).toBe('✔ Name [ada]');
  });
});

describe('number', () => {
  it('answers with a number, or with nothing when nothing is typed', async () => {
    const typed = await render(number, { message: 'Age' });
    typed.events.type('42');
    typed.events.keypress('enter');
    await expect(typed.answer).resolves.toBe(42);
    expect(typed.getScreen()).toBe('✔ Age 42');
    const empty = await render(number, { message: 'Age' });
    empty.events.keypress('enter');
    await expect(empty.answer).resolves.toBeUndefined();
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
    expect(getScreen()).toBe('✔ Secret');
  });

  it('draws a mask character per typed one, the default star or one of its own', async () => {
    const star = await render(password, { message: 'Secret', mask: true });
    star.events.type('abc');
    expect(star.getScreen()).toBe(frame('? Secret ***', 'ctrl+t toggle visibility'));
    star.events.keypress('enter');
    await expect(star.answer).resolves.toBe('abc');
    expect(star.getScreen()).toBe('✔ Secret ***');
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
    expect(yes.getScreen()).toBe('✔ Go? Yes');
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
    expect(getScreen()).toBe('✔ Go? sure');
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
    expect(getScreen()).toBe('✔ Go? Yes');
  });
});
