// -*- mode: Bluespec; -*-
/**
 * `burgee migrate` over a project whose incumbent is on a major the drop-in does not claim
 * (packages/burgee/src/migrate-majors.ts: `removedSites`, `moveOf`; migrate.ts: `withSites`).
 *
 * Chosen once at init: the majors the drop-in claims, the major the project is on (not claimed),
 * the major each API was removed in, and, per file, the APIs it uses and whether it imports a
 * specifier no claimed entry serves (a deep import, `commander/esm.mjs`). A project only uses an
 * API its own major still has, so every used API was removed after the found major.
 *
 * Then the run as the code runs it: every file is scanned, in any order, each contributing the
 * sites the table can see; once all are scanned the gate decides the move, once.
 *
 * `safety` is the intent's question, the field trial's four crashes stated as an invariant:
 *   - a printed move never targets a major whose entry lacks an API the project uses, nor one
 *     that serves none of a specifier it imports, nor a major the drop-in does not claim;
 *   - and when some claimed major above the found one would be safe, a move is printed, so the
 *     gate cannot pass by refusing everything.
 *
 * The rejected designs are steps, so CI runs each and requires `safety` to FAIL (models.yml):
 *   stepUnchecked — a move to the nearest claimed major whatever the sites say (the trial's
 *                   `manual` arm, one major nearer);
 *   stepOffByOne  — an API removed in exactly the target major does not block it;
 *   stepLatest    — the move targets the highest claimed major, checked: the trial moved qrcode
 *                   to yargs 18, where its singleton is gone, while 17 still has it;
 *   stepEager     — the move is decided when the first file is scanned, before the sites in the others;
 *   stepNoDeep    — a specifier no entry serves does not block the move.
 */
module majors {
  pure val MAJORS = 1.to(5)
  pure val FILES = Set("a", "b")
  pure val APIS = Set("p", "q")

  // inputs
  var claimed: Set[int]
  var found: int
  var removedIn: str -> int
  var uses: str -> Set[str]
  var deep: str -> bool
  // the run
  var scanned: Set[str]
  /** The APIs the scanned files use, and whether any imports a specifier no entry serves. */
  var seen: Set[str]
  var unserved: bool
  var decided: bool
  /** The major the printed move targets; 0 when no move is printed. */
  var move: int

  action keepInputs = all { claimed' = claimed, found' = found, removedIn' = removedIn, uses' = uses, deep' = deep }

  action init = {
    nondet c = MAJORS.powerset().exclude(Set(Set())).oneOf()
    nondet f = MAJORS.exclude(c).oneOf()
    nondet r = setOfMaps(APIS, MAJORS).oneOf()
    nondet u = setOfMaps(FILES, APIS.filter(a => r.get(a) > f).powerset()).oneOf()
    nondet d = setOfMaps(FILES, Set(true, false)).oneOf()
    all {
      claimed' = c, found' = f, removedIn' = r, uses' = u, deep' = d,
      scanned' = Set(), seen' = Set(), unserved' = false, decided' = false, move' = 0,
    }
  }

  /** The smallest claimed major above the found one, or 0. */
  def nearest(c: Set[int], f: int): int =
    c.filter(m => m > f).fold(0, (acc, m) => if (acc == 0 or m < acc) m else acc)

  def highest(c: Set[int], f: int): int = c.filter(m => m > f).fold(0, (acc, m) => if (m > acc) m else acc)

  /** `moveOf`, and its rejected variants. */
  def gate(v: str, apis: Set[str], blind: bool): int = {
    val t = if (v == "latest") highest(claimed, found) else nearest(claimed, found)
    val blocks = apis.exists(a => if (v == "offByOne") removedIn.get(a) < t else removedIn.get(a) <= t)
    if (t == 0) 0
    else if (v == "unchecked") t
    else if (blocks or (blind and v != "noDeep")) 0
    else t
  }

  /** One file of `scanBatch`: its sites and specifiers join the run's. `eager` decides on the first. */
  action scanOne(v: str): bool = all {
    not(decided),
    nondet f = FILES.exclude(scanned).oneOf()
    val s = seen.union(uses.get(f))
    val b = unserved or deep.get(f)
    all {
      keepInputs,
      scanned' = scanned.union(Set(f)),
      seen' = s,
      unserved' = b,
      decided' = v == "eager",
      move' = if (v == "eager") gate(v, s, b) else move,
    },
  }

  /** `withSites`, after every file is scanned. */
  action decide(v: str): bool = all {
    not(decided),
    scanned == FILES,
    keepInputs,
    scanned' = scanned, seen' = seen, unserved' = unserved,
    decided' = true,
    move' = gate(v, seen, unserved),
  }

  action idle = all {
    decided,
    keepInputs,
    scanned' = scanned, seen' = seen, unserved' = unserved, decided' = decided, move' = move,
  }

  action stepWith(v: str): bool = any { scanOne(v), decide(v), idle }
  action step = stepWith("shipped")
  action stepUnchecked = stepWith("unchecked")
  action stepOffByOne = stepWith("offByOne")
  action stepLatest = stepWith("latest")
  action stepEager = stepWith("eager")
  action stepNoDeep = stepWith("noDeep")

  val used = FILES.map(f => uses.get(f)).flatten()
  val anyDeep = FILES.exists(f => deep.get(f))

  /** The move targets a claimed major above the found one, whose entry has every API the project uses and serves every specifier it imports. */
  val moveNeverCrashes = move != 0 implies all {
    claimed.contains(move),
    move > found,
    used.forall(a => removedIn.get(a) > move),
    not(anyDeep),
  }

  /** Once decided: when some claimed major above the found one is safe, a move is printed. */
  val moveWhenOneIsSafe = (decided and not(anyDeep) and claimed.exists(m => m > found and used.forall(a => removedIn.get(a) > m))) implies move != 0

  val safety = moveNeverCrashes and moveWhenOneIsSafe

  /** Witness, expected to be VIOLATED: some run prints a move — qrcode, whose singleton 17 still has. */
  val neverMoves = move == 0
}
