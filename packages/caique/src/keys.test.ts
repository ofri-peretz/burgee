/**
 * `caique/keys` (controlroom R2): one decoder, keymaps as data, raw mode once, and no wait
 * off a terminal (controlroom R7).
 *
 * The decoder cases are node's own reports, normalised — each row is a byte string a real
 * terminal sends for the key, and the shape the rest of the family reads. The reader cases
 * drive a real `PassThrough` through node's real `emitKeypressEvents`, so what is asserted is
 * the decoder a person's keyboard goes through, not a double of it.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { bindings, canonical, canReadKeys, decode, type KeyInput, type KeyPress, KeysError, match, readKeys, specOf } from './keys.js';
import { keyOf } from './raw.js';

const ESC = '\u001B';

/** A key press with every modifier off, overridden where a row says so. */
const key = (name: string, sequence: string, mods: Partial<Pick<KeyPress, 'ctrl' | 'meta' | 'shift'>> = {}): KeyPress => ({ name, ctrl: false, meta: false, shift: false, sequence, ...mods });

/** What a call threw, or `undefined` when it did not. */
function refusal(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('decode: what a terminal sends, as one shape', () => {
  it.each([
    ['up', `${ESC}[A`, key('up', `${ESC}[A`)],
    ['down', `${ESC}[B`, key('down', `${ESC}[B`)],
    ['right', `${ESC}[C`, key('right', `${ESC}[C`)],
    ['left', `${ESC}[D`, key('left', `${ESC}[D`)],
    ['tab', '\t', key('tab', '\t')],
    ['shift-tab', `${ESC}[Z`, key('tab', `${ESC}[Z`, { shift: true })],
    ['enter (CR, what Enter sends in raw mode)', '\r', key('enter', '\r')],
    ['ctrl+j (LF, which only Ctrl+J sends in raw mode)', '\n', key('j', '\n', { ctrl: true })],
    ['backspace (DEL)', '\u007F', key('backspace', '\u007F')],
    ['backspace (BS)', '\b', key('backspace', '\b')],
    ['delete', `${ESC}[3~`, key('delete', `${ESC}[3~`)],
    ['home', `${ESC}[H`, key('home', `${ESC}[H`)],
    ['home, the other spelling', `${ESC}[1~`, key('home', `${ESC}[1~`)],
    ['end', `${ESC}[F`, key('end', `${ESC}[F`)],
    ['end, the other spelling', `${ESC}[4~`, key('end', `${ESC}[4~`)],
    ['page up', `${ESC}[5~`, key('pageup', `${ESC}[5~`)],
    ['page down', `${ESC}[6~`, key('pagedown', `${ESC}[6~`)],
    ['a letter', 's', key('s', 's')],
    ['an uppercase letter, as the letter with shift', 'S', key('s', 'S', { shift: true })],
    ['a digit', '1', key('1', '1')],
    ['space', ' ', key('space', ' ')],
    ['ctrl+c', '\u0003', key('c', '\u0003', { ctrl: true })],
    ['ctrl+d', '\u0004', key('d', '\u0004', { ctrl: true })],
    ['meta+a', `${ESC}a`, key('a', `${ESC}a`, { meta: true })],
    ['meta+enter', `${ESC}\r`, key('enter', `${ESC}\r`, { meta: true })],
    ['ctrl+up', `${ESC}[1;5A`, key('up', `${ESC}[1;5A`, { ctrl: true })],
    ['shift+up', `${ESC}[1;2A`, key('up', `${ESC}[1;2A`, { shift: true })],
    ['a character node has no name for, as itself', '/', key('/', '/')],
    ['an accented letter, as itself', 'é', key('é', 'é')],
    ['an uppercase accented letter, lowercased with shift like any letter', 'É', key('é', 'É', { shift: true })],
  ])('%s', (_label, sequence, expected) => {
    expect(decode(sequence)).toEqual([expected]);
  });

  it('a lone Escape is escape with no modifier, said at once rather than after a timeout', () => {
    // node reports it `meta`, and only once its escape timer fires; a chunk has no rest coming.
    expect(decode(ESC)).toEqual([key('escape', ESC)]);
  });

  it('Escape twice keeps the meta node gives it', () => {
    expect(decode(`${ESC}${ESC}`)).toEqual([key('escape', `${ESC}${ESC}`, { meta: true })]);
  });

  it('a chunk is every key in it, in order, including an Escape at its end', () => {
    expect(decode(`ab${ESC}[A${ESC}`).map((k) => k.name)).toEqual(['a', 'b', 'up', 'escape']);
  });

  it('a partial sequence is no key at all, which is what node makes of it', () => {
    expect(decode(`${ESC}[`)).toEqual([]);
  });

  it('a sequence nothing names has an empty name, which no keymap can bind', () => {
    const [unknown] = decode(`${ESC}[13;2u`);
    expect(unknown?.name).toBe('');
    expect(specOf(unknown as KeyPress)).toBeUndefined();
  });

  it('bracketed paste arrives as its two markers around the text', () => {
    expect(decode(`${ESC}[200~hi${ESC}[201~`).map((k) => k.name)).toEqual(['paste-start', 'h', 'i', 'paste-end']);
  });
});

describe('canonical: one spelling per key', () => {
  it.each([
    ['left', 'left'],
    ['ctrl+c', 'ctrl+c'],
    ['Ctrl+C', 'ctrl+c'],
    ['shift+ctrl+tab', 'ctrl+shift+tab'],
    ['alt+x', 'meta+x'],
    ['meta+shift+ctrl+a', 'ctrl+meta+shift+a'],
    ['PageUp', 'pageup'],
    ['esc', 'escape'],
    ['return', 'enter'],
    [' ', 'space'],
    ['S', 'shift+s'],
    ['?', '?'],
    ['ctrl++', 'ctrl++'],
    ['f5', 'f5'],
  ])('%j is %j', (spec, expected) => {
    expect(canonical(spec)).toBe(expected);
  });

  it.each(['', 'shift+', 'hyper+x', 'ctrl+ab', 'leftt'])('refuses %j, with a fix', (spec) => {
    const thrown = refusal(() => canonical(spec));
    expect(thrown).toBeInstanceOf(KeysError);
    expect(thrown).toMatchObject({ code: 'E_KEY_SPEC', name: 'KeysError' });
    expect((thrown as KeysError).fix).toContain('[ctrl+][meta+][shift+]<key>');
  });
});

describe('specOf: a key press in a keymap’s spelling', () => {
  it('orders the modifiers the way canonical does', () => {
    expect(specOf(key('tab', '', { shift: true, ctrl: true, meta: true }))).toBe('ctrl+meta+shift+tab');
    expect(specOf(decode('G')[0] as KeyPress)).toBe(canonical('G'));
  });
});

describe('a keymap is data', () => {
  const keymap = { left: 'previous', right: 'next', 'ctrl+c': 'quit', s: 'status', S: 'all', q: 'quit' } as const;

  it('match reads it', () => {
    expect(match(keymap, decode(`${ESC}[D`)[0] as KeyPress)).toBe('previous');
    expect(match(keymap, decode('\u0003')[0] as KeyPress)).toBe('quit');
    expect(match(keymap, decode('s')[0] as KeyPress)).toBe('status');
    expect(match(keymap, decode('S')[0] as KeyPress)).toBe('all');
  });

  it('a key it does not bind matches nothing, and neither does one nothing can bind', () => {
    expect(match(keymap, decode('x')[0] as KeyPress)).toBeUndefined();
    expect(match(keymap, decode(`${ESC}[13;2u`)[0] as KeyPress)).toBeUndefined();
    // ctrl+s is not s: a modifier is part of the key.
    expect(match(keymap, key('s', '\u0013', { ctrl: true }))).toBeUndefined();
  });

  it('bindings lists every bound key, in the order written, so a hint line names only those', () => {
    expect(bindings(keymap)).toEqual([
      { key: 'left', action: 'previous' },
      { key: 'right', action: 'next' },
      { key: 'ctrl+c', action: 'quit' },
      { key: 's', action: 'status' },
      { key: 'shift+s', action: 'all' },
      { key: 'q', action: 'quit' },
    ]);
  });

  it('two spellings of one key are refused, by bindings and by match alike', () => {
    const twice = { G: 'bottom', 'shift+g': 'top' };
    expect(() => bindings(twice)).toThrow(/"shift\+g" and "G" are the same key/);
    expect(() => match(twice, decode('g')[0] as KeyPress)).toThrow(KeysError);
  });

  it('a spec that names no key is refused when it is read, not silently never matched', () => {
    expect(() => match({ 'ctrl+': 'nothing' }, decode('a')[0] as KeyPress)).toThrow(KeysError);
  });
});

describe('canReadKeys', () => {
  it('needs a terminal that can be put into raw mode', () => {
    expect(canReadKeys({ isTTY: true, setRawMode: () => undefined })).toBe(true);
    expect(canReadKeys({ isTTY: false, setRawMode: () => undefined })).toBe(false);
    expect(canReadKeys({ isTTY: true })).toBe(false);
    expect(canReadKeys({})).toBe(false);
  });
});

/** A terminal on a real stream, which records what was done to its mode. */
function terminal(raw = false) {
  const modes: boolean[] = [];
  const stream = new PassThrough() as PassThrough & KeyInput;
  stream.isTTY = true;
  stream.isRaw = raw;
  stream.setRawMode = (mode: boolean) => {
    modes.push(mode);
    stream.isRaw = mode;
    return stream;
  };
  return { stream, modes };
}

/** An exit registry a test can run, standing in for closeout's. */
function registry() {
  const handlers = new Set<() => void>();
  const onExit = (handler: () => void): (() => void) => {
    handlers.add(handler);
    return () => handlers.delete(handler);
  };
  return { onExit, handlers, exit: () => [...handlers].forEach((h) => h()) };
}

describe('readKeys: raw mode once, for the reader’s whole life', () => {
  it('reads every key, and turns raw mode on once however many arrive', () => {
    const { stream, modes } = terminal();
    const got: string[] = [];
    const stop = readKeys(stream, (k) => got.push(specOf(k) ?? '?'), registry().onExit);
    stream.emit('data', `${ESC}[A`);
    stream.emit('data', 'x');
    stream.emit('data', '\u0003');
    expect(got).toEqual(['up', 'x', 'ctrl+c']);
    expect(modes).toEqual([true]);
    stop();
    expect(modes).toEqual([true, false]);
  });

  it('stopping is idempotent, and stops the reading', () => {
    const { stream, modes } = terminal();
    const got: KeyPress[] = [];
    const stop = readKeys(stream, (k) => got.push(k), registry().onExit);
    stop();
    stop();
    stream.emit('data', 'x');
    expect(got).toEqual([]);
    expect(modes).toEqual([true, false]);
  });

  it('a reader stopped twice does not pause the stream under the next reader', () => {
    const { stream } = terminal();
    const first = readKeys(stream, () => undefined, registry().onExit);
    first();
    const second = readKeys(stream, () => undefined, registry().onExit);
    first();
    expect(stream.isPaused()).toBe(false);
    second();
    expect(stream.isPaused()).toBe(true);
  });

  it('registers the way back on the exit path, and takes it off when stopped', () => {
    const exit = registry();
    const { stream, modes } = terminal();
    readKeys(stream, () => undefined, exit.onExit);
    expect(exit.handlers.size).toBe(1);
    exit.exit();
    expect(modes).toEqual([true, false]);

    const tidy = registry();
    const second = terminal();
    readKeys(second.stream, () => undefined, tidy.onExit)();
    expect(tidy.handlers.size).toBe(0);
  });

  it('leaves raw mode alone for a caller that already had it', () => {
    const { stream, modes } = terminal(true);
    readKeys(stream, () => undefined, registry().onExit)();
    expect(modes).toEqual([]);
  });

  it('registers on closeout’s exit hook when no registry is given', () => {
    const { stream, modes } = terminal();
    readKeys(stream, () => undefined)();
    expect(modes).toEqual([true, false]);
  });

  it('a lone Escape arrives as escape, once the decoder has waited for the rest of a sequence', async () => {
    const { stream } = terminal();
    const got = new Promise<KeyPress>((resolve) => {
      const stop = readKeys(stream, (k) => {
        stop();
        resolve(k);
      }, registry().onExit);
    });
    stream.emit('data', ESC);
    expect(await got).toEqual(key('escape', ESC));
  });
});

/** A pipe: what stdin is under CI, an agent, or `< file`. */
const pipe = (): PassThrough & KeyInput => new PassThrough() as PassThrough & KeyInput;

/** A terminal with no `setRawMode`, which cannot be read a key at a time either. */
function cannotGoRaw(): PassThrough & KeyInput {
  const stream = pipe();
  stream.isTTY = true;
  return stream;
}

describe('readKeys off a terminal: never a wait (controlroom R7)', () => {
  it.each([
    ['a pipe', pipe],
    ['a terminal that cannot go raw', cannotGoRaw],
  ])('%s: throws at once with a fix, and listens to nothing', (_label, make) => {
    const stream = make();
    expect(() => readKeys(stream, () => undefined, registry().onExit)).toThrow(
      expect.objectContaining({ code: 'E_NOT_A_TERMINAL', fix: 'read lines from stdin instead, or pass the answer as a flag' }),
    );
    expect(stream.listenerCount('keypress')).toBe(0);
    expect(stream.listenerCount('data')).toBe(0);
  });
});

/**
 * `raw.ts`'s `keyOf`, rebuilt on this decoder. Its own suite (`raw.test.ts`) is unchanged and is
 * the acceptance check; these are the chunks that suite never sends, where comparing bytes and
 * decoding could disagree.
 */
describe('keyOf on top of the decoder', () => {
  it.each([
    ['an empty chunk', ''],
    ['two keys typed faster than they were read', 'kk'],
    ['a partial sequence', `${ESC}[`],
    ['a letter with shift, which is not the letter', 'K'],
    ['an arrow with a modifier, which is not the arrow', `${ESC}[1;5A`],
  ])('%s is other', (_label, chunk) => {
    expect(keyOf(chunk)).toBe('other');
  });

  it('reads the application-mode arrows a terminal sends after `ESC [ ? 1 h`, which byte comparison did not', () => {
    expect(keyOf(`${ESC}OA`)).toBe('up');
    expect(keyOf(`${ESC}OB`)).toBe('down');
  });
});
