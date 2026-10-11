/**
 * `select` and the pagination under it, in this process.
 *
 * Their public grade is `@inquirer/select`'s own suite through `compat-oracle`, which runs
 * against `dist/` in another process and moves no counter here. So every branch is driven
 * again in this file, through the same screens that suite asserts, and the pagination cases
 * walk the pointer arithmetic both ways round a list that overflows its page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { render } from './__fixtures__/inquirer-render.js';
import { createPrompt, Separator, select, usePagination, ValidationError } from './inquirer.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** The frame as lines, so a case reads as the screen it asserts. */
const frame = (...lines: string[]): string => lines.join('\n');

const HELP = '↑↓ navigate • ⏎ select';

const numbers = Array.from({ length: 12 }, (_, i) => ({ value: i + 1 }));

/** `1` to `12`, seven on a page, with the cursor on `cursor`. */
const page = (first: number, cursor: number, size = 7): string[] =>
  Array.from({ length: size }, (_, i) => {
    const n = ((first - 1 + i) % 12) + 1;
    return `${n === cursor ? '❯' : ' '} ${n}`;
  });

describe('select', () => {
  it('moves with the arrows and answers with the active value', async () => {
    const { answer, events, getScreen } = await render(select, { message: 'Pick', choices: numbers });
    expect(getScreen()).toBe(frame('? Pick', ...page(1, 1), '', HELP));
    events.keypress('down');
    events.keypress('down');
    expect(getScreen()).toBe(frame('? Pick', ...page(1, 3), '', HELP));
    events.keypress('enter');
    expect(getScreen()).toBe('✔ Pick 3');
    await expect(answer).resolves.toBe(3);
  });

  it('takes bare values as choices, and answers with the short name', async () => {
    const { answer, events, getScreen } = await render(select, { message: 'Pick', choices: ['a', { value: 'b', name: 'Bee', short: 'B' }] });
    events.keypress('down');
    events.keypress('enter');
    expect(getScreen()).toBe('✔ Pick B');
    await expect(answer).resolves.toBe('b');
  });

  it('starts on the default, unless the default is not an answerable choice', async () => {
    const onDefault = await render(select, { message: 'Pick', choices: numbers, default: 3 });
    expect(onDefault.getScreen()).toContain('❯ 3');
    const disabled = await render(select, { message: 'Pick', choices: [{ value: 1 }, { value: 2, disabled: true }], default: 2 });
    expect(disabled.getScreen()).toContain('❯ 1');
  });

  it('jumps to the n-th choice on a number, counting choices and not separators', async () => {
    const { events, getScreen } = await render(select, { message: 'Pick', choices: [new Separator(), { value: 'a' }, { value: 'b' }, { value: 'c', disabled: true }] });
    events.type('2');
    expect(getScreen()).toContain('❯ b');
    // The third choice is disabled, so a number cannot land on it.
    events.keypress('backspace');
    events.type('3');
    expect(getScreen()).toContain('❯ b');
  });

  it('forgets a typed number after 700 ms, so the next one starts a new jump', async () => {
    vi.useFakeTimers();
    const { events, getScreen } = await render(select, { message: 'Pick', choices: numbers });
    events.type('1');
    events.type('2');
    expect(getScreen()).toContain('❯ 12');
    vi.advanceTimersByTime(700);
    events.type('4');
    expect(getScreen()).toContain('❯ 4');
  });

  it('searches the names by prefix on any other key, and leaves the cursor when nothing matches', async () => {
    vi.useFakeTimers();
    const { events, getScreen } = await render(select, { message: 'Pick', choices: ['apple', 'banana', 'blueberry', { value: 'bz', disabled: true }] });
    events.type('bl');
    expect(getScreen()).toContain('❯ blueberry');
    vi.advanceTimersByTime(700);
    events.type('q');
    expect(getScreen()).toContain('❯ blueberry');
    // `b` lands on banana; `bz` then matches only a disabled choice, which is no match.
    vi.advanceTimersByTime(700);
    events.type('bz');
    expect(getScreen()).toContain('❯ banana');
  });

  it('reads j and k as movement under vim keybindings, never as a search', async () => {
    vi.stubEnv('INQUIRER_KEYBINDINGS', 'vim');
    const { events, getScreen } = await render(select, { message: 'Pick', choices: ['apple', 'kiwi', 'juniper'] });
    events.keypress('j');
    expect(getScreen()).toContain('❯ kiwi');
    events.type('x');
    expect(getScreen()).toContain('❯ kiwi');
  });

  it('refuses a disabled choice with the reason, and clears it on the next key', async () => {
    const { answer, events, getScreen } = await render(select, { message: 'Pick', choices: [{ value: 'a' }, { value: 'b', disabled: 'sold out' }] });
    events.keypress('down');
    expect(getScreen()).toBe(frame('? Pick', '  a', '❯ b sold out', '', HELP));
    events.keypress('enter');
    expect(getScreen()).toBe(frame('? Pick', '  a', '❯ b sold out', '', '> This option is disabled and cannot be selected.', HELP));
    events.keypress('up');
    expect(getScreen()).toBe(frame('? Pick', '❯ a', '- b sold out', '', HELP));
    events.keypress('enter');
    await expect(answer).resolves.toBe('a');
  });

  it('draws separators, a disabled choice without a reason, the description and numbered indexes', async () => {
    const { events, getScreen } = await render(select, {
      message: 'Pick',
      choices: [{ value: 'a', description: 'the first' }, new Separator('--'), { value: 'b', disabled: true }, { value: 'c' }],
      theme: { indexMode: 'number' },
    });
    expect(getScreen()).toBe(frame('? Pick', '❯ 1. a', ' --', '- 2. b (disabled)', '  3. c', '', 'the first', HELP));
    events.keypress('up');
    expect(getScreen()).toContain('❯ 3. c');
  });

  it('stops at the ends when it does not loop, and comes round when it does', async () => {
    const stops = await render(select, { message: 'Pick', choices: ['a', 'b'], loop: false });
    stops.events.keypress('up');
    expect(stops.getScreen()).toContain('❯ a');
    stops.events.keypress('down');
    stops.events.keypress('down');
    expect(stops.getScreen()).toContain('❯ b');
    const loops = await render(select, { message: 'Pick', choices: ['a', 'b'] });
    loops.events.keypress('up');
    expect(loops.getScreen()).toContain('❯ b');
  });

  it('draws no help line when the theme returns none', async () => {
    const { getScreen } = await render(select, { message: 'Pick', choices: ['a'], theme: { style: { keysHelpTip: () => undefined } } });
    expect(getScreen()).toBe(frame('? Pick', '❯ a'));
  });

  it('rejects a list with nothing to answer', async () => {
    const { answer } = await render(select, { message: 'Pick', choices: [new Separator()] });
    await expect(answer).rejects.toBeInstanceOf(ValidationError);
    await expect(answer).rejects.toThrow('[select prompt] No selectable choices. All choices are disabled.');
  });

  it('clears a pending jump when it settles', async () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const { answer, events } = await render(select, { message: 'Pick', choices: ['a', 'b'] });
    events.type('b');
    events.keypress('enter');
    await expect(answer).resolves.toBe('b');
    expect(clear).toHaveBeenCalled();
  });
});

describe('usePagination, through select', () => {
  it('keeps the cursor in the middle of a looping page as the list scrolls under it', async () => {
    const { events, getScreen } = await render(select, { message: 'Pick', choices: numbers });
    for (let i = 0; i < 4; i++) events.keypress('down');
    expect(getScreen()).toBe(frame('? Pick', ...page(2, 5), '', HELP));
    events.keypress('up');
    expect(getScreen()).toBe(frame('? Pick', ...page(1, 4), '', HELP));
    // Coming round the top keeps the cursor where it was.
    for (let i = 0; i < 4; i++) events.keypress('up');
    expect(getScreen()).toBe(frame('? Pick', ...page(9, 12), '', HELP));
  });

  it('walks a jump down by its distance, and holds on a jump of a page or more', async () => {
    vi.useFakeTimers();
    const { events, getScreen } = await render(select, { message: 'Pick', choices: numbers });
    events.type('3');
    expect(getScreen()).toBe(frame('? Pick', ...page(1, 3), '', HELP));
    vi.advanceTimersByTime(700);
    events.type('11');
    expect(getScreen()).toBe(frame('? Pick', ...page(9, 11), '', HELP));
  });

  it('settles a page that does not loop into the middle, then to the bottom at the end', async () => {
    const { events, getScreen } = await render(select, { message: 'Pick', choices: numbers, loop: false });
    for (let i = 0; i < 5; i++) events.keypress('down');
    expect(getScreen()).toBe(frame('? Pick', ...page(3, 6), '', HELP));
    for (let i = 0; i < 6; i++) events.keypress('down');
    expect(getScreen()).toBe(frame('? Pick', ...page(6, 12), '', HELP));
  });

  it('keeps every row of a multi-line choice together, and cuts the ones that do not fit', async () => {
    const menu = [
      { value: 'a', name: 'Alpha\n  one\n  two' },
      { value: 'b', name: 'Beta\n  one\n  two' },
      { value: 'c', name: 'Gamma\n  one\n  two' },
    ];
    const { events, getScreen } = await render(select, { message: 'Pick', choices: menu, pageSize: 4 });
    expect(getScreen()).toBe(frame('? Pick', '❯ Alpha', '  one', '  two', '  Beta', '', HELP));
    events.keypress('down');
    expect(getScreen()).toBe(frame('? Pick', '  two', '❯ Beta', '  one', '  two', '', HELP));
    events.keypress('down');
    events.keypress('down');
    expect(getScreen()).toBe(frame('? Pick', '  two', '❯ Alpha', '  one', '  two', '', HELP));
  });

  it('draws an active choice taller than the room under the pointer at the bottom of the page', async () => {
    const tall = [{ value: 'a' }, { value: 'b' }, { value: 'c', name: 'C\n1\n2\n3' }];
    const { events, getScreen } = await render(select, { message: 'Pick', choices: tall, pageSize: 4, loop: false });
    events.keypress('down');
    events.keypress('down');
    expect(getScreen()).toBe(frame('? Pick', '❯ C', '1', '2', '3', '', HELP));
  });
});

describe('usePagination, called directly', () => {
  // A header line, so even an empty page is a frame with something on it.
  const list = createPrompt((config: { items: (string | undefined)[]; active: number; pageSize: number }) =>
    ['list:', usePagination({ items: config.items, active: config.active, pageSize: config.pageSize, renderItem: ({ item, isActive }) => `${isActive ? '>' : ' '}${String(item)}` })].join('\n'),
  );

  it('loops by default, and draws nothing for a missing item', async () => {
    const { getScreen } = await render(list, { items: ['a', undefined, 'c'], active: 0, pageSize: 5 });
    expect(getScreen()).toBe(frame('list:', '>a', ' c'));
  });

  it('draws an empty page for an empty list', async () => {
    const { getScreen, answer } = await render(list, { items: [], active: -1, pageSize: 3 });
    expect(getScreen()).toBe('list:');
    answer.cancel();
    await expect(answer).rejects.toThrow('Prompt was canceled');
  });
});
