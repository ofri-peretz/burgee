/**
 * `caique/clack` — the twelve prompts and the writers, driven the way clack's own suite drives
 * them: a readable that receives `keypress` events and a writable that records every write.
 *
 * `compat-oracle` grades this subpath with clack's `guide.test.ts`, which needs
 * `@clack/core` installed beside it; these cases hold the same behaviour inside caique's own
 * suite, where that package is not a dependency and never may be (U6), and add the answers —
 * which the guide cases never look at — so a prompt that draws the right frame and returns the
 * wrong value cannot pass. Colour is off here (`vitest-colour-setup.ts`), so frames are
 * compared as text.
 */
import { sep } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { SHOW_CURSOR } from 'closeout/cursor';
import { afterEach, describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-namespace -- the first case reads the module's exports by name, which is the claim under test
import * as clack from './clack.js';

class Output extends Writable {
  buffer: string[] = [];
  isTTY = false;
  columns = 80;
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
  char?: string;
  name?: string;
  shift?: boolean;
}

const KEYS: Record<string, Key> = {
  escape: { char: 'escape', name: 'escape' },
  return: { char: '\r', name: 'return' },
  up: { name: 'up' },
  down: { name: 'down' },
  space: { char: ' ', name: 'space' },
  tab: { char: '\t', name: 'tab' },
  backspace: { char: '\u007F', name: 'backspace' },
};

/** Start a prompt, press `keys` one by one, and return its answer and everything it wrote. */
async function drive<T>(start: (io: { input: Input; output: Output }) => Promise<T>, keys: string[]): Promise<{ answer: T; writes: string[] }> {
  const input = new Input();
  const output = new Output();
  const answer = start({ input, output });
  for (const key of keys) {
    const known = KEYS[key];
    const event = known ?? { char: key, name: key.toLowerCase() };
    input.emit('keypress', event.char, { name: event.name, sequence: event.char, shift: event.shift });
    // eslint-disable-next-line reliability/no-await-in-loop -- keys are pressed one at a time, each after the last one's frame
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { answer: await answer, writes: output.buffer };
}

/** Everything a writer wrote to a recording stream. */
function capture(write: (output: Output) => void): string {
  const output = new Output();
  write(output);
  return output.buffer.join('');
}

/** A validator that accepts only `ok`. */
const sayOk = (value: string | undefined): string | undefined => (value === 'ok' ? undefined : 'say ok');

const OPTIONS = [{ value: 'a' }, { value: 'b' }];
const MESSAGE = 'message';

const PROMPTS: Record<string, (opts: clack.CommonOptions) => Promise<unknown>> = {
  text: (opts) => clack.text({ message: MESSAGE, ...opts }),
  password: (opts) => clack.password({ message: MESSAGE, ...opts }),
  confirm: (opts) => clack.confirm({ message: MESSAGE, ...opts }),
  multiline: (opts) => clack.multiline({ message: MESSAGE, ...opts }),
  date: (opts) => clack.date({ message: MESSAGE, ...opts }),
  path: (opts) => clack.path({ message: MESSAGE, ...opts }),
  select: (opts) => clack.select({ message: MESSAGE, options: OPTIONS, ...opts }),
  selectKey: (opts) => clack.selectKey({ message: MESSAGE, options: OPTIONS, ...opts }),
  multiselect: (opts) => clack.multiselect({ message: MESSAGE, options: OPTIONS, ...opts }),
  groupMultiselect: (opts) => clack.groupMultiselect({ message: MESSAGE, options: { group: OPTIONS }, ...opts }),
  autocomplete: (opts) => clack.autocomplete({ message: MESSAGE, options: OPTIONS, ...opts }),
  autocompleteMultiselect: (opts) => clack.autocompleteMultiselect({ message: MESSAGE, options: OPTIONS, ...opts }),
};

/** The first frame: clack writes the cursor hide, then the whole frame in one write. */
async function firstFrame(name: string, opts: Omit<clack.CommonOptions, 'input' | 'output'> = {}): Promise<string> {
  const { writes } = await drive((io) => (PROMPTS[name] as (o: clack.CommonOptions) => Promise<unknown>)({ ...io, ...opts }), ['escape']);
  return writes[1] ?? '';
}

describe('the twelve prompts', () => {
  afterEach(() => {
    clack.updateSettings({ withGuide: true });
  });

  it('are the twelve clack names the guide suite renders', () => {
    for (const name of Object.keys(PROMPTS)) expect(typeof (clack as Record<string, unknown>)[name], name).toBe('function');
  });

  it.each(Object.keys(PROMPTS))('%s opens on the grey guide, then its glyph and message', async (name) => {
    const lines = (await firstFrame(name)).split('\n');
    expect(lines[0]).toBe(clack.S_BAR);
    expect(lines[1]).toBe(`${clack.S_STEP_ACTIVE}  ${MESSAGE}`);
  });

  it.each(Object.keys(PROMPTS))('%s draws no guide when withGuide is false', async (name) => {
    const lines = (await firstFrame(name, { withGuide: false })).split('\n');
    expect(lines[0]).toBe(`${clack.S_STEP_ACTIVE}  ${MESSAGE}`);
    expect(lines.filter((line) => line.startsWith(`${clack.S_BAR}  `) || line === clack.S_BAR_END)).toEqual([]);
  });

  it.each(Object.keys(PROMPTS))("%s obeys this module's own updateSettings({ withGuide: false })", async (name) => {
    clack.updateSettings({ withGuide: false });
    expect((await firstFrame(name)).split('\n')[0]).toBe(`${clack.S_STEP_ACTIVE}  ${MESSAGE}`);
  });

  it.each(Object.keys(PROMPTS))('%s cancels on escape, and gives the cursor back last', async (name) => {
    const { answer, writes } = await drive((io) => (PROMPTS[name] as (o: clack.CommonOptions) => Promise<unknown>)(io), ['escape']);
    expect(clack.isCancel(answer)).toBe(true);
    expect(writes.at(-1)).toBe(SHOW_CURSOR);
  });
});

describe('what the prompts answer', () => {
  it('text returns what was typed, edited', async () => {
    const { answer } = await drive((io) => clack.text({ message: MESSAGE, ...io }), ['h', 'i', 'x', 'backspace', 'return']);
    expect(answer).toBe('hi');
  });

  it('text falls back to its default on an empty answer, after validating the empty one', async () => {
    const seen: (string | undefined)[] = [];
    const validate = (value: string | undefined): undefined => {
      seen.push(value);
      return undefined;
    };
    const { answer } = await drive((io) => clack.text({ message: MESSAGE, defaultValue: 'dflt', validate, ...io }), ['return']);
    expect(answer).toBe('dflt');
    expect(seen).toEqual([undefined]);
  });

  it('text shows a validation error and stays open until the answer is valid', async () => {
    const { answer, writes } = await drive((io) => clack.text({ message: MESSAGE, validate: sayOk, ...io }), ['n', 'o', 'return', 'backspace', 'backspace', 'o', 'k', 'return']);
    expect(answer).toBe('ok');
    expect(writes.join('')).toContain('say ok');
  });

  it('text accepts a Standard Schema as its validator', async () => {
    const schema = { '~standard': { validate: (value: unknown) => (value === 'ok' ? { value } : { issues: [{ message: 'not ok' }] }) } };
    const { writes } = await drive((io) => clack.text({ message: MESSAGE, validate: schema, ...io }), ['n', 'return', 'escape']);
    expect(writes.join('')).toContain('not ok');
  });

  it('password returns the typed secret and never writes it', async () => {
    const { answer, writes } = await drive((io) => clack.password({ message: MESSAGE, ...io }), ['s', 'e', 'c', 'return']);
    expect(answer).toBe('sec');
    expect(writes.join('')).not.toContain('sec');
    expect(writes.join('')).toContain(clack.S_PASSWORD_MASK.repeat(3));
  });

  it('confirm answers at once on n, and toggles with the arrows', async () => {
    expect((await drive((io) => clack.confirm({ message: MESSAGE, ...io }), ['n'])).answer).toBe(false);
    expect((await drive((io) => clack.confirm({ message: MESSAGE, ...io }), ['down', 'return'])).answer).toBe(false);
    expect((await drive((io) => clack.confirm({ message: MESSAGE, initialValue: false, ...io }), ['return'])).answer).toBe(false);
  });

  it('select moves past a disabled option and returns the value under the cursor', async () => {
    const options = [{ value: 'a' }, { value: 'b', disabled: true }, { value: 'c' }];
    expect((await drive((io) => clack.select({ message: MESSAGE, options, ...io }), ['down', 'return'])).answer).toBe('c');
    expect((await drive((io) => clack.select({ message: MESSAGE, options, initialValue: 'c', ...io }), ['j', 'return'])).answer).toBe('a');
  });

  it('selectKey answers on the key of an option, ignoring case unless asked', async () => {
    const options = [{ value: 'yes' }, { value: 'no' }];
    expect((await drive((io) => clack.selectKey({ message: MESSAGE, options, ...io }), ['N'])).answer).toBe('no');
  });

  it('multiselect toggles with space and a, and refuses an empty answer by default', async () => {
    const { answer, writes } = await drive((io) => clack.multiselect({ message: MESSAGE, options: OPTIONS, ...io }), ['return', 'down', 'space', 'return']);
    expect(answer).toEqual(['b']);
    expect(writes.join('')).toContain('Please select at least one option.');
    expect((await drive((io) => clack.multiselect({ message: MESSAGE, options: OPTIONS, ...io }), ['a', 'return'])).answer).toEqual(['a', 'b']);
    expect((await drive((io) => clack.multiselect({ message: MESSAGE, options: OPTIONS, required: false, ...io }), ['return'])).answer).toEqual([]);
  });

  it('groupMultiselect toggles a whole group from its header', async () => {
    const options = { one: [{ value: 'a' }, { value: 'b' }], two: [{ value: 'c' }] };
    expect((await drive((io) => clack.groupMultiselect({ message: MESSAGE, options, ...io }), ['space', 'return'])).answer).toEqual(['a', 'b']);
    expect((await drive((io) => clack.groupMultiselect({ message: MESSAGE, options, ...io }), ['down', 'down', 'space', 'return'])).answer).toEqual(['b']);
  });

  it('autocomplete filters by what is typed', async () => {
    const options = [{ value: 'apple' }, { value: 'banana' }];
    expect((await drive((io) => clack.autocomplete({ message: MESSAGE, options, ...io }), ['b', 'return'])).answer).toBe('banana');
    expect((await drive((io) => clack.autocomplete({ message: MESSAGE, options, ...io }), ['down', 'return'])).answer).toBe('banana');
  });

  it('autocompleteMultiselect toggles with tab, and with space once the arrows are in use', async () => {
    expect((await drive((io) => clack.autocompleteMultiselect({ message: MESSAGE, options: OPTIONS, ...io }), ['tab', 'down', 'space', 'return'])).answer).toEqual(['a', 'b']);
  });

  it('multiline inserts a newline on enter and submits on a second one at the end', async () => {
    expect((await drive((io) => clack.multiline({ message: MESSAGE, ...io }), ['h', 'return', 'i', 'return', 'return'])).answer).toBe('h\ni');
  });

  it('date is typed field by field in the format given, and returns a UTC date', async () => {
    const { answer } = await drive((io) => clack.date({ message: MESSAGE, format: 'YMD', ...io }), ['2', '0', '2', '6', '0', '9', '2', '7', 'return']);
    expect(answer).toEqual(new Date(Date.UTC(2026, 8, 27)));
  });

  it('date refuses year 1 rather than answer 1901, which is what Date.UTC makes of it', async () => {
    const { answer, writes } = await drive((io) => clack.date({ message: MESSAGE, format: 'YMD', ...io }), ['up', 'right', 'up', 'right', 'up', 'return', 'escape']);
    expect(clack.isCancel(answer)).toBe(true);
    expect(writes.join('')).toContain('Please enter a valid date');
  });

  it('date refuses a date before minDate', async () => {
    const minDate = new Date(Date.UTC(2030, 0, 1));
    const { writes } = await drive((io) => clack.date({ message: MESSAGE, format: 'YMD', minDate, ...io }), ['2', '0', '2', '6', '0', '9', '2', '7', 'return', 'escape']);
    expect(writes.join('')).toContain('Date must be on or after 2030-01-01');
  });

  // `fileURLToPath`, not the URL's `pathname`: on Windows that is `/D:/a/…`, which no
  // filesystem call can read, so the prompt listed nothing and waited forever.
  it('path lists the entries under what was typed', async () => {
    const root = fileURLToPath(new URL('.', import.meta.url));
    const { answer } = await drive((io) => clack.path({ message: MESSAGE, initialValue: `${root}clack-core`, ...io }), ['return']);
    expect(answer).toBe(`${root}clack-core.ts`);
  });

  it('path lists the entries under a path typed with forward slashes, in the separator the platform writes', async () => {
    const root = fileURLToPath(new URL('.', import.meta.url));
    const typed = `${root.split(sep).join('/')}clack-core`;
    const { answer } = await drive((io) => clack.path({ message: MESSAGE, initialValue: typed, ...io }), ['return']);
    expect(answer).toBe(`${root}clack-core.ts`);
  });

  it('an aborted signal cancels before anything is drawn', async () => {
    const controller = new AbortController();
    controller.abort();
    const { answer, writes } = await drive((io) => clack.text({ message: MESSAGE, signal: controller.signal, ...io }), []);
    expect(clack.isCancel(answer)).toBe(true);
    expect(writes).toEqual(['\n']);
  });
});

describe('the writers', () => {
  it('intro, outro and cancel draw the ends of the guide', () => {
    expect(capture((output) => clack.intro('hi', { output }))).toBe(`${clack.S_BAR_START}  hi\n`);
    expect(capture((output) => clack.outro('bye', { output }))).toBe(`${clack.S_BAR}\n${clack.S_BAR_END}  bye\n\n`);
    expect(capture((output) => clack.cancel('stop', { output, withGuide: false }))).toBe('stop\n\n');
  });

  it('log puts the first line beside its symbol and the rest beside the bar', () => {
    expect(capture((output) => clack.log.info('one\ntwo', { output }))).toBe(`${clack.S_BAR}\n${clack.S_INFO}  one\n${clack.S_BAR}  two\n`);
  });

  it('note boxes its message under its title', () => {
    const lines = capture((output) => clack.note('body', 'title', { output })).split('\n');
    expect(lines[1]).toMatch(/^◇ {2}title ─+╮$/);
    expect(lines).toContain(`${clack.S_BAR}  body   ${clack.S_BAR}`);
  });

  it('spinner prints each message once and its result once off a terminal, which is its static projection', () => {
    const text = capture((output) => {
      const spin = clack.spinner({ output });
      spin.start('working');
      spin.message('still working');
      spin.stop('done');
    });
    expect(text).toBe(`${clack.S_BAR}\n◒  working...\n◒  still working...\n${clack.S_STEP_SUBMIT}  done\n`);
  });

  it('group asks in order, hands each prompt the answers so far, and reports a cancel', async () => {
    const seen: unknown[] = [];
    let cancelled: unknown;
    const results = await clack.group(
      {
        first: () => Promise.resolve('one'),
        second: ({ results: so }) => {
          seen.push({ ...so });
          return Promise.resolve(clack.CANCEL_SYMBOL as unknown as string);
        },
      },
      { onCancel: ({ results: so }) => (cancelled = { ...so }) },
    );
    expect(seen).toEqual([{ first: 'one' }]);
    expect(cancelled).toEqual({ first: 'one', second: 'canceled' });
    expect(results).toEqual({ first: 'one', second: 'canceled' });
  });

  it('tasks runs each enabled task under a spinner and ends on what it returned', async () => {
    const output = new Output();
    await clack.tasks(
      [
        { title: 'one', task: () => 'one done' },
        { title: 'skipped', task: () => 'never', enabled: false },
      ],
      { output },
    );
    expect(output.buffer.join('')).toContain(`${clack.S_STEP_SUBMIT}  one done`);
    expect(output.buffer.join('')).not.toContain('never');
  });
});
