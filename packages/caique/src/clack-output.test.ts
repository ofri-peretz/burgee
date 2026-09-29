/**
 * `caique/clack`'s writers on the paths `clack.test.ts` does not take: every `log` and `stream`
 * kind, a note's edges, and the spinner — animated on a terminal, ended by a signal or by the
 * process leaving, and told the answers `tasks` hands it.
 *
 * `closeout/exit-hook` is replaced by a recorder, so "the process is leaving" is a call this
 * file makes rather than one it would have to die to observe. The animation runs on faked
 * intervals, and `performance.now` is pinned wherever a timer is printed. Colour is off in
 * this suite (`vitest-colour-setup.ts`), so every frame is compared as text.
 */
import { performance } from 'node:perf_hooks';
import { Writable } from 'node:stream';

import { HIDE_CURSOR, SHOW_CURSOR } from 'closeout/cursor';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANCEL_SYMBOL,
  S_BAR,
  S_BAR_END,
  S_BAR_H,
  S_BAR_START,
  S_CONNECT_LEFT,
  S_CORNER_BOTTOM_LEFT,
  S_CORNER_BOTTOM_RIGHT,
  S_CORNER_TOP_RIGHT,
  S_ERROR,
  S_INFO,
  S_STEP_CANCEL,
  S_STEP_ERROR,
  S_STEP_SUBMIT,
  S_SUCCESS,
  S_WARN,
  settings,
} from './clack-core.js';
import { cancel, group, intro, log, note, outro, spinner, stream, tasks } from './clack-output.js';

/** Every exit hook registered and not yet removed, in registration order. */
const hooks = vi.hoisted(() => new Set<(code: number | string) => void>());
vi.mock('closeout/exit-hook', () => ({
  default: (hook: (code: number | string) => void): (() => void) => {
    hooks.add(hook);
    return () => {
      hooks.delete(hook);
    };
  },
}));

/** The process leaving with `code`: every hook still registered is run, as exit-hook runs them. */
function exitWith(code: number | string): void {
  for (const hook of [...hooks]) hook(code);
}

class Output extends Writable {
  buffer: string[] = [];
  constructor(
    readonly isTTY = false,
    readonly columns = 80,
  ) {
    super();
  }
  get text(): string {
    return this.buffer.join('');
  }
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, done: (error?: Error | null) => void): void {
    this.buffer.push(chunk.toString());
    done();
  }
}

const CSI = '\u001B[';
/** What the spinner writes to take its last frame of one line back off the screen. */
const ERASE_ONE = `${CSI}1G${CSI}J`;

/** Everything written to process.stdout while `write` runs — where a writer given no output goes. */
async function stdoutOf(write: () => unknown): Promise<string> {
  let text = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    text += String(chunk);
    return true;
  });
  try {
    await write();
  } finally {
    spy.mockRestore();
  }
  return text;
}

/** Everything a writer wrote to a recording stream. */
function capture(write: (output: Output) => void): string {
  const output = new Output();
  write(output);
  return output.text;
}

afterEach(() => {
  hooks.clear();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the ends of the guide', () => {
  it('write to process.stdout with an empty title when given nothing', async () => {
    expect(await stdoutOf(() => intro())).toBe(`${S_BAR_START}  \n`);
    expect(await stdoutOf(() => outro())).toBe(`${S_BAR}\n${S_BAR_END}  \n\n`);
    expect(await stdoutOf(() => cancel())).toBe(`${S_BAR_END}  \n\n`);
  });

  it('are the bare text when the guide is off', () => {
    expect(capture((output) => intro('hi', { output, withGuide: false }))).toBe('hi\n');
    expect(capture((output) => outro('bye', { output, withGuide: false }))).toBe('bye\n\n');
    expect(capture((output) => cancel('stop', { output }))).toBe(`${S_BAR_END}  stop\n\n`);
  });
});

describe('log', () => {
  it.each([
    ['info', S_INFO],
    ['success', S_SUCCESS],
    ['step', S_STEP_SUBMIT],
    ['warn', S_WARN],
    ['warning', S_WARN],
    ['error', S_ERROR],
  ] as const)('%s marks its first line with its own symbol', (kind, symbol) => {
    expect(capture((output) => log[kind]('one\ntwo', { output }))).toBe(`${S_BAR}\n${symbol}  one\n${S_BAR}  two\n`);
  });

  it('message takes lines as an array, its own two symbols, and any number of spacing lines', () => {
    const text = capture((output) => log.message(['one', 'two'], { output, symbol: '*', secondarySymbol: '+', spacing: 2 }));
    expect(text).toBe('+\n+\n*  one\n+  two\n');
  });

  it('draws an empty line as the bar alone, with nothing after it', () => {
    expect(capture((output) => log.message('one\n\nthree', { output, spacing: 0 }))).toBe(`${S_BAR}  one\n${S_BAR}\n${S_BAR}  three\n`);
  });

  it('writes the lines and blank spacing, and no marks, when the guide is off', () => {
    expect(capture((output) => log.info('one\n\nthree', { output, withGuide: false }))).toBe('\none\n\nthree\n');
  });

  it('message with nothing writes the spacing line to process.stdout', async () => {
    expect(await stdoutOf(() => log.message())).toBe(`${S_BAR}\n`);
  });
});

/** Chunks as a model produces them: one at a time, each on a later turn than the last. */
async function* chunks(...parts: string[]): AsyncGenerator<string> {
  yield* parts;
}

describe('stream', () => {
  it.each([
    ['info', S_INFO],
    ['success', S_SUCCESS],
    ['step', S_STEP_SUBMIT],
    ['warn', S_WARN],
    ['warning', S_WARN],
    ['error', S_ERROR],
  ] as const)('%s writes each chunk as it arrives beside its symbol, a newline continuing on the bar', async (kind, symbol) => {
    expect(await stdoutOf(() => stream[kind](chunks('one', ' more\nt', 'wo')))).toBe(`${S_BAR}\n${symbol}  one more\n${S_BAR}  two\n`);
  });

  it('message takes a plain iterable, and the bar as its symbol unless given one', async () => {
    expect(await stdoutOf(() => stream.message(['a', 'b']))).toBe(`${S_BAR}\n${S_BAR}  ab\n`);
    expect(await stdoutOf(() => stream.message(['a'], { symbol: '*' }))).toBe(`${S_BAR}\n*  a\n`);
  });
});

describe('note', () => {
  it('closes the box on the guide, or on its own corner when the guide is off', () => {
    const guided = capture((output) => note('body', 'title', { output })).split('\n');
    expect(guided[0]).toBe(S_BAR);
    expect(guided.at(-2)).toBe(`${S_CONNECT_LEFT}${S_BAR_H.repeat(9)}${S_CORNER_BOTTOM_RIGHT}`);
    const bare = capture((output) => note('body', 'title', { output, withGuide: false })).split('\n');
    expect(bare[0]).toBe(`${S_STEP_SUBMIT}  title ${S_BAR_H}${S_CORNER_TOP_RIGHT}`);
    expect(bare.at(-2)).toBe(`${S_CORNER_BOTTOM_LEFT}${S_BAR_H.repeat(9)}${S_CORNER_BOTTOM_RIGHT}`);
  });

  it('applies format to every line of the message, and sizes the box to the formatted width', () => {
    const lines = capture((output) => note('a\nb', '', { output, format: (line) => `<${line}>` })).split('\n');
    // The blank rows above and below are the box's padding, not the message, so they are not formatted.
    expect(lines.slice(2, 6)).toEqual([`${S_BAR}       ${S_BAR}`, `${S_BAR}  <a>  ${S_BAR}`, `${S_BAR}  <b>  ${S_BAR}`, `${S_BAR}       ${S_BAR}`]);
  });

  it('wraps the message to the terminal less the box around it', () => {
    const output = new Output(false, 12);
    note('abcdefghij', '', { output });
    // 12 columns less 6 for the bars, padding and guide leave 6 for the text.
    expect(output.text.split('\n').slice(3, 5)).toEqual([`${S_BAR}  abcdef  ${S_BAR}`, `${S_BAR}  ghij    ${S_BAR}`]);
  });

  it('with nothing, is an empty box on process.stdout', async () => {
    expect(await stdoutOf(() => note())).toBe(`${S_BAR}\n${S_STEP_SUBMIT}   ${S_BAR_H}${S_CORNER_TOP_RIGHT}\n${S_BAR}    ${S_BAR}\n${S_BAR}    ${S_BAR}\n${S_BAR}    ${S_BAR}\n${S_CONNECT_LEFT}${S_BAR_H.repeat(4)}${S_CORNER_BOTTOM_RIGHT}\n`);
  });
});

/** What an unguided spinner writes when it is started, then ended by `end`. */
const endedBy = (end: 'stop' | 'cancel' | 'error'): string =>
  capture((output) => {
    const spin = spinner({ output, withGuide: false });
    spin.start('work');
    spin[end]('over');
  });

describe('a spinner off a terminal', () => {
  it('ends on each of its three endings, with that ending’s glyph', () => {
    expect(endedBy('stop')).toBe(`◒  work...\n${S_STEP_SUBMIT}  over\n`);
    expect(endedBy('cancel')).toBe(`◒  work...\n${S_STEP_CANCEL}  over\n`);
    expect(endedBy('error')).toBe(`◒  work...\n${S_STEP_ERROR}  over\n`);
  });

  it('ends on its last message when the ending names none', () => {
    const text = capture((output) => {
      const spin = spinner({ output, withGuide: false });
      spin.start('work');
      spin.message('more');
      spin.cancel();
    });
    expect(text).toBe(`◒  work...\n◒  more...\n${S_STEP_CANCEL}  more\n`);
  });

  it('says whether it was cancelled, and forgets it on the next start', () => {
    const spin = spinner({ output: new Output() });
    spin.start('work');
    spin.cancel();
    expect(spin.isCancelled).toBe(true);
    spin.start('again');
    expect(spin.isCancelled).toBe(false);
  });

  it('clear() ends it without a result line', () => {
    const text = capture((output) => {
      const spin = spinner({ output, withGuide: false });
      spin.start('work');
      spin.clear();
    });
    expect(text).toBe('◒  work...\n');
  });

  it('writes nothing for an ending or a message when it was never started, nor for a message it already shows', () => {
    const text = capture((output) => {
      const spin = spinner({ output, withGuide: false });
      spin.message('early');
      spin.stop('never');
      spin.start('work');
      spin.message();
      spin.message('work..');
      spin.stop();
    });
    expect(text).toBe(`◒  work...\n${S_STEP_SUBMIT}  work\n`);
  });

  it('draws its frames through styleFrame, and draws no glyph when given no frames', () => {
    expect(
      capture((output) => {
        const spin = spinner({ output, withGuide: false, frames: ['@'], styleFrame: (frame) => `[${frame}]` });
        spin.start('work');
      }),
    ).toBe('[@]  work...\n');
    expect(
      capture((output) => {
        const spin = spinner({ output, withGuide: false, frames: [] });
        spin.start('work');
        spin.message('more');
      }),
    ).toBe('  work...\n  more...\n');
  });

  it('writes to process.stdout when given no output, opening on the guide', async () => {
    const text = await stdoutOf(() => {
      const spin = spinner();
      spin.start('work');
      spin.stop('done');
    });
    expect(text).toBe(`${S_BAR}\n◒  work...\n${S_STEP_SUBMIT}  done\n`);
  });

  it('prints how long it ran beside the result when its indicator is the timer', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const output = new Output();
    const spin = spinner({ output, withGuide: false, indicator: 'timer' });
    spin.start('work');
    now.mockReturnValue(1_000 + 61_500);
    spin.stop('done');
    expect(output.text).toBe(`◒  work...\n${S_STEP_SUBMIT}  done [1m 1s]\n`);
  });
});

describe('a spinner interrupted', () => {
  it('by its abort signal ends on the cancel message and tells onCancel', () => {
    const controller = new AbortController();
    const onCancel = vi.fn();
    const output = new Output();
    const spin = spinner({ output, withGuide: false, signal: controller.signal, cancelMessage: 'aborted', onCancel });
    spin.start('work');
    controller.abort();
    expect(output.text).toBe(`◒  work...\n${S_STEP_CANCEL}  aborted\n`);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(spin.isCancelled).toBe(true);
  });

  it('by its abort signal after it stopped, does nothing', () => {
    const controller = new AbortController();
    const onCancel = vi.fn();
    const output = new Output();
    const spin = spinner({ output, withGuide: false, signal: controller.signal, onCancel });
    spin.start('work');
    spin.stop('done');
    controller.abort();
    expect(output.text).toBe(`◒  work...\n${S_STEP_SUBMIT}  done\n`);
    expect(onCancel).not.toHaveBeenCalled();
    // The listener went with the stop: a spinner that finished is not cancelled after the fact.
    expect(spin.isCancelled).toBe(false);
  });

  it.each([130, 143, 1, 0])('by the process leaving with %s — a signal, or no failure the program chose — is a cancel', (code) => {
    const onCancel = vi.fn();
    const output = new Output();
    const spin = spinner({ output, withGuide: false, onCancel });
    spin.start('work');
    exitWith(code);
    expect(output.text).toBe(`◒  work...\n${S_STEP_CANCEL}  ${settings.messages.cancel}\n`);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it.each([2, '3', 127])('by the process leaving with %s, a failing code the program chose, ends on the error message', (code) => {
    const onCancel = vi.fn();
    const output = new Output();
    const spin = spinner({ output, withGuide: false, onCancel });
    spin.start('work');
    exitWith(code);
    expect(output.text).toBe(`◒  work...\n${S_STEP_ERROR}  ${settings.messages.error}\n`);
    expect(onCancel).not.toHaveBeenCalled();
    expect(spin.isCancelled).toBe(false);
  });

  it('by the process leaving, uses its own errorMessage over the default', () => {
    const output = new Output();
    spinner({ output, withGuide: false, errorMessage: 'build failed' }).start('work');
    exitWith(2);
    expect(output.text).toBe(`◒  work...\n${S_STEP_ERROR}  build failed\n`);
  });

  it('removes its exit hook when it ends, so leaving afterwards writes nothing', () => {
    const output = new Output();
    const spin = spinner({ output, withGuide: false });
    spin.start('work');
    spin.stop('done');
    expect(hooks.size).toBe(0);
    exitWith(2);
    expect(output.text).toBe(`◒  work...\n${S_STEP_SUBMIT}  done\n`);
    expect(spin.isCancelled).toBe(false);
  });

  it('registers one exit hook however often it starts, so one stop leaves nothing to fire later', () => {
    const onCancel = vi.fn();
    const output = new Output();
    const spin = spinner({ output, withGuide: false, onCancel });
    // exit-hook keeps its hooks in a Set: the same handler twice is one hook, and one removal
    // takes it. A fresh closure per start would leave the first behind to cancel a finished spinner.
    spin.start('one');
    spin.start('two');
    expect(hooks.size).toBe(1);
    spin.stop('done');
    exitWith(130);
    expect(output.text).toBe(`◒  one...\n◒  two...\n${S_STEP_SUBMIT}  done\n`);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('a spinner on a terminal outside CI', () => {
  beforeEach(() => {
    vi.stubEnv('CI', '');
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  it('hides the cursor, redraws each frame over the last, and gives the cursor back at the end', () => {
    const output = new Output(true);
    const spin = spinner({ output, withGuide: false, frames: ['a', 'b'], delay: 10 });
    spin.start('work');
    vi.advanceTimersByTime(20);
    spin.stop('done');
    expect(output.buffer).toEqual([HIDE_CURSOR, 'a  work', `${ERASE_ONE}b  work`, `${ERASE_ONE}a  work`, ERASE_ONE, `${S_STEP_SUBMIT}  done\n`, SHOW_CURSOR]);
  });

  it('grows its trailing dots an eighth a frame, to three at most, and starts them again after four', () => {
    const output = new Output(true);
    const spin = spinner({ output, withGuide: false, frames: ['a'], delay: 1 });
    spin.start('work');
    vi.advanceTimersByTime(40);
    const frames = output.buffer.slice(1).map((write) => write.replace(ERASE_ONE, ''));
    expect(frames[7]).toBe('a  work');
    expect(frames[8]).toBe('a  work.');
    expect(frames[24]).toBe('a  work...');
    // Four dots' worth is still drawn as three, and the frame after it starts over.
    expect(frames[31]).toBe('a  work...');
    expect(frames[32]).toBe('a  work...');
    expect(frames[33]).toBe('a  work');
    expect(frames[34]).toBe('a  work');
    spin.stop();
  });

  it('animates without a glyph when given no frames', () => {
    const output = new Output(true);
    const spin = spinner({ output, withGuide: false, frames: [], delay: 10 });
    spin.start('work');
    vi.advanceTimersByTime(10);
    spin.stop();
    expect(output.buffer.slice(1, 3)).toEqual(['  work', `${ERASE_ONE}  work`]);
  });

  it('draws a new message on the next frame rather than printing it', () => {
    const output = new Output(true);
    const spin = spinner({ output, withGuide: false, frames: ['a'], delay: 10 });
    spin.start('work');
    spin.message('more');
    expect(output.buffer).toEqual([HIDE_CURSOR, 'a  work']);
    vi.advanceTimersByTime(10);
    expect(output.buffer.at(-1)).toBe(`${ERASE_ONE}a  more`);
    spin.stop();
  });

  it('erases every line of a frame that wrapped', () => {
    const output = new Output(true, 6);
    const spin = spinner({ output, withGuide: false, frames: ['a'], delay: 10 });
    spin.start('abcdefgh');
    vi.advanceTimersByTime(10);
    expect(output.buffer.slice(1, 3)).toEqual(['a  abc\ndefgh', `${CSI}1A${ERASE_ONE}a  abc\ndefgh`]);
    spin.stop();
  });

  it('draws the time it has run on every frame when its indicator is the timer', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const output = new Output(true);
    const spin = spinner({ output, withGuide: false, frames: ['a'], delay: 10, indicator: 'timer' });
    spin.start('work');
    now.mockReturnValue(2_000);
    vi.advanceTimersByTime(10);
    spin.stop('done');
    expect(output.buffer.slice(1, 5)).toEqual(['a  work [0s]', `${ERASE_ONE}a  work [2s]`, ERASE_ONE, `${S_STEP_SUBMIT}  done [2s]\n`]);
  });

  it('is printed, not animated, in CI even on a terminal', () => {
    vi.stubEnv('CI', 'true');
    const output = new Output(true);
    const spin = spinner({ output, withGuide: false });
    spin.start('work');
    spin.stop('done');
    expect(output.text).toBe(`◒  work...\n${S_STEP_SUBMIT}  done\n`);
  });
});

/**
 * The glyphs and the frame delay are read once, when `clack-core` loads, from the terminal it
 * finds — so each table is reached by loading the module again under the terminal that picks it.
 * Every variable the Windows table reads is pinned too, so the case says the same on any platform.
 */
describe('the default frames and delay', () => {
  beforeEach(() => {
    for (const name of ['CI', 'WT_SESSION', 'TERM_PROGRAM', 'TERMINAL_EMULATOR']) vi.stubEnv(name, '');
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    vi.resetModules();
  });

  it.each([
    ['xterm-256color', ['◒', '◐', '◓', '◑'], 80],
    ['linux', ['•', 'o', 'O', '0'], 120],
  ])('on TERM=%s are %j, a frame every %sms', async (term, frames, delay) => {
    vi.stubEnv('TERM', term);
    const fresh = await import('./clack-output.js');
    const output = new Output(true);
    const spin = fresh.spinner({ output, withGuide: false });
    spin.start('w');
    vi.advanceTimersByTime(delay - 1);
    expect(output.buffer).toHaveLength(2);
    vi.advanceTimersByTime(1 + delay * 3);
    spin.stop();
    expect(output.buffer.slice(1, 5).map((write) => write.replace(ERASE_ONE, '').slice(0, 1))).toEqual(frames);
  });
});

describe('tasks', () => {
  it('ends each task on its title when it returns nothing or an empty string, and lets it report as it goes', async () => {
    const output = new Output();
    await tasks(
      [
        {
          title: 'first',
          task: (message) => {
            message('halfway');
          },
        },
        {
          title: 'second',
          task: (message) => {
            message('almost');
            return Promise.resolve('');
          },
          enabled: true,
        },
      ],
      { output, withGuide: false },
    );
    // The title, not the last progress message: an empty result is no result, as `result || title` is in clack.
    expect(output.text).toBe(`◒  first...\n◒  halfway...\n${S_STEP_SUBMIT}  first\n◒  second...\n◒  almost...\n${S_STEP_SUBMIT}  second\n`);
  });
});

describe('group', () => {
  it('keeps a cancelled answer as the cancel itself when nobody asked to hear about it', async () => {
    const results = await group({ first: () => Promise.resolve(CANCEL_SYMBOL as unknown as string), second: () => Promise.resolve('two') });
    expect(results).toEqual({ first: CANCEL_SYMBOL, second: 'two' });
  });
});
