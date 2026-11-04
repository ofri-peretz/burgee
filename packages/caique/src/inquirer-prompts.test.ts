/**
 * `caique/inquirer/prompts` on the paths `@inquirer/prompts`' own suites leave to the grade:
 * every branch of `usePagination`'s window, and `select` and `checkbox` driven over real
 * streams, a keypress here being bytes decoded by `node:readline` as a person's would be.
 *
 * The screens themselves are graded by upstream's suites in `compat-oracle` (100 cases for
 * these two prompts and their pagination); this file holds the arithmetic and the answers.
 */
import { AsyncResource } from 'node:async_hooks';
import { PassThrough, Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PromptReadline, useState, withHooks } from './inquirer-hooks.js';
import { usePagination } from './inquirer-pagination.js';
import { checkbox, select, Separator } from './inquirer-prompts.js';
import { TICK } from './inquirer-theme.js';
import { ValidationError } from './inquirer.js';

const noop = (): void => undefined;

/** One turn of the event loop. */
const turn = async (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/** A page renderer mounted in a bare store: `move` re-renders with a new active index. */
function mountPage<T>(items: readonly T[], options: { pageSize: number; loop?: boolean; active?: number; columns?: number }): { page: () => string; move: (active: number) => void } {
  const rl = { input: new PassThrough(), output: { columns: options.columns ?? 80 } } as unknown as PromptReadline;
  let page = '';
  let move: (active: number) => void = noop;
  withHooks(rl, (cycle) => {
    cycle(() => {
      const [active, setActive] = useState(options.active ?? 0);
      move = AsyncResource.bind((next: number) => {
        setActive(next);
      });
      page = usePagination({
        items,
        active,
        pageSize: options.pageSize,
        ...(options.loop === undefined ? {} : { loop: options.loop }),
        renderItem: ({ item, isActive }) => `${isActive ? '>' : ' '}${String(item)}`,
      });
    });
  });
  return { page: () => page, move: (active) => move(active) };
}

const numbers = Array.from({ length: 10 }, (_, i) => i + 1);

/**
 * Every page drawn while the cursor visits `moves` in turn, the first page included. A move of
 * `-1` draws the page again with the cursor where it is, as a prompt does when something else
 * on its screen changes.
 */
function walk(items: readonly string[], options: { pageSize: number; loop: boolean; active?: number }, moves: number[]): string[] {
  const rl = { input: new PassThrough(), output: { columns: 80 } } as unknown as PromptReadline;
  const pages: string[] = [];
  let move: (active: number) => void = noop;
  let redraw: () => void = noop;
  withHooks(rl, (cycle) => {
    cycle(() => {
      const [active, setActive] = useState(options.active ?? 0);
      const [draws, setDraws] = useState(0);
      move = AsyncResource.bind((next: number) => {
        setActive(next);
      });
      redraw = AsyncResource.bind(() => {
        setDraws(draws + 1);
      });
      pages.push(usePagination({ items, active, pageSize: options.pageSize, loop: options.loop, renderItem: ({ item, isActive }) => `${isActive ? '>' : ' '}${item}` }));
    });
  });
  for (const next of moves) {
    if (next === -1) redraw();
    else move(next);
  }
  return pages;
}

describe('usePagination', () => {
  it('draws a looping page again in the same place when nothing moved, from a start past the page', () => {
    expect(walk(['i0', 'i1', 'i2', 'i3\n-', 'i4', 'i5\n-\n-\n-', 'i6\n-', 'i7', 'i8', 'i9', 'i10\n-\n-\n-', 'i11'], { pageSize: 6, loop: true, active: 9 }, [-1,  -1])).toEqual([
      '-\n i6\n-\n i7\n i8\n>i9',
      '-\n i6\n-\n i7\n i8\n>i9',
      '-\n i6\n-\n i7\n i8\n>i9',
    ]);
  });

  it('without a loop, keeps the cursor where the end of the list pulls it, moving and coming back', () => {
    expect(walk(['i0', 'i1\n-\n-\n-', 'i2', 'i3\n-', 'i4', 'i5\n-', 'i6', 'i7', 'i8', 'i9\n-', 'i10'], { pageSize: 10, loop: false, active: 4 }, [7,  7,  8,  7])).toEqual([
      '-\n-\n i2\n i3\n-\n>i4\n i5\n-\n i6\n i7',
      '-\n i4\n i5\n-\n i6\n>i7\n i8\n i9\n-\n i10',
      '-\n i4\n i5\n-\n i6\n i7\n>i8\n i9\n-\n i10',
      '-\n i4\n i5\n-\n i6\n>i7\n i8\n i9\n-\n i10',
    ]);
  });

  it('moves a looping cursor down by a jump, then back', () => {
    expect(walk(['i0\n-\n-', 'i1\n-', 'i2', 'i3\n-\n-\n-', 'i4', 'i5', 'i6', 'i7\n-'], { pageSize: 8, loop: true, active: 1 }, [3,  1])).toEqual([
      '-\n>i1\n-\n i2\n i3\n-\n-\n-',
      ' i1\n-\n i2\n>i3\n-\n-\n-\n i4',
      ' i0\n-\n-\n>i1\n-\n i2\n i3\n-',
    ]);
  });

  it('does not move a looping cursor for a jump of a whole page', () => {
    expect(walk(['i0', 'i1\n-\n-\n-', 'i2', 'i3', 'i4', 'i5\n-\n-', 'i6', 'i7', 'i8'], { pageSize: 5, loop: true, active: 3 }, [-1,  -1,  8])).toEqual([
      '-\n-\n i2\n>i3\n i4',
      '-\n-\n i2\n>i3\n i4',
      '-\n-\n i2\n>i3\n i4',
      '-\n i6\n i7\n>i8\n i0',
    ]);
  });

  it('keeps an item taller than the page under a cursor that steps back and forth', () => {
    expect(walk(['i0\n-\n-\n-', 'i1'], { pageSize: 4, loop: true, active: 1 }, [1,  0,  1,  0,  1,  -1])).toEqual([
      '>i1\n i0\n-',
      '>i0\n-\n-\n-',
      '>i1\n i0',
      '>i0\n-\n-\n-',
      '>i1\n i0',
      '>i1\n i0',
    ]);
  });

  it('moves a looping cursor by one item at a time over items of different heights, drawing again between steps', () => {
    expect(walk(['i0', 'i1\n-\n-\n-', 'i2\n-\n-', 'i3'], { pageSize: 6, loop: true, active: 1 }, [-1,  1,  -1,  2,  -1,  3])).toEqual([
      ' i0\n>i1\n-\n-\n-\n i2',
      ' i0\n>i1\n-\n-\n-\n i2',
      ' i0\n>i1\n-\n-\n-\n i2',
      '-\n-\n-\n>i2\n-\n-',
      '-\n-\n-\n>i2\n-\n-',
      ' i2\n-\n-\n>i3\n i0\n i1',
    ]);
  });

  it('moves a looping cursor one tall item at a time from a start past the first', () => {
    expect(walk(['i0\n-\n-\n-', 'i1', 'i2\n-\n-', 'i3', 'i4', 'i5'], { pageSize: 8, loop: true, active: 1 }, [1,  1,  2,  3,  4,  5])).toEqual([
      '-\n>i1\n i2\n-\n-\n i3\n i4\n i5',
      '-\n i1\n>i2\n-\n-\n i3\n i4\n i5',
      ' i1\n i2\n-\n-\n>i3\n i4\n i5\n i0',
      ' i2\n-\n-\n i3\n>i4\n i5\n i0\n-',
      '-\n-\n i3\n i4\n>i5\n i0\n-\n-',
    ]);
  });

  it('loops one row at a time over items of different heights', () => {
    expect(walk(['a', 'b\nb2', 'c', 'd\nd2\nd3', 'e', 'f'], { pageSize: 4, loop: true }, [1, 2, 3, 4, 5, 0, 5, 4])).toEqual([
      '>a\n b\nb2\n c',
      ' a\n>b\nb2\n c',
      ' b\nb2\n>c\n d',
      ' c\n>d\nd2\nd3',
      'd2\nd3\n>e\n f',
      'd3\n e\n>f\n a',
      ' e\n f\n>a\n b',
      'd3\n e\n>f\n a',
      'd2\nd3\n>e\n f',
    ]);
  });

  it('loops by jumps shorter and longer than the page over items of different heights', () => {
    expect(walk(['a', 'b\nb2', 'c', 'd\nd2\nd3', 'e', 'f', 'g', 'h'], { pageSize: 5, loop: true }, [2, 4, 7, 0, 3, 6, 1])).toEqual([
      '>a\n b\nb2\n c\n d',
      ' b\nb2\n>c\n d\nd2',
      'd2\nd3\n>e\n f\n g',
      ' f\n g\n>h\n a\n b',
      ' g\n h\n>a\n b\nb2',
      'b2\n c\n>d\nd2\nd3',
      ' e\n f\n>g\n h\n a',
      ' h\n a\n>b\nb2\n c',
    ]);
  });

  it('without a loop, walks to the end and back over items of different heights', () => {
    expect(walk(['a', 'b\nb2', 'c', 'd\nd2\nd3', 'e', 'f'], { pageSize: 4, loop: false }, [1, 2, 3, 4, 5, 4, 3, 2, 1, 0])).toEqual([
      '>a\n b\nb2\n c',
      ' a\n>b\nb2\n c',
      ' b\nb2\n>c\n d',
      ' c\n>d\nd2\nd3',
      'd2\nd3\n>e\n f',
      'd2\nd3\n e\n>f',
      'd2\nd3\n>e\n f',
      ' c\n>d\nd2\nd3',
      ' b\nb2\n>c\n d',
      ' a\n>b\nb2\n c',
      '>a\n b\nb2\n c',
    ]);
  });

  it('loops over a list exactly as tall as the page as over a short one', () => {
    expect(walk(['a', 'b', 'c', 'd'], { pageSize: 4, loop: true }, [1, 3, 2, 0])).toEqual([
      '>a\n b\n c\n d',
      ' a\n>b\n c\n d',
      ' a\n b\n c\n>d',
      ' a\n b\n>c\n d',
      '>a\n b\n c\n d',
    ]);
  });

  it('without a loop, draws a list exactly as tall as the page whole', () => {
    expect(walk(['a', 'b\nb2', 'c'], { pageSize: 4, loop: false }, [2, 1, 0])).toEqual([
      '>a\n b\nb2\n c',
      ' a\n b\nb2\n>c',
      ' a\n>b\nb2\n c',
      '>a\n b\nb2\n c',
    ]);
  });

  it('clips an item taller than the page, at the top and the bottom', () => {
    expect(walk(['a\na2\na3\na4\na5', 'b', 'c', 'd\nd2\nd3\nd4'], { pageSize: 3, loop: true }, [1, 2, 3, 0, 3])).toEqual([
      '>a\na2\na3',
      'a5\n>b\n c',
      ' b\n>c\n d',
      '>d\nd2\nd3',
      '>a\na2\na3',
      '>d\nd2\nd3',
    ]);
  });

  it('without a loop, clips an item taller than the page', () => {
    expect(walk(['a', 'b', 'c\nc2\nc3\nc4\nc5', 'd'], { pageSize: 3, loop: false }, [1, 2, 3, 2])).toEqual([
      '>a\n b\n c',
      ' a\n>b\n c',
      '>c\nc2\nc3',
      'c4\nc5\n>d',
      '>c\nc2\nc3',
    ]);
  });

  it('draws a list shorter than the page whole, wherever the cursor is', () => {
    const { page, move } = mountPage([1, 2, 3], { pageSize: 7 });
    expect(page()).toBe('>1\n 2\n 3');
    move(2);
    expect(page()).toBe(' 1\n 2\n>3');
  });

  it('loops: the cursor walks down to the middle and stays there while the list scrolls under it', () => {
    const { page, move } = mountPage(numbers, { pageSize: 5 });
    expect(page()).toBe('>1\n 2\n 3\n 4\n 5');
    move(1);
    expect(page()).toBe(' 1\n>2\n 3\n 4\n 5');
    move(2);
    expect(page()).toBe(' 1\n 2\n>3\n 4\n 5');
    move(3);
    expect(page()).toBe(' 2\n 3\n>4\n 5\n 6');
    // Moving up keeps the cursor where it is.
    move(2);
    expect(page()).toBe(' 1\n 2\n>3\n 4\n 5');
    // A jump of several rows moves the cursor by the jump, up to the middle.
    move(0);
    move(9);
    expect(page()).toBe(' 8\n 9\n>10\n 1\n 2');
  });

  it('loops past the end, wrapping the rows above the cursor around', () => {
    const { page, move } = mountPage(numbers, { pageSize: 5 });
    move(9);
    expect(page()).toBe('>10\n 1\n 2\n 3\n 4');
    // Moving up, even across the end, never moves the cursor.
    move(0);
    expect(page()).toBe('>1\n 2\n 3\n 4\n 5');
  });

  it('does not move the cursor down for a jump of a whole page or more', () => {
    const { page, move } = mountPage(numbers, { pageSize: 3 });
    move(5);
    expect(page()).toBe('>6\n 7\n 8');
  });

  it('moves the cursor down by a jump shorter than the page, as far as the middle', () => {
    const { page, move } = mountPage(numbers, { pageSize: 7 });
    move(2);
    expect(page()).toBe(' 1\n 2\n>3\n 4\n 5\n 6\n 7');
    move(6);
    expect(page()).toBe(' 4\n 5\n 6\n>7\n 8\n 9\n 10');
  });

  it('without a loop, keeps the cursor mid-page and lets the ends pull it to the edge', () => {
    const { page, move } = mountPage(numbers, { pageSize: 5, loop: false });
    expect(page()).toBe('>1\n 2\n 3\n 4\n 5');
    move(5);
    expect(page()).toBe(' 4\n 5\n>6\n 7\n 8');
    move(9);
    expect(page()).toBe(' 6\n 7\n 8\n 9\n>10');
  });

  it('draws a multi-line item against the bottom when it does not fit under the cursor, and cuts it to the page', () => {
    const tall = ['a', 'b\nb2\nb3\nb4', 'c'];
    const { page, move } = mountPage(tall, { pageSize: 3, loop: false });
    move(1);
    expect(page()).toBe('>b\nb2\nb3');
    const above = mountPage(['x\nx2\nx3', 'y', 'z', 'w'], { pageSize: 3, loop: false, active: 3 });
    expect(above.page()).toBe('x3\n z\n>w'.replace('x3\n z', ' y\n z'));
  });

  it('wraps a line wider than the output, and draws a missing item as nothing', () => {
    expect(mountPage(['abcdef'], { pageSize: 3, columns: 4 }).page()).toBe('>abc\ndef');
    expect(mountPage([null, 'b'] as unknown as string[], { pageSize: 3, active: 1 }).page()).toBe('>b');
    expect(mountPage(['a'], { pageSize: 3, active: 4 }).page()).toBe(' a');
  });
});

/** A terminal pair: keys go in as bytes, frames come out as text. */
function terminal(): { input: PassThrough; output: Writable & { text: () => string; raw: () => string }; press: (...keys: string[]) => Promise<void> } {
  const chunks: string[] = [];
  const output = Object.assign(
    new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    }),
    { text: () => stripVTControlCharacters(chunks.join('')), raw: () => chunks.join('') },
  );
  const input = new PassThrough();
  // A turn before each key: a modern stream's first render waits one `setImmediate`, and a key
  // that lands before it is discarded, by design (upstream issue #1303).
  const press = async (...keys: string[]): Promise<void> =>
    keys.reduce(async (previous, key) => {
      await previous;
      await turn();
      input.write(key);
      await turn();
    }, turn());
  return { input, output, press };
}

const UP = '\u001B[A';
const DOWN = '\u001B[B';
const ENTER = '\r';
const BACKSPACE = '\u007F';

/** The text drawn since the last keypress. */
const lastFrame = (text: string): string => text.slice(text.lastIndexOf('?'));

describe('select', () => {
  it('answers the active choice: arrows skip separators and loop, a bare value is its own name', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a', new Separator(), { value: 'b', description: 'the b' }, { value: 'c', disabled: true }] }, io);
    await io.press(DOWN);
    expect(lastFrame(io.output.text())).toContain('the b');
    await io.press(DOWN, DOWN, UP, UP, ENTER);
    await expect(answer).resolves.toBe('b');
    expect(io.output.text()).toContain(`${TICK} Pick b`);
  });

  it('refuses a disabled choice with the theme error, and clears it on the next key', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: [{ value: 'x', disabled: 'gone' }, 'y'] }, io);
    await io.press();
    expect(io.output.text()).toContain('gone');
    await io.press(ENTER);
    expect(lastFrame(io.output.text())).toContain('This option is disabled and cannot be selected.');
    await io.press(DOWN);
    expect(lastFrame(io.output.text())).not.toContain('This option is disabled');
    await io.press(ENTER);
    await expect(answer).resolves.toBe('y');
  });

  it('stands still at either end when it does not loop', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a', 'b'], loop: false }, io);
    await io.press(UP, ENTER);
    await expect(answer).resolves.toBe('a');
    const io2 = terminal();
    const answer2 = select({ message: 'Pick', choices: ['a', 'b'], loop: false }, io2);
    await io2.press(DOWN, DOWN, ENTER);
    await expect(answer2).resolves.toBe('b');
  });

  it('jumps by number, skipping separators and disabled choices, and forgets the number after a pause', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const io = terminal();
      const answer = select({ message: 'Pick', choices: ['a', new Separator(), { value: 'b', disabled: true }, 'c'], theme: { indexMode: 'number' } }, io);
      await io.press();
      expect(io.output.text()).toContain('3. c');
      await io.press('2');
      vi.advanceTimersByTime(700);
      await io.press('3', ENTER);
      await expect(answer).resolves.toBe('c');
    } finally {
      vi.useRealTimers();
    }
  });

  it('searches by the start of a name, ignores what matches nothing, and backspace starts over', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['apple', 'banana', 'blueberry'] }, io);
    await io.press('b', 'l', 'x', BACKSPACE, 'b', 'a', ENTER);
    await expect(answer).resolves.toBe('banana');
  });

  it('does not search under vim keybindings, where j and k move', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['apple', 'banana', 'jam'], theme: { keybindings: ['vim'] } }, io);
    await io.press('j', 'b', ENTER);
    await expect(answer).resolves.toBe('banana');
  });

  it('starts on the default, unless the default is not a selectable choice', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a', 'b'], default: 'b' }, io);
    await io.press(ENTER);
    await expect(answer).resolves.toBe('b');
    const io2 = terminal();
    const answer2 = select({ message: 'Pick', choices: ['a', 'b'], default: 'z' }, io2);
    await io2.press(ENTER);
    await expect(answer2).resolves.toBe('a');
  });

  it('rejects a list with nothing to stand on', async () => {
    const io = terminal();
    await expect(select({ message: 'Pick', choices: [new Separator()] }, io)).rejects.toBeInstanceOf(ValidationError);
  });

  it('draws an empty message without a gap', async () => {
    const io = terminal();
    const answer = select({ message: '', choices: ['a'], theme: { prefix: '' } }, io);
    await io.press(ENTER);
    await expect(answer).resolves.toBe('a');
  });
});

/** Valid at two choices, a message at one, and a bare refusal otherwise. */
function twoPlease(choices: readonly unknown[]): string | boolean {
  if (choices.length === 2) return true;
  return choices.length === 1 ? 'two, please' : false;
}

describe('checkbox', () => {
  it('toggles with space and answers what is checked, drawing the checked name and the description', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: [{ value: 'a', checkedName: 'A!', description: 'about a' }, new Separator(), 'b'] }, io);
    await io.press();
    expect(io.output.text()).toContain('about a');
    await io.press(' ');
    expect(lastFrame(io.output.text())).toContain('A!');
    await io.press(DOWN, ' ', UP, UP, ' ', ENTER);
    await expect(answer).resolves.toEqual(['a']);
    expect(io.output.text()).toContain(`${TICK} Pick a`);
  });

  it('refuses to toggle a disabled choice, and draws it checked or not', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: [{ value: 'x', disabled: true, checked: true }, { value: 'y', disabled: 'no' }, 'z'], loop: false }, io);
    await io.press(' ');
    expect(lastFrame(io.output.text())).toContain('This option is disabled and cannot be toggled.');
    await io.press(DOWN);
    expect(lastFrame(io.output.text())).not.toContain('cannot be toggled');
    await io.press(DOWN, DOWN, ' ', ENTER);
    await expect(answer).resolves.toEqual(['x', 'z']);
  });

  it('toggles all, inverts, and toggles by number', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: ['a', 'b', { value: 'c', disabled: true }] }, io);
    await io.press('a');
    await io.press('a');
    await io.press('i', '1', '9', 'q', ENTER);
    await expect(answer).resolves.toEqual(['b']);
  });

  it('hides shortcuts set to null from the help line', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: ['a'], shortcuts: { all: null, invert: null } }, io);
    await io.press();
    expect(io.output.text()).not.toContain('invert');
    await io.press('a', ENTER);
    await expect(answer).resolves.toEqual([]);
  });

  it('holds the answer until it is valid and required', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: ['a', 'b'], required: true, validate: twoPlease }, io);
    await io.press(ENTER);
    expect(lastFrame(io.output.text())).toContain('At least one choice must be selected');
    await io.press(' ', ENTER);
    expect(lastFrame(io.output.text())).toContain('two, please');
    await io.press(DOWN, ' ', ENTER);
    await expect(answer).resolves.toEqual(['a', 'b']);
    const io2 = terminal();
    const answer2 = checkbox({ message: 'Pick', choices: ['a'], validate: () => false }, io2);
    await io2.press(ENTER);
    expect(lastFrame(io2.output.text())).toContain('You must select a valid value');
    answer2.cancel();
    await expect(answer2).rejects.toThrow();
  });

  it('ignores every key while a validation is pending, and listens again once it fails, as @inquirer/checkbox 5.2.7 does', async () => {
    const io = terminal();
    let settle!: (verdict: boolean | string) => void;
    const pending = async (): Promise<boolean | string> =>
      new Promise((resolve) => {
        settle = resolve;
      });
    const validate = vi.fn().mockImplementationOnce(pending).mockReturnValue(true);
    const answer = checkbox({ message: 'Pick', choices: ['a', 'b'], validate, theme: { spinner: { frames: ['@'] } } }, io);
    await io.press(' ', ENTER);
    await io.press(DOWN, ' ', 'a', 'i', '2', ENTER);
    expect(validate).toHaveBeenCalledOnce();
    // Loading while it waits: past the spinner's 300 ms delay, the prefix is its frame.
    await vi.waitFor(() => {
      expect(io.output.text()).toContain('@ Pick');
    });
    settle('b instead');
    await io.press();
    expect(lastFrame(io.output.text())).toContain('b instead');
    await io.press(' ', DOWN, ' ', ENTER);
    await expect(answer).resolves.toEqual(['b']);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('rejects a list with nothing to stand on', async () => {
    const io = terminal();
    await expect(checkbox({ message: 'Pick', choices: [] }, io)).rejects.toBeInstanceOf(ValidationError);
  });

  it('draws an empty message without a gap', async () => {
    const io = terminal();
    const answer = checkbox({ message: '', choices: ['a'], theme: { prefix: '' } }, io);
    await io.press(ENTER);
    await expect(answer).resolves.toEqual([]);
  });
});

describe('the done frame', () => {
  /**
   * `@inquirer/core` writes the done frame, then resolves; it does not wait for the stream to
   * flush. So the line must be handed to `output.write` before the answer settles, whenever the
   * stream's own callback fires.
   */
  it.each([
    ['select', select, []],
    ['checkbox', checkbox, [' ']],
  ] as const)('%s hands its done line to the output before the answer settles', async (_name, prompt, keys) => {
    const issued: string[] = [];
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        setTimeout(callback, 20);
      },
    });
    const write = output.write.bind(output);
    output.write = ((chunk: string, ...rest: never[]) => {
      issued.push(chunk);
      return write(chunk, ...rest);
    }) as typeof output.write;
    const input = new PassThrough();
    const answer = (prompt as typeof select)({ message: 'Pick', choices: ['a', 'b'] }, { input, output });
    await [DOWN, ...keys, ENTER].reduce(async (previous, key) => {
      await previous;
      await turn();
      input.write(key);
    }, Promise.resolve());
    const seen = await answer.then(() => stripVTControlCharacters(issued.join('')));
    expect(seen).toContain(`${TICK} Pick b`);
  });
});

/** Every escape a transcript holds, spelled so it can be read: a colour as `<36>`, a move or an erase as `<2K>`, `<1A>`. */
const shown = (text: string): string => text.replaceAll(/\u001B\[([\d;?]*)([A-Za-z])/gu, (_, parameter: string, final: string) => `<${parameter}${final === 'm' ? '' : final}>`);

describe('select and checkbox, frame by frame, in colour', () => {
  beforeEach(() => {
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('select: separators, a description, disabled choices, the help line, and the answer', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a', new Separator(), { value: 'b', description: 'the b' }, { value: 'c', disabled: true }, { value: 'd', disabled: 'gone' }] }, io);
    await io.press(DOWN, ENTER);
    await expect(answer).resolves.toBe('b');
    expect(shown(io.output.raw())).toMatchInlineSnapshot(`
      "? <1>Pick<22>
      <36>❯ a<39>
       ──────────────
        b
      <2>- c (disabled)<22>
      <2>- d gone<22>

      <1>↑↓<22> <2>navigate<22><2> • <22><1>⏎<22> <2>select<22><?25l><23G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
        a
       ──────────────
      <36>❯ b<39>
      <2>- c (disabled)<22>
      <2>- d gone<22>

      <36>the b<39>
      <1>↑↓<22> <2>navigate<22><2> • <22><1>⏎<22> <2>select<22><?25l><23G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>✔ <1>Pick<22> <36>b<39><9G>
      <G><?25h>"
    `);
  });

  it('select: numbered choices counted past separators, and a disabled one refused', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a', new Separator(), { value: 'c', disabled: true }, 'd'], theme: { indexMode: 'number' } }, io);
    await io.press(DOWN, ENTER, DOWN, ENTER);
    await expect(answer).resolves.toBe('d');
    expect(shown(io.output.raw())).toMatchInlineSnapshot(`
      "? <1>Pick<22>
      <36>❯ 1. a<39>
       ──────────────
      <2>- 2. c (disabled)<22>
        3. d

      <1>↑↓<22> <2>navigate<22><2> • <22><1>⏎<22> <2>select<22><?25l><23G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
        1. a
       ──────────────
      <2>❯ 2. c (disabled)<22>
        3. d

      <1>↑↓<22> <2>navigate<22><2> • <22><1>⏎<22> <2>select<22><?25l><23G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
        1. a
       ──────────────
      <2>❯ 2. c (disabled)<22>
        3. d

      <31>> This option is disabled and cannot be selected.<39>
      <1>↑↓<22> <2>navigate<22><2> • <22><1>⏎<22> <2>select<22><?25l><23G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
        1. a
       ──────────────
      <2>- 2. c (disabled)<22>
      <36>❯ 3. d<39>

      <1>↑↓<22> <2>navigate<22><2> • <22><1>⏎<22> <2>select<22><?25l><23G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>✔ <1>Pick<22> <36>d<39><9G>
      <G><?25h>"
    `);
  });

  it('checkbox: checked and unchecked, disabled either way, a description, the help line, and the answer', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: [{ value: 'a', checkedName: 'A!', description: 'about a' }, new Separator(), 'b', { value: 'x', disabled: true, checked: true }, { value: 'y', disabled: 'no' }] }, io);
    await io.press(' ', DOWN, ' ', ENTER);
    await expect(answer).resolves.toEqual(['a', 'b', 'x']);
    expect(shown(io.output.raw())).toMatchInlineSnapshot(`
      "? <1>Pick<22>
      <36>❯◯ a<39>
       ──────────────
       ◯ b
      <2> ◎ x (disabled)<22>
      <2> - y no<22>

      <36>about a<39>
      <1>↑↓<22> <2>navigate<22><2> • <22><1>space<22> <2>select<22><2> • <22><1>a<22> <2>all<22><2> • <22><1>i<22> <2>invert<22><2> • <22><1>⏎<22> <2>submit<22><?25l><57G><58G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
      <36>❯◉ A!<39>
       ──────────────
       ◯ b
      <2> ◎ x (disabled)<22>
      <2> - y no<22>

      <36>about a<39>
      <1>↑↓<22> <2>navigate<22><2> • <22><1>space<22> <2>select<22><2> • <22><1>a<22> <2>all<22><2> • <22><1>i<22> <2>invert<22><2> • <22><1>⏎<22> <2>submit<22><?25l><57G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
       ◉ A!
       ──────────────
      <36>❯◯ b<39>
      <2> ◎ x (disabled)<22>
      <2> - y no<22>

      <1>↑↓<22> <2>navigate<22><2> • <22><1>space<22> <2>select<22><2> • <22><1>a<22> <2>all<22><2> • <22><1>i<22> <2>invert<22><2> • <22><1>⏎<22> <2>submit<22><?25l><57G><58G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
       ◉ A!
       ──────────────
      <36>❯◉ b<39>
      <2> ◎ x (disabled)<22>
      <2> - y no<22>

      <1>↑↓<22> <2>navigate<22><2> • <22><1>space<22> <2>select<22><2> • <22><1>a<22> <2>all<22><2> • <22><1>i<22> <2>invert<22><2> • <22><1>⏎<22> <2>submit<22><?25l><57G><55G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
       ◉ A!
       ──────────────
      <36>❯◉ b<39>
      <2> ◎ x (disabled)<22>
      <2> - y no<22>

      <1>↑↓<22> <2>navigate<22><2> • <22><1>space<22> <2>select<22><2> • <22><1>a<22> <2>all<22><2> • <22><1>i<22> <2>invert<22><2> • <22><1>⏎<22> <2>submit<22><?25l><57G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
       ◉ A!
       ──────────────
      <36>❯◉ b<39>
      <2> ◎ x (disabled)<22>
      <2> - y no<22>

      <1>↑↓<22> <2>navigate<22><2> • <22><1>space<22> <2>select<22><2> • <22><1>a<22> <2>all<22><2> • <22><1>i<22> <2>invert<22><2> • <22><1>⏎<22> <2>submit<22><?25l><57G><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><1A><2K><G>✔ <1>Pick<22> <36>a, b, x<39><15G>
      <G><?25h>"
    `);
  });

  it('checkbox: a refusal, and the help line without shortcuts', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: ['a'], required: true, shortcuts: { all: null, invert: null } }, io);
    await io.press(ENTER);
    answer.cancel();
    await expect(answer).rejects.toThrow();
    expect(shown(io.output.raw())).toMatchInlineSnapshot(`
      "? <1>Pick<22>
      <36>❯◯ a<39>

      <1>↑↓<22> <2>navigate<22><2> • <22><1>space<22> <2>select<22><2> • <22><1>⏎<22> <2>submit<22><?25l><38G><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
      <36>❯◯ a<39>

      <1>↑↓<22> <2>navigate<22><2> • <22><1>space<22> <2>select<22><2> • <22><1>⏎<22> <2>submit<22><?25l><38G><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
      <36>❯◯ a<39>

      <1>↑↓<22> <2>navigate<22><2> • <22><1>space<22> <2>select<22><2> • <22><1>⏎<22> <2>submit<22><?25l><38G><2K><1A><2K><1A><2K><1A><2K><G>? <1>Pick<22>
      <36>❯◯ a<39>

      <31>> At least one choice must be selected<39>
      <1>↑↓<22> <2>navigate<22><2> • <22><1>space<22> <2>select<22><2> • <22><1>⏎<22> <2>submit<22><?25l><38G>
      <G><?25h>"
    `);
  });
});

const RIGHT = '\u001B[C';

/** The choice rows a frame draws: every row of `frame` that names one of `names`. */
const rowsNaming = (frame: string, names: readonly string[]): number => frame.split('\n').filter((row) => names.some((name) => row.includes(name))).length;

const TEN = Array.from({ length: 10 }, (_, i) => `choice${String(i)}`);

describe('select and checkbox, on the keys and choices their other cases do not use', () => {
  it('select: pages seven choices by default, starts past a leading separator, and draws the prefix and message with one space', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: [new Separator(), ...TEN] }, io);
    await io.press();
    expect(io.output.text().startsWith('? Pick\n')).toBe(true);
    // Seven rows: the separator, and six choices.
    expect(rowsNaming(lastFrame(io.output.text()), TEN)).toBe(6);
    await io.press(ENTER);
    await expect(answer).resolves.toBe('choice0');
    expect(io.output.text()).toContain(`${TICK} Pick choice0`);
  });

  it('select: with no prefix, the message starts the line, and so does the answer', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a'], theme: { prefix: '' } }, io);
    await io.press(ENTER);
    await expect(answer).resolves.toBe('a');
    expect(io.output.text()).toMatch(/^Pick\n/u);
    expect(io.output.text()).toMatch(/Pick a\n?$/u);
    expect(io.output.text()).not.toMatch(/ Pick a\n?$/u);
  });

  it('select: draws its message in the idle status, then done', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a'], theme: { style: { message: (text: string, status: string) => `${text}:${status}` } as never } }, io);
    await io.press(ENTER);
    await expect(answer).resolves.toBe('a');
    expect(io.output.text()).toContain('Pick:idle');
    expect(io.output.text()).toContain('Pick:done');
  });

  it('select: a number of a disabled choice moves nothing, nor one past the last choice', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a', { value: 'b', disabled: true }, 'c'] }, io);
    await io.press('2', '9', ENTER);
    await expect(answer).resolves.toBe('a');
  });

  it('select: under vim keybindings, a letter does not search', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['apple', 'banana'], theme: { keybindings: ['vim'] } }, io);
    await io.press('b', ENTER);
    await expect(answer).resolves.toBe('apple');
  });

  it('select: a key that is not an arrow, a number or a letter searches for nothing, which is the first choice', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a', 'b'] }, io);
    await io.press(DOWN, RIGHT, ENTER);
    await expect(answer).resolves.toBe('a');
  });

  it('select: a search lasts while keys keep coming, and starts over after a pause', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const io = terminal();
      const answer = select({ message: 'Pick', choices: ['bob', 'bl', 'u-turn'] }, io);
      await io.press('b');
      vi.advanceTimersByTime(600);
      await io.press('l');
      vi.advanceTimersByTime(200);
      await io.press('u', ENTER);
      await expect(answer).resolves.toBe('bl');
      const io2 = terminal();
      const answer2 = select({ message: 'Pick', choices: ['blue', 'lemon'] }, io2);
      await io2.press('b');
      vi.advanceTimersByTime(800);
      await io2.press('l', ENTER);
      await expect(answer2).resolves.toBe('lemon');
      // A search still pending when the prompt is cancelled is cleared with it, not left to fire on a closed line.
      const io3 = terminal();
      const answer3 = select({ message: 'Pick', choices: ['a', 'b'] }, io3);
      await io3.press('b');
      const pending = vi.getTimerCount();
      answer3.cancel();
      await expect(answer3).rejects.toThrow();
      expect(vi.getTimerCount()).toBe(pending - 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('checkbox: pages seven choices by default, and draws the prefix and message with one space', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: TEN }, io);
    await io.press();
    expect(io.output.text().startsWith('? Pick\n')).toBe(true);
    expect(rowsNaming(lastFrame(io.output.text()), TEN)).toBe(7);
    await io.press(ENTER);
    await expect(answer).resolves.toEqual([]);
  });

  it('checkbox: with no prefix, the message starts the line, and so does the answer', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: ['a'], theme: { prefix: '' } }, io);
    await io.press(' ', ENTER);
    await expect(answer).resolves.toEqual(['a']);
    expect(io.output.text()).toMatch(/^Pick\n/u);
    expect(io.output.text()).toMatch(/Pick a\n?$/u);
    expect(io.output.text()).not.toMatch(/ Pick a\n?$/u);
  });

  it('checkbox: `a` checks every selectable choice, and again unchecks them', async () => {
    const choices = ['a', { value: 'x', disabled: true }, 'b'];
    const io = terminal();
    const all = checkbox({ message: 'Pick', choices }, io);
    await io.press('a', ENTER);
    await expect(all).resolves.toEqual(['a', 'b']);
    const io2 = terminal();
    const none = checkbox({ message: 'Pick', choices }, io2);
    await io2.press('a', 'a', ENTER);
    await expect(none).resolves.toEqual([]);
  });

  it('checkbox: a number toggles that choice and moves to it, and not a disabled one', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: ['a', 'b', { value: 'x', disabled: true }] }, io);
    await io.press('2', ' ', '3', ENTER);
    await expect(answer).resolves.toEqual([]);
    // The cursor stays where it was for the disabled one, so space toggles that.
    const io2 = terminal();
    const answer2 = checkbox({ message: 'Pick', choices: ['a', 'b', { value: 'x', disabled: true }] }, io2);
    await io2.press('3', ' ', ENTER);
    await expect(answer2).resolves.toEqual(['a']);
  });

  it('checkbox: hands its validator the chosen choices, with no description where none was written', async () => {
    const io = terminal();
    let seen: readonly object[] = [];
    const answer = checkbox({ message: 'Pick', choices: ['a'], validate: (chosen) => ((seen = chosen), true) }, io);
    await io.press(' ', ENTER);
    await expect(answer).resolves.toEqual(['a']);
    expect(seen.map((choice) => 'description' in choice)).toEqual([false]);
  });

  it('checkbox: toggling clears a refusal', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: ['a'], required: true }, io);
    await io.press(ENTER);
    expect(lastFrame(io.output.text())).toContain('At least one choice must be selected');
    await io.press(' ');
    expect(lastFrame(io.output.text())).not.toContain('At least one choice must be selected');
    await io.press(ENTER);
    await expect(answer).resolves.toEqual(['a']);
  });

  it('names the prompt when no choice can be stood on', async () => {
    await expect(checkbox({ message: 'Pick', choices: [new Separator()] }, terminal())).rejects.toThrow('[checkbox prompt] No selectable choices. All choices are disabled.');
    await expect(select({ message: 'Pick', choices: [new Separator()] }, terminal())).rejects.toThrow('[select prompt] No selectable choices. All choices are disabled.');
  });
});

describe('the frame around a list, and the prompt under it', () => {
  it('a null choice is a choice named null', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: [null, 'a'] }, io);
    await io.press(ENTER);
    await expect(answer).resolves.toBeNull();
  });

  it('ends a frame with no help line on the last row of the list, not on the spacer', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a'], theme: { style: { keysHelpTip: () => undefined } as never } }, io);
    await io.press();
    expect(io.output.raw()).toContain('❯ a\u001B[?25l');
    await io.press(ENTER);
    await expect(answer).resolves.toBe('a');
  });

  it('echoes nothing readline reads: a letter typed into a list is not drawn', async () => {
    const io = terminal();
    const answer = select({ message: 'Pick', choices: ['a', 'b'] }, io);
    await io.press('q', ENTER);
    await expect(answer).resolves.toBe('a');
    expect(io.output.text()).not.toContain('q');
  });

  it('shows no spinner for a check that answered before the spinner was due', async () => {
    const io = terminal();
    const answer = checkbox({ message: 'Pick', choices: ['a'], validate: async () => 'not yet', theme: { spinner: { frames: ['@'] } } }, io);
    await io.press(ENTER);
    await new Promise((resolve) => {
      setTimeout(resolve, 450);
    });
    expect(io.output.text()).not.toContain('@');
    answer.cancel();
    await expect(answer).rejects.toThrow();
  });
});

