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

import { describe, expect, it, vi } from 'vitest';

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

describe('usePagination', () => {
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
function terminal(): { input: PassThrough; output: Writable & { text: () => string }; press: (...keys: string[]) => Promise<void> } {
  const chunks: string[] = [];
  const output = Object.assign(
    new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    }),
    { text: () => stripVTControlCharacters(chunks.join('')) },
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
