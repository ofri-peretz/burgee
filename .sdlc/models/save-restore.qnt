// -*- mode: Bluespec; -*-
/**
 * Save-the-original, restore-it-later, with more than one owner, in any stop order:
 *
 *   - flagstaff/src/ora.ts `#hookStream`/`#uninstallHook` — spinners hooking `stream.write`;
 *   - closeout/src/cursor.ts `rawMode` — spinners and prompts sharing raw mode.
 *
 * The first version of this model described the code as it was and both properties failed
 * (A starts, B starts, A stops, B stops): B restored A's dead wrapper for good, and the second
 * `rawMode` caller got a no-op so the first one's undo took raw mode from it. This version
 * describes the fix — a stopped hook is a pass-through and the top is unwound, and `rawMode`
 * counts its holders. Re-check by reverting `unhook` to `write' = wrapped.get(o)`.
 */
module saveRestore {
  pure val OWNERS = Set("A", "B")
  pure val ORIGINAL = "orig"

  // ── stream.write hooks (ora) ──────────────────────────────────────────────────────────
  var write: str              // whose wrapper `stream.write` currently is
  var wrapped: str -> str     // what each owner's wrapper wraps; "" before it hooked
  var live: Set[str]          // owners whose spinner is still running
  // ── raw mode (rawMode) ────────────────────────────────────────────────────────────────
  var isRaw: bool
  var holders: int            // `rawHolders.get(input)`
  var needsRaw: Set[str]      // owners between rawMode() and their undo

  action init = all {
    write' = ORIGINAL, wrapped' = OWNERS.mapBy(o => ""), live' = Set(),
    isRaw' = false, holders' = 0, needsRaw' = Set(),
  }

  /** One step of `for (top …; top && !top.live; …) stream.write = top.wrapped`. */
  pure def peel(w: str, wr: str -> str, lv: Set[str]): str =
    if (OWNERS.contains(w) and not(lv.contains(w))) wr.get(w) else w
  // ponytail: unwound to depth |OWNERS| by hand; Quint has no unbounded loop.
  pure def unwind(w: str, wr: str -> str, lv: Set[str]): str = peel(peel(w, wr, lv), wr, lv)

  action hook(o: str): bool = all {
    wrapped.get(o) == "",
    wrapped' = wrapped.set(o, write), write' = o, live' = live.union(Set(o)),
    isRaw' = isRaw, holders' = holders, needsRaw' = needsRaw,
  }
  action unhook(o: str): bool = all {
    live.contains(o),
    live' = live.exclude(Set(o)),
    write' = unwind(write, wrapped, live.exclude(Set(o))),
    wrapped' = wrapped,
    isRaw' = isRaw, holders' = holders, needsRaw' = needsRaw,
  }
  action acquireRaw(o: str): bool = all {
    not(needsRaw.contains(o)),
    needsRaw' = needsRaw.union(Set(o)), holders' = holders + 1, isRaw' = true,
    write' = write, wrapped' = wrapped, live' = live,
  }
  action releaseRaw(o: str): bool = all {
    needsRaw.contains(o),
    needsRaw' = needsRaw.exclude(Set(o)), holders' = holders - 1,
    isRaw' = if (holders - 1 > 0) isRaw else false,
    write' = write, wrapped' = wrapped, live' = live,
  }

  action step = {
    nondet o = OWNERS.oneOf()
    any { hook(o), unhook(o), acquireRaw(o), releaseRaw(o) }
  }

  /** With every spinner stopped, `stream.write` is the original again. */
  val writeRestored = live == Set() implies write == ORIGINAL
  /** A stopped spinner's wrapper is never the live `write`. */
  val noStaleHook = not(OWNERS.exists(o => write == o and not(live.contains(o))))
  /** While anyone is reading keys, the terminal is raw; once nobody is, it is not. */
  val rawWhileNeeded = (needsRaw != Set() implies isRaw) and (needsRaw == Set() implies not(isRaw))

  val safety = writeRestored and noStaleHook and rawWhileNeeded
}
