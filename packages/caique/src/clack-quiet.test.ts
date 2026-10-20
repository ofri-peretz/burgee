/**
 * `caique-quiet-seam` R1–R3: burgee's `--quiet` reaches the clack port through the `runtime`
 * a caller hands each call — `spinner({ runtime: ctx.runtime })` — and nothing else.
 *
 * - **R1, R2.** With `runtime.quiet`, every writer that decorates writes nothing, to the stream
 *   it was given or to the process's, and its lifecycle still runs: a spinner starts, takes
 *   messages and stops, `tasks` resolves, and no interval is ever armed, so a quiet run cannot
 *   hold the event loop open.
 * - **R2, `log.error`.** A failure is never decoration: it writes under quiet.
 * - **R3.** A prompt is not decoration: under quiet it draws the frame it draws without one and
 *   answers the keys it is given.
 */
import { Readable, Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { cancel, intro, log, note, outro, spinner, tasks } from './clack-output.js';
import { text } from './clack-prompts.js';

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

class Input extends Readable {
  override _read(): void {
    // Keys arrive as emitted `keypress` events, never as data.
  }
}

/** burgee's `ctx.runtime` under `--quiet`, as `ctx.ts` builds it: roundel's policy runtime. */
const QUIET = { env: {}, argv: [], isTTY: { stdout: true }, quiet: true };
const LOUD = { ...QUIET, quiet: false };

/** Every byte written to the process's stdout and stderr while `write` runs. */
async function processBytes(write: () => unknown): Promise<string> {
  let text = '';
  const capture = (chunk: string | Uint8Array): boolean => {
    text += String(chunk);
    return true;
  };
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  try {
    await write();
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
  return text;
}

/** `text()` on a non-TTY pair of streams, answered `hi` and return: its answer and every frame it drew. */
async function answered(runtime?: typeof QUIET): Promise<{ answer: unknown; frames: string }> {
  const input = new Input();
  const output = new Output();
  const pending = text({ message: 'Name?', input, output, ...(runtime === undefined ? {} : { runtime }) });
  for (const char of 'hi') input.emit('keypress', char, { name: char, sequence: char });
  input.emit('keypress', '\r', { name: 'return', sequence: '\r' });
  const answer = await pending;
  return { answer, frames: stripVTControlCharacters(output.text) };
}

/** A task that reports progress once, then ends on its own message. */
const halfway = (message: (text: string) => void): string => {
  message('halfway');
  return 'done';
};

afterEach(() => {
  vi.useRealTimers();
});

/** Each writer R2 names, called once on `output` with `runtime`. */
const DECORATION: Record<string, (opts: { output: Output; runtime: typeof QUIET }) => unknown> = {
  intro: (opts) => {
    intro('title', opts);
  },
  outro: (opts) => {
    outro('done', opts);
  },
  note: (opts) => {
    note('body', 'title', opts);
  },
  'log.message': (opts) => {
    log.message('x', opts);
  },
  'log.info': (opts) => {
    log.info('x', opts);
  },
  'log.step': (opts) => {
    log.step('x', opts);
  },
  'log.success': (opts) => {
    log.success('x', opts);
  },
  'log.warn': (opts) => {
    log.warn('x', opts);
  },
  'log.warning': (opts) => {
    log.warning('x', opts);
  },
  spinner: (opts) => {
    const spin = spinner(opts);
    spin.start('working');
    spin.message('still working');
    spin.stop('worked');
  },
  'spinner, ended on an error': (opts) => {
    const spin = spinner(opts);
    spin.start('working');
    spin.error('failed');
  },
  tasks: async (opts) => {
    await tasks([{ title: 'one', task: halfway }], opts);
  },
};

describe('R1, R2 — a quiet runtime draws nothing', () => {
  for (const [name, call] of Object.entries(DECORATION)) {
    it(`${name} writes 0 bytes to its output and to the process under quiet`, async () => {
      const output = new Output();
      const leaked = await processBytes(() => call({ output, runtime: QUIET }));
      expect(output.text).toBe('');
      expect(leaked).toBe('');
    });

    it(`${name} still draws with a runtime that is not quiet`, async () => {
      const output = new Output();
      await call({ output, runtime: LOUD });
      expect(output.text).not.toBe('');
    });
  }

  it('the spinner arms no interval on a terminal under quiet, and its lifecycle still runs', () => {
    vi.useFakeTimers();
    const output = new Output(true);
    const spin = spinner({ output, runtime: QUIET });
    spin.start('working');
    expect(vi.getTimerCount()).toBe(0);
    spin.message('still');
    spin.cancel('stopped');
    expect(spin.isCancelled).toBe(true);
    expect(output.text).toBe('');
  });

  it('the same spinner animates on a terminal when the runtime is not quiet', () => {
    vi.useFakeTimers();
    const output = new Output(true);
    const spin = spinner({ output, runtime: LOUD });
    spin.start('working');
    expect(vi.getTimerCount()).toBe(1);
    spin.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a spinner reads CI from the runtime it is handed: on a terminal, CI set there means no animation', () => {
    vi.useFakeTimers();
    const output = new Output(true);
    const spin = spinner({ output, runtime: { ...LOUD, env: { CI: 'true' } } });
    spin.start('working');
    expect(vi.getTimerCount()).toBe(0);
    spin.stop();
    expect(output.text).toContain('working...');
  });

  it('tasks resolves under quiet, each task run and told its messages', async () => {
    const seen: string[] = [];
    const output = new Output();
    const one = (message: (text: string) => void): void => {
      message('a');
      seen.push('one');
    };
    const two = async (): Promise<string> => {
      seen.push('two');
      return await Promise.resolve('two done');
    };
    await tasks(
      [
        { title: 'one', task: one },
        { title: 'two', task: two },
      ],
      { output, runtime: QUIET },
    );
    expect(seen).toEqual(['one', 'two']);
    expect(output.text).toBe('');
  });

  it('a runtime is read from the call, never from the environment: without one, quiet is off', () => {
    const output = new Output();
    log.info('x', { output });
    expect(output.text).not.toBe('');
  });
});

describe('R2 — a failure is never quiet', () => {
  it('log.error writes under quiet', () => {
    const output = new Output();
    log.error('broke', { output, runtime: QUIET });
    expect(stripVTControlCharacters(output.text)).toContain('broke');
  });

  it('cancel writes under quiet: a cancelled session is not decoration', () => {
    const output = new Output();
    cancel('stopped', { output, runtime: QUIET });
    expect(stripVTControlCharacters(output.text)).toContain('stopped');
  });
});

describe('R3 — a prompt ignores quiet', () => {
  it('text() under quiet in a non-TTY draws what it draws without a runtime, and answers', async () => {
    const plain = await answered();
    const quiet = await answered(QUIET);
    expect(quiet.answer).toBe('hi');
    expect(quiet.frames).toBe(plain.frames);
    expect(quiet.frames).toContain('Name?');
  });
});
