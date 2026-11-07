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
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

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

/**
 * Collect every unhandledRejection until the test ends. An async keypress listener's promise
 * is nobody's, so a rejection from it reaches only this — and, outside a test, kills the process.
 */
function escapes(): () => unknown[] {
  const seen: unknown[] = [];
  const listener = (reason: unknown): void => {
    seen.push(reason);
  };
  process.on('unhandledRejection', listener);
  onTestFinished(() => {
    process.off('unhandledRejection', listener);
  });
  return () => seen;
}

/** Validators that fail the way a network check does: by throwing, not by naming a problem. */
const rejects = (): Promise<undefined> => Promise.reject(new Error('network down'));
const rejectsBare = (): Promise<undefined> => Promise.reject();
function throws(): undefined {
  throw new Error('network down');
}
const passes = (): undefined => undefined;

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

  it.each([
    ['Ctrl-C', '\u0003', { name: 'c', ctrl: true }],
    ['escape', undefined, { name: 'escape' }],
  ])('%s while a validator hangs cancels: in raw mode Ctrl-C is a byte, and dropping it leaves no way out', async (_name, char, key) => {
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, validate: () => new Promise<string | undefined>(noop) });
    typeLine(input, 'ok');
    ret(input);
    press(input, char, key);
    expect(await state(answer)).toBe(CANCEL_SYMBOL);
    expect(output.buffer.at(-1)).toBe(SHOW_CURSOR);
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

  it.each([
    ['rejects', rejects, 'network down'],
    ['throws', throws, 'network down'],
    ['rejects with nothing', rejectsBare, settings.messages.error],
  ])('a validator that %s is a failed check, shown and retryable, never an unhandledRejection that kills the process', async (_name, fails, shown) => {
    const escaped = escapes();
    let validate: () => Promise<undefined> | undefined = fails;
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, validate: () => validate() });
    typeLine(input, 'ok');
    ret(input);
    expect(await state(answer)).toBe('pending');
    expect(output.buffer.at(-1)).toContain(shown);
    validate = passes;
    ret(input);
    expect(await answer).toBe('ok');
    expect(escaped()).toEqual([]);
  });

  it('a validator that rejects after an abort cancelled the prompt is still answered, not left to escape', async () => {
    const escaped = escapes();
    let fail: (reason: Error) => void = noop;
    const controller = new AbortController();
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, signal: controller.signal, validate: () => new Promise<undefined>((_resolve, reject) => (fail = reject)) });
    ret(input);
    controller.abort();
    expect(await answer).toBe(CANCEL_SYMBOL);
    const written = output.buffer.length;
    fail(new Error('network down'));
    await tick();
    expect(escaped()).toEqual([]);
    expect(output.buffer).toHaveLength(written);
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

/** A terminal's input: raw mode is a flag the test can read back. */
class Terminal extends Input {
  isTTY = true;
  isRaw = false;
  setRawMode(raw: boolean): this {
    this.isRaw = raw;
    return this;
  }
}

/** A prompt whose own code — the hook named `hook` — throws once `armed` says so. */
function breaking(hook: 'render' | 'onKey' | 'finalize' | 'abort', armed: () => boolean) {
  const input = new Terminal();
  const output = new Output();
  const controller = new AbortController();
  const boom = new Error(`${hook} broke`);
  const fail = (): void => {
    if (armed()) throw boom;
  };
  const answer = run<string>({
    input,
    output,
    track: true,
    signal: controller.signal,
    render: (prompt) => {
      if (hook === 'render') fail();
      return `> ${prompt.userInput}`;
    },
    onKey: () => {
      if (hook === 'onKey') fail();
    },
    finalize: () => {
      if (hook === 'finalize' || hook === 'abort') fail();
    },
  });
  return { input, output, controller, boom, answer };
}

/** What a prompt rejected with, or what it settled to — `pending` when it has not. */
const outcome = async (answer: Promise<unknown>): Promise<unknown> => state(answer).catch((reason: unknown) => reason);

describe("a throw from the prompt's own code", () => {
  it.each(['render', 'onKey', 'finalize'] as const)('a %s that throws on a key rejects the prompt with that error, and gives the terminal back', async (hook) => {
    const escaped = escapes();
    let armed = false;
    const { input, output, boom, answer } = breaking(hook, () => armed);
    expect(input.isRaw).toBe(true);
    armed = true;
    typeLine(input, 'x');
    ret(input);
    const settled = await outcome(answer);
    // Nothing awaits a keypress listener: a throw left in it reaches only this.
    expect(escaped()).toEqual([]);
    expect(settled).toBe(boom);
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount('keypress')).toBe(0);
    // Two queued keys threw for render and onKey; the first closed the prompt, once.
    expect(output.buffer.at(-1)).toBe(SHOW_CURSOR);
  });

  it('a render that throws on the first frame rejects the prompt and leaves no key listener or raw mode behind', async () => {
    const { input, boom, answer } = breaking('render', () => true);
    expect(await outcome(answer)).toBe(boom);
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount('keypress')).toBe(0);
  });

  it('a finalize that throws while an abort cancels rejects the prompt, and gives the terminal back', async () => {
    const { input, output, controller, boom, answer } = breaking('abort', () => true);
    controller.abort();
    expect(await outcome(answer)).toBe(boom);
    expect(input.isRaw).toBe(false);
    expect(output.buffer.at(-1)).toBe(SHOW_CURSOR);
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

/** Every escape spelled so it can be read: a colour as `<36>`. */
const shown = (text: string): string => text.replaceAll(/\u001B\[([\d;?]*)([A-Za-z])/gu, (_, parameter: string, final: string) => `<${parameter}${final === 'm' ? '' : final}>`);

/** Every `S_` glyph a fresh `clack-core` exports, under `TERM`. */
async function glyphs(term: string): Promise<Record<string, string>> {
  vi.stubEnv('TERM', term);
  for (const name of ['CI', 'WT_SESSION', 'TERM_PROGRAM', 'TERMINAL_EMULATOR']) vi.stubEnv(name, '');
  vi.resetModules();
  const fresh = await import('./clack-core.js');
  return Object.fromEntries(Object.entries(fresh).filter(([name]) => name.startsWith('S_'))) as Record<string, string>;
}

describe('the glyphs and instructions, read once at import', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('draws clack’s box glyphs where the terminal can, and its ASCII ones where it cannot', async () => {
    expect(await glyphs('xterm-256color')).toMatchInlineSnapshot(`
      {
        "S_BAR": "│",
        "S_BAR_END": "└",
        "S_BAR_END_RIGHT": "┘",
        "S_BAR_H": "─",
        "S_BAR_START": "┌",
        "S_BAR_START_RIGHT": "┐",
        "S_CHECKBOX_ACTIVE": "◻",
        "S_CHECKBOX_INACTIVE": "◻",
        "S_CHECKBOX_SELECTED": "◼",
        "S_CONNECT_LEFT": "├",
        "S_CORNER_BOTTOM_LEFT": "╰",
        "S_CORNER_BOTTOM_RIGHT": "╯",
        "S_CORNER_TOP_LEFT": "╭",
        "S_CORNER_TOP_RIGHT": "╮",
        "S_ERROR": "■",
        "S_INFO": "●",
        "S_PASSWORD_MASK": "▪",
        "S_RADIO_ACTIVE": "●",
        "S_RADIO_INACTIVE": "○",
        "S_STEP_ACTIVE": "◆",
        "S_STEP_CANCEL": "■",
        "S_STEP_ERROR": "▲",
        "S_STEP_SUBMIT": "◇",
        "S_SUCCESS": "◆",
        "S_WARN": "▲",
      }
    `);
    expect(await glyphs('linux')).toMatchInlineSnapshot(`
      {
        "S_BAR": "|",
        "S_BAR_END": "—",
        "S_BAR_END_RIGHT": "—",
        "S_BAR_H": "-",
        "S_BAR_START": "T",
        "S_BAR_START_RIGHT": "T",
        "S_CHECKBOX_ACTIVE": "[•]",
        "S_CHECKBOX_INACTIVE": "[ ]",
        "S_CHECKBOX_SELECTED": "[+]",
        "S_CONNECT_LEFT": "+",
        "S_CORNER_BOTTOM_LEFT": "+",
        "S_CORNER_BOTTOM_RIGHT": "+",
        "S_CORNER_TOP_LEFT": "+",
        "S_CORNER_TOP_RIGHT": "+",
        "S_ERROR": "x",
        "S_INFO": "•",
        "S_PASSWORD_MASK": "•",
        "S_RADIO_ACTIVE": ">",
        "S_RADIO_INACTIVE": " ",
        "S_STEP_ACTIVE": "*",
        "S_STEP_CANCEL": "x",
        "S_STEP_ERROR": "x",
        "S_STEP_SUBMIT": "o",
        "S_SUCCESS": "*",
        "S_WARN": "!",
      }
    `);
  });

  it('colours the list instructions and the required refusal as clack does', async () => {
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', '1');
    vi.resetModules();
    const core = await import('./clack-core.js');
    const list = await import('./clack-list.js');
    expect(shown([...core.SELECT_INSTRUCTIONS, ...core.MULTISELECT_INSTRUCTIONS, list.REQUIRED].join('\n'))).toMatchInlineSnapshot(`
      "<2>↑/↓<22> to navigate
      <2>Enter:<22> confirm
      <2>↑/↓<22> to navigate
      <2>Space:<22> select
      <2>Enter:<22> confirm
      Please select at least one option.
      <0><2>Press <90><47><7> space <27><49><39> to select, <90><47><7> enter <27><49><39> to submit<22><0>"
    `);
  });

  it('starts with every action, and the vim and cancel aliases', () => {
    expect([...settings.actions]).toEqual(['up', 'down', 'left', 'right', 'space', 'enter', 'cancel']);
    expect(Object.fromEntries(settings.aliases)).toEqual({ k: 'up', j: 'down', h: 'left', l: 'right', '\u0003': 'cancel', escape: 'cancel' });
  });
});

/** The first frame of a text prompt on a stream `columns` wide. */
async function frameAt(columns: number): Promise<string> {
  const input = new Input();
  const output = new Output();
  output.columns = columns;
  const answer = text({ message: 'm', initialValue: 'abcdef', input, output });
  press(input, 'escape', { name: 'escape' });
  await answer;
  return output.buffer[1] ?? '';
}

describe('the loop, on the paths only its own definitions take', () => {
  it('a validator that throws an Error with no message shows the error setting, and one that returns nothing or an empty string submits', async () => {
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, validate: (value) => {
      if (value === 'x') throw Object.assign(new Error('blank'), { message: '' });
      return value === 'y' ? '' : undefined;
    } });
    typeLine(input, 'x');
    ret(input);
    await tick();
    expect(output.buffer.at(-1)).toContain(settings.messages.error);
    press(input, '\u007F', { name: 'backspace' });
    typeLine(input, 'y');
    ret(input);
    expect(await answer).toBe('y');
  });

  it('a Standard Schema with an empty list of issues finds no problem', () => {
    expect(runValidation(schema([], false), 'x')).toBeUndefined();
  });

  it('draws the validating frame in dim while the verdict is out', async () => {
    vi.stubEnv('NO_COLOR', undefined);
    vi.stubEnv('FORCE_COLOR', '1');
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    let settle: (problem: string | undefined) => void = noop;
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, validate: () => new Promise<string | undefined>((resolve) => (settle = resolve)) });
    typeLine(input, 'ok');
    ret(input);
    await tick();
    expect(shown(output.buffer.at(-1) ?? '')).toMatchInlineSnapshot(`
      "<4A><1G><J><90>│<39>
      <2>◆<22>  m
      <2>│<22>  ok█
      <36>└<39>
      "
    `);
    settle(undefined);
    expect(await answer).toBe('ok');
  });

  it('reads a lone escape as a cancel after clack’s 50 ms, from bytes on the stream', async () => {
    const input = new Input();
    const answer = text({ message: 'm', input, output: new Output() });
    input.push('\u001B');
    const late = new Promise((resolve) => {
      setTimeout(() => resolve('late'), 300);
    });
    expect(await Promise.race([answer, late])).toBe(CANCEL_SYMBOL);
  });

  it('takes up a stream an earlier prompt paused, so a second prompt on it hears its bytes', async () => {
    const input = new Input();
    const first = text({ message: 'm', input, output: new Output() });
    typeLine(input, 'a');
    ret(input);
    expect(await first).toBe('a');
    expect(input.isPaused()).toBe(true);
    const second = text({ message: 'm', input, output: new Output() });
    input.push('\u001B');
    const late = new Promise((resolve) => {
      setTimeout(() => resolve('late'), 300);
    });
    expect(await Promise.race([second, late])).toBe(CANCEL_SYMBOL);
  });

  it('pauses its input once answered, and an abort after that draws nothing', async () => {
    const controller = new AbortController();
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output, signal: controller.signal });
    typeLine(input, 'a');
    ret(input);
    expect(await answer).toBe('a');
    expect(input.isPaused()).toBe(true);
    const written = output.buffer.length;
    controller.abort();
    expect(output.buffer).toHaveLength(written);
  });

  it('wraps at 80 columns for a stream that reports none, and at the width of a stream one column wide', async () => {
    expect(await frameAt(0)).toBe(await frameAt(80));
    expect((await frameAt(1)).split('\n').length).toBeGreaterThan((await frameAt(80)).split('\n').length);
  });

  it('a definition that does not track typing leaves the typed line alone, and reads its keys through the aliases', async () => {
    const input = new Input();
    const output = new Output();
    const actions: (string | undefined)[] = [];
    const answer = run<string>({ input, output, onKey: (_prompt, _char, _key, action) => actions.push(action), render: (prompt) => `typed: ${prompt.userInput}` });
    typeLine(input, 'k');
    press(input, 'escape', { name: 'escape' });
    await answer;
    expect(output.buffer.join('')).not.toContain('typed: k');
    expect(actions[0]).toBe('up');
  });

  it('a definition that tracks typing reads its keys without the aliases, and needs no onInput for its initial line', async () => {
    const input = new Input();
    const output = new Output();
    const actions: (string | undefined)[] = [];
    const answer = run<string>({ input, output, track: true, initialUserInput: 'x', onKey: (_prompt, _char, _key, action) => actions.push(action), render: (prompt) => `typed: ${prompt.userInput}` });
    typeLine(input, 'k');
    press(input, 'escape', { name: 'escape' });
    await answer;
    expect(output.buffer.join('')).toContain('typed: xk');
    expect(actions[0]).toBeUndefined();
  });

  it('an enter that a key handler already answered is not validated again', async () => {
    const input = new Input();
    const answer = run<string>({
      input,
      output: new Output(),
      validate: () => 'never',
      onKey: (prompt, _char, key) => {
        if (key.name === 'return') {
          prompt.value = 'done';
          prompt.state = 'submit';
        }
      },
      render: () => 'frame',
    });
    ret(input);
    expect(await answer).toBe('done');
  });

  it('draws a placeholder of one character with the cursor on it', async () => {
    expect(await firstWith('x')).toContain('│  x\n');
  });

  it('draws a cancelled answer of only spaces as nothing', async () => {
    const input = new Input();
    const output = new Output();
    const answer = text({ message: 'm', input, output });
    typeLine(input, '  ');
    press(input, 'escape', { name: 'escape' });
    await answer;
    expect(output.buffer.at(-3)?.endsWith('■  m\n│')).toBe(true);
  });

  it('draws the instructions without the guide with nothing before them', async () => {
    const input = new Input();
    const output = new Output();
    const answer = select({ message: 'm', options: [{ value: 'a' }], withGuide: false, input, output });
    press(input, 'escape', { name: 'escape' });
    await answer;
    expect(output.buffer[1]).toContain('\n↑/↓ to navigate • Enter: confirm\n');
  });
});

