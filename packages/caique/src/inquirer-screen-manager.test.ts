/**
 * The screen manager and the muted stream under it, driven directly rather than through a
 * prompt: a fake readline that reports whatever cursor position a case names, and an output
 * that records every byte. `@inquirer/testing` compares whole frames, so the frames here are
 * asserted byte for byte too — an extra `cursorTo` is a failing case, not a cosmetic one.
 */
import { Writable } from 'node:stream';

import { SHOW_CURSOR } from 'closeout/cursor';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { breakLines, cursorDown, cursorLeft, cursorTo, cursorUp, eraseLines, MuteStream, outputWidth, ScreenManager, type ScreenReadline } from './inquirer-screen.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A writable that records what reaches it, sized like a terminal when a case asks. */
function sink(size: { columns?: number; rows?: number; isTTY?: boolean } = {}): Writable & { text: () => string; chunks: string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return Object.assign(stream, size, { chunks, text: () => chunks.join('') });
}

describe('MuteStream', () => {
  it('reports no size and no TTY before it is piped anywhere', () => {
    const stream = new MuteStream();
    expect(stream.columns).toBeUndefined();
    expect(stream.rows).toBeUndefined();
    expect(stream.isTTY).toBe(false);
  });

  it('reads its size and TTY-ness through from whatever it is piped to', () => {
    const stream = new MuteStream();
    stream.pipe(sink({ columns: 120, rows: 40, isTTY: true }));
    expect(stream.columns).toBe(120);
    expect(stream.rows).toBe(40);
    expect(stream.isTTY).toBe(true);
  });

  it('reads a destination that says nothing about TTY as not one', () => {
    const stream = new MuteStream();
    stream.pipe(sink());
    expect(stream.isTTY).toBe(false);
  });

  it('writes nothing while muted, and writes again once unmuted', () => {
    const out = sink();
    const stream = new MuteStream();
    stream.pipe(out);
    stream.mute();
    expect(stream.write('secret')).toBe(true);
    stream.unmute();
    expect(stream.write('shown')).toBe(true);
    expect(out.text()).toBe('shown');
  });

  it('ends with a final chunk only when unmuted, and ends either way', () => {
    const ends: string[] = [];
    const record = (label: string): MuteStream => {
      const stream = new MuteStream();
      stream.on('data', (chunk: string) => ends.push(`${label}:${chunk}`));
      stream.on('end', () => ends.push(`${label}:end`));
      return stream;
    };
    record('open').end('last');
    const muted = record('muted');
    muted.mute();
    muted.end('hidden');
    record('bare').end();
    expect(ends).toEqual(['open:last', 'open:end', 'muted:end', 'bare:end']);
  });
});

describe('outputWidth', () => {
  it('takes the width the output declares', () => {
    vi.stubEnv('COLUMNS', '50');
    expect(outputWidth({ columns: 120 })).toBe(120);
  });

  it('falls back to COLUMNS when the output declares no usable width', () => {
    vi.stubEnv('COLUMNS', '50');
    expect(outputWidth({ columns: 0 })).toBe(50);
    expect(outputWidth({})).toBe(50);
    expect(outputWidth(undefined)).toBe(50);
  });

  it('falls back to eighty when COLUMNS is unset, not a number, or not positive', () => {
    for (const columns of [undefined, '', 'wide', '0', '-3']) {
      vi.stubEnv('COLUMNS', columns);
      expect(outputWidth(undefined)).toBe(80);
    }
  });
});

const red = (text: string): string => `\u001B[31m${text}\u001B[39m`;

describe('breakLines', () => {
  it('hard-wraps each line at the width and trims the whitespace a break leaves behind', () => {
    expect(breakLines('abcdef\ngh  ', 4)).toBe('abcd\nef\ngh');
  });

  it('keeps an escape sequence whole across the break', () => {
    expect(breakLines(red('abcdef'), 4)).toBe(`${red('abcd')}\n${red('ef')}`);
  });
});

interface FakeReadline extends ScreenReadline {
  prompts: string[];
  closed: number;
  cursor: { rows: number; cols: number };
}

/** A readline the screen manager can drive, over a recording output of `columns` width. */
function readlineOn(out: Writable, line = ''): FakeReadline {
  const output = new MuteStream();
  output.pipe(out);
  output.mute();
  const rl: FakeReadline = {
    line,
    output,
    prompts: [],
    closed: 0,
    cursor: { rows: 0, cols: 0 },
    setPrompt: (prompt) => {
      rl.prompts.push(prompt);
    },
    getCursorPos: () => rl.cursor,
    close: () => {
      rl.closed++;
    },
  };
  return rl;
}

describe('ScreenManager', () => {
  it('draws the first frame with nothing to erase, and the cursor at the column readline reports', () => {
    const out = sink({ columns: 80 });
    const rl = readlineOn(out);
    const screen = new ScreenManager(rl);
    rl.cursor = { rows: 0, cols: 6 };
    screen.render('? name');
    expect(out.text()).toBe(`? name${cursorTo(6)}`);
    expect(rl.prompts).toEqual(['? name']);
    // Muted again once drawn, so nothing readline writes afterwards reaches the terminal.
    expect((rl.output as MuteStream).muted).toBe(true);
  });

  it('erases the previous frame before drawing the next one', () => {
    const out = sink({ columns: 80 });
    const rl = readlineOn(out);
    const screen = new ScreenManager(rl);
    screen.render('? one\nline two');
    // Only the line the cursor sits on is readline's prompt.
    expect(rl.prompts).toEqual(['line two']);
    out.chunks.length = 0;
    screen.render('? again');
    expect(out.text()).toBe(`${eraseLines(2)}? again${cursorTo(0)}`);
  });

  it('draws bottom content below the prompt line, then climbs back to it', () => {
    const out = sink({ columns: 80 });
    const rl = readlineOn(out);
    const screen = new ScreenManager(rl);
    rl.cursor = { rows: 0, cols: 6 };
    screen.render('? name', 'help\nmore');
    expect(out.text()).toBe(`? name\nhelp\nmore${cursorUp(2)}${cursorTo(6)}`);
    out.chunks.length = 0;
    // The next frame first steps down past the two lines it left under the cursor.
    screen.render('? name');
    expect(out.text()).toBe(`${cursorDown(2)}${eraseLines(3)}? name${cursorTo(6)}`);
  });

  it('tells readline only the prompt part of the last line, never the typed input', () => {
    const out = sink({ columns: 80 });
    const rl = readlineOn(out, 'secret');
    const screen = new ScreenManager(rl);
    screen.render('? password: secret');
    expect(rl.prompts).toEqual(['? password: ']);
  });

  it('adds a newline when the prompt line exactly fills the width, so the cursor is not left on it', () => {
    const out = sink({ columns: 4 });
    const rl = readlineOn(out);
    const screen = new ScreenManager(rl);
    rl.cursor = { rows: 1, cols: 0 };
    screen.render('abcd');
    // One wrapped row down from where readline reports the prompt row: no climb needed.
    expect(out.text()).toBe(`abcd\n${cursorTo(0)}`);
  });

  it('re-issues the column only when readline has moved the cursor', () => {
    const out = sink({ columns: 80 });
    const rl = readlineOn(out);
    rl.cursor = { rows: 0, cols: 3 };
    const screen = new ScreenManager(rl);
    screen.checkCursorPos();
    expect(out.text()).toBe('');
    rl.cursor = { rows: 0, cols: 5 };
    screen.checkCursorPos();
    expect(out.text()).toBe(cursorTo(5));
    screen.checkCursorPos();
    expect(out.text()).toBe(cursorTo(5));
  });

  it('leaves the answer on screen when done, and shows the cursor', () => {
    const out = sink({ columns: 80 });
    const rl = readlineOn(out);
    const screen = new ScreenManager(rl);
    screen.render('? name', 'help');
    out.chunks.length = 0;
    screen.done({ clearContent: false });
    expect(out.text()).toBe(`${cursorDown(1)}\n${cursorLeft}${SHOW_CURSOR}`);
    expect(rl.prompts.at(-1)).toBe('');
    expect(rl.closed).toBe(1);
  });

  it('erases the whole prompt when done with clearContent', () => {
    const out = sink({ columns: 80 });
    const rl = readlineOn(out);
    const screen = new ScreenManager(rl);
    screen.render('? one\ntwo');
    out.chunks.length = 0;
    screen.done({ clearContent: true });
    expect(out.text()).toBe(`${eraseLines(2)}${cursorLeft}${SHOW_CURSOR}`);
    expect(rl.closed).toBe(1);
  });
});
