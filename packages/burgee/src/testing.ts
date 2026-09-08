/**
 * `burgee/testing` — run a burgee CLI in-process, with argv, env, stdin, cwd and
 * TTY-ness injected, and get back `{ code, stdout, stderr, json }`. Requirement T1.
 *
 * A separate entry point so it is paid for per import (K6): a user's shipped CLI
 * imports `burgee` and never pulls a byte of this.
 */
export { processRuntime, type Clock, type Runtime, type Writer } from './runtime.js';
export {
  captureConsole,
  codeOf,
  fakeClock,
  fakeRuntime,
  finish,
  runBurgee,
  RuntimeExit,
  stripAnsi,
  swapEnv,
  type FakeClock,
  type FakeRuntime,
  type RunOptions,
  type RunResult,
} from './testing-helpers.js';
export { ExitCode, isExitCode, type ExitCode as ExitCodeValue } from './exit-code.js';
