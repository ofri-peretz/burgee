/**
 * @interlace/cli-core — the shared contract behind the commander-* and yargs-*
 * extensions. Design: docs/intents/agent-native-cli-layer/design.md. Nothing here
 * parses argv or imports a parser; the extensions do, each in its host's idiom.
 */

export { ExitCode, isExitCode } from './exit-code.js';
export { processRuntime, type Runtime, type Writer } from './runtime.js';
export { captureConsole, codeOf, fakeRuntime, type FakeRuntime, finish, type RunOptions, type RunResult, RuntimeExit, stripAnsi, swapEnv } from './testing.js';
