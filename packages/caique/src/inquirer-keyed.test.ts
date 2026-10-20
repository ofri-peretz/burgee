/**
 * `expand` and `rawlist`, in this process.
 *
 * Their public grade is each package's own suite through `compat-oracle`, against `dist/` in
 * another process. Every branch is driven again here, through the screens those suites
 * assert: the collapsed letters and the expanded list, the help row, a choice picked by its
 * key or by its position, and the arrows walking a raw list.
 */
import { describe, expect, it, vi } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { ValidationError } from './inquirer.js';
import { expand, rawlist, Separator } from './inquirer-prompts.js';

const frame = (...lines: string[]): string => lines.join('\n');

const yes = { key: 'y' as const, name: 'Overwrite', value: 'overwrite' };
const abort = { key: 'x' as const, name: 'Abort', value: 'abort' };
const overwrite = [yes, { key: 'a' as const, name: 'All', value: 'all' }, abort];

/** The status each frame was drawn in, and the highlight drawn as brackets so a test can see it. */
const seenTheme = { style: { message: (text: string, status: string) => `${text}:${status}`, highlight: (text: string) => `[${text}]` } };

describe('expand', () => {
  it('collapses to the keys, names the typed one, and answers with its value', async () => {
    const { answer, events, getScreen } = await render(expand, { message: 'Overwrite?', choices: overwrite });
    expect(getScreen()).toBe('? Overwrite? (yaxH)');
    events.type('a');
    expect(getScreen()).toBe(frame('? Overwrite? (yaxH) a', '>> All'));
    events.keypress('enter');
    await expect(answer).resolves.toBe('all');
    expect(getScreen()).toBe('✔ Overwrite? All');
  });

  it('expands on h, or Enter with h the default, and highlights the typed key in the list', async () => {
    const { answer, events, getScreen } = await render(expand, { message: 'Overwrite?', choices: [yes, new Separator('--'), abort] });
    events.keypress('enter');
    expect(getScreen()).toBe(frame('? Overwrite?', '  y) Overwrite', ' --', '  x) Abort'));
    events.type('x');
    expect(getScreen()).toBe(frame('? Overwrite? x', '  y) Overwrite', ' --', '  x) Abort', '>> Abort'));
    events.keypress('enter');
    await expect(answer).resolves.toBe('abort');
  });

  it('starts expanded, and answers with the default key on an empty Enter', async () => {
    const { answer, events, getScreen } = await render(expand, { message: 'Overwrite?', choices: overwrite, default: 'x', expanded: true });
    expect(getScreen()).toBe(frame('? Overwrite?', '  y) Overwrite', '  a) All', '  x) Abort'));
    events.keypress('enter');
    await expect(answer).resolves.toBe('abort');
  });

  it('capitalises the default key in the collapsed letters', async () => {
    const { getScreen } = await render(expand, { message: 'Overwrite?', choices: overwrite, default: 'a' });
    expect(getScreen()).toBe('? Overwrite? (yAxh)');
  });

  it('asks again for a key it does not know, or for an empty line once expanded', async () => {
    const { events, getScreen } = await render(expand, { message: 'Overwrite?', choices: overwrite, expanded: true });
    events.keypress('enter');
    expect(getScreen()).toBe(frame('? Overwrite?', '  y) Overwrite', '  a) All', '  x) Abort', '> Please input a value'));
    events.type('q');
    events.keypress('enter');
    expect(getScreen()).toContain('> "q" isn\'t an available option');
    events.type('y');
    expect(getScreen()).not.toContain('available option');
  });

  it('opens idle, highlights the key typed with spaces around it, and skips a separator in the letters', async () => {
    const { answer, events, getScreen, frames } = await render(expand, { message: 'Overwrite?', choices: [yes, new Separator(), abort], theme: seenTheme });
    expect(frames()[0]).toBe('? Overwrite?:idle (yxH)');
    events.keypress('h');
    events.keypress('enter');
    events.type(' x ');
    expect(getScreen()).toBe(frame('? Overwrite?:idle  x', '  y) Overwrite', ' ──────────────', '[  x) Abort]', '>> Abort'));
    events.keypress('enter');
    await expect(answer).resolves.toBe('abort');
  });

  it('draws the default it answered with on the last frame', async () => {
    const { answer, events, getScreen } = await render(expand, { message: 'Overwrite?', choices: overwrite, default: 'y' });
    events.keypress('enter');
    await expect(answer).resolves.toBe('overwrite');
    expect(getScreen()).toBe('✔ Overwrite? Overwrite');
  });

  it('names a choice by its value when it has no name, and answers with the name when it has no value', async () => {
    const byValue = await render(expand, { message: 'Pick', choices: [{ key: 'v', value: 'valued' }] });
    byValue.events.type('v');
    expect(byValue.getScreen()).toContain('>> valued');
    byValue.events.keypress('enter');
    await expect(byValue.answer).resolves.toBe('valued');
    const byName = await render(expand, { message: 'Pick', choices: [{ key: 'n', name: 'named' }] });
    byName.events.type('n');
    byName.events.keypress('enter');
    await expect(byName.answer).resolves.toBe('named');
    expect(byName.getScreen()).toBe('✔ Pick named');
  });
});

const fruits = ['apple', 'banana', 'cherry'];

describe('rawlist', () => {
  it('numbers its choices and answers with the one whose number is typed', async () => {
    const { answer, events, getScreen } = await render(rawlist, { message: 'Fruit', choices: fruits });
    expect(getScreen()).toBe(frame('? Fruit', '  1) apple', '  2) banana', '  3) cherry'));
    events.type('2');
    expect(getScreen()).toBe(frame('? Fruit 2', '  1) apple', '  2) banana', '  3) cherry'));
    events.keypress('enter');
    await expect(answer).resolves.toBe('banana');
    expect(getScreen()).toBe('✔ Fruit banana');
  });

  it('matches a key of the choice’s own first, trimmed, and answers with its short name', async () => {
    const { answer, events } = await render(rawlist, {
      message: 'Fruit',
      choices: [
        { value: 'a', name: 'Apple', key: 'p', short: 'A' },
        { value: 'b', name: 'Banana', description: 'yellow' },
      ],
    });
    events.type(' p ');
    events.keypress('enter');
    await expect(answer).resolves.toBe('a');
  });

  it('starts on the default, shows the active description, and hides it under an error', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Fruit', choices: [{ value: 'a' }, { value: 'b', description: 'second' }], default: 'b' });
    expect(getScreen()).toBe(frame('? Fruit 2', '  1) a', '  2) b', 'second'));
    events.keypress('backspace');
    events.type('9');
    events.keypress('enter');
    expect(getScreen()).toBe(frame('? Fruit 9', '  1) a', '  2) b', '> "9" isn\'t an available option'));
  });

  it('asks for a value on an empty Enter, and ignores a default it does not have', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Fruit', choices: fruits, default: 'kiwi' });
    events.keypress('enter');
    expect(getScreen()).toContain('> Please input a value');
  });

  it('walks the list with the arrows, from the top on Down and the bottom on Up, past separators', async () => {
    const down = await render(rawlist, { message: 'Fruit', choices: [new Separator(), ...fruits] });
    down.events.keypress('down');
    expect(down.getScreen()).toContain('? Fruit 1');
    down.events.keypress('down');
    expect(down.getScreen()).toContain('? Fruit 2');
    const up = await render(rawlist, { message: 'Fruit', choices: [...fruits, new Separator()] });
    up.events.keypress('up');
    expect(up.getScreen()).toContain('? Fruit 3');
    up.events.keypress('up');
    expect(up.getScreen()).toContain('? Fruit 2');
    up.events.keypress('down');
    up.events.keypress('down');
    expect(up.getScreen()).toContain('? Fruit 1');
  });

  it('stops at the ends when it does not loop', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Fruit', choices: fruits, loop: false });
    events.keypress('down');
    events.keypress('up');
    expect(getScreen()).toContain('? Fruit 1');
    events.keypress('down');
    events.keypress('down');
    events.keypress('down');
    expect(getScreen()).toContain('? Fruit 3');
  });

  it('honours vim keybindings for the arrows', async () => {
    vi.stubEnv('INQUIRER_KEYBINDINGS', 'vim');
    const { events, getScreen } = await render(rawlist, { message: 'Fruit', choices: fruits });
    events.keypress('j');
    expect(getScreen()).toContain('? Fruit 1');
    vi.unstubAllEnvs();
  });

  it('rejects a list of separators only', async () => {
    const { answer } = await render(rawlist, { message: 'Fruit', choices: [new Separator()] });
    await expect(answer).rejects.toBeInstanceOf(ValidationError);
    await expect(answer).rejects.toThrow('[select prompt] No selectable choices. All choices are disabled.');
  });

  it('opens idle, counts positions past a separator, and highlights the choice picked', async () => {
    const { answer, events, getScreen, frames } = await render(rawlist, { message: 'Fruit', choices: [new Separator('--'), ...fruits], theme: seenTheme });
    expect(frames()[0]).toBe(frame('? Fruit:idle', ' --', '  1) apple', '  2) banana', '  3) cherry'));
    events.type('3');
    expect(getScreen()).toBe(frame('? Fruit:idle 3', ' --', '  1) apple', '  2) banana', '[  3) cherry]'));
    events.keypress('enter');
    await expect(answer).resolves.toBe('cherry');
  });

  it('takes a number only as a position, never a word, and answers with a choice’s short name', async () => {
    const { answer, events, getScreen } = await render(rawlist, { message: 'Fruit', choices: [{ value: 'a', name: 'Apple', short: 'A' }, { value: 'b' }, { value: 'c' }] });
    events.type('b');
    events.keypress('enter');
    expect(getScreen()).toContain('> "b" isn\'t an available option');
    events.keypress('backspace');
    events.type('1');
    events.keypress('enter');
    await expect(answer).resolves.toBe('a');
    expect(getScreen()).toBe('✔ Fruit A');
  });

  it('reads an object without a value as a bare value, and preselects nothing without a default', async () => {
    const { getScreen } = await render(rawlist, { message: 'Fruit', choices: [{ name: 'odd' } as unknown as string, { value: undefined, name: 'none' }] });
    expect(getScreen()).toBe(frame('? Fruit', '  1) [object Object]', '  2) none'));
  });

  it('clears the line on an arrow, so the next key starts a new answer, and clears an error on a key', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Fruit', choices: fruits });
    events.keypress('enter');
    expect(getScreen()).toContain('> Please input a value');
    events.type('2');
    expect(getScreen()).not.toContain('Please input a value');
    events.keypress('down');
    expect(getScreen()).toContain('? Fruit 3');
    events.type('1');
    expect(getScreen()).toContain('? Fruit 1');
  });

  it('starts from the bottom on Up when nothing is picked, even without a separator', async () => {
    const { events, getScreen } = await render(rawlist, { message: 'Fruit', choices: fruits });
    events.keypress('up');
    expect(getScreen()).toContain('? Fruit 3');
  });
});
