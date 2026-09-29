/**
 * `clack-core.ts`, the loop under every `caique/clack` prompt: its settings, its line editor,
 * its validation states and the ways a prompt can end. `clack.test.ts` holds the twelve prompts
 * to clack's guide suite; these hold the engine to what it promises underneath them — that a
 * key edits the line the way `readline` would, that a slow validator shows it is working and
 * cannot be typed over, and that a prompt which has ended writes nothing more.
 *
 * Colour is off (`vitest-colour-setup.ts`), so frames are compared as text.
 */
import { Readable, Writable } from 'node:stream';

import { SHOW_CURSOR } from 'closeout/cursor';
import { afterEach, describe, expect, it } from 'vitest';

import { CANCEL_SYMBOL, isTTY, run, runValidation, S_BAR, S_BAR_END, settings, symbolBar, updateSettings } from './clack-core.js';
import { select, text } from './clack-prompts.js';

class Output extends Writable {
  buffer: string[] = [];
  isTTY = false;
  columns?: number = 80;
  rows = 20;
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, done: (error?: Error | null) => void): void {
    this.buffer.push(chunk.toString());
    done();
  }
}

class Input extends Readable {
  override _read(): void {
    // Keys arrive as emitted `keypress` events, never as data.
  }
}

interface Key {
  name?: string;
  ctrl?: boolean;
}

/** One key: a printable character is its own name; anything else is named. */
const press = (input: Input, char: string | undefined, key: Key = {}): boolean => input.emit('keypress', char, { name: key.name ?? char, sequence: char, ctrl: key.ctrl });

const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/** Type a line, one character at a time. */
function typeLine(input: Input, line: string): void {
  for (const char of line) press(input, char);
}

const ret = (input: Input): boolean => press(input, '\r', { name: 'return' });

/** A settled promise's value, or `pending` — read after the loop has had its turn. */
async function state<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([promise, tick().then(() => 'pending' as const)]);
}

const noop = (): void => undefined;

/** A Standard Schema that finds `issues`, synchronously or not. */
const schema = (issues: { message: string }[] | undefined, async: boolean) => ({
  '~standard': { validate: (_value: unknown) => (async ? Promise.resolve({ issues }) : { issues }) },
});

/** What a text prompt answers after `keys`, and enter. */
async function edited(keys: (input: Input) => void): Promise<unknown> {
  const input = new Input();
  const answer = text({ message: 'm', input, output: new Output() });
  keys(input);
  ret(input);
  return answer;
}

/** A text prompt's first frame, with `placeholder`. */
async function firstWith(placeholder: string | undefined): Promise<string> {
  const input = new Input();
  const output = new Output();
  const answer = text({ message: 'm', input, output, ...(placeholder === undefined ? {} : { placeholder }) });
  press(input, 'escape', { name: 'escape' });
  await answer;
  return output.buffer[1] ?? '';
}

describe('updateSettings', () => {
  afterEach(() => {
    settings.aliases.delete('w');
    settings.messages.cancel = 'Canceled';
    settings.messages.error = 'Something went wrong';
    settings.withGuide = true;
  });

  it('adds an alias for a known action, and a select moves with it', async () => {
    updateSettings({ aliases: { w: 'down' } });
    const input = new Input();
    const answer = select({ message: 'pick', options: [{ value: 'a' }, { value: 'b' }], input, output: new Output() });
    press(input, 'w');
    ret(input);
    expect(await answer).toBe('b');
  });

  it('never replaces an existing alias, and ignores an action that does not exist', () => {
    // `k` is clack's `up`; a caller cannot quietly turn it into `down` for every prompt.
    updateSettings({ aliases: { k: 'down', z: 'jump' as 'up' } });
    expect(settings.aliases.get('k')).toBe('up');
    expect(settings.aliases.has('z')).toBe(false);
  });

  it('sets the cancel and error messages one at a time, and leaves an unnamed one alone', () => {
    updateSettings({ messages: { cancel: 'Bye' } });
    expect(settings.messages).toEqual({ cancel: 'Bye', error: 'Something went wrong' });
    updateSettings({ messages: { error: 'Boom' } });
    expect(settings.messages).toEqual({ cancel: 'Bye', error: 'Boom' });
  });

  it('leaves the guide as it was when the update does not name it', () => {
    updateSettings({ withGuide: false });
    updateSettings({});
    expect(settings.withGuide).toBe(false);
  });
});

describe('the exported probes', () => {
  it('isTTY is true only for a stream that says it is a terminal', () => {
    expect(isTTY({ isTTY: true })).toBe(true);
    expect(isTTY({ isTTY: false })).toBe(false);
    expect(isTTY({})).toBe(false);
  });

  it('symbolBar draws the bar in every state but validating, which has none', () => {
    expect(symbolBar('validating')).toBeUndefined();
    expect(symbolBar('active')).toBe(S_BAR);
    expect(symbolBar('error')).toBe(S_BAR);
  });
});

describe('runValidation with a Standard Schema', () => {
  it('awaits an asynchronous schema and reports its first issue', async () => {
    const result = runValidation(schema([{ message: 'first' }, { message: 'second' }], true), 'x');
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe('first');
  });

  it('reports nothing for a schema with no issues', () => {
    expect(runValidation(schema(undefined, false), 'x')).toBeUndefined();
  });
});

describe('the line editor', () => {
  it('inserts at the cursor after the arrows move it', async () => {
    const answer = await edited((input) => {
      typeLine(input, 'abc');
      press(input, undefined, { name: 'left' });
      press(input, undefined, { name: 'left' });
      press(input, 'X');
    });
    expect(answer).toBe('aXbc');
  });

  it('draws the cursor inside the line once it is moved off the end', async () => {
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output });
    typeLine(input, 'abc');
    expect(output.buffer.at(-1)).toContain('abc█');
    press(input, undefined, { name: 'left' });
    press(input, undefined, { name: 'left' });
    // Colour is off, so the inverted `b` reads as a plain one: the whole line, and no block after it.
    expect(output.buffer.at(-1)).toContain('│  abc\n');
    ret(input);
    await answer;
  });

  it('goes home and to the end', async () => {
    const answer = await edited((input) => {
      typeLine(input, 'mid');
      press(input, undefined, { name: 'home' });
      press(input, '<');
      press(input, undefined, { name: 'end' });
      press(input, '>');
    });
    expect(answer).toBe('<mid>');
  });

  it('stops at both ends rather than wrapping', async () => {
    const answer = await edited((input) => {
      typeLine(input, 'ab');
      // Right at the end stays there, so one left lands between the two characters.
      press(input, undefined, { name: 'right' });
      press(input, undefined, { name: 'left' });
      press(input, 'X');
      for (let i = 0; i < 5; i++) press(input, undefined, { name: 'left' });
      press(input, '0');
    });
    expect(answer).toBe('0aXb');
  });

  it('backspace deletes behind the cursor and does nothing at the start', async () => {
    const answer = await edited((input) => {
      typeLine(input, 'abc');
      press(input, undefined, { name: 'left' });
      press(input, '\u007F', { name: 'backspace' });
      press(input, undefined, { name: 'home' });
      press(input, '\u007F', { name: 'backspace' });
    });
    expect(answer).toBe('ac');
  });

  it('delete removes under the cursor and does nothing at the end', async () => {
    const answer = await edited((input) => {
      typeLine(input, 'abc');
      press(input, undefined, { name: 'delete' });
      press(input, undefined, { name: 'home' });
      press(input, undefined, { name: 'delete' });
    });
    expect(answer).toBe('bc');
  });

  it('ctrl-u deletes everything before the cursor', async () => {
    const answer = await edited((input) => {
      typeLine(input, 'drop keep');
      for (let i = 0; i < 4; i++) press(input, undefined, { name: 'left' });
      press(input, 'u', { name: 'u', ctrl: true });
    });
    expect(answer).toBe('keep');
  });

  it('a keypress with no key name is no action for a list, even when its character is an alias', async () => {
    // Aliases are looked up by key name: `j` typed without one does not move the cursor.
    const input = new Input();
    const answer = select({ message: 'pick', options: [{ value: 'a' }, { value: 'b' }], input, output: new Output() });
    input.emit('keypress', 'j', {});
    ret(input);
    expect(await answer).toBe('a');
  });

  it('takes a keypress that carries no key description as typing', async () => {
    const input = new Input();
    const answer = text({ message: 'm', input, output: new Output() });
    input.emit('keypress', 'a');
    ret(input);
    expect(await answer).toBe('a');
  });
});

describe('the placeholder', () => {
  it('is drawn in an empty line', async () => {
    expect(await firstWith('type a name')).toContain('type a name');
  });

  it('an empty placeholder draws the hidden cell, as no placeholder does', async () => {
    expect(await firstWith('')).toBe(await firstWith(undefined));
  });
});

describe('validation', () => {
  it('a slow validator draws the validating frame, and keys pressed meanwhile are not typed', async () => {
    let settle: (problem: string | undefined) => void = noop;
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, validate: () => new Promise<string | undefined>((resolve) => (settle = resolve)) });
    typeLine(input, 'ok');
    ret(input);
    typeLine(input, 'XX');
    expect(await state(answer)).toBe('pending');
    settle(undefined);
    expect(await answer).toBe('ok');
  });

  it('an Error from a validator is shown by its message', async () => {
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, validate: () => new Error('not like that') });
    ret(input);
    await tick();
    expect(output.buffer.at(-1)).toContain('not like that');
    press(input, 'escape', { name: 'escape' });
    await answer;
  });

  it('without the guide, the problem is drawn with no closing bar in front of it', async () => {
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, withGuide: false, validate: () => 'say more' });
    ret(input);
    await tick();
    const shown = (output.buffer.at(-1) ?? '').split('\n');
    expect(shown).toContain('say more');
    expect(shown.join('\n')).not.toContain(S_BAR_END);
    press(input, 'escape', { name: 'escape' });
    await answer;
  });
});

describe('ending', () => {
  it('an abort while the prompt is open cancels it and draws the cancelled frame', async () => {
    const controller = new AbortController();
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, signal: controller.signal });
    typeLine(input, 'half');
    controller.abort();
    expect(await answer).toBe(CANCEL_SYMBOL);
    expect(output.buffer.at(-1)).toBe(SHOW_CURSOR);
    expect(output.buffer.join('')).toContain('half');
  });

  it('an abort while a validator is pending cancels, and the late verdict draws nothing after the prompt closed', async () => {
    let settle: (problem: string | undefined) => void = noop;
    const controller = new AbortController();
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, signal: controller.signal, validate: () => new Promise<string | undefined>((resolve) => (settle = resolve)) });
    typeLine(input, 'ok');
    ret(input);
    controller.abort();
    expect(await answer).toBe(CANCEL_SYMBOL);
    const closed = output.buffer.length;
    expect(output.buffer.at(-1)).toBe(SHOW_CURSOR);
    settle(undefined);
    await tick();
    // The cursor has been given back; a frame drawn now would land under the shell's prompt.
    expect(output.buffer.slice(closed)).toEqual([]);
  });
});

describe('the frame', () => {
  it('wraps at 80 columns when the stream does not say how wide it is', async () => {
    for (const columns of [undefined, 0]) {
      const input = new Input();
      const output = new Output();
      if (columns === undefined) delete output.columns;
      else output.columns = columns;
      const answer = text({ message: 'w'.repeat(100), input, output, withGuide: false });
      press(input, 'escape', { name: 'escape' });
      // eslint-disable-next-line reliability/no-await-in-loop -- one prompt at a time on one pair of streams
      await answer;
      const rows = (output.buffer[1] ?? '').split('\n');
      expect(Math.max(...rows.map((row) => row.length)), String(columns)).toBeLessThanOrEqual(80);
      expect(rows.some((row) => row.length === 80)).toBe(true);
    }
  });

  it('a one-row frame repaints without climbing: the climb is for the rows above the first', async () => {
    const input = new Input();
    const output = new Output();
    const answer = run<string>({ input, output, track: true, onInput: (p) => (p.value = p.userInput), render: (p) => `> ${p.userInput}` });
    press(input, 'a');
    ret(input);
    expect(await answer).toBe('a');
    const repaint = output.buffer[2] ?? '';
    expect(repaint).toBe('\u001B[1G\u001B[J> a');
  });

  it('a two-row frame climbs one row to repaint', async () => {
    const input = new Input();
    const output = new Output();
    const answer = run<string>({ input, output, track: true, onInput: (p) => (p.value = p.userInput), render: (p) => `title\n> ${p.userInput}` });
    press(input, 'a');
    ret(input);
    await answer;
    expect(output.buffer[2]).toBe('\u001B[1A\u001B[1G\u001B[Jtitle\n> a');
  });

});
