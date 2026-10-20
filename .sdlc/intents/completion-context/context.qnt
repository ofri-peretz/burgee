// -*- mode: Bluespec; -*-
/**
 * What a completer is told about the line (packages/burgee/src/complete-dynamic.ts), as a state
 * machine. completion-context R1–R3.
 *
 * A person types a line one piece at a time, and may press TAB after any piece. Each step here
 * is one piece, chosen by the checker from what a person can type: an option with its value, a
 * boolean or its negation, a positional, the `--` terminator, or a valued option with the cursor
 * after it. The step does two things at once:
 *
 *   - `gt` records what the person meant: the options they set, the positionals they typed,
 *     and what TAB is completing now. That is the ground truth.
 *   - `sc` reads the same words the way `__complete` reads them, one word at a time, with
 *     `parseArgs({ strict: false, tokens: true })` and the fold after it. That is the design.
 *
 * `safety` says the two agree after every piece. The completer sees exactly what was typed:
 *   sameTarget       — TAB completes the option whose value is being typed, or the positional
 *                      slot the cursor is in, counted against what was typed before it;
 *   sameOptions      — `context.options` holds each typed option at its last value, coerced,
 *                      and nothing the person did not type (not the option awaiting its value);
 *   sameRaw          — a value that fails coercion is in `context.raw` under its key, and is
 *                      not also in `context.options`, not even as an earlier good value;
 *   samePositionals  — `context.positionals` counts the positionals, and no option's value.
 *
 * Three options stand for every kind a command declares: `remote` (a string), `port` (a number,
 * whose value `x` fails coercion), and `force` (a negatable boolean).
 *
 * The rejected designs are steps, and CI runs each and requires `safety` to FAIL (models.yml):
 *   stepCountValues     — an option's value is counted as a positional too: the slot is off by one;
 *   stepFoldTrailing    — the option awaiting its value is folded as `true`, the way
 *                         `parseArgs` reports it, so a completer sees `remote: true`;
 *   stepFirstWins       — a boolean keeps its first spelling: `--force --no-force` reads `true`;
 *   stepKeepStale       — a failed value goes to `raw`, and the earlier good one stays in `options`;
 *   stepFlagsAfterEnd   — a word after `--` is still read as an option.
 * `rawNeverHolds` is a witness and must also FAIL: some line puts a value in `raw`, so
 * `sameRaw` is not holding only because nothing reaches it.
 *
 * Run by hand:
 *   npx @informalsystems/quint run .sdlc/intents/completion-context/context.qnt \
 *     --invariant=safety --max-steps=30 --max-samples=20000
 */
module context {
  // "" is absent. `force` is "true" or "false" when typed.
  type Opts = { remote: str, port: str, force: str }

  type Truth = {
    options: Opts,
    raw: str,          // context.raw.port: the only option whose value can fail coercion
    positionals: int,
    ended: bool,       // `--` typed
    awaiting: str,     // the valued option whose value TAB completes, or ""
  }

  // The scanner: what parseArgs and the fold have read so far, before coercion.
  type Scan = {
    last: Opts,        // the last token per option, as typed; `port` may be "x"
    staleGood: str,    // stepKeepStale only: the earlier good `port` it fails to drop
    positionals: int,
    ended: bool,
    pending: str,      // a valued option read, its value not yet
  }

  pure val NONE: Opts = { remote: "", port: "", force: "" }

  var gt: Truth
  var sc: Scan
  // The design the last step read the line with: the derivations below differ by it.
  var design: str

  action init = all {
    design' = "shipped",
    gt' = { options: NONE, raw: "", positionals: 0, ended: false, awaiting: "" },
    sc' = { last: NONE, staleGood: "", positionals: 0, ended: false, pending: "" },
  }

  pure def isValued(w: str): bool = w == "--remote" or w == "--port"
  pure def nameOf(w: str): str = if (w == "--remote") "remote" else "port"
  pure def flagOf(name: str): str = if (name == "remote") "--remote" else "--port"

  pure def setOpt(o: Opts, name: str, v: str): Opts =
    if (name == "remote") { ...o, remote: v } else if (name == "port") { ...o, port: v } else { ...o, force: v }

  /** One word, read the way `__complete` reads it; `v` names the design. */
  pure def scanWord(s: Scan, w: str, v: str): Scan =
    if (s.ended and v != "flagsAfterEnd") { ...s, positionals: s.positionals + 1 }
    else if (s.pending != "") {
      ...s,
      last: setOpt(s.last, s.pending, w),
      staleGood: if (s.pending == "port" and w != "x") w else s.staleGood,
      pending: "",
      positionals: if (v == "countValues") s.positionals + 1 else s.positionals,
    }
    else if (w == "--") { ...s, ended: true }
    else if (isValued(w)) { ...s, pending: nameOf(w) }
    else if (w == "--force" or w == "--no-force") {
      if (v == "firstWins" and s.last.force != "") s
      else { ...s, last: setOpt(s.last, "force", if (w == "--force") "true" else "false") }
    }
    else { ...s, positionals: s.positionals + 1 }

  pure def scanAll(s: Scan, ws: List[str], v: str): Scan = ws.foldl(s, (acc, w) => scanWord(acc, w, v))

  // ── the context a completer is handed, derived from the scan ─────────────────────────────
  /** Coercion, one key at a time: a `port` that is not a number goes to `raw`. */
  pure def ctxOptions(s: Scan, v: str): Opts = {
    val coerced = { ...s.last, port: if (s.last.port == "x") (if (v == "keepStale") s.staleGood else "") else s.last.port }
    if (v == "foldTrailing" and s.pending != "") setOpt(coerced, s.pending, "true") else coerced
  }
  pure def ctxRaw(s: Scan): str = if (s.last.port == "x") "x" else ""
  pure def ctxTarget(s: Scan): str = s.pending

  // ── what a person types next ─────────────────────────────────────────────────────────────
  action typeWith(words: List[str], after: Truth, v: str): bool = all {
    design' = v,
    gt' = after,
    sc' = scanAll(sc, words, v),
  }

  /** `--remote s` or `--port 1|x`: an option and its value in one piece. */
  action optionWith(v: str): bool = {
    nondet name = Set("remote", "port").oneOf()
    nondet value = (if (name == "remote") Set("s") else Set("1", "x")).oneOf()
    all {
      not(gt.ended), gt.awaiting == "",
      typeWith([flagOf(name), value], {
        ...gt,
        options: setOpt(gt.options, name, if (value == "x") "" else value),
        raw: if (name == "port") (if (value == "x") "x" else "") else gt.raw,
      }, v),
    }
  }

  action booleanWith(v: str): bool = {
    nondet on = Set(true, false).oneOf()
    all {
      not(gt.ended), gt.awaiting == "",
      typeWith([if (on) "--force" else "--no-force"], { ...gt, options: setOpt(gt.options, "force", if (on) "true" else "false") }, v),
    }
  }

  /** A positional. After `--`, a word that looks like an option is one too. */
  action positionalWith(v: str): bool = {
    nondet w = (if (gt.ended) Set("p", "--force", "--remote", "--") else Set("p")).oneOf()
    all {
      gt.awaiting == "",
      typeWith([w], { ...gt, positionals: gt.positionals + 1 }, v),
    }
  }

  action endWith(v: str): bool = all {
    not(gt.ended), gt.awaiting == "",
    typeWith(["--"], { ...gt, ended: true }, v),
  }

  /** `--remote ` and TAB: the cursor is on that option's value. */
  action awaitWith(v: str): bool = {
    nondet name = Set("remote", "port").oneOf()
    all {
      not(gt.ended), gt.awaiting == "",
      typeWith([flagOf(name)], { ...gt, awaiting: name }, v),
    }
  }

  /** The value of the option the cursor was on, typed after all. */
  action valueWith(v: str): bool = {
    nondet value = (if (gt.awaiting == "remote") Set("s") else Set("1", "x")).oneOf()
    all {
      gt.awaiting != "",
      typeWith([value], {
        ...gt,
        awaiting: "",
        options: setOpt(gt.options, gt.awaiting, if (value == "x") "" else value),
        raw: if (gt.awaiting == "port") (if (value == "x") "x" else "") else gt.raw,
      }, v),
    }
  }

  action stepWith(v: str): bool = any { optionWith(v), booleanWith(v), positionalWith(v), endWith(v), awaitWith(v), valueWith(v) }

  action step = stepWith("shipped")
  action stepCountValues = stepWith("countValues")
  action stepFoldTrailing = stepWith("foldTrailing")
  action stepFirstWins = stepWith("firstWins")
  action stepKeepStale = stepWith("keepStale")
  action stepFlagsAfterEnd = stepWith("flagsAfterEnd")

  // ── invariants ───────────────────────────────────────────────────────────────────────────
  val sameTarget = ctxTarget(sc) == gt.awaiting
  val samePositionals = sc.positionals == gt.positionals
  val sameOptions = ctxOptions(sc, design) == gt.options
  val sameRaw = ctxRaw(sc) == gt.raw and (gt.raw != "" implies ctxOptions(sc, design).port == "")

  val safety = sameTarget and samePositionals and sameOptions and sameRaw

  /** A witness, expected to be VIOLATED: some line puts a failed value in `raw`. */
  val rawNeverHolds = gt.raw == ""
}
