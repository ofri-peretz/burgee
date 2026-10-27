// -*- mode: Bluespec; -*-
/**
 * A live controlroom screen and the terminal it takes, against every way the process can end:
 * `live()` in `packages/controlroom/src/screen.ts`, the pairings in `closeout/cursor`
 * (`alternateScreen`, `hideCursor`, and `rawMode` under caique's `readKeys`), and closeout's
 * shutdown, whose `restore` phase runs last on every exit path (constraint 3, criterion 4).
 *
 * Granularity: one JS turn is one action. `live()` takes the alternate screen, the cursor and the
 * keyboard in one synchronous call, so no signal lands between them — but a throw can (the first
 * `paint()`, a component's `frame`), which is why each take is its own step. Each take changes the
 * terminal and registers its undo in the same call (R1); the undo is closeout's `paired()`: run
 * once, by `close()` or by the shutdown, whichever is first.
 *
 * What the model is for is the interleavings the PTY matrix (`closeout/src/pty-matrix.test.ts`)
 * cannot enumerate: a throw half-way through `open`, a signal while a `flush` handler hangs and the
 * deadline fires, `close()` from the program racing the shutdown that is already restoring, and a
 * second signal on top. Re-check the design it rejects by making `take` register nothing and
 * adding the undo in a later step: `restoredWhenGone` fails at once (a throw between the two).
 *
 * Run by hand:
 *   npx @informalsystems/quint run .sdlc/intents/controlroom/restore.qnt \
 *     --invariant=safety --max-steps=30 --max-samples=20000
 */
module restore {
  // The order `live()` takes them in: the alternate screen, the cursor, then the keyboard.
  pure val ORDER = ["alt", "cursor", "raw"]
  pure val TAKEN = Set("alt", "cursor", "raw")

  // What the terminal is showing: each thing the screen has taken and not given back.
  var changed: Set[str]
  // Undos registered with closeout and not yet run: the `restore` phase runs exactly these.
  var registered: Set[str]
  // How many times each thing was taken, and how many times its undo ran.
  var takes: str -> int
  var undos: str -> int
  // The screen: "none", "opening" (taken `opened` of ORDER), "open", "closed".
  var screen: str
  var opened: int
  // closeout's one shutdown: "none", "flushing" (a handler may hang here), "restored".
  var shutdown: str
  var alive: bool

  action init = all {
    changed' = Set(), registered' = Set(),
    takes' = TAKEN.mapBy(r => 0), undos' = TAKEN.mapBy(r => 0),
    screen' = "none", opened' = 0, shutdown' = "none", alive' = true,
  }

  /** Run `rs`' undos: each gives its thing back, leaves the registry, and is counted. */
  action undo(rs: Set[str]): bool = all {
    changed' = changed.exclude(rs),
    registered' = registered.exclude(rs),
    undos' = TAKEN.mapBy(r => if (rs.contains(r)) undos.get(r) + 1 else undos.get(r)),
    takes' = takes,
  }

  // ── open(): `live()`, one take per step, so a throw can land between two ───────────────
  // A screen opened once the shutdown has begun is closeout's late registration — registry.qnt's
  // `lateAddRuns` — and is not this model's question.
  action begin = all {
    alive, screen == "none", shutdown == "none",
    screen' = "opening", opened' = 0,
    changed' = changed, registered' = registered, takes' = takes, undos' = undos,
    shutdown' = shutdown, alive' = alive,
  }

  /**
   * The change and its undo's registration are one call (R1): never one without the other. The
   * takes are one synchronous turn, so only a throw stops them part-way, and a throw starts the
   * shutdown: no take follows a `trigger`.
   */
  action takeAt(r: str): bool = all {
    changed' = changed.union(Set(r)),
    registered' = registered.union(Set(r)),
    takes' = takes.set(r, takes.get(r) + 1),
    undos' = undos,
    opened' = opened + 1,
    screen' = if (opened + 1 == ORDER.length()) "open" else "opening",
    shutdown' = shutdown, alive' = alive,
  }

  action take = all {
    alive, screen == "opening", shutdown == "none",
    takeAt(ORDER[opened]),
  }

  /**
   * `close()`, from the program: quit, or the work is done. It runs the undos it still holds —
   * `paired()`'s run-once means one the shutdown already ran is not run again.
   */
  action close = all {
    alive, screen == "open",
    undo(registered),
    screen' = "closed", opened' = opened, shutdown' = shutdown, alive' = alive,
  }

  // ── closeout: any exit path starts the one shutdown ────────────────────────────────────
  /**
   * The door: falling off the end, `process.exit()`, an uncaught throw (mid-open included), a
   * signal, or the deadline. They differ in what holds the process up, not in what runs: every
   * one reaches `restore`, so one action stands for all of them.
   */
  action trigger = all {
    alive, shutdown == "none",
    shutdown' = "flushing",
    changed' = changed, registered' = registered, takes' = takes, undos' = undos,
    screen' = screen, opened' = opened, alive' = alive,
  }

  /**
   * `flush` and `release` settle, or a handler hangs and the deadline fires, or `'exit'` lands
   * mid-run (`runSync`): each way, `restore` runs next, and runs what is registered then.
   */
  action restorePhase = all {
    alive, shutdown == "flushing",
    undo(registered),
    shutdown' = "restored", screen' = screen, opened' = opened, alive' = alive,
  }

  /** The signal is re-raised, or the code is set and Node leaves: the process is gone. */
  action leave = all {
    alive, shutdown == "restored",
    alive' = false,
    changed' = changed, registered' = registered, takes' = takes, undos' = undos,
    screen' = screen, opened' = opened, shutdown' = shutdown,
  }

  /** A second signal, or another door, while the shutdown runs: it joins the one run (closeout R1). */
  action again = all {
    alive, shutdown != "none",
    changed' = changed, registered' = registered, takes' = takes, undos' = undos,
    screen' = screen, opened' = opened, shutdown' = shutdown, alive' = alive,
  }

  action idle = all {
    not(alive),
    changed' = changed, registered' = registered, takes' = takes, undos' = undos,
    screen' = screen, opened' = opened, shutdown' = shutdown, alive' = alive,
  }

  action step = any { begin, take, close, trigger, restorePhase, leave, again, idle }

  /** Constraint 3: whatever ended it, the terminal the process leaves is the one it found. */
  val restoredWhenGone = not(alive) implies changed == Set()

  /** `close()` hands the terminal back while the program goes on running. */
  val closedIsRestored = screen == "closed" implies changed == Set()

  /** No undo runs twice for one take: a second `setRawMode(false)` would take raw mode from the next holder. */
  val undoOnce = TAKEN.forall(r => undos.get(r) <= takes.get(r))

  /** What the terminal shows is exactly what an undo is still registered for. */
  val nothingUnowned = changed == registered

  val safety = restoredWhenGone and closedIsRestored and undoOnce and nothingUnowned
}
