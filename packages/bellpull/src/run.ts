/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `run()` — the package (design R1, R2, R10).
 *
 * ## A non-zero exit is a result, never a throw
 *
 * `execa` throws when a child exits non-zero. That turns the most ordinary outcome in the
 * layer — a linter found something, a test failed, `git rev-parse` was asked about a tag
 * that does not exist — into an exception, so every caller wraps every call, and every
 * wrapper reconstructs the same four fields out of the error. This repository already has
 * two of those wrappers: `compat-oracle/src/run.ts` catches to read `status` and `stdout`
 * off the thrown object, and `vendor.ts` catches a failed `git clone --branch <tag>` purely
 * to fall back to `HEAD`. Neither is handling an error; both are reading a result through a
 * `catch`.
 *
 * So: {@link Result} always comes back, `ok` says whether the exit was 0, and the promise
 * rejects only where **no process ran or none finished** — the executable did not resolve,
 * the spawn itself failed. A timeout is the interesting third case, and it resolves; see
 * below.
 *
 * ## The deadline resolves, and why that is a decision
 *
 * `spec.md` R1 lists the deadline under "rejection is reserved for", and R2 says a breach
 * gives `timedOut: true` with the output that arrived before the kill. Those cannot both be
 * the surface: a rejected promise has no `Result` to carry `timedOut` or the partial output
 * on, and R2's whole content is that the partial output survives, because a CI timeout with
 * the output discarded is undiagnosable. **R2 wins**, it is recorded in `spec.md` under
 * "Reconciliations", and `ok` is `false` — a run that was killed did not succeed.
 *
 * ## Y10, the reason the default is finite
 *
 * A subprocess that never returns strands an unattended run exactly the way an exit handler
 * that never returns does one layer up. `execa` and `tinyexec` both default to no timeout at
 * all. Here it is {@link DEFAULT_TIMEOUT}, the kill is a ladder (`SIGTERM`, then `SIGKILL`
 * after {@link DEFAULT_GRACE}) because a child that ignores `SIGTERM` is the case that
 * matters, and `timeout: 0` opts out explicitly for a caller who means it.
 *
 * ## Nothing here reads `process`
 *
 * `runtime` is an argument (Y9). That is what makes a `PATH` lookup testable and what keeps
 * `run()` usable from a worker, a test, or a runtime that has no `process` at all.
 */
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';

import { hookChildProcess } from './enoent.js';
import { type Runtime } from './runtime.js';
import { parse, type SpawnOptions } from './spawn-args.js';
import { NotFoundError, resolveExecutable } from './which.js';

/** Milliseconds a child may take before it is killed. Finite by default — Y10. */
export const DEFAULT_TIMEOUT = 30_000;

/** Milliseconds between `SIGTERM` and `SIGKILL`, for a child that declines to leave. */
export const DEFAULT_GRACE = 5_000;

/**
 * What a run produced. One value, three renderings (see `project.ts`).
 */
export interface Result {
  /** The exit was 0 and the run was not killed. The only field most callers branch on. */
  ok: boolean;
  /** The exit code, or `null` when the child died of a signal — the shape Node reports. */
  code: number | null;
  /** The signal that killed it, or `null`. */
  signal: NodeJS.Signals | null;
  /** Everything the child wrote to stdout. `''` when stdio was not captured. */
  stdout: string;
  /** Everything the child wrote to stderr. */
  stderr: string;
  /**
   * Wall-clock milliseconds from spawn to close — **including Node's own scheduling**, not
   * the child's CPU time (design R11). Stated here rather than in a README because the
   * caveat is what makes the number usable: it is the right figure for "how long did the
   * user wait" and the wrong one for "how expensive is this program".
   */
  duration: number;
  /** The command as the caller wrote it. */
  command: string;
  /** The arguments as the caller wrote them. */
  args: readonly string[];
  /**
   * The file that actually ran, and the `PATH` entry it came from — the field that answers
   * "which binary was this" without a second investigation. `undefined` when resolution was
   * skipped (`shell: true`, where the shell resolves).
   */
  executable: { path: string; from: string } | undefined;
  /** The deadline fired and the child was killed. `ok` is `false`. */
  timedOut: boolean;
}

/** A host that can register work to run when the process is shutting down. */
export interface ExitHost {
  /** Register; the returned function unregisters. `closeout`'s `Registry.add` fits as-is. */
  add(handler: () => unknown, spec?: unknown): () => void;
}

export interface RunOptions extends SpawnOptions {
  /** The ambient state. Required: nothing here reads `process` (Y9). */
  runtime: Runtime;
  /** Milliseconds before the child is killed. `0` disables the deadline, deliberately. */
  timeout?: number | undefined;
  /** Milliseconds between `SIGTERM` and `SIGKILL` on a breach. */
  grace?: number | undefined;
  /**
   * Where to register the child's kill so it is not orphaned if the parent is shut down.
   *
   * **This is the `bellpull → closeout` seam, and it is a parameter rather than an import
   * on purpose.** `closeout` owns bounded exit paths; a parent that is killed while a child
   * is running must not leave that child behind. But `package-shape-lock.test.ts` asserts
   * that a foundation package depends on *nothing* — bellpull and closeout are both in that
   * tier, so a package edge between them is forbidden by a lock on main. The shape is
   * declared structurally instead (the family's R3 idiom), so
   * `run(cmd, args, { exitHost: closeoutRegistry })` composes with nothing imported.
   *
   * Given none, **no signal handler is registered at all**. Registering one silently would
   * be this package deciding to own the process's signals, which is the layer above's job.
   */
  exitHost?: ExitHost | undefined;
  /** Passed to `child_process`. `'inherit'` is what a pass-through subcommand wants. */
  stdio?: 'pipe' | 'inherit' | 'ignore' | readonly unknown[] | undefined;
}

/**
 * Spawning failed for a reason that is not a missing executable.
 *
 * `ERR_`, not `E_`. The `E_…` codes are the *plugin* vocabulary — `E_PLUGIN_SCHEMA` and the
 * rest — which `plugin-contract` R8 requires every layer to share and
 * `scripts/plugin-error-vocabulary-lock.test.ts` enforces by refusing any `'E_…'` literal a
 * host ships that is not in its declared union. This is a runtime failure rather than a
 * refused plugin, so it takes Node's own convention for a runtime error code and stays out
 * of a vocabulary it is not part of.
 */
export class SpawnError extends Error {
  readonly code = 'ERR_SPAWN_FAILED';
  constructor(
    readonly command: string,
    readonly cause: unknown,
  ) {
    super(`could not spawn ${command}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'SpawnError';
  }
}

/** Decode a chunk. Buffers are concatenated first so a multi-byte character cannot be split. */
const decode = (chunks: Buffer[]): string => (chunks.length === 0 ? '' : Buffer.concat(chunks).toString('utf8'));

/**
 * Run a program and come back with a {@link Result}.
 *
 * Rejects with {@link NotFoundError} when the executable does not resolve and
 * {@link SpawnError} when the spawn itself fails. Everything else — any exit code, any
 * signal, a breached deadline — resolves.
 */
export async function run(command: string, args: readonly unknown[] = [], options: RunOptions): Promise<Result> {
  const { runtime, timeout = DEFAULT_TIMEOUT, grace = DEFAULT_GRACE, exitHost, stdio = 'pipe', ...rest } = options;

  /*
   * The runtime is the default environment for the child, not merely the thing this
   * function reads. Y9 says `env` and `cwd` arrive as arguments; if the child were then
   * spawned into the *ambient* environment, the argument would describe one world and the
   * subprocess would run in another — a `PATH` the caller supplied would decide what
   * `executable` reports and nothing else. An explicit `env`/`cwd` on the call still wins.
   */
  const spawnOptions: SpawnOptions = { ...rest, cwd: rest.cwd ?? runtime.cwd, env: rest.env ?? runtime.env };
  const parsed = parse(command, args, spawnOptions, runtime);
  const original = parsed.original;

  // Resolution happens here and not inside the spawn, because the resolved path is a field
  // of the result: "which binary ran" is the question this layer exists to be able to
  // answer. With `shell: true` the shell resolves and we do not pretend otherwise.
  //
  // `resolveExecutable`, which is the same lookup `parse` just did. Asking a narrower
  // question here — a single `PATHEXT` walk — meant that on Windows an extensionless script
  // with a `#!` line resolved for the parse and was then rejected here, so `run()` refused a
  // command it had already worked out how to run. See `which.ts`.
  const shell = rest.shell === true || typeof rest.shell === 'string';
  const resolved = shell ? undefined : resolveExecutable(original.command, { runtime, cwd: spawnOptions.cwd });
  if (!shell && resolved === undefined) throw new NotFoundError(original.command);

  /*
   * Run the file that was resolved, rather than handing the name back for the kernel to
   * resolve a second time. Two resolutions can disagree — a different `PATH`, a different
   * working directory, a file that appeared in between — and if they do, `executable` names
   * one binary and another one runs, which makes the field worse than useless.
   *
   * **On the Windows `cmd.exe` path that is exactly what happens, and the sentence that used
   * to sit here — "`parse` has already produced the `cmd.exe` line and owns the answer" — was
   * wrong.** `parse` builds the line from the command *as the caller wrote it*, so a caller
   * who wrote a bare name hands that name to `cmd.exe`, which resolves it again against the
   * child's own environment. `escape.test.ts` made the two disagree on a Windows runner:
   * `resolved` held the full `…\node_modules\.bin\echo-argv.cmd` while `cmd.exe` reported
   * `'echo-argv' is not recognized`.
   *
   * It is left as it is, and said rather than quietly patched. Building the line from
   * `resolved.path` would be a deliberate divergence from `cross-spawn`, whose `parseNonShell`
   * does the same thing with the same consequence and whose suite grades this package 68 / 68
   * — its own cmd-shim case spawns a *path*, never a `PATH` lookup, so the divergence is
   * invisible to it. Changing it is a drop-in decision, not a bug fix.
   *
   * What a caller should take from this: on Windows `executable` reports what **bellpull**
   * resolved. That is the answer for a command given as a path, and for a bare name it is the
   * answer only as long as the child's environment agrees with the one passed in — which is
   * why a `PATH` key that appears twice in different cases is not a cosmetic problem.
   */
  const file = resolved !== undefined && parsed.command === original.command ? resolved.path : parsed.command;

  const started = Date.now();
  let child: ChildProcess;
  try {
    child = nodeSpawn(file, parsed.args, { ...parsed.options, stdio } as never);
  } catch (cause) {
    throw new SpawnError(original.command, cause);
  }
  hookChildProcess(child, parsed, runtime);

  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout?.on('data', (chunk: Buffer) => out.push(chunk));
  child.stderr?.on('data', (chunk: Buffer) => err.push(chunk));

  /* The seam: while this child is alive, a shutdown of the parent kills it too. */
  const unregister = exitHost?.add(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  const deadline = startDeadline(child, timeout, grace);

  try {
    const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((settle, reject) => {
      child.once('error', (cause: NodeJS.ErrnoException) => {
        reject(cause.code === 'ENOENT' ? new NotFoundError(original.command) : new SpawnError(original.command, cause));
      });
      // `close`, not `exit`: `exit` fires when the process ends, `close` when its stdio has
      // also been drained. Settling on `exit` loses whatever was still in the pipe, which is
      // the same truncation R2 is about, arriving by a different route.
      child.once('close', (c: number | null, s: NodeJS.Signals | null) => settle([c, s]));
    });

    return {
      ok: code === 0 && !deadline.fired(),
      code,
      signal,
      stdout: decode(out),
      stderr: decode(err),
      duration: Date.now() - started,
      command: original.command,
      args: original.args,
      executable: resolved === undefined ? undefined : { path: resolved.path, from: resolved.from },
      timedOut: deadline.fired(),
    };
  } finally {
    deadline.cancel();
    unregister?.();
  }
}

/** What a started deadline gives back: whether it fired, and how to stand it down. */
export interface Deadline {
  fired: () => boolean;
  cancel: () => void;
}

/** The half of `ChildProcess` the ladder uses. Structural, so the ladder can be driven without one. */
export interface Killable {
  kill: (signal?: NodeJS.Signals) => unknown;
}

/**
 * The kill ladder (R2, Y10).
 *
 * `SIGTERM` first, because a child that cleans up should be given the chance to; `SIGKILL`
 * after `grace`, because **a child that ignores `SIGTERM` is the case the ladder exists
 * for** — without the second rung the deadline is a suggestion and the run hangs anyway,
 * which is Y10's failure wearing a timer. `matrix.test.ts` has that child, and with the
 * second rung deleted the case hangs until vitest kills the file.
 *
 * Both timers are `unref`'d: a pending deadline must not be the reason a program stays
 * alive after its work is done.
 *
 * ## Exported, and `Killable` rather than `ChildProcess`, so the rungs can be proven
 *
 * An end-to-end cell cannot prove the second rung: it races `node`'s cold start. Until the
 * child has run its first line the `SIGTERM` handler is not installed, so a deadline that
 * fires during startup kills it by the *default* action and the run reports `SIGTERM` —
 * correct behaviour, read as a failure. One cold start in twelve took 265 ms on an idle Mac
 * against `matrix.test.ts`'s 300 ms deadline, and macOS CI duly went red.
 *
 * The ladder itself has no race. Showing that means not timing it: a structural parameter
 * lets both rungs be driven on fake timers, asserting which signal at which tick with no
 * process and no clock. `index.ts` does not re-export this — a seam for the suite, not
 * surface for a caller.
 */
export function startDeadline(child: Killable, timeout: number, grace: number): Deadline {
  if (timeout <= 0) return { fired: () => false, cancel: () => undefined };

  let fired = false;
  let hard: NodeJS.Timeout | undefined;
  const soft = setTimeout(() => {
    fired = true;
    child.kill('SIGTERM');
    hard = setTimeout(() => child.kill('SIGKILL'), grace);
    hard.unref?.();
  }, timeout);
  soft.unref?.();

  return {
    fired: () => fired,
    cancel: () => {
      clearTimeout(soft);
      if (hard !== undefined) clearTimeout(hard);
    },
  };
}
