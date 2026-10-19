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
 * The second version added a validator that throws, synchronously or by rejecting, as a third
 * verdict, and described the code as it was: the throw left `submit()`, then `onKeypress`, and
 * nothing awaits a keypress listener, so it was an unhandledRejection — which kills a Node
 * process by default. `rejectionsHandled` failed in three steps (open, enter, a rejecting
 * verdict), with the prompt left showing "validating" and no validator out; a fourth step, an
 * abort before the verdict, showed it escaping from a prompt that had already answered. This
 * version describes the fix: a throw takes the problem's path, the error state with its message.
 * Re-check with three mutants, each caught by `safety`: the throw escapes (`unhandled + 1`), a
 * throw submits, and a throw is caught but leaves the prompt in Validating.
 *
 * The third version added `fault`, a throw from the prompt's own code (a render, onKey,
 * finalize) in any turn, and described the code as it was: from a key it escaped the listener
 * (`unhandled + 1`, the prompt open and raw mode on for good), from an abort it escaped the
 * abort listener, and from open's first frame the promise rejected with raw mode still on.
 * `rejectionsHandled` failed in one step. This version describes the fix: `crash` releases the
 * terminal and rejects with the throw. Re-check with two mutants, each caught by `safety`: the
 * throw escapes (`unhandled + 1`), and a reject that leaves the terminal held (`closed' = closed`).
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
  var settles: int            // settles of the promise: `resolve` on close, `reject` on a crash
  var pending: bool           // an async validator is out
  var drawsAfterClose: int    // frames written after close() gave the cursor back
  var lastKey: str            // the last key delivered
  var lastVerdict: str        // how the last validator answered: "ok", "problem" or "rejects"
  var unhandled: int          // rejections that escaped `onKeypress`, which nothing awaits

  action init = all {
    state' = Initial, closed' = false, settles' = 0, pending' = false,
    drawsAfterClose' = 0, lastKey' = "", lastVerdict' = "", unhandled' = 0,
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
    lastVerdict' = lastVerdict, unhandled' = unhandled,
  }

  /** onKeypress, up to the await (or to the end, when nothing awaits). */
  action press(k: Key): bool = all {
    not(closed), state != Initial,
    lastKey' = match k { | CtrlC => "ctrlc" | Return => "return" | Char => "char" },
    lastVerdict' = lastVerdict, unhandled' = unhandled,
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

  /**
   * The validator answered — or threw, synchronously or by rejecting: the rest of submit(),
   * then the rest of onKeypress. A throw is a problem the validator could not name, so it
   * takes the problem's path: the error state, its message shown, the prompt still open.
   */
  action verdict = all {
    pending,
    pending' = false, lastKey' = lastKey,
    nondet outcome = Set("ok", "problem", "rejects").oneOf()
    all {
      lastVerdict' = outcome, unhandled' = unhandled,
      if (closed) all {
        // submit() writes the state whatever happened meanwhile ...
        state' = if (outcome == "ok") Submit else Error,
        closed' = closed, settles' = settles,
        // ... and onKeypress's `if (this.closed) return` draws nothing and does not finish().
        drawsAfterClose' = drawsAfterClose,
      } else if (outcome == "ok") finish(Submit) else stay(Error),
    },
  }

  /**
   * The prompt's own code threw — a render, onKey, finalize — in whichever turn ran it: open's
   * first frame, a key, a verdict, an abort. `crash` releases the terminal and rejects the
   * promise with the throw, which settles it: the caller sees the error, and nothing escapes.
   */
  action fault = all {
    not(closed),
    state' = state, closed' = true, settles' = settles + 1, drawsAfterClose' = drawsAfterClose,
    pending' = pending, lastKey' = lastKey, lastVerdict' = lastVerdict, unhandled' = unhandled,
  }

  /** The signal's abort listener, which close() removes. */
  action abort = all {
    not(closed), state != Initial,
    finish(Cancel), pending' = pending, lastKey' = lastKey,
    lastVerdict' = lastVerdict, unhandled' = unhandled,
  }

  action step = any {
    open, verdict, abort, fault,
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

  /** A validator that throws is answered, never left to escape the keypress listener as an unhandledRejection. */
  val rejectionsHandled = unhandled == 0
  /** Only a validator that passed lets the answer through: a throw is never a pass. */
  val submitsOnlyWhenValid = state == Submit implies lastVerdict == "ok"
  /** An open prompt shows "validating" only while a validator is out: a throw never strands it there. */
  val validatingMeansPending = (not(closed) and state == Validating) implies pending

  val safety = settledOnce and closedIffSettled and quietAfterClose and cancelHonoured
    and rejectionsHandled and submitsOnlyWhenValid and validatingMeansPending
}
