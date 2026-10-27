// -*- mode: Bluespec; -*-
/**
 * One `promptFor` run and every way it can end (packages/caique/src/prompt-for.ts, R1, R4):
 * the verdict, the terminal opened only to ask, Ctrl+C as a byte in raw mode, a typed answer,
 * the handler, and a signal from outside — `kill -INT`, SIGTERM, the terminal closing — that
 * ends the process in any turn through the host's exit path (`ctx.onExit`, burgee's E5).
 *
 * One action per JS turn. `decide()` is pure, so the verdict is one step: refuse (no person,
 * `--json`, an `--mcp` call), skip (every value given), or ask. Asking writes the question,
 * which opens the terminal — `createIo()` over stdin and stderr, `node:readline` with
 * `terminal: true`, so raw mode is on — and registers its close with the exit path in the
 * same turn. Ctrl+C typed while it waits is a byte: readline, given no `SIGINT` listener,
 * closes the interface, which takes raw mode off and ends the read with nothing (cancel).
 *
 * Guarantees, together `safety`:
 *  - raw mode is on only while a question is waiting;
 *  - a run that has settled, or a process that has gone, never leaves the terminal raw;
 *  - nothing stays registered with the exit path once the run has settled;
 *  - a refusal never opened the terminal: the agent that was refused was never asked;
 *  - the handler runs only on a run whose every value is present.
 *
 * The first version described the code as it was written, and `rawOnlyWhileAsking` failed in
 * two steps (ask, answer): the terminal was closed in a `finally` around the handler, so the
 * handler ran with stdin still raw and readline still reading it — a Ctrl+C pressed during a
 * long handler was a byte readline swallowed, not the interrupt a person meant. This version
 * describes the fix: the terminal is closed once the asking is done, before the handler runs.
 *
 * Rejected designs, each re-checked by swapping its step for `step` (`--step=<name>`); each
 * must fail `safety`:
 *  - `stepCloseAfterHandler`: the first version, above.
 *  - `stepUnregistered`: the terminal is not handed to the exit path. A signal while the
 *    question waits ends the process with raw mode on, and the shell is unusable (clack #408).
 *  - `stepEagerTerminal`: the terminal is opened before the verdict, for every run. A refusal
 *    under `--json` has then opened stdin — under `--mcp`, the transport — to refuse.
 *  - `stepNoRelease`: the exit-path registration is never released. A settled run leaves a
 *    handler that closes a terminal the next prompt may own.
 * And the witness `neverAsks` must fail too, so `safety` does not hold because nothing asks.
 */
module interrupt {
  type Phase = Idle | Asking | Running | Settled | Exited
  type Outcome = None | Answered | Cancelled | Refused | Skipped

  var phase: Phase
  var outcome: Outcome
  var raw: bool          // the terminal is in raw mode
  var opened: bool       // the terminal was ever opened in this run
  var registered: bool   // the terminal's close is registered with the host's exit path
  var handlerRan: bool   // the wrapped handler was called
  var missingAtRun: bool // the handler was called with a value still missing

  action init = all {
    phase' = Idle, outcome' = None, raw' = false, opened' = false,
    registered' = false, handlerRan' = false, missingAtRun' = false,
  }

  action unchangedFlags(r: bool, o: bool, g: bool): bool = all { raw' = r, opened' = o, registered' = g }

  /** `decide()`: nobody to ask, or `--json` — refuse, before anything touches the terminal. */
  action refuse = all {
    phase == Idle,
    phase' = Settled, outcome' = Refused, unchangedFlags(raw, opened, registered),
    handlerRan' = handlerRan, missingAtRun' = missingAtRun,
  }

  /** Every value came from a flag, the environment or a default: nothing is asked. */
  action skip = all {
    phase == Idle,
    phase' = Running, outcome' = Skipped, unchangedFlags(raw, opened, registered),
    handlerRan' = handlerRan, missingAtRun' = missingAtRun,
  }

  /** `ask()` writes the question: the lazy terminal opens, raw mode on, its close handed to the exit path. */
  action ask(register: bool): bool = all {
    phase == Idle,
    phase' = Asking, outcome' = outcome, raw' = true, opened' = true, registered' = register,
    handlerRan' = handlerRan, missingAtRun' = missingAtRun,
  }

  /**
   * A line typed and Return: the answer is read, and the terminal is closed — raw mode off, the
   * registration released — before the handler is called. With `closeFirst` false, the shape
   * of the first version: the terminal stayed open until the handler's `finally`.
   */
  action answer(closeFirst: bool): bool = all {
    phase == Asking,
    phase' = Running, outcome' = Answered, opened' = opened,
    raw' = if (closeFirst) false else raw,
    registered' = if (closeFirst) false else registered,
    handlerRan' = handlerRan, missingAtRun' = missingAtRun,
  }

  /** Ctrl+C typed while it waits: a byte in raw mode. readline closes, raw mode off, the read ends empty. */
  action ctrlC(release: bool): bool = all {
    phase == Asking,
    // `finally { terminal.close() }`: close again (idempotent) and release the registration.
    phase' = Settled, outcome' = Cancelled, raw' = false, opened' = opened,
    registered' = if (release) false else registered,
    handlerRan' = handlerRan, missingAtRun' = missingAtRun,
  }

  /** The handler runs on the values; when it returns or throws, `finally` closes the terminal. */
  action handle(release: bool): bool = all {
    phase == Running,
    phase' = Settled, outcome' = outcome, raw' = false, opened' = opened,
    registered' = if (release) false else registered,
    handlerRan' = true,
    missingAtRun' = (missingAtRun or (outcome != Answered and outcome != Skipped)),
  }

  /**
   * A signal from outside, in any turn before the process is gone: the host's exit path runs
   * every registered handler (the terminal's close among them), then the process ends.
   */
  action signal = all {
    phase != Exited,
    phase' = Exited, outcome' = outcome,
    raw' = if (registered) false else raw,
    opened' = opened, registered' = registered,
    handlerRan' = handlerRan, missingAtRun' = missingAtRun,
  }

  /** The shipped design. */
  action step = any { refuse, skip, ask(true), answer(true), ctrlC(true), handle(true), signal }

  // ---- rejected designs ----
  action stepUnregistered = any { refuse, skip, ask(false), answer(true), ctrlC(true), handle(true), signal }

  action stepCloseAfterHandler = any { refuse, skip, ask(true), answer(false), ctrlC(true), handle(true), signal }

  /** Opened for every run, before the verdict: a refusal has already touched stdin. */
  action refuseAfterOpening = all {
    phase == Idle,
    phase' = Settled, outcome' = Refused, raw' = false, opened' = true, registered' = false,
    handlerRan' = handlerRan, missingAtRun' = missingAtRun,
  }
  action stepEagerTerminal = any { refuseAfterOpening, skip, ask(true), answer(true), ctrlC(true), handle(true), signal }

  action stepNoRelease = any { refuse, skip, ask(true), answer(true), ctrlC(false), handle(false), signal }

  // ---- guarantees ----
  /** Raw mode is on only while a question waits. */
  val rawOnlyWhileAsking = raw implies phase == Asking
  /** A settled run, or a process that has gone, never leaves the terminal raw. */
  val restoredAtTheEnd = (phase == Settled or phase == Exited) implies not(raw)
  /** Nothing stays registered with the exit path once the run has settled. */
  val releasedWhenSettled = phase == Settled implies not(registered)
  /** A refusal never opened the terminal. */
  val refusedUnasked = outcome == Refused implies not(opened)
  /** The handler never runs with a value missing. */
  val handlerHasEverything = not(missingAtRun)

  val safety = rawOnlyWhileAsking and restoredAtTheEnd and releasedWhenSettled and refusedUnasked and handlerHasEverything

  /** Witness: some run asks. Must FAIL, or `safety` holds only because nothing ever asks. */
  val neverAsks = not(opened)
}
