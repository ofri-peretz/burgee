/**
 * E5 and O5 — every door out of a burgee program, bound by the package whose job that is.
 *
 * `exit-code.ts` has declared `SIGINT: 130` and *"SIGINT after the terminal was restored"*
 * since the contract was written, and `.sdlc/intents/burgee/spec.md` marks both E5 and O5
 * `R`. Neither was implemented. The engine's only exit was `host.exit(code)` — `process.exit`
 * — which restores nothing, runs nothing, and truncates a pipe by definition (yargs #1519,
 * #2118: *"No truncated JSON"*). A constant is not an implementation.
 *
 * Writing the listener here was the other option and it is the worse one, for a reason this
 * repository can count: `caique`, `flagstaff` and `closeout` each had a copy of "restore the
 * cursor on the way out" before closeout existed, and three copies of a signal handler is
 * three answers to whether Ctrl-C during a spinner leaves the terminal usable. closeout's
 * whole claim is the sentence burgee needs — bound every exit path, run the handlers exactly
 * once, hand the terminal back **last** — and it grades 21/21 against `exit-hook`'s own suite
 * and 6/6 against `restore-cursor`'s.
 *
 * ## The two registries, and why a run must say which it is
 *
 * A run either owns the process or it does not, and the difference is not cosmetic. The
 * harness (`runCommand`), the MCP loop and every façade test inject their own `exit`; a
 * registry that attached nine listeners to the process on their behalf would leak a listener
 * per test and would exit the *test runner* on the first raised signal. So:
 *
 *   - `processTeardown` — the real CLI. `install()` wires `exit`, `beforeExit`, five signals,
 *     `uncaughtException` and `unhandledRejection`, and burgee's drain goes in the `flush`
 *     phase, which closeout runs before `release` and before `restore`.
 *   - `detachedTeardown` — a run that owns no process. The same registry with no wiring, run
 *     by the engine when the run ends.
 *
 * Both are run by the engine at the end of a run, and closeout's run-once state machine is
 * what makes that safe: a signal that beats the engine to it wins, and the engine's own call
 * finds the work already done rather than doing it twice. That is the property that lets the
 * ordinary path be *awaited* — where `process.exit` would have abandoned an async handler —
 * without giving up the signal path.
 */
import { createRegistry, install, type ProcessLike, type Registry } from 'closeout';

/**
 * The half of a stream a flush needs.
 *
 * Structural, so the engine can hand it `host.stdout` and a test can hand it eight bytes that
 * only come out when somebody waits. `writableLength` is optional because a caller's injected
 * `stdout` is a `{ write }` and has nothing buffered to begin with.
 */
export interface Drainable {
  writableLength?: number;
  write(chunk: string, callback?: () => void): unknown;
}

export interface Teardown {
  /**
   * Register cleanup for this run. Returns the function that unregisters it.
   *
   * `label` is what a breached deadline calls it. Worth passing: the default is the
   * function's own `name`, which is right for `onExit(releaseTheLock)` and `(anonymous)` for
   * the arrow that is the shape that actually hangs.
   */
  add(handler: () => void | Promise<void>, label?: string): () => void;
  /** Run every handler, once, phase by phase, for a run leaving with `code`. */
  run(code: number): Promise<void>;
  /** closeout's registry, for the lock that grades which phase the drain went into. */
  readonly registry: Registry;
}

/**
 * Resolve when the stream has nothing left in it.
 *
 * An empty write whose callback fires on flush, rather than a `'drain'` listener: `'drain'`
 * is only emitted for a stream that went over its high-water mark, so a shutdown that waited
 * for one would wait forever on the common case of a few hundred buffered bytes.
 */
function drained(stream: Drainable): Promise<void> {
  if ((stream.writableLength ?? 0) === 0) return Promise.resolve();
  return new Promise<void>((done) => {
    stream.write('', () => done());
  });
}

function teardownOf(registry: Registry, streams: readonly Drainable[]): Teardown {
  // Named, and in `flush` rather than the default `release`: the phase is what puts it ahead
  // of a caller's cleanup and ahead of the terminal restore whatever order things registered
  // in, which is the ordering closeout exists to provide (O5 before E5, in one word).
  registry.add(async function flushStreams(): Promise<void> {
    await Promise.all(streams.map(drained));
  }, { phase: 'flush', label: 'burgee:flush' });

  return {
    add: (handler, label) => registry.add(handler, label === undefined ? 'release' : { phase: 'release', label }),
    run: async (code) => void (await registry.run({ code, signal: null })),
    registry,
  };
}

/**
 * Installed at most once per process, and lazily: `import 'burgee'` must not attach nine
 * listeners to a process that may never run a command.
 */
let shared: Teardown | undefined;

/**
 * The run that owns the process. `proc` is closeout's own seam (its design R7) and is passed
 * only by a test — the memo is skipped for it, so a fake process never becomes the answer a
 * later real run gets.
 */
export function processTeardown(streams: readonly Drainable[], proc?: ProcessLike): Teardown {
  if (proc !== undefined) return teardownOf(install({ process: proc }).registry, streams);
  return (shared ??= teardownOf(install().registry, streams));
}

/** A run that owns no process: the harness, the MCP loop, any caller that injected `exit`. */
export function detachedTeardown(streams: readonly Drainable[] = []): Teardown {
  return teardownOf(createRegistry(), streams);
}
