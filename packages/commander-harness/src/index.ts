/**
 * commander-harness — run a commander program in-process (design R3, R5 of
 * `cli-testing-harness`). Public commander APIs only: `exitOverride()`,
 * `configureOutput()`, `parseAsync(argv, { from: 'user' })`.
 */
import { captureConsole, codeOf, ExitCode, fakeRuntime, finish, type FakeRuntime, type RunOptions, type RunResult, type Runtime, swapEnv } from '@interlace/cli-core';
import { type Command } from 'commander';

/** A program, or a factory that builds one against the runtime the harness fakes. */
export type ProgramSource = Command | ((runtime: Runtime) => Command);

/** commander's own exits that are not failures. */
const BENIGN = new Set(['commander.helpDisplayed', 'commander.help', 'commander.version']);

/** The shape of a `CommanderError`, whichever copy of commander threw it. */
export interface CommanderExit {
  code: string;
  exitCode: number;
}

/**
 * Recognise commander's error by shape, not by `instanceof`: the program under test
 * and this harness routinely resolve different copies of commander (nested installs,
 * a consumer's own version), and a class check across copies is always false.
 */
export function isCommanderExit(e: unknown): e is CommanderExit {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('commander.');
}

/**
 * Map a commander exit to E1: help and version are `OK`; `program.error()` keeps an
 * E1 code it was given; every other commander error is a usage error.
 */
export function mapCommanderExit(e: CommanderExit): ExitCode {
  if (BENIGN.has(e.code)) return ExitCode.OK;
  if (e.code === 'commander.error') return codeOf(e);
  return ExitCode.USAGE;
}

/** Build or accept the program. A plain function, so the async runner calls no parameter directly (finding 8). */
function resolveProgram(source: ProgramSource, rt: FakeRuntime): Command {
  return typeof source === 'function' ? source(rt) : source;
}

function wire(program: Command, rt: FakeRuntime): void {
  program.exitOverride();
  program.configureOutput({
    writeOut: (s) => rt.stdout.write(s),
    writeErr: (s) => rt.stderr.write(s),
  });
  for (const sub of program.commands) wire(sub, rt);
}

export async function runCommander(source: ProgramSource, opts: RunOptions): Promise<RunResult> {
  const rt = fakeRuntime(opts);
  const program = resolveProgram(source, rt);
  wire(program, rt);
  // ponytail: commander reads Option#env() from process.env at parse time (#2549).
  const restoreEnv = swapEnv(opts.env);
  const restoreConsole = captureConsole(rt);
  const startedAt = performance.now();
  try {
    await program.parseAsync(opts.argv, { from: 'user' });
    return finish(rt, ExitCode.OK, startedAt);
  } catch (e) {
    if (isCommanderExit(e)) return finish(rt, mapCommanderExit(e), startedAt);
    const code = codeOf(e);
    if (code === ExitCode.RUNTIME) rt.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    return finish(rt, code, startedAt);
  } finally {
    restoreConsole();
    restoreEnv();
  }
}

export type { RunOptions, RunResult, Runtime } from '@interlace/cli-core';
