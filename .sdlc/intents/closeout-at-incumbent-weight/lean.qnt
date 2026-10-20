// -*- mode: Bluespec; -*-
/**
 * `closeout/exit-hook` without the registry (packages/closeout/src/exit-hook.ts), as a state
 * machine. closeout-at-incumbent-weight R4.
 *
 * Until 2026-10-20 the drop-in's exactly-once came from `registry.ts` (`Registry.settled`,
 * modelled in `.sdlc/intents/closeout/registry.qnt`). The drop-in now runs exit-hook's own
 * small machine instead, and this is it, one JavaScript turn per action:
 *
 *   shutdown(manual, isSynchronous, signal):
 *     if (called) return; called = true;                    // the one guard
 *     for (const hook of syncHooks) hook(code);              // sync hooks, every path
 *     if (isSynchronous) { leave(manual, code); return; }    // 'exit' and PM2: no async hook
 *     timer = setTimeout(leave, max(wait));                  // armed before any async hook runs
 *     await Promise.all(asyncHooks.map(hook => hook(code)))  // all called in the trigger's turn
 *     clearTimeout(timer); await drain-or-1s; leave(manual, code);
 *
 * Triggers: `beforeExit`, SIGINT, SIGTERM and `gracefulExit()` can await (`triggerAsync`);
 * the `'exit'` event and PM2's `shutdown` message cannot (`triggerSync`). Hooks are added and
 * removed at any time, before or after the first trigger. A leave ends the process: nothing
 * runs after `exited`, which is what `process.exit()` means (the unit tests' fake process does
 * not end, and the model does not describe it).
 *
 * `safety` is the conjunction of R4's guarantees for this door:
 *   onceEach         — no hook runs twice, however many triggers arrive;
 *   noLostHook       — every hook registered when the first trigger lands runs on that path
 *                      (sync hooks on every path, async hooks on the paths that can await);
 *   noAsyncOnSync    — a trigger that cannot await calls no async hook at all (calling one
 *                      runs it to its first `await`, which the incumbent never does);
 *   noLateHook       — a hook registered after the first trigger never runs (exit-hook's
 *                      `isCalled`: the shutdown is already decided);
 *   waitIsBounded    — while an async hook is out, the `max(wait)` timer is live, so a hook
 *                      that never settles cannot keep the process.
 *
 * The rejected designs are steps, and CI runs each and requires `safety` to FAIL (models.yml):
 *   stepNoGuard      — no `called` flag: a second trigger runs every hook again;
 *   stepAsyncOnSync  — a synchronous trigger calls the async hooks too;
 *   stepNoTimer      — no `max(wait)` timer: an async hook that never settles holds the exit;
 *   stepClearFirst   — the hook sets are cleared when the shutdown starts, before they run.
 * `asyncNeverRuns` is a witness and must also FAIL: some run calls an async hook, so the
 * async half of `safety` is not holding because nothing reaches it.
 *
 * Run by hand:
 *   npx @informalsystems/quint run .sdlc/intents/closeout-at-incumbent-weight/lean.qnt \
 *     --invariant=safety --max-steps=30 --max-samples=20000
 */
module lean {
  pure val HOOKS = Set("h1", "h2", "h3")

  type State = {
    // What each hook is, chosen once in init: the checker tries every assignment.
    isAsync: str -> bool,
    // `syncHooks` and `asyncHooks`, as one set split by `isAsync`.
    registered: Set[str],
    // `called`, and what the first trigger saw.
    called: bool,
    path: str,            // "none", "sync" or "async": the kind of the first trigger
    atTrigger: Set[str],  // `registered` at the moment the first trigger landed
    invoked: str -> int,
    settled: Set[str],
    // The async path: "idle", "awaiting" (Promise.all out), "draining", then exited.
    phase: str,
    timerLive: bool,
    exited: bool,
  }

  var s: State

  def asyncOut(st: State): Set[str] =
    HOOKS.filter(h => st.isAsync.get(h) and st.invoked.get(h) > 0 and not(st.settled.contains(h)))

  def invokeAll(st: State, hs: Set[str]): str -> int =
    HOOKS.mapBy(h => if (hs.contains(h)) st.invoked.get(h) + 1 else st.invoked.get(h))

  action init = {
    nondet isAsync = HOOKS.setOfMaps(Set(true, false)).oneOf()
    s' = {
      isAsync: isAsync, registered: Set(), called: false, path: "none", atTrigger: Set(),
      invoked: HOOKS.mapBy(h => 0), settled: Set(), phase: "idle", timerLive: false, exited: false,
    }
  }

  // ── registration: `exitHook(fn)`, `asyncExitHook(fn, { wait })`, and their removers ─────
  action register = {
    nondet h = HOOKS.oneOf()
    all { not(s.exited), s' = { ...s, registered: s.registered.union(Set(h)) } }
  }

  action unregister = {
    nondet h = HOOKS.oneOf()
    all { not(s.exited), s' = { ...s, registered: s.registered.exclude(Set(h)) } }
  }

  // ── the first trigger, and every one after it ─────────────────────────────────────────
  /** `shutdown(manual, false, signal)`: the sync hooks, the timer, then every async hook. */
  action triggerAsyncWith(v: str): bool = {
    val hs = if (v == "clearFirst") Set() else s.registered
    val asyncHs = hs.filter(h => s.isAsync.get(h))
    all {
      not(s.exited),
      if (s.called and v != "noGuard") s' = s
      else s' = {
        ...s,
        registered: if (v == "clearFirst") Set() else s.registered,
        called: true,
        path: if (s.called) s.path else "async",
        atTrigger: if (s.called) s.atTrigger else s.registered,
        invoked: invokeAll(s, hs),
        phase: "awaiting",
        timerLive: v != "noTimer" and asyncHs != Set(),
      },
    }
  }

  /** `shutdown(manual, true, …)`: `'exit'` or PM2. Sync hooks only, then the process is gone. */
  action triggerSyncWith(v: str): bool = {
    val hs = if (v == "clearFirst") Set() else s.registered
    val ran = if (v == "asyncOnSync") hs else hs.filter(h => not(s.isAsync.get(h)))
    all {
      not(s.exited),
      if (s.called and v != "noGuard") s' = s
      else s' = {
        ...s,
        registered: if (v == "clearFirst") Set() else s.registered,
        called: true,
        path: if (s.called) s.path else "sync",
        atTrigger: if (s.called) s.atTrigger else s.registered,
        invoked: invokeAll(s, ran),
        exited: true,
      },
    }
  }

  // ── the async path ────────────────────────────────────────────────────────────────────
  /** An async hook's promise settles. Resolve or reject: `Promise.all` treats both as back. */
  action settle = {
    nondet h = HOOKS.oneOf()
    all {
      not(s.exited), s.isAsync.get(h), s.invoked.get(h) > 0, not(s.settled.contains(h)),
      s' = { ...s, settled: s.settled.union(Set(h)) },
    }
  }

  /** `await Promise.all(…)` returns, then `clearTimeout(timer)`. */
  action allBack = all {
    not(s.exited), s.phase == "awaiting", asyncOut(s) == Set(),
    s' = { ...s, phase: "draining", timerLive: false },
  }

  /** The drain resolves, or its one second runs out: `leave(manual, code)`. */
  action drained = all {
    not(s.exited), s.phase == "draining",
    s' = { ...s, exited: true },
  }

  /** The `max(wait)` timer fires: `leave(true, code)`, whatever is still out. */
  action timerFires = all {
    not(s.exited), s.timerLive,
    s' = { ...s, timerLive: false, exited: true },
  }

  action idle = all { s.exited, s' = s }

  action stepWith(v: str): bool = any {
    register, unregister, triggerAsyncWith(v), triggerSyncWith(v), settle, allBack, drained, timerFires, idle,
  }

  action step = stepWith("shipped")
  action stepNoGuard = stepWith("noGuard")
  action stepAsyncOnSync = stepWith("asyncOnSync")
  action stepNoTimer = stepWith("noTimer")
  action stepClearFirst = stepWith("clearFirst")

  // ── invariants ────────────────────────────────────────────────────────────────────────
  val onceEach = HOOKS.forall(h => s.invoked.get(h) <= 1)

  val noLostHook = and {
    s.path != "none" implies s.atTrigger.forall(h => not(s.isAsync.get(h)) implies s.invoked.get(h) == 1),
    s.path == "async" implies s.atTrigger.forall(h => s.invoked.get(h) == 1),
  }

  val noAsyncOnSync = s.path == "sync" implies HOOKS.forall(h => s.isAsync.get(h) implies s.invoked.get(h) == 0)

  val noLateHook = s.path != "none" implies HOOKS.forall(h => s.invoked.get(h) > 0 implies s.atTrigger.contains(h))

  val waitIsBounded = (not(s.exited) and asyncOut(s) != Set()) implies s.timerLive

  val safety = onceEach and noLostHook and noAsyncOnSync and noLateHook and waitIsBounded

  /** A witness, expected to be VIOLATED: some run calls an async hook. */
  val asyncNeverRuns = HOOKS.forall(h => s.isAsync.get(h) implies s.invoked.get(h) == 0)
}
