/**
 * Render a `caique/inquirer` prompt the way `@inquirer/testing` renders one, so caique's own
 * tests read the same screens the graded suites assert — without a dependency on it.
 *
 * Two streams and nothing else. The input is a classic `Stream` with no `readableFlowing`,
 * as `mute-stream` is, so the first frame is drawn synchronously, inside the prompt call. The
 * output records every write and counts as a frame only a write with something visible in
 * it: a write that only moves the cursor is not a screen anyone reads. `getScreen()` is the
 * last frame with its escape sequences stripped and its edges trimmed.
 *
 * A key is delivered the way the testing package delivers one: `keypress` emits the event
 * readline would, and `type` writes the text into the input — so readline's own line buffer
 * fills, which is what the prompts read — and then emits a keypress per character.
 */
import { Stream, Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';

import { type CancelablePromise, type Context, type Prompt } from '../inquirer-core.js';

/** The keypress a test sends: a key name, or the fields readline would decode. */
export type Key = string | { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean };

class KeyInput extends Stream {
  readable = true;
  writable = true;

  pause(): this {
    return this;
  }

  resume(): this {
    return this;
  }

  setEncoding(): this {
    return this;
  }

  write(chunk: string): boolean {
    this.emit('data', chunk);
    return true;
  }

  end(): this {
    this.emit('end');
    return this;
  }
}

class Screen extends Writable {
  /** Wide, so nothing a test draws is wrapped by the terminal width. */
  columns = 10_000;
  readonly frames: string[] = [];
  readonly raw: string[] = [];

  override _write(chunk: Buffer, _encoding: string, callback: () => void): void {
    const text = chunk.toString();
    this.raw.push(text);
    if (stripVTControlCharacters(text).trim().length > 0) {
      this.frames.push(text);
      this.emit('render');
    }
    callback();
  }
}

/** What a rendered prompt hands its test. */
export interface Rendered<Value> {
  answer: CancelablePromise<Value>;
  events: { keypress: (key: Key) => void; type: (text: string) => void };
  getScreen: (options?: { raw?: boolean }) => string;
  /** Wait for the next frame, then for the event loop to settle behind it. */
  nextRender: () => Promise<void>;
}

const settle = async (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

export async function render<Value, const Config>(prompt: Prompt<Value, Config>, config: Config, options: Omit<Context, 'input' | 'output'> = {}): Promise<Rendered<Value>> {
  const input = new KeyInput();
  const output = new Screen();
  // A classic `Stream` is what `mute-stream` is and what the prompt is built to take; Node's
  // types describe only the modern readable, so the one cast is here, in the fixture.
  // eslint-disable-next-line reliability/no-unsafe-type-narrowing
  const answer = prompt(config, { ...options, input: input as unknown as NodeJS.ReadableStream, output });
  // A prompt that throws before drawing never renders; the answer is what reports it.
  if (output.frames.length === 0) await Promise.race([new Promise((resolve) => output.once('render', resolve)), answer.catch(() => undefined)]);

  let seen = output.frames.length;
  return {
    answer,
    events: {
      keypress: (key) => {
        input.emit('keypress', null, typeof key === 'string' ? { name: key } : key);
      },
      type: (text) => {
        input.write(text);
        for (const char of text) input.emit('keypress', null, { name: char });
      },
    },
    getScreen: ({ raw = false } = {}) => {
      const last = (raw ? output.raw : output.frames).at(-1) ?? '';
      return raw ? last : stripVTControlCharacters(last).trim();
    },
    nextRender: async () => {
      if (output.frames.length <= seen) await new Promise((resolve) => output.once('render', resolve));
      await settle();
      seen = output.frames.length;
    },
  };
}
