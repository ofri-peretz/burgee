// -*- mode: Bluespec; -*-
/**
 * `burgee migrate`'s gate (packages/burgee/src/migrate.ts, `migrate()`), one action per await:
 *
 *   const entries = (await status(dir)) ?? [];                         // readTree
 *   if (!dryRun && !force && entries.length > 0) throw DirtyTreeError;  //   ...refused
 *   …manifest, majors, transitive, the scan in batches…                  // scan
 *   const preflight = preflightOf({ …, jestConfigs: await … });         // runPreflight
 *   const blocking = changed.length === 0 ? 0 : preflight.filter(blocking).length;
 *   if (!dryRun && blocking === 0) await writeAll(dir, changed);         // writeBatch, BATCH at a time
 *   return { changed: !dryRun && blocking === 0 && …, exitCode: … }     // finish
 *
 * The inputs — a dirty tree, `--force`, `--dry-run`, whether preflight finds a blocking row, how
 * many files the scan would rewrite — are chosen once, at init, from every combination. The
 * requirements are migrate-preflight R6 (a blocking row on a planned rewrite writes nothing, and
 * `--force` does not lift it) and A6 (a dirty tree without `--force` writes nothing).
 *
 * Mutants checked before merging, each caught by `safety` (spec.md, Verification): writeBatch
 * without `not(blocked)`; `blocked` that `--force` lifts; writeBatch without `not(dryRun)`;
 * writeBatch reachable from "scanned", before the preflight ran.
 */
module preflight {
  // inputs
  var dirty: bool
  var force: bool
  var dryRun: bool
  var blockingRow: bool
  var planned: int
  // the run
  var phase: str
  var preflightRan: bool
  var blocked: bool
  var written: int
  var exitCode: int
  var changed: bool

  action keepInputs = all {
    dirty' = dirty, force' = force, dryRun' = dryRun, blockingRow' = blockingRow, planned' = planned,
  }

  action init = all {
    nondet d = Set(true, false).oneOf()
    nondet f = Set(true, false).oneOf()
    nondet r = Set(true, false).oneOf()
    nondet b = Set(true, false).oneOf()
    nondet p = 0.to(2).oneOf()
    all {
      dirty' = d, force' = f, dryRun' = r, blockingRow' = b, planned' = p,
      phase' = "start", preflightRan' = false, blocked' = false, written' = 0, exitCode' = -1, changed' = false,
    },
  }

  /** `await status(dir)`, then the A6 refusal, which throws before anything else is read. */
  action readTree = all {
    phase == "start",
    keepInputs,
    if (dirty and not(force) and not(dryRun)) all { phase' = "refused", exitCode' = 1 }
    else all { phase' = "treeRead", exitCode' = exitCode },
    preflightRan' = preflightRan, blocked' = blocked, written' = written, changed' = changed,
  }

  /** The manifest, the majors, the transitive read and every scan batch: no write among them. */
  action scan = all {
    phase == "treeRead",
    keepInputs,
    phase' = "scanned",
    preflightRan' = preflightRan, blocked' = blocked, written' = written, exitCode' = exitCode, changed' = changed,
  }

  /** `await jestConfigsIn(dir)`, then `preflightOf` and the `blocking` count. */
  action runPreflight = all {
    phase == "scanned",
    keepInputs,
    phase' = "decided",
    preflightRan' = true,
    blocked' = if (planned == 0) false else blockingRow,
    written' = written, exitCode' = exitCode, changed' = changed,
  }

  /** One `writeAll` batch. */
  action writeBatch = all {
    phase == "decided" or phase == "writing",
    not(dryRun),
    not(blocked),
    written < planned,
    keepInputs,
    phase' = "writing",
    written' = written + 1,
    preflightRan' = preflightRan, blocked' = blocked, exitCode' = exitCode, changed' = changed,
  }

  /** The report. Refusals of files also set exit 1; they are not this gate, so they are not modelled. */
  action finish = all {
    phase == "decided" or phase == "writing",
    dryRun or blocked or written == planned,
    keepInputs,
    phase' = "done",
    exitCode' = if (blocked) 1 else 0,
    changed' = (not(dryRun) and not(blocked) and planned > 0),
    preflightRan' = preflightRan, blocked' = blocked, written' = written,
  }

  action idle = all {
    phase == "done" or phase == "refused",
    keepInputs,
    phase' = phase, preflightRan' = preflightRan, blocked' = blocked, written' = written, exitCode' = exitCode, changed' = changed,
  }

  action step = any { readTree, scan, runPreflight, writeBatch, finish, idle }

  /** R6 — a blocking row on a planned rewrite leaves every file as it was, whatever `--force` says. */
  val refusalNeverWrites = (blockingRow and planned > 0) implies written == 0
  /** A6 — a dirty tree without `--force` or `--dry-run` is refused before anything is written. */
  val dirtyNeverWrites = (dirty and not(force) and not(dryRun)) implies written == 0
  val dryRunNeverWrites = dryRun implies written == 0
  /** No file is written before the preflight has decided. */
  val decidedBeforeWrite = written > 0 implies preflightRan
  /** R6 — a finished, blocked run says so in the exit code and in `changed`. */
  val blockedExitsRuntime = (phase == "done" and blockingRow and planned > 0) implies (exitCode == 1 and not(changed))

  val safety = refusalNeverWrites and dirtyNeverWrites and dryRunNeverWrites and decidedBeforeWrite and blockedExitsRuntime

  /** Witness, expected to be VIOLATED: some run writes, so `safety` does not hold by never writing. */
  val writesHappen = written == 0
}
