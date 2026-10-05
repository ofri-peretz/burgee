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
import { createInterface } from 'node:readline';

import { type Io, type Reader, type ReadOptions, type Writer } from './ask.js';
import { processRuntime, type Runtime } from './runtime.js';

/** The stream pair a terminal Io is built over: a `Runtime`'s `stdin` and its `stdout`. */
export interface Streams {
  input: NodeJS.ReadableStream & { isTTY?: boolean };
  output: NodeJS.WritableStream & { isTTY?: boolean; columns?: number };
}

/** A runtime's two streams as the pair `createIo` takes — the mapping, written down once. */
export const streamsOf = (runtime: Runtime): Streams => ({ input: runtime.stdin, output: runtime.stdout });

/** Accepts a chunk and writes nothing: what a muted stream's `write` does. */
const swallow = (): boolean => true;

/**
 * `readline` echoes what it reads. For a hidden answer the echo is suppressed by
 * intercepting the interface's own output for the duration of the question — not by
 * turning the terminal's echo off, which would leave it off if the process died mid-prompt.
 */
function mute(target: Streams['output']): () => void {
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
 * going to type. Lines that arrive before anyone asks are kept, in order, and handed out
 * before the end is: `printf 'x\ny\n' | cli` delivers both lines in one chunk, before the
 * first question is asked, and both are answers.
 *
 * With no argument it builds over the real process, read when it is called and not at
 * import: a program that wants the terminal it was started in writes `createIo()`.
 */
export function createIo(streams: Streams = streamsOf(processRuntime())): Io & { close: () => void } {
  const rl = createInterface({ input: streams.input, output: streams.output, terminal: streams.output.isTTY === true });
  // One listener for the life of the interface, not one per read: a `line` event with no
  // read pending is queued rather than dropped.
  // ponytail: the queue is unbounded, as readline's own async iterator's is.
  const queued: string[] = [];
  const waiting: ((value: string | undefined) => void)[] = [];
  let ended = false;
  rl.on('line', (value: string) => {
    const next = waiting.shift();
    if (next) next(value);
    else queued.push(value);
  });
  rl.once('close', () => {
    ended = true;
    for (const resolve of waiting.splice(0)) resolve(undefined);
  });

  const reader: Reader = {
    line: async ({ hidden = false }: ReadOptions = {}) => {
      // A queued line was read, and echoed, before this question was asked: there is
      // nothing left to hide, and no swallowed newline to put back.
      if (queued.length > 0) return queued.shift();
      if (ended) return undefined;
      const unmute = hidden ? mute(streams.output) : undefined;
      try {
        return await new Promise<string | undefined>((resolve) => waiting.push(resolve));
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
    // Read through, not copied: a terminal that is resized between two repaints has a new width.
    get columns() {
      return streams.output.columns;
    },
  };

  return { reader, writer, close: () => rl.close() };
}
