import { type ExitCode } from './exit-code.js';

/** Anything that accepts text; `process.stdout` satisfies it, so does an array push. */
export interface Writer {
  write(chunk: string): unknown;
}

/**
 * The world, as the layers above the parser see it (design R1 of
 * `cli-testing-harness`). Nothing above the parser reads `process.*` directly; it
 * reads its `Runtime`, so a test can substitute every part of it.
 */
export interface Runtime {
  argv: string[];
  env: Record<string, string | undefined>;
  cwd: string;
  stdin: NodeJS.ReadableStream;
  stdout: Writer;
  stderr: Writer;
  isTTY: { stdin: boolean; stdout: boolean; stderr: boolean };
  /** Ends the run with an E1 code. In the real runtime this never returns. */
  exit(code: ExitCode): never;
}

const ARGV_PROGRAM_AND_SCRIPT = 2;

/** The one place in the layer that touches `process`. Locked by `process-reference.lock.test.ts`. */
export const processRuntime: Runtime = {
  argv: process.argv.slice(ARGV_PROGRAM_AND_SCRIPT),
  env: process.env,
  cwd: process.cwd(),
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  isTTY: {
    stdin: Boolean(process.stdin.isTTY),
    stdout: Boolean(process.stdout.isTTY),
    stderr: Boolean(process.stderr.isTTY),
  },
  exit(code) {
    process.exit(code);
  },
};
