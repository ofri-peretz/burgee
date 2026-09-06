/**
 * yargs-testing — run a yargs CLI in-process (design R4, R5 of
 * `cli-testing-harness`). Public yargs APIs only: `.exitProcess(false)`,
 * `.showHelpOnFail(false)`, `.fail()`, `.getHelp()`, `.parseAsync()`.
 */
import { captureConsole, codeOf, ExitCode, fakeRuntime, finish, type RunOptions, type RunResult, type Runtime, swapEnv } from '@interlace/cli-core';
import yargs, { type Argv } from 'yargs';

/** Builds the CLI on a fresh yargs instance; a yargs instance holds parse state, so a factory it is. */
export type CliBuilder = (y: Argv, runtime: Runtime) => Argv;

interface Failure {
  msg: string | undefined;
  err: unknown;
}

const HELP_FLAGS = new Set(['--help', '-h']);

/** A fresh instance that never exits, never prints help on failure, and reports failures to `onFail`. */
function prepare(build: CliBuilder, rt: Runtime, onFail: (f: Failure) => void): Argv {
  const y = yargs(rt.argv)
    .exitProcess(false)
    .showHelpOnFail(false)
    .fail((msg, err) => {
      onFail({ msg, err });
    });
  return build(y, rt);
}

export async function runYargs(build: CliBuilder, opts: RunOptions): Promise<RunResult> {
  const rt = fakeRuntime(opts);
  let failure: Failure | null = null;
  const y = prepare(build, rt, (f) => {
    failure = f;
  });
  // ponytail: yargs reads .env() from process.env at parse time, like commander.
  const restoreEnv = swapEnv(opts.env);
  const restoreConsole = captureConsole(rt);
  const startedAt = performance.now();
  try {
    if (opts.argv.some((a) => HELP_FLAGS.has(a))) {
      // yargs #2450: help for the parsed argv cannot be rendered through parse
      // without printing; the harness renders it itself.
      rt.stdout.write(`${await y.getHelp()}\n`);
      return finish(rt, ExitCode.OK, startedAt);
    }
    await y.parseAsync();
    if (failure) return finish(rt, failed(rt, failure), startedAt);
    return finish(rt, ExitCode.OK, startedAt);
  } catch (e) {
    return finish(rt, failed(rt, { msg: undefined, err: e }), startedAt);
  } finally {
    restoreConsole();
    restoreEnv();
  }
}

/** A `.fail()` call without an error is yargs reporting usage; with one, the handler threw. */
function failed(rt: ReturnType<typeof fakeRuntime>, { msg, err }: Failure): ExitCode {
  if (err === undefined || err === null) {
    if (msg) rt.stderr.write(`${msg}\n`);
    return ExitCode.USAGE;
  }
  const code = codeOf(err);
  if (code === ExitCode.RUNTIME) rt.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  return code;
}

export type { RunOptions, RunResult, Runtime } from '@interlace/cli-core';
