// -*- mode: Bluespec; -*-
/**
 * seniority's precedence and provenance for one key (packages/seniority/src/precedence.ts:
 * `ORDER`, `RANK`, `candidatesFor`, `resolve`; src/plugin.ts: `register`, `sources`;
 * src/truth-table.ts: `truthTable`).
 *
 * The five built-ins sit at `RANK` (0, 10, 20, 30, 40 — `ORDER`'s positions times ten). Two
 * plugin sources may register, each with a rank. Then, in any order, any registered source sets
 * the key to a value or withdraws it, and every change is resolved again, as a run resolves
 * whatever its layers hold: `resolve` is pure, so one action is one call over the current layers.
 *
 * `safety` is the intent's two questions as invariants — which source outranks the others, and
 * which one actually set this value:
 *   - the winner is a source that set the key, the value is the one it set, and provenance
 *     names it (R3: "every resolved value carries its source");
 *   - nothing is unset when some source set it, and nothing wins when none did;
 *   - no set source has a lower rank than the winner; at an equal rank a built-in beats a
 *     plugin, and of two plugins the later registered wins (R15, plugin.test.ts);
 *   - a flag that is set always wins, and the default wins only alone (R15's two bounds);
 *   - with no plugin registered, the winner is the row of the truth table for the sources
 *     set: the first of them in `ORDER` (R1, criterion 2 — `truthTable`'s own rule).
 *
 * The rejected designs are steps, so CI runs each and requires `safety` to FAIL (models.yml):
 *   stepLastWriter      — the source that set the key most recently wins: a merge in
 *                         discovery order, `Object.assign` over the layers, the shape most
 *                         config loaders have;
 *   stepStaleProvenance — the value is re-resolved but provenance is kept from the first
 *                         answer: "which one set it" recorded once, beside the value;
 *   stepUnbounded       — `register` takes any rank instead of refusing one outside
 *                         (RANK.flag, RANK.default): a plugin can then outrank the flag;
 *   stepPluginTie       — a plugin at a built-in's rank beats the built-in;
 *   stepOldestFirst     — of two plugins at one rank the earlier registered wins: seniority
 *                         before 2026-09-30, when `sources()` read the plugins oldest first.
 */
module precedence {
  pure val ORDER = ["flag", "env", "config", "package", "default"]
  pure val BUILTINS = Set("flag", "env", "config", "package", "default")
  pure val RANK = Map("flag" -> 0, "env" -> 10, "config" -> 20, "package" -> 30, "default" -> 40)
  pure val PLUGINS = Set("vault", "ci")
  /** The ranks a plugin may ask for: below the flag, on it, between, on a built-in, on the default, below it. */
  pure val ASKED = Set(-5, 0, 5, 10, 15, 40, 45)
  pure val VALUES = Set(1, 2)
  pure val UNSET = 0
  pure val NONE = ""

  /** The value each source holds for the key; `UNSET` when it has none. */
  var held: str -> int
  /** Each source's rank: the built-ins' `RANK`, a plugin's own once registered. */
  var rank: str -> int
  /** The plugins, oldest first. */
  var registered: List[str]
  /** The source that set the key most recently, for `stepLastWriter`. */
  var lastSet: str
  /** What `resolve` answered: the winning source, its value, and the provenance it recorded. */
  var winner: str
  var value: int
  var provenance: str

  pure def isBuiltin(s: str): bool = BUILTINS.contains(s)
  pure def regSet(reg: List[str]): Set[str] = reg.foldl(Set(), (acc, p) => acc.union(Set(p)))
  pure def pos(reg: List[str], s: str): int = reg.indices().fold(-1, (acc, i) => if (reg[i] == s) i else acc)

  /** Does `a` outrank `b`? The shipped order and its rejected variants. */
  pure def beats(v: str, rk: str -> int, reg: List[str], a: str, b: str): bool =
    if (rk.get(a) != rk.get(b)) rk.get(a) < rk.get(b)
    else if (isBuiltin(a) != isBuiltin(b)) (if (v == "pluginTie") not(isBuiltin(a)) else isBuiltin(a))
    else if (v == "oldestFirst") pos(reg, a) < pos(reg, b)
    else pos(reg, a) > pos(reg, b)

  /** `resolve`: the best source that holds a value, or `NONE`. */
  pure def pick(v: str, h: str -> int, rk: str -> int, reg: List[str], last: str): str = {
    val holding = BUILTINS.union(regSet(reg)).filter(s => h.get(s) != UNSET)
    if (v == "lastWriter" and holding.contains(last)) last
    else holding.fold(NONE, (best, s) => if (best == NONE or beats(v, rk, reg, s, best)) s else best)
  }

  action resolveWith(v: str, h: str -> int, rk: str -> int, reg: List[str], last: str): bool = {
    val w = pick(v, h, rk, reg, last)
    all {
      held' = h,
      rank' = rk,
      registered' = reg,
      lastSet' = last,
      winner' = w,
      value' = if (w == NONE) UNSET else h.get(w),
      provenance' = if (v == "staleProvenance" and provenance != NONE) provenance else w,
    }
  }

  action init = all {
    held' = BUILTINS.union(PLUGINS).mapBy(_ => UNSET),
    rank' = BUILTINS.union(PLUGINS).mapBy(s => if (isBuiltin(s)) RANK.get(s) else 0),
    registered' = [],
    lastSet' = NONE,
    winner' = NONE,
    value' = UNSET,
    provenance' = NONE,
  }

  /** `register`: a plugin source with a rank; the shipped host refuses one outside (flag, default). */
  action register(v: str): bool = {
    nondet p = PLUGINS.exclude(regSet(registered)).oneOf()
    nondet r = ASKED.oneOf()
    all {
      PLUGINS.exclude(regSet(registered)) != Set(),
      v == "unbounded" or (r > RANK.get("flag") and r < RANK.get("default")),
      resolveWith(v, held, rank.set(p, r), registered.append(p), lastSet),
    }
  }

  /** A source sets the key: a flag typed, a variable exported, a file written, a plugin read. */
  action setKey(v: str): bool = {
    nondet s = BUILTINS.union(regSet(registered)).oneOf()
    nondet x = VALUES.oneOf()
    resolveWith(v, held.set(s, x), rank, registered, s)
  }

  /** A source stops setting it. */
  action unsetKey(v: str): bool = {
    nondet s = BUILTINS.union(regSet(registered)).oneOf()
    resolveWith(v, held.set(s, UNSET), rank, registered, lastSet)
  }

  action stepWith(v: str): bool = any { register(v), setKey(v), unsetKey(v) }
  action step = stepWith("shipped")
  action stepLastWriter = stepWith("lastWriter")
  action stepStaleProvenance = stepWith("staleProvenance")
  action stepUnbounded = stepWith("unbounded")
  action stepPluginTie = stepWith("pluginTie")
  action stepOldestFirst = stepWith("oldestFirst")

  val holding = BUILTINS.union(regSet(registered)).filter(s => held.get(s) != UNSET)

  /** R3: provenance names the source whose value was returned, and that source set it. */
  val provenanceIsTheSetter = provenance == winner and (winner != NONE implies (holding.contains(winner) and value == held.get(winner)))

  /** Unset exactly when no source set the key. */
  val unsetIffNothingSet = (winner == NONE) iff (holding == Set())

  /** No set source has a lower rank than the winner. */
  val rankRespected = winner != NONE implies holding.forall(s => rank.get(s) >= rank.get(winner))

  /** At the winner's rank, a built-in beats a plugin. */
  val builtinWinsTie = (winner != NONE and not(isBuiltin(winner))) implies holding.forall(s => not(isBuiltin(s) and rank.get(s) == rank.get(winner)))

  /** Of two plugins at one rank, the later registered wins. */
  val laterPluginWinsTie = (winner != NONE and not(isBuiltin(winner))) implies holding.forall(s => isBuiltin(s) or rank.get(s) != rank.get(winner) or pos(registered, s) <= pos(registered, winner))

  /** R15's bounds: every plugin rank strictly between the flag's and the default's. */
  val pluginRanksInBounds = regSet(registered).forall(p => rank.get(p) > RANK.get("flag") and rank.get(p) < RANK.get("default"))

  /** What the user typed wins. */
  val flagWins = held.get("flag") != UNSET implies winner == "flag"

  /** The declared default is the floor: it wins only when nothing else set the key. */
  val defaultIsFloor = winner == "default" implies holding == Set("default")

  /** R1: with no plugin, the answer is the truth table's row — the first source set, in ORDER. */
  val matchesTruthTable = registered == [] implies winner == ORDER.foldl(NONE, (first, s) => if (first == NONE and held.get(s) != UNSET) s else first)

  val safety = all {
    provenanceIsTheSetter,
    unsetIffNothingSet,
    rankRespected,
    builtinWinsTie,
    laterPluginWinsTie,
    pluginRanksInBounds,
    flagWins,
    defaultIsFloor,
    matchesTruthTable,
  }

  /** Witness, expected to be VIOLATED: some run has two sources set at once, so a source is outranked. */
  val neverOutranked = holding.size() <= 1

  /** Witness, expected to be VIOLATED: some run is won by a plugin source. */
  val pluginNeverWins = not(PLUGINS.contains(winner))
}
