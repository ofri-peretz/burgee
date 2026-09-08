/**
 * A `Reader` and `Writer` over real streams — the one file in this package that touches a
 * terminal, and the reason `ask()` can be used by a program rather than only by a test.
 *
 * Everything above this is strings in and strings out. That is deliberate: the widgets, the
 * decision and the binding are all testable without a PTY, and this is the thin layer that
 * has to be got right once. It reads lines through `node:readline`, which handles the
 * line editing, the backspace and the `Ctrl-D` a person expects.
 *
 * **Hiding a password happens here**, because this is the only layer that knows what echo
 * is. `ask()` says which prompts are hidden; nothing above has to remember to mute anything,
 * and a widget cannot leak a secret by writing it, since no widget writes what it read.
 */
import { createInterface, type Interface } from 'node:readline';

import { type Io, type Reader, type ReadOptions, type Writer } from './ask.js';

/** The stream pair a terminal Io is built over: `process.stdin` and `process.stdout`. */
export interface Streams {
  input: NodeJS.ReadableStream & { isTTY?: boolean };
  output: NodeJS.WritableStream & { isTTY?: boolean };
}

/** Accepts a chunk and writes nothing: what a muted stream's `write` does. */
const swallow = (): boolean => true;

/**
 * `readline` echoes what it reads. For a hidden answer the echo is suppressed by
 * intercepting the interface's own output for the duration of the question — not by
 * turning the terminal's echo off, which would leave it off if the process died mid-prompt.
 */
function mute(rl: Interface & { output?: NodeJS.WritableStream }, streams: Streams): () => void {
  const target = rl.output ?? streams.output;
  const original = target.write.bind(target);
  // `readline` writes the prompt through the same stream it echoes through, so the prompt
  // has already been written by the time this is installed: everything after it is input.
  (target as { write: unknown }).write = swallow;
  return () => {
    (target as { write: unknown }).write = original;
  };
}

/**
 * A reader and writer over a real stream pair.
 *
 * The reader resolves `undefined` when the stream ends, which `ask()` reads as a
 * cancellation — `Ctrl-D` and a closed pipe both arrive that way, and both mean nobody is
 * going to type.
 */
export function createIo(streams: Streams): Io & { close: () => void } {
  const rl = createInterface({ input: streams.input, output: streams.output, terminal: streams.output.isTTY === true });
  let ended = false;
  rl.once('close', () => {
    ended = true;
  });

  const reader: Reader = {
    line: async ({ hidden = false }: ReadOptions = {}) => {
      if (ended) return undefined;
      const unmute = hidden ? mute(rl, streams) : undefined;
      try {
        return await new Promise<string | undefined>((resolve) => {
          const onLine = (value: string): void => {
            rl.off('close', onClose);
            resolve(value);
          };
          const onClose = (): void => {
            rl.off('line', onLine);
            resolve(undefined);
          };
          rl.once('line', onLine);
          rl.once('close', onClose);
        });
      } finally {
        unmute?.();
        // The newline the person typed was swallowed with the echo; put it back so the
        // next question does not start on the same line as the hidden answer.
        if (hidden) streams.output.write('\n');
      }
    },
  };

  const writer: Writer = {
    write: (text: string) => {
      streams.output.write(text);
    },
  };

  return { reader, writer, close: () => rl.close() };
}
