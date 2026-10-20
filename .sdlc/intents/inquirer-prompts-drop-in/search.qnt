// -*- mode: Bluespec; -*-
/**
 * `search`'s source race (packages/caique/src/inquirer-search.ts), the one part of the ten
 * prompts where an `await` lets the world move: every edit to the term calls `source` again,
 * and the answers come back in any order.
 *
 * One action per JS turn. A key's handler reads the state of the **last frame drawn** (its
 * closure is that render's), which is `seen` here, and `status` is the store. `edit` is a key
 * that changes the term: `setTerm` draws a frame, reading the store as it stands, and then the
 * effect keyed on the term aborts the call before it, starts one for the new term and sets the
 * store `loading` — a change that draws nothing until the next frame. So the key after an edit
 * still sees the frame before it. `answer(c)` is the turn after call `c`'s
 * `await config.source(...)`: `if (controller.signal.aborted) return`, else the list is drawn
 * and the prompt is idle. `enter` is Enter: `if (chosen && status === 'idle')`, on `seen`.
 *
 * Calls are named by the term they were made for (terms count up from 0).
 *
 * The first version modelled `edit` as marking the prompt loading in its own turn, and the
 * ported tests found the code does not: Enter right after a key answers from the list drawn
 * for the term before it. `@inquirer/search` behaves the same — its own "Autocomplete with
 * tab" case presses Enter straight after Tab and expects the choice drawn under the cursor —
 * so the drop-in keeps it, and `answersFromTermOnScreen` is pinned as an expected violation
 * (an open question in spec.md). What does hold is that the answer is at most one edit behind.
 *
 * Mutants, each caught by `safety` and each a design the code rejects:
 * - `stepNoAbort`: a settled call is drawn whether or not it was aborted — a slow answer for
 *   `ap` lands after the fast one for `app` and replaces it (`search.test.ts`'s "Handles race
 *   conditions between source calls").
 * - `stepEnterLoading`: Enter answers whatever is drawn while a call it has drawn as loading is
 *   out, so after two keys it answers from a list two terms old.
 * `someAnswer` is expected to be violated: some run does answer, so `safety` is not vacuous.
 */
module search {
  type Status = Loading | Idle | Done

  /** How many edits a run may make: enough for two calls to overlap and settle out of order. */
  pure val MAX_TERMS = 3

  var term: int            // the term in the store, by edit count
  var out: Set[int]        // calls made and not yet settled
  var aborted: Set[int]    // calls whose AbortController fired
  var shownFor: int        // the term whose list is drawn; -1 before any
  var status: Status       // the store
  var seen: Status         // the status of the last frame drawn, which a key's handler reads
  var answeredFor: int     // the term whose list the answer came from; -1 while open
  var staleDrawn: int      // times a list from an aborted call was drawn

  action init = all {
    term' = 0, out' = Set(0), aborted' = Set(), shownFor' = -1, status' = Loading, seen' = Loading,
    answeredFor' = -1, staleDrawn' = 0,
  }

  /** A key that changes the term: its frame reads the store, then the effect moves the search on. */
  action edit = all {
    seen != Done, term < MAX_TERMS,
    term' = term + 1,
    seen' = status,
    out' = out.union(Set(term + 1)),
    aborted' = aborted.union(Set(term)),
    status' = Loading,
    shownFor' = shownFor, answeredFor' = answeredFor, staleDrawn' = staleDrawn,
  }

  /** Any other frame — the spinner's, a key that moves the cursor — draws the store as it is. */
  action redraw = all {
    status != Done,
    seen' = status,
    term' = term, out' = out, aborted' = aborted, shownFor' = shownFor, status' = status,
    answeredFor' = answeredFor, staleDrawn' = staleDrawn,
  }

  /** Call `c` settles. `honourAbort` is the shipped `if (controller.signal.aborted) return`. */
  action answerWith(c: int, honourAbort: bool): bool = all {
    out.contains(c),
    out' = out.exclude(Set(c)),
    term' = term, aborted' = aborted, answeredFor' = answeredFor,
    if (status == Done or (honourAbort and aborted.contains(c))) all {
      shownFor' = shownFor, status' = status, seen' = seen, staleDrawn' = staleDrawn,
    } else all {
      shownFor' = c,
      status' = Idle,
      seen' = Idle,
      staleDrawn' = if (aborted.contains(c)) staleDrawn + 1 else staleDrawn,
    },
  }

  /** Enter. `needIdle` is the shipped `status === 'idle'`, read off the last frame; a drawn list is the `chosen`. */
  action enterWith(needIdle: bool): bool = all {
    seen != Done, shownFor >= 0, not(needIdle) or seen == Idle,
    status' = Done, seen' = Done, answeredFor' = shownFor,
    term' = term, out' = out, aborted' = aborted, shownFor' = shownFor, staleDrawn' = staleDrawn,
  }

  action idle = all {
    term' = term, out' = out, aborted' = aborted, shownFor' = shownFor, status' = status,
    seen' = seen, answeredFor' = answeredFor, staleDrawn' = staleDrawn,
  }

  action stepWith(honourAbort: bool, needIdle: bool): bool = any {
    edit,
    redraw,
    nondet c = 0.to(MAX_TERMS).oneOf()
    answerWith(c, honourAbort),
    enterWith(needIdle),
    idle,
  }

  action step = stepWith(true, true)
  action stepNoAbort = stepWith(false, true)
  action stepEnterLoading = stepWith(true, false)

  /** A list from an aborted call is never drawn: an answer for a term typed past is dropped. */
  val neverDrawsStale = staleDrawn == 0
  /** An answer comes from the list of the term in the store, or of the one just before it. */
  val answersAtMostOneEditBehind = answeredFor == -1 or answeredFor >= term - 1

  val safety = neverDrawsStale and answersAtMostOneEditBehind

  /** Expected to be violated (incumbent parity, an open question in spec.md): Enter right after an edit answers from the previous term's list. */
  val answersFromTermOnScreen = answeredFor == -1 or answeredFor == term

  /** Expected to be violated: some run answers, so `safety` is not vacuous. */
  val someAnswer = answeredFor == -1
}
