// -*- mode: Bluespec; -*-
/**
 * `search`'s source race (packages/caique/src/inquirer-search.ts), the one part of the ten
 * prompts where an `await` lets the world move: every edit to the term calls `source` again,
 * and the answers come back in any order.
 *
 * One action per JS turn. `edit` is a keypress that changes the term: `setTerm` re-renders,
 * and the effect keyed on the term aborts the call before it and starts one for the new term,
 * all in that turn. `answer(c)` is the turn after call `c`'s `await config.source(...)`
 * settles: `if (controller.signal.aborted) return`, else its results are drawn and the
 * prompt is idle. `enter` is Enter: `if (chosen && status === 'idle') await submit(...)`.
 *
 * Calls are named by the term they were made for (terms count up from 0), so "the results
 * drawn are for the term on screen" is `shownFor == term`.
 *
 * Mutants, each caught by `safety` and each a design the code rejects:
 * - `stepNoAbort`: a settled call is drawn whether or not it was aborted — a slow answer for
 *   `ap` lands after the fast one for `app` and replaces it (R3, `search.test.ts`'s
 *   "Handles race conditions between source calls").
 * - `stepEnterLoading`: Enter answers whatever is drawn while a call is still out, so the user
 *   answers from the list of a term they have already typed past.
 * `someAnswer` is expected to be violated: some run does answer, so `safety` is not vacuous.
 */
module search {
  type Status = Loading | Idle | Done

  /** How many edits a run may make: enough for two calls to overlap and settle out of order. */
  pure val MAX_TERMS = 3

  var term: int            // the term on screen, by edit count
  var out: Set[int]        // calls made and not yet settled
  var aborted: Set[int]    // calls whose AbortController fired
  var shownFor: int        // the term whose results are drawn; -1 before any
  var status: Status
  var answeredFor: int     // the term whose list the answer came from; -1 while open
  var staleDrawn: int      // times a list for a term other than the one on screen was drawn

  action init = all {
    term' = 0, out' = Set(0), aborted' = Set(), shownFor' = -1, status' = Loading,
    answeredFor' = -1, staleDrawn' = 0,
  }

  /** A key that changes the term: abort the call out for the old term, start one for the new. */
  action edit = all {
    status != Done, term < MAX_TERMS,
    term' = term + 1,
    out' = out.union(Set(term + 1)),
    aborted' = aborted.union(Set(term)),
    status' = Loading,
    shownFor' = shownFor, answeredFor' = answeredFor, staleDrawn' = staleDrawn,
  }

  /** Call `c` settles. `honourAbort` is the shipped `if (controller.signal.aborted) return`. */
  action answerWith(c: int, honourAbort: bool): bool = all {
    out.contains(c),
    out' = out.exclude(Set(c)),
    term' = term, aborted' = aborted, answeredFor' = answeredFor,
    if (status == Done or (honourAbort and aborted.contains(c))) all {
      shownFor' = shownFor, status' = status, staleDrawn' = staleDrawn,
    } else all {
      shownFor' = c,
      status' = Idle,
      staleDrawn' = if (c != term) staleDrawn + 1 else staleDrawn,
    },
  }

  /** Enter. `needIdle` is the shipped `status === 'idle'`; a drawn list is the `chosen`. */
  action enterWith(needIdle: bool): bool = all {
    status != Done, shownFor >= 0, not(needIdle) or status == Idle,
    status' = Done, answeredFor' = shownFor,
    term' = term, out' = out, aborted' = aborted, shownFor' = shownFor, staleDrawn' = staleDrawn,
  }

  action idle = all {
    term' = term, out' = out, aborted' = aborted, shownFor' = shownFor, status' = status,
    answeredFor' = answeredFor, staleDrawn' = staleDrawn,
  }

  action stepWith(honourAbort: bool, needIdle: bool): bool = any {
    edit,
    nondet c = 0.to(MAX_TERMS).oneOf()
    answerWith(c, honourAbort),
    enterWith(needIdle),
    idle,
  }

  action step = stepWith(true, true)
  action stepNoAbort = stepWith(false, true)
  action stepEnterLoading = stepWith(true, false)

  /** R3: a list is drawn only for the term on screen; an answer for a term typed past is dropped. */
  val neverDrawsStale = staleDrawn == 0
  /** R3: an answer comes from the list of the term on screen, never from one typed past. */
  val answersFromTermOnScreen = answeredFor == -1 or answeredFor == term
  /** The prompt is idle only while the drawn list is the current term's. */
  val idleMeansCurrent = status != Idle or shownFor == term

  val safety = neverDrawsStale and answersFromTermOnScreen and idleMeansCurrent

  /** Expected to be violated: some run answers, so `safety` is not vacuous. */
  val someAnswer = answeredFor == -1
}
