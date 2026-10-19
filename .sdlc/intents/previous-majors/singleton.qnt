// -*- mode: Bluespec; -*-
/**
 * `require('burgee/yargs/v17')` — yargs 17's singleton (`previous-majors` R3, R4), as
 * `packages/burgee/src/yargs/v17.cts` and `v17-factory.ts` build it.
 *
 * One evaluation of the CommonJS entry is a *load*. A load makes a string table of its own
 * (`yargs17()`), builds one instance over `process.argv` without its binary, and binds the
 * singleton's methods to it. Calling the singleton builds another instance and rebinds it. A
 * program — and 17's own suite, in every `beforeEach` — busts the require cache, changes
 * `process.argv`, and requires the entry again; that is a new load.
 *
 * The designs this rejects, and how to see each fail:
 *  - **An ES module entry.** Evaluated once per process whatever the cache says, so a require
 *    after a bust is not a load: make `bust` advance `required` alone and `boundIsThisLoads` fails.
 *  - **18's constructor**, which sets `en_US` on every instance it builds: set `locale' = "en_US"`
 *    in `call` and `tableStartsAtEn` fails, as 14 cases of 17's suite did.
 *  - **One string table per process** (the façade's own): leave `locale` alone in `bust` and
 *    `tableStartsAtEn` fails — a locale one test set is the next file's.
 */
module singleton {
  pure val ARGVS = Set(1, 2, 3)
  pure val LOCALES = Set("en", "pirate", "fr")

  type Instance = { load: int, args: int }

  var argv: int            // what `process.argv` holds now
  var required: int        // fresh requires the program has made: the load it believes it has
  var load: int            // evaluations of the entry so far
  var bound: Instance      // the instance the singleton's methods are bound to
  var locale: str          // the current load's string table
  var localeSet: bool      // whether anything in this load set a locale

  action init = all {
    nondet a = ARGVS.oneOf()
    all { argv' = a, required' = 1, load' = 1, bound' = { load: 1, args: a }, locale' = "en", localeSet' = false },
  }

  /** The program assigns `process.argv`. Nothing is rebuilt until the entry is loaded again. */
  action setArgv(a: int): bool = all {
    argv' = a, required' = required, load' = load, bound' = bound, locale' = locale, localeSet' = localeSet,
  }

  /** `delete require.cache[…]; require('burgee/yargs/v17')`: a fresh evaluation over the argv of now. */
  action bust: bool = all {
    argv' = argv, required' = required + 1, load' = load + 1, bound' = { load: load + 1, args: argv }, locale' = "en", localeSet' = false,
  }

  /** `yargs([...])`: a new instance, and the singleton rebinds to it. 17 leaves the table alone. */
  action call(a: int): bool = all {
    argv' = argv, required' = required, load' = load, bound' = { load: load, args: a }, locale' = locale, localeSet' = localeSet,
  }

  /** `.locale('pirate')` on any instance of this load: the load's one table. */
  action setLocale(l: str): bool = all {
    argv' = argv, required' = required, load' = load, bound' = bound, locale' = l, localeSet' = true,
  }

  action step = any {
    nondet a = ARGVS.oneOf() any { setArgv(a), call(a) },
    bust,
    nondet l = LOCALES.oneOf() setLocale(l),
  }

  /** The singleton acts on an instance of the load the program last required — never an older one. */
  val boundIsThisLoads = load == required and bound.load == load

  /** A load's table starts at 17's `en`, and only something in that load moves it. */
  val tableStartsAtEn = localeSet or locale == "en"

  val safety = boundIsThisLoads and tableStartsAtEn
}
