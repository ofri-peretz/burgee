// -*- mode: Bluespec; -*-
/**
 * One clack prompt's life (packages/caique/src/clack-core.ts, `Session`):
 * initial → active → (validating ↔ error) → submit | cancel, plus an AbortSignal.
 *
 * One action per JS turn. The one await is `problem = await problem` in `submit()`, so a key
 * that submits through an async validator is two turns: `press` up to the await, `verdict`
 * after it. A validator that answers synchronously is the same two actions with no turn
 * between them; the model allows one, which only adds interleavings.
 *
 * The first version described the code as it was, and `cancelHonoured` failed in three steps
 * (open, enter with an async validator, Ctrl-C): `if (state === 'validating') return` dropped
 * the key, and in raw mode Ctrl-C is a byte, not a signal, so a validator that never answers
 * left no way out. This version describes the fix: a cancel key while validating cancels.
 * Re-check by making `press`'s Validating branch ignore `CtrlC` too.
 *
 * Checked and left alone: after an abort or a cancel key mid-validation, the late verdict
 * still writes `state = 'submit'` or `'error'` on the closed prompt (open, enter, abort,
 * verdict). Nothing reads it: `settle` already ran once, `onKeypress` returns on `closed`
 * before drawing, and `run` is internal to caique. So the guarantees below are about what
 * a caller sees, the answer and the frames, not about `state` after close.
 */
module promptSession {
  type State = Initial | Active | Validating | Error | Submit | Cancel
  /** `CtrlC` stands for every cancel alias: Ctrl-C, escape, and any added by `updateSettings`. */
  type Key = Char | Return | CtrlC

  var state: State
  var closed: bool
  var settles: int            // calls to `settle`, the promise's resolve
  var pending: bool           // an async validator is out
  var drawsAfterClose: int    // frames written after close() gave the cursor back
  var lastKey: str            // the last key delivered

  action init = all {
    state' = Initial, closed' = false, settles' = 0, pending' = false,
    drawsAfterClose' = 0, lastKey' = "",
  }

  /** finish(): finalize, the last frame, then close(): listeners off, raw mode off, cursor back, settle. */
  action finish(s: State): bool = all {
    state' = s, closed' = true, settles' = settles + 1, drawsAfterClose' = drawsAfterClose,
  }

  action stay(s: State): bool = all {
    state' = s, closed' = closed, settles' = settles, drawsAfterClose' = drawsAfterClose,
  }

  /** open(): attach and draw the first frame, which moves initial to active. */
  action open = all {
    state == Initial, not(closed),
    stay(Active), pending' = pending, lastKey' = lastKey,
  }

  /** onKeypress, up to the await (or to the end, when nothing awaits). */
  action press(k: Key): bool = all {
    not(closed), state != Initial,
    lastKey' = match k { | CtrlC => "ctrlc" | Return => "return" | Char => "char" },
    pending' = (pending or (state != Validating and k == Return)),
    if (state == Validating) match k {
      // Keys wait for the verdict, except cancel: `if (cancels(char, key)) this.cancel()`.
      | CtrlC => finish(Cancel)
      | _ => stay(state)
    } else match k {
      | CtrlC => finish(Cancel)
      | Char => stay(Active)
      | Return => stay(Validating)
    },
  }

  /** The validator answered: the rest of submit(), then the rest of onKeypress. */
  action verdict = all {
    pending,
    pending' = false, lastKey' = lastKey,
    nondet ok = Set(true, false).oneOf()
    if (closed) all {
      // submit() writes the state whatever happened meanwhile ...
      state' = if (ok) Submit else Error,
      closed' = closed, settles' = settles,
      // ... and onKeypress's `if (this.closed) return` draws nothing and does not finish().
      drawsAfterClose' = drawsAfterClose,
    } else if (ok) finish(Submit) else stay(Error),
  }

  /** The signal's abort listener, which close() removes. */
  action abort = all {
    not(closed), state != Initial,
    finish(Cancel), pending' = pending, lastKey' = lastKey,
  }

  action step = any {
    open, verdict, abort,
    nondet k = Set(Char, Return, CtrlC).oneOf() press(k),
  }

  /** `settle` runs at most once. */
  val settledOnce = settles <= 1
  /** Closed means settled, and settled means closed: no prompt ends without an answer. */
  val closedIffSettled = closed == (settles == 1)
  /** Nothing is drawn once the cursor has been given back. */
  val quietAfterClose = drawsAfterClose == 0
  /** A cancel key on an open prompt ends it, in every state: a person can always leave. */
  val cancelHonoured = lastKey == "ctrlc" implies closed

  val safety = settledOnce and closedIffSettled and quietAfterClose and cancelHonoured
}
