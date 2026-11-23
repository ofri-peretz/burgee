/**
 * What `@inquirer/prompts` 8.8.1 changed, held here to literals as well as by its own suites in
 * `compat-oracle`. The theme across most of it: after any handler rewrites the shown answer,
 * readline's line holds what is shown, so the next key edits it rather than starting over.
 */
import { describe, expect, it } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { checkbox, confirm, expand, input, number, password, rawlist, search } from './inquirer-prompts.js';
import { wrapContent } from './inquirer-screen.js';

const nothing = (): void => undefined;

/** A promise and the function that settles it, for a validation the test answers later. */
function pending<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = nothing;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('@inquirer/confirm 6.4.1', () => {
  it('answers no when the no-keyword is a prefix of the yes-keyword', async () => {
    const { answer, events } = await render(confirm, { message: 'Sure?', theme: { keywords: { yes: 'Nope-not', no: 'No' } } });
    events.type('no');
    events.keypress('enter');
    await expect(answer).resolves.toBe(false);
  });

  it('answers yes to the whole yes-keyword', async () => {
    const { answer, events } = await render(confirm, { message: 'Sure?', theme: { keywords: { yes: 'Nai', no: 'Ochi' } } });
    events.type('nai');
    events.keypress('enter');
    await expect(answer).resolves.toBe(true);
  });

  it('keeps the built-in n answering no beside a yes-keyword that starts with n', async () => {
    const { answer, events } = await render(confirm, { message: 'Sure?', theme: { keywords: { yes: 'Nai', no: 'Ochi' } } });
    events.type('n');
    events.keypress('enter');
    await expect(answer).resolves.toBe(false);
  });

  it('keeps the built-in yes answering yes beside a no-keyword that starts with y', async () => {
    const { answer, events } = await render(confirm, { message: 'Sure?', default: false, theme: { keywords: { yes: 'Ja', no: 'Yok' } } });
    events.type('yes');
    events.keypress('enter');
    await expect(answer).resolves.toBe(true);
  });

  it.each([
    { yes: 'N', no: 'Nein', typed: 'n', expected: true, why: 'the whole yes-keyword before the built-in n' },
    { yes: 'Ab', no: 'A', typed: 'a', expected: false, why: 'the whole no-keyword before the yes prefix' },
    { yes: 'Ja', no: 'Yok', typed: 'y', expected: true, why: 'the built-in y before the no prefix' },
    { yes: 'Ja', no: 'Yesno', typed: 'yes', expected: true, why: 'the built-in yes before the no prefix' },
    { yes: 'Nope', no: 'Ochi', typed: 'no', expected: false, why: 'the built-in no before the yes prefix' },
  ])('$typed answers $expected beside $yes / $no: $why', async ({ yes, no, typed, expected }) => {
    const { answer, events } = await render(confirm, { message: 'Sure?', theme: { keywords: { yes, no } } });
    events.type(typed);
    events.keypress('enter');
    await expect(answer).resolves.toBe(expected);
  });

  it('shows whole graphemes as initials, and the default one uppercased or coloured', async () => {
    const emoji = await render(confirm, { message: 'Like it?', theme: { keywords: { yes: '👍', no: '👎' } } });
    expect(emoji.getScreen()).toBe('? Like it? (👍/👎)');
    const accented = await render(confirm, { message: 'Sûr ?', theme: { keywords: { yes: 'Évidemment', no: 'Non' } } });
    expect(accented.getScreen()).toBe('? Sûr ? (É/n)');
    const astral = await render(confirm, { message: 'Ok?', theme: { keywords: { yes: '𐐨es', no: '𐐩o' } } });
    expect(astral.getScreen()).toBe('? Ok? (𐐀/𐐩)');
  });

  it('uppercases the whole default text a custom confirmDefault is handed', async () => {
    const { getScreen } = await render(confirm, { message: 'Ok?', default: false });
    expect(getScreen()).toBe('? Ok? (y/N)');
  });
});

describe('@inquirer/checkbox 5.3.1', () => {
  const toppings = [{ value: 'ham' }, { value: 'pineapple', disabled: true }, { value: 'pepperoni' }];

  it('shows the disabled error for a digit on a disabled choice, and clears it on a selectable one', async () => {
    const { answer, events, getScreen } = await render(checkbox, { message: 'Topping', choices: toppings });
    events.keypress('2');
    expect(getScreen()).toContain('This option is disabled and cannot be toggled.');
    expect(getScreen()).toContain('❯◯ ham');
    events.keypress('3');
    expect(getScreen()).not.toContain('This option is disabled');
    events.keypress('enter');
    await expect(answer).resolves.toEqual(['pepperoni']);
  });

  it('ignores a digit past the last choice', async () => {
    const { events, getScreen } = await render(checkbox, { message: 'Topping', choices: toppings });
    events.keypress('9');
    expect(getScreen()).not.toContain('This option is disabled');
    expect(getScreen()).toContain('❯◯ ham');
  });

  it.each(['a', 'i'])('clears the required error when toggling with %s', async (key) => {
    const { events, getScreen, nextRender } = await render(checkbox, { message: 'Pick', choices: ['parser', 'lexer'], required: true });
    events.keypress('enter');
    await nextRender();
    expect(getScreen()).toContain('At least one choice must be selected');
    events.keypress(key);
    expect(getScreen()).not.toContain('At least one choice must be selected');
  });
});

describe('@inquirer/expand 5.2.1', () => {
  const choices = [
    { key: 'y', name: 'Overwrite', value: 'overwrite' },
    { key: 'd', name: 'Show diff', value: 'diff' },
  ] as const;

  it('starts the answer fresh after the help is expanded', async () => {
    const { answer, events, getScreen } = await render(expand, { message: 'Overwrite?', choices: [...choices] });
    events.type('h');
    events.keypress('enter');
    expect(getScreen().split('\n')[0]).toBe('? Overwrite?');
    events.type('d');
    expect(getScreen().split('\n')[0]).toBe('? Overwrite? d');
    events.keypress('enter');
    await expect(answer).resolves.toBe('diff');
  });

  it('keeps a refused answer in the line, to edit', async () => {
    const { events, getScreen } = await render(expand, { message: 'Overwrite?', choices: [...choices] });
    events.type('yq');
    events.keypress('enter');
    expect(getScreen()).toContain('"yq" isn\'t an available option');
    events.type('z');
    expect(getScreen()).toContain('? Overwrite? (ydH) yqz');
  });
});

describe('@inquirer/rawlist 5.4.1', () => {
  const fruits = ['apple', 'banana', 'cherry'];

  it('keeps a refused answer in the line, to edit', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Fruit', choices: fruits });
    events.type('9');
    events.keypress('enter');
    expect(getScreen()).toContain('"9" isn\'t an available option');
    events.type('1');
    expect(getScreen()).toContain('? Fruit 91');
  });

  it('writes the typed input back when an arrow stops at the edge', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Fruit', choices: fruits, loop: false });
    events.type('3');
    events.keypress('down');
    expect(getScreen()).toContain('? Fruit 3');
    events.type('1');
    expect(getScreen()).toContain('? Fruit 31');
  });

  it('leaves the line empty when an arrow stops at the edge with nothing typed', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Fruit', choices: fruits, loop: false });
    events.keypress('up');
    expect(getScreen()).toContain('? Fruit 3');
    events.keypress('down');
    expect(getScreen()).toContain('? Fruit 3');
    events.type('1');
    expect(getScreen()).toContain('? Fruit 31');
  });

  it('writes nothing back when an arrow stops at the edge over a default nobody typed', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Fruit', choices: fruits, loop: false, default: 'cherry' });
    expect(getScreen()).toContain('? Fruit 3');
    events.keypress('down');
    events.type('1');
    expect(getScreen()).toContain('? Fruit 1');
  });

  it('preselects a choice whose value and default are both null', async () => {
    const { answer, events, getScreen } = await render(rawlist, { message: 'Pick', choices: [{ value: 'a' }, { value: null, name: 'none' }], default: null });
    expect(getScreen()).toContain('? Pick 2');
    events.keypress('enter');
    await expect(answer).resolves.toBeNull();
  });

  it('matches a custom key exactly as typed, spaces and all', async () => {
    const { answer, events } = await render(rawlist, { message: 'Pick', choices: [{ value: 'a', key: 'x ' }, { value: 'b', key: 'x' }] });
    events.type('x ');
    events.keypress('enter');
    await expect(answer).resolves.toBe('a');
  });
});

describe('@inquirer/input 5.2.1', () => {
  it.each([/^\d+$/gu, /^\d+$/uy, /^\d+$/guy])('leaves %s where its caller set it', async (pattern) => {
    pattern.lastIndex = 2;
    const { answer, events } = await render(input, { message: 'Number', pattern });
    events.type('123');
    events.keypress('enter');
    await expect(answer).resolves.toBe('123');
    expect(pattern.lastIndex).toBe(2);
  });

  it('still refuses what a pattern does not match', async () => {
    const { events, getScreen, nextRender } = await render(input, { message: 'Number', pattern: /^\d+$/u });
    events.type('12a');
    events.keypress('enter');
    await nextRender();
    expect(getScreen()).toBe('? Number 12a\n> Invalid input');
  });

  it('clears the error of a refused attempt when the same answer passes', async () => {
    let attempts = 0;
    const { answer, events, getScreen, nextRender } = await render(input, { message: 'Again?', validate: () => ++attempts > 1 || 'Try again' });
    events.type('ok');
    events.keypress('enter');
    await nextRender();
    expect(getScreen()).toContain('Try again');
    events.keypress('enter');
    await expect(answer).resolves.toBe('ok');
    expect(getScreen()).toBe('✔ Again? ok');
  });

  it('drops the keys typed while it validated, and clears the error once answered', async () => {
    const verdict = pending<string>();
    const { answer, events, getScreen, nextRender } = await render(input, {
      message: 'Two?',
      validate: (value: string) => value === '2' || verdict.promise,
    });
    events.type('1');
    events.keypress('enter');
    await nextRender();
    events.type('x');
    verdict.resolve('Must be 2');
    await nextRender();
    expect(getScreen()).toBe('? Two? 1\n> Must be 2');
    events.keypress('backspace');
    events.type('2');
    expect(getScreen()).toBe('? Two? 2');
    events.keypress('enter');
    await expect(answer).resolves.toBe('2');
    expect(getScreen()).toBe('✔ Two? 2');
  });
});

describe('@inquirer/number 4.3.1', () => {
  it.each(['0x10', '0b11', '0o7', 'Infinity', '1e999', '1.2.3'])('refuses %s, which is not a plain decimal a person types', async (typed) => {
    const { events, getScreen, nextRender } = await render(number, { message: 'Age' });
    events.type(typed);
    events.keypress('enter');
    await nextRender();
    expect(getScreen()).toBe(`? Age ${typed}\n> You must provide a valid numeric value`);
  });

  it.each([
    ['1e3', 1000],
    ['-2.5', -2.5],
    ['+.5', 0.5],
    ['7.', 7],
    ['2E-1', 0.2],
    ['.25', 0.25],
    ['1e10', 1e10],
  ])('takes %s', async (typed, expected) => {
    const { answer, events } = await render(number, { message: 'Value', step: 'any' });
    events.type(typed);
    events.keypress('enter');
    await expect(answer).resolves.toBe(expected);
  });

  it('drops the keys typed while it validated before writing the refused answer back', async () => {
    const verdict = pending<string>();
    const { answer, events, nextRender } = await render(number, { message: 'Value', validate: (value?: number) => value !== 12 || verdict.promise });
    events.type('12');
    events.keypress('enter');
    await nextRender();
    events.type('9');
    verdict.resolve('Try again');
    await nextRender();
    events.type('3');
    events.keypress('enter');
    await expect(answer).resolves.toBe(123);
  });
});

describe('@inquirer/password 5.3.1', () => {
  it('drops the keys typed while it validated before writing the refused answer back', async () => {
    const verdict = pending<string>();
    const { answer, events, nextRender } = await render(password, { message: 'Value', validate: (value: string) => value !== '12' || verdict.promise });
    events.type('12');
    events.keypress('enter');
    await nextRender();
    events.type('9');
    verdict.resolve('Try again');
    await nextRender();
    events.type('3');
    events.keypress('enter');
    await expect(answer).resolves.toBe('123');
  });
});

describe('@inquirer/search 4.4.1', () => {
  const fruits = ['apple', 'banana', 'cherry'];
  const source = (term?: string): string[] => (term === undefined ? fruits : fruits.filter((fruit) => fruit.includes(term)));

  it('ignores query edits while it validates, and draws loading meanwhile', async () => {
    const verdict = pending<boolean>();
    const { answer, events, getScreen, nextRender } = await render(search, { message: 'Fruit', source, validate: () => verdict.promise });
    await nextRender();
    events.keypress('enter');
    events.type('x');
    expect(getScreen()).toContain('Fruit');
    expect(getScreen()).not.toContain('Fruit x');
    verdict.resolve(true);
    await expect(answer).resolves.toBe('apple');
  });

  it('keeps the term in the line through keys typed while it validates', async () => {
    const verdict = pending<boolean>();
    const seen: (string | undefined)[] = [];
    const { events, nextRender } = await render(search, {
      message: 'Fruit',
      initialValue: 'ban',
      source: (term?: string) => {
        seen.push(term);
        return source(term);
      },
      validate: () => verdict.promise,
    });
    await nextRender();
    events.keypress('enter');
    events.type('xyz');
    verdict.resolve(false);
    await nextRender();
    events.type('s');
    await nextRender();
    // The refused choice's name replaced the term, and the ignored keys are nowhere in it.
    expect(seen.at(-1)).toBe('bananas');
  });

  it('writes the term back for each key typed while it validates, as 4.4.1 does', async () => {
    // The line holds the term through the validation, and a refusal of the choice the term names
    // writes the term once more without clearing: @inquirer/search 4.4.1 then reads both.
    const verdict = pending<string>();
    const seen: (string | undefined)[] = [];
    const { events, nextRender } = await render(search, {
      message: 'Fruit',
      initialValue: 'banana',
      source: (term?: string) => {
        seen.push(term);
        return source(term);
      },
      validate: () => verdict.promise,
    });
    await nextRender();
    events.keypress('enter');
    events.type('x');
    verdict.resolve('Not that one');
    await nextRender();
    events.type('s');
    await nextRender();
    expect(seen.at(-1)).toBe('bananabananas');
  });

  it('keeps a refused term in the line, so typing extends it', async () => {
    const seen: (string | undefined)[] = [];
    const { events, getScreen, nextRender } = await render(search, {
      message: 'Fruit',
      source: (term?: string) => {
        seen.push(term);
        return source(term);
      },
      validate: () => 'Not that one',
    });
    await nextRender();
    events.type('apple');
    await nextRender();
    events.keypress('enter');
    await nextRender();
    expect(getScreen()).toContain('Not that one');
    events.type('s');
    await nextRender();
    expect(seen.at(-1)).toBe('apples');
  });

  it('replaces the term with a refused choice by another name, so typing extends that', async () => {
    const seen: (string | undefined)[] = [];
    const { events, nextRender } = await render(search, {
      message: 'Fruit',
      source: (term?: string) => {
        seen.push(term);
        return source(term);
      },
      validate: () => false,
    });
    await nextRender();
    events.type('an');
    await nextRender();
    events.keypress('enter');
    await nextRender();
    expect(seen.at(-1)).toBe('banana');
    events.type('s');
    await nextRender();
    expect(seen.at(-1)).toBe('bananas');
  });

  it('empties the results on a failed search, names it, and searches again', async () => {
    let calls = 0;
    const { answer, events, getScreen, nextRender } = await render(search, {
      message: 'Fruit',
      source: async (term?: string) => {
        calls += 1;
        // An error with no message, which the prompt names for itself.
        if (calls === 2) throw Object.assign(new Error('unnamed'), { message: '' });
        if (calls === 3) throw 'down';
        return source(term);
      },
    });
    await nextRender();
    events.type('a');
    await nextRender();
    expect(getScreen()).toContain('> Search failed');
    events.keypress('down');
    events.type('p');
    await nextRender();
    expect(getScreen()).toContain('> Search failed');
    events.type('p');
    await nextRender();
    expect(getScreen()).not.toContain('Search failed');
    expect(getScreen()).toContain('❯ apple');
    events.keypress('enter');
    await expect(answer).resolves.toBe('apple');
  });

  it('answers nothing on Enter while a failed search shows, and moves nowhere', async () => {
    let calls = 0;
    const { answer, events, getScreen, nextRender } = await render(search, {
      message: 'Fruit',
      source: async (term?: string) => {
        calls += 1;
        if (calls === 2) throw new Error('offline');
        return source(term);
      },
    });
    await nextRender();
    events.keypress('down');
    events.keypress('down');
    expect(getScreen()).toContain('❯ cherry');
    events.type('e');
    await nextRender();
    expect(getScreen()).toContain('> offline');
    events.keypress('enter');
    events.keypress('down');
    events.type('r');
    await nextRender();
    expect(getScreen()).toContain('❯ cherry');
    events.keypress('enter');
    await expect(answer).resolves.toBe('cherry');
  });

  it('names a failed search by its error message', async () => {
    const { getScreen, nextRender } = await render(search, {
      message: 'Fruit',
      source: async () => {
        throw new Error('offline');
      },
    });
    await nextRender();
    expect(getScreen()).toContain('> offline');
  });
});

describe('@inquirer/core 12.1.1 screen', () => {
  it('writes a tab as a tab, the way the incumbent leaves it', () => {
    expect(wrapContent('? Name Mike\ty', 80).text).toBe('? Name Mike\ty');
    expect(wrapContent('a\tb\nc', 80)).toEqual({ text: 'a\tb\nc', lastRow: 'c', finalLineRows: 1 });
  });
});
