/**
 * The slice of the world a screen needs, and the one file in this package that names the
 * process (Y9). Every other file takes a `Runtime`, so a test substitutes the world by
 * passing an object of its own: buffers for the streams, a manual clock, a fake terminal.
 */
import process from 'node:process';

import { type KeyInput } from 'caique/keys';
import { type OutputStream } from 'closeout/cursor';
import { type Runtime as LoopRuntime, type Writer } from 'flagstaff/loop';

export interface Runtime extends LoopRuntime {
  readonly stdout: Writer &
    OutputStream & {
      /** Rows of the terminal, read at every paint so a resize is honoured. */
      readonly rows?: number | undefined;
      on?(event: 'resize', listener: () => void): unknown;
      off?(event: 'resize', listener: () => void): unknown;
    };
  readonly stdin: KeyInput;
}

/**
 * The real process, narrowed. `isTTY` is a getter so the mode is decided when a screen
 * opens, not when this module loads; the clock is wall time through the timers Node keeps.
 */
export const processRuntime = (): Runtime => ({
  env: process.env,
  argv: process.argv,
  isTTY: {
    get stdout() {
      return process.stdout.isTTY;
    },
  },
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  clock: {
    now: () => performance.now(),
    schedule(fn, ms) {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    },
  },
});
